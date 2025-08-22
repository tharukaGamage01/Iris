import cv2
import csv
import math
import os
import time
import numpy as np
import requests
import face_recognition
from collections import defaultdict, deque
from urllib.parse import urlparse
import pathlib
from typing import Dict, List, Tuple, Set, Optional
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client, Client

"""
Face attendance camera client.

This module captures frames from a webcam, loads face encodings
from an images API, matches faces, and writes attendance rows
directly to a Supabase database. Each function below has a short
description as a multi-line docstring.
"""

API_BASE = os.getenv("API_BASE", "http://localhost:8001")
IMAGES_API_URL = os.getenv("IMAGES_API_URL", f"{API_BASE}/images")

IMAGES_PAGE_SIZE = int(os.getenv("IMAGES_PAGE_SIZE", "50"))
IMAGES_MAX_PAGES = int(os.getenv("IMAGES_MAX_PAGES", "10"))

CAM_INDEX = int(os.getenv("CAM_INDEX", "0"))
SCALE = float(os.getenv("SCALE", "0.25"))
MODEL = os.getenv("MODEL", "hog")
TOLERANCE = float(os.getenv("TOLERANCE", "0.50"))
GAP_MARGIN = float(os.getenv("GAP_MARGIN", "0.10"))
VOTES_WINDOW = int(os.getenv("VOTES_WINDOW", "7"))
VOTES_REQUIRED = int(os.getenv("VOTES_REQUIRED", "3"))
MIN_BOX_SIZE = int(os.getenv("MIN_BOX_SIZE", "40"))
TIME_FMT = "%H:%M:%S"
EVENT_DEBOUNCE_SEC = float(os.getenv("EVENT_DEBOUNCE_SEC", "5.0"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
_sb: Optional[Client] = None

def init_supabase() -> Client:
    """
    Initialize and return a Supabase client.

    This creates the client the first time and reuses it later.
    It raises an error if required environment variables are missing.
    """
    global _sb
    if _sb is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not set")
        _sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb

_people_loaded = False
id_map_by_canonical: Dict[str, dict] = {}
extid_map: Dict[str, dict] = {}

def _canonical_name(s: str) -> str:
    """
    Convert a name to a simple canonical form.

    Lowercase, replace spaces with underscores, and keep only
    letters, numbers, and . _ - characters.
    """
    s = (s or "").strip().lower()
    s = s.replace(" ", "_")
    return "".join(ch for ch in s if (ch.isalnum() or ch in "._-")).strip("_")


def _load_people_cache():
    """
    Load all students from the database and build quick lookup maps.

    This creates two maps: by canonical name and by external id.
    """
    global _people_loaded, id_map_by_canonical, extid_map
    if _people_loaded:
        return
    try:
        sb = init_supabase()
        res = sb.table("students").select("id, external_id, name").execute()
        data = res.data or []
        id_map_by_canonical.clear()
        extid_map.clear()
        for p in data:
            nm = p.get("name") or ""
            ext = p.get("external_id") or ""
            can = _canonical_name(nm.replace("__", "_"))
            if can:
                id_map_by_canonical[can] = p
            if ext:
                extid_map[ext] = p
        print(f"[INFO] Loaded {len(data)} people for ID mapping.")
    except Exception as e:
        print(f"[WARN] Loading people cache failed: {e}")
    finally:
        _people_loaded = True

def _get_student(sb: Client, *, external_id: str | None = None, name: str | None = None) -> Optional[dict]:
    """
    Find a student by external id or name.

    Try exact external id first, then a case-insensitive name search,
    then a cached canonical-name lookup. Returns the student dict
    or None if not found.
    """
    if external_id:
        if external_id in extid_map:
            return extid_map[external_id]
        res = sb.table("students").select("id, external_id, name") \
            .eq("external_id", external_id).limit(1).execute()
        if res.data:
            p = res.data[0]
            extid_map[external_id] = p
            can = _canonical_name(p.get("name") or "")
            if can:
                id_map_by_canonical[can] = p
            return p

    if not name:
        return None

    try:
        res = sb.table("students").select("id, external_id, name") \
            .ilike("name", f"%{name}%").limit(1).execute()
        if res.data:
            p = res.data[0]
            ext = p.get("external_id") or ""
            if ext:
                extid_map[ext] = p
            can = _canonical_name(p.get("name") or "")
            if can:
                id_map_by_canonical[can] = p
            return p
    except Exception as e:
        print(f"[WARN] wildcard lookup failed: {e}")

    can = _canonical_name(name)
    if can in id_map_by_canonical:
        return id_map_by_canonical[can]

    _load_people_cache()
    return id_map_by_canonical.get(can)

def _toggle_attendance_for_today_direct(sb: Client, student_id: str, when: datetime) -> dict:
    """
    Toggle attendance for a student for today in the database.

    If no attendance row exists for today, insert a checked-in row.
    If already checked-in and not checked-out, update to checked-out.
    Otherwise create/update a checked-in row. Returns the row dict.
    """
    today = when.date().isoformat()
    iso = when.isoformat()

    sel = sb.table("attendance").select("*").eq("student_id", student_id).eq("date", today).limit(1).execute()
    rows = sel.data or []

    if not rows:
        ins = {
            "date": today,
            "student_id": student_id,
            "check_in_at": iso,
            "check_out_at": None,
            "status": "checked-in",
            "visits": 1,
            "last_seen_at": iso,
        }
        res = sb.table("attendance").insert(ins).execute()
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

    sb.table("attendance").update(upd).eq("id", row["id"]).execute()
    return {**row, **upd}

def _infer_name_from_url(url: str) -> str:
    """
    Get a canonical name from an image URL.

    Use the file name (without extension) and convert it to the
    same canonical form used for names in the database.
    """
    path = urlparse(url).path
    fname = pathlib.Path(path).name
    stem = pathlib.Path(fname).stem
    return _canonical_name(stem)

def _url_to_rgb_image(url: str) -> Optional[np.ndarray]:
    """
    Download an image URL and return it as an RGB numpy array.

    Return None on failure.
    """
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        data = np.frombuffer(r.content, dtype=np.uint8)
        bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if bgr is None:
            return None
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        return np.ascontiguousarray(rgb, dtype=np.uint8)
    except Exception as e:
        print(f"[WARN] Failed to fetch {url}: {e}")
        return None

def _fetch_images_page(page: int, limit: int) -> Tuple[List[str], bool]:
    """
    Fetch a single page of image URLs from the images API.

    Returns a tuple (urls, has_more).
    """
    try:
        resp = requests.get(IMAGES_API_URL, params={"limit": limit, "page": page}, timeout=15)
        resp.raise_for_status()
        payload = resp.json()
        if isinstance(payload, dict) and "images" in payload:
            urls = payload.get("images", [])
            has_more = bool(payload.get("has_more", False))
            if "has_more" not in payload:
                has_more = len(urls) == limit
            return urls, has_more
        urls = payload if isinstance(payload, list) else payload.get("images", [])
        return urls, False
    except Exception as e:
        print(f"[ERROR] Fetching images page failed: {e}")
        return [], False

def load_known_faces_from_api() -> Dict[str, List[np.ndarray]]:
    """
    Load face encodings from the images API.

    For each public image URL, download and extract face encodings.
    Returns a dict mapping canonical name -> list of encodings.
    """
    print(f"[INFO] Fetching image URLs from {IMAGES_API_URL} ...")
    page = 1
    known = defaultdict(list)
    pages_fetched = 0

    while pages_fetched < IMAGES_MAX_PAGES:
        urls, has_more = _fetch_images_page(page, IMAGES_PAGE_SIZE)
        if not urls:
            break

        for url in urls:
            rgb = _url_to_rgb_image(url)
            if rgb is None:
                print(f"[WARN] Could not decode image: {url}")
                continue
            encs = face_recognition.face_encodings(rgb)
            if not encs:
                print(f"[WARN] No face found in: {url}")
                continue
            name = _infer_name_from_url(url)
            known[name].append(encs[0])
            print(f"[INFO] Loaded encoding: {name} <- {url}")

        pages_fetched += 1
        page += 1
        if not has_more:
            break

    return dict(known)

def build_centroids(known_faces: Dict[str, List[np.ndarray]]) -> Dict[str, np.ndarray]:
    """
    Build one centroid vector per identity from multiple encodings.

    This computes the mean vector for each known name.
    """
    return {name: np.mean(np.vstack(vecs), axis=0) for name, vecs in known_faces.items()}

def decide_identity(enc, identities, known_faces, centroids):
    """
    Decide the best identity for a face encoding.

    Compare the encoding to centroids and individual encodings,
    and return (name, best_dist, second_dist). Returns 'Unknown'
    when confidence is low.
    """
    if not identities:
        return "Unknown", math.inf, math.inf

    dists = []
    for name in identities:
        d_centroid = np.linalg.norm(enc - centroids[name])
        d_min = min(np.linalg.norm(enc - e) for e in known_faces[name])
        d = 0.5 * d_centroid + 0.5 * d_min
        dists.append((name, d))

    dists.sort(key=lambda x: x[1])
    best_name, best_dist = dists[0]
    second_dist = dists[1][1] if len(dists) > 1 else math.inf

    if best_dist > TOLERANCE or (second_dist - best_dist) < GAP_MARGIN:
        return "Unknown", best_dist, second_dist
    return best_name, best_dist, second_dist

_last_event_at: Dict[str, float] = {}

def notify_seen(name: str, external_id: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Record that a person was seen and toggle their attendance.

    This debounces rapid repeated events and prefers external id
    lookup, falling back to name matching. Returns (ok, status).
    """
    key = (external_id or name or "").strip()
    if not key:
        return False, None

    now_ts = time.time()
    if now_ts - _last_event_at.get(key, 0) < EVENT_DEBOUNCE_SEC:
        return False, None
    _last_event_at[key] = now_ts

    try:
        sb = init_supabase()

        _load_people_cache()

        stu = _get_student(sb, external_id=external_id, name=name)
        if not stu:
            print(f"[WARN] Student not found for name={name!r} external_id={external_id!r}")
            return False, None

        att = _toggle_attendance_for_today_direct(sb, stu["id"], datetime.now(timezone.utc))
        status = (att.get("status") or "").lower() or None
        return True, status
    except Exception as e:
        print(f"[WARN] Direct DB toggle failed for {name}: {e}")
        return False, None


def main():
    _load_people_cache()

    
    known_faces = load_known_faces_from_api()
    if not known_faces:
        raise RuntimeError(
            "No encodings loaded from /images. "
            "Ensure it returns public URLs with faces and that the files are accessible."
        )

    identities = list(known_faces.keys())
    centroids = build_centroids(known_faces)
    print(f"[INFO] Loaded identities from images: {identities}")

    vote_buffers = defaultdict(lambda: deque(maxlen=VOTES_WINDOW))
    visible_now: Set[str] = set()
    visible_last: Set[str] = set()

    # CSV setup
    today = datetime.now().strftime("%Y-%m-%d")
    os.makedirs("attendance", exist_ok=True)
    csv_path = os.path.join("attendance", f"{today}.csv")
    f = open(csv_path, "a", newline="")
    ln = csv.writer(f)
    if f.tell() == 0:
        ln.writerow(["Name", "Time", "Event"])

    # Camera
    cap = cv2.VideoCapture(CAM_INDEX)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam.")

    print("[INFO] Running. Press 'q' to quit.")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("[WARN] Failed to grab frame.")
                break

            visible_now.clear()

            
            small = cv2.resize(frame, (0, 0), fx=SCALE, fy=SCALE)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            rgb_small = np.ascontiguousarray(rgb_small, dtype=np.uint8)

            face_locations = face_recognition.face_locations(rgb_small, model=MODEL)
            face_encodings = face_recognition.face_encodings(rgb_small, face_locations, num_jitters=0)

            final_draw = []

            for idx, (loc, enc) in enumerate(zip(face_locations, face_encodings)):
                top, right, bottom, left = loc
                top = int(top / SCALE); right = int(right / SCALE)
                bottom = int(bottom / SCALE); left = int(left / SCALE)

                if (right - left) < MIN_BOX_SIZE or (bottom - top) < MIN_BOX_SIZE:
                    vote_buffers[idx].append("Unknown")
                    final_draw.append(("Unknown", (top, right, bottom, left)))
                    continue

                candidate, _, _ = decide_identity(enc, identities, known_faces, centroids)

                buf = vote_buffers[idx]
                buf.append(candidate)
                counts = {}
                for n in buf:
                    counts[n] = counts.get(n, 0) + 1
                name_mode, count_mode = max(counts.items(), key=lambda kv: kv[1])

                confident = (name_mode != "Unknown") and (count_mode >= VOTES_REQUIRED)
                name_final = name_mode if confident else "Unknown"
                final_draw.append((name_final, (top, right, bottom, left)))

                if confident:
                    visible_now.add(name_final)

            
            new_appearances = {n for n in visible_now if n not in visible_last and n != "Unknown"}
            for n in new_appearances:
                
                ok, status = notify_seen(name=n, external_id=None)
                if ok and status:
                    ln.writerow([n, datetime.now().strftime(TIME_FMT), status])
                    print(f"[ATTENDANCE] {n} -> {status}")

            visible_last = set(visible_now)

            
            for name, (top, right, bottom, left) in final_draw:
                color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                label = name
                (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_DUPLEX, 0.7, 1)
                y1 = max(top - 10, 0)
                cv2.rectangle(frame, (left, y1 - th - baseline - 6), (left + tw + 10, y1), color, cv2.FILLED)
                cv2.putText(frame, label, (left + 5, y1 - 5), cv2.FONT_HERSHEY_DUPLEX, 0.7, (0, 0, 0), 1, cv2.LINE_AA)

            cv2.imshow("Face Attendance", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    finally:
        cap.release()
        cv2.destroyAllWindows()
        f.close()
        print(f"[INFO] Saved attendance to {csv_path}")

if __name__ == "__main__":
    main()