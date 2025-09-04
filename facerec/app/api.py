import io, os, re, mimetypes, logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime, timezone
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, Body
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

"""
Face Attendance API server.

Provides endpoints to enroll students, list image URLs from storage,
read daily attendance, and accept seen events from a camera client.
"""

app = FastAPI(title="Face Attendance API")


@app.on_event("startup")
async def _show_routes():
    """
    Print registered routes when the application starts.

    This helps debugging by showing available endpoints.
    """
    print("\n[ROUTES]")
    for r in app.router.routes:
        methods = ",".join(sorted(getattr(r, "methods", []) or []))
        print(f"{methods:10s} {getattr(r, 'path', '')}")
    print("[/ROUTES]\n")

@app.get("/health")
async def health():
    return {"ok": True}


VERIFY_THRESHOLD = float(os.getenv("VERIFY_THRESHOLD", "0.75"))
IDENTIFY_MARGIN = float(os.getenv("IDENTIFY_MARGIN", "0.12"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "images")

"""
Allow cross-origin requests from local development origins.
"""
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


try:
    from supabase import create_client, Client
except ImportError:
    create_client, Client = None, None

supabase: Optional["Client"] = None
if create_client and SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
else:
    logging.warning("Supabase client not initialized (check SUPABASE_URL/KEY).")


def sanitize_name(name: str) -> str:
    """
    Convert a display name into a filename-friendly canonical name.

    Lowercase the name, replace whitespace with underscores and strip
    characters that are not letters, numbers, dot, underscore or hyphen.
    """
    s = name.strip().lower()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^a-z0-9._-]", "", s)
    return re.sub(r"_+", "_", s).strip("_") or "student"

def ext_from_upload(file: UploadFile) -> str:
    """
    Guess a file extension for an uploaded image.

    Use the provided content-type when available, otherwise infer
    from the filename. Defaults to 'jpg' on unknown inputs.
    """
    ct = (file.content_type or "").lower()
    if ct in ("image/jpeg", "image/jpg"): return "jpg"
    if ct == "image/png": return "png"
    if ct == "image/webp": return "webp"
    fn = (file.filename or "").lower()
    for ext in ("jpg", "jpeg", "png", "webp"):
        if fn.endswith("." + ext):
            return "jpg" if ext == "jpeg" else ext
    return "jpg"

def pick_image_content_type(file: UploadFile, blob: bytes, stored_filename: str) -> str:
    """
    Determine the best content-type for an uploaded image.

    Prefer the client's content-type, then guess from filename, and
    finally inspect the bytes with Pillow to determine format.
    """
    ct = (file.content_type or "").lower()
    if ct.startswith("image/"):
        return ct
    guess, _ = mimetypes.guess_type(stored_filename)
    if (guess or "").startswith("image/"):
        return guess
    try:
        fmt = Image.open(io.BytesIO(blob)).format
        return {
            "JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp",
            "GIF": "image/gif", "BMP": "image/bmp", "TIFF": "image/tiff",
        }.get((fmt or "").upper(), "application/octet-stream")
    except Exception:
        return "application/octet-stream"

def upload_bytes_to_supabase(path: str, data: bytes, content_type: str) -> Tuple[str, Optional[str]]:
    """
    Upload raw bytes to Supabase Storage and return (path, public_url).

    Raises a RuntimeError when storage is not configured or the upload fails.
    """
    if not supabase or not SUPABASE_BUCKET:
        raise RuntimeError("Supabase is not configured (URL/KEY/BUCKET).")

    options = {"contentType": str(content_type), "upsert": "true"}
    res = supabase.storage.from_(SUPABASE_BUCKET).upload(path, data, options)
    if res is None or getattr(res, "error", None):
        raise RuntimeError(f"Upload failed for {path}: {getattr(res, 'error', res)}")

    pub = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
    public_url = pub if isinstance(pub, str) else pub.get("publicUrl")
    return path, public_url


@app.post("/enroll")
async def enroll(
    external_id: str = Form(...),
    name: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Enroll a student:
      - upsert (external_id, name) into 'students'
      - upload image to Supabase Storage as '<sanitized_name>.<ext>' with correct content type
    """
    if not external_id or not name:
        raise HTTPException(400, "Name and external_id are required")

    blob = await file.read()
    if not blob:
        raise HTTPException(400, "Empty file")

    filename     = f"{sanitize_name(name)}.{ext_from_upload(file)}"
    content_type = pick_image_content_type(file, blob, filename)

    try:
        stored_path, public_url = upload_bytes_to_supabase(filename, blob, content_type)
    except Exception as e:
        raise HTTPException(500, f"Supabase upload failed: {e}")

    try:
        res = supabase.table("students").upsert(
            {"external_id": external_id, "name": name},
            on_conflict="external_id"
        ).execute()
        if getattr(res, "error", None):
            raise RuntimeError(res.error)
    except Exception as e:
        raise HTTPException(500, f"Failed to save student record: {e}")

    return JSONResponse(content=jsonable_encoder({
        "ok": True,
        "external_id": external_id,
        "name": name,
        "image_path": stored_path,
        "image_url": public_url,
        "content_type": content_type
    }))

def list_image_urls(prefix: str = "", limit: int = 50, page: int = 1) -> Dict[str, Any]:
    """
    List public image URLs from storage.

    Supports optional prefix, paging and returns a structure with images and pagination info.
    """
    if not supabase or not SUPABASE_BUCKET:
        return {"images": [], "count": 0, "page": page, "page_size": limit, "has_more": False}

    options = {"limit": int(limit), "offset": int((page - 1) * limit), "sortBy": {"column": "name", "order": "asc"}}
    try:
        files = supabase.storage.from_(SUPABASE_BUCKET).list(prefix or "", options) or []
    except Exception as e:
        logging.error(f"Storage list failed: {e}")
        return {"images": [], "count": 0, "page": page, "page_size": limit, "has_more": False}

    urls = []
    for f in files:
        fname = f.get("name") if isinstance(f, dict) else None
        if not fname:
            continue
        path = f"{prefix.rstrip('/')}/{fname}".lstrip('/') if prefix else fname
        pub = supabase.storage.from_(SUPABASE_BUCKET).get_public_url(path)
        url = pub if isinstance(pub, str) else pub.get("publicUrl")
        if url:
            urls.append(url)

    return {
        "images": urls,
        "count": len(urls),
        "page": page,
        "page_size": limit,
        "has_more": len(files) == limit
    }

@app.get("/images")
async def get_all_images(
    prefix: str = Query("", description="Optional folder/prefix (e.g., 'students/')"),
    limit: int = Query(50, ge=1, le=100),
    page: int  = Query(1,  ge=1)
):
    return {"success": True, **list_image_urls(prefix=prefix, limit=limit, page=page)}

@app.get("/api/people")
@app.get("/people")
async def get_people():
    """
    Return enrolled students (id, external_id, name).
    """
    if not supabase:
        return {"data": []}
    try:
        res = supabase.table("students").select("id, external_id, name").order("name", desc=False).execute()
        return {"data": res.data or []}
    except Exception as e:
        logging.exception(f"Failed to fetch people: {e}")
        return {"data": []}

@app.get("/api/attendance/daily")
@app.get("/attendance/daily")
async def attendance_daily(date: str = Query(None, description="YYYY-MM-DD (defaults to today, UTC)")):
    """
    Return attendance rows for the given date.

    Defaults to today's date (UTC) when no date is provided.
    """
    if not supabase:
        return {"attendance": []}

    if not date:
        date = datetime.now(timezone.utc).date().isoformat()

    try:
        res = supabase.table("attendance").select("*").eq("date", date).execute()
        rows = res.data or []
        # (Optional) attach student object for convenience:
        # student_ids = list({r["student_id"] for r in rows if r.get("student_id")})
        # if student_ids:
        #     sres = supabase.table("students").select("id, external_id, name").in_("id", student_ids).execute()
        #     smap = {s["id"]: s for s in (sres.data or [])}
        #     for r in rows:
        #         r["student"] = smap.get(r.get("student_id"))
        return {"attendance": rows, "date": date}
    except Exception as e:
        logging.exception(f"Failed to fetch attendance for {date}: {e}")
        return {"attendance": [], "date": date}

def _get_student_by_external_or_name(external_id: Optional[str], name: Optional[str]):
    """
    Find a student by external id or a case-insensitive name match.

    Returns the student dict or None when not found.
    """
    if not supabase:
        raise RuntimeError("Supabase not configured")

    if external_id:
        res = supabase.table("students").select("id, external_id, name").eq("external_id", external_id).limit(1).execute()
        if res.data:
            return res.data[0]

    if name:
        res = supabase.table("students").select("id, external_id, name").ilike("name", name).limit(1).execute()
        if res.data:
            return res.data[0]

    return None

def _toggle_attendance_for_today(student_id: str, event_time: datetime) -> Dict[str, Any]:
    today_str = event_time.date().isoformat()
    sel = supabase.table("attendance").select("*").eq("student_id", student_id).eq("date", today_str).limit(1).execute()
    rows = sel.data or []

    iso = event_time.isoformat()

    if not rows:
        ins = {
            "date": today_str,
            "student_id": student_id,
            "check_in_at": iso,
            "check_out_at": None,
            "status": "checked-in",
            "visits": 1,
            "last_seen_at": iso,
        }
        res = supabase.table("attendance").insert(ins).execute()
        return (res.data or [ins])[0]

    row = rows[0]
    visits = int(row.get("visits") or 0)
    status = (row.get("status") or "absent").lower()

    if status == "checked-in" and not row.get("check_out_at"):
        upd = {
            "check_out_at": iso,
            "status": "checked-out",
            "visits": visits + 1,
            "last_seen_at": iso,
        }
    else:
        upd = {
            "check_in_at": iso,
            "check_out_at": None,
            "status": "checked-in",
            "visits": visits + 1,
            "last_seen_at": iso,
        }

    supabase.table("attendance").update(upd).eq("id", row["id"]).execute()
    return {**row, **upd}

class SeenPayload(BaseModel):
    """Payload for seen events posted by the camera.

    external_id is preferred. name is a fallback. seen_at is an optional ISO timestamp.
    """
    external_id: Optional[str] = None
    name: Optional[str] = None
    seen_at: Optional[str] = None

@app.post("/api/attendance/seen")
@app.post("/attendance/seen")
async def attendance_seen(payload: SeenPayload = Body(...)):
    """
    Record a seen event posted by the camera.

    Accepts external_id (preferred) or name and an optional ISO timestamp.
    Returns the updated attendance row and student info.
    """
    if not payload.external_id and not payload.name:
        raise HTTPException(400, "Provide external_id or name")

    stu = _get_student_by_external_or_name(payload.external_id, payload.name)
    if not stu:
        raise HTTPException(404, "Student not found")

    when = datetime.now(timezone.utc)
    if payload.seen_at:
        try:
            dt = datetime.fromisoformat(payload.seen_at)
            when = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            pass

    att = _toggle_attendance_for_today(stu["id"], when)
    return {"ok": True, "student": {"id": stu["id"], "external_id": stu["external_id"], "name": stu["name"]}, "attendance": att}



@app.get("/unknowns")
async def get_unknowns(date: str = Query(None, description="YYYY-MM-DD (defaults to today)")):
    """
    Returns today's unknown detections as joined rows:
      { data: [ { attendance: {..}, person: {..} }, ... ] }
    """
    if not supabase:
        return {"data": []}
    if not date:
        date = datetime.now(timezone.utc).date().isoformat()
    try:
        att = supabase.table("unknown_attendance").select(
            "id, unknown_id, date, status, check_in_at, check_out_at, last_seen_at, visits, snapshot_url"
        ).eq("date", date).execute()
        rows = att.data or []
        out = []
        for r in rows:
            up = supabase.table("unknown_people").select(
                "id, fingerprint, label, last_snapshot_url"
            ).eq("id", r["unknown_id"]).limit(1).execute()
            person = (up.data or [None])[0]
            out.append({"attendance": r, "person": person})
        return {"data": out}
    except Exception as e:
        # log if you have logging configured
        return {"data": []}

