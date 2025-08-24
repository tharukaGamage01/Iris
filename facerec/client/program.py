import cv2
import csv
import math
import os
import time
import io
import hashlib
import numpy as np
import requests
import face_recognition
from collections import defaultdict, deque
from urllib.parse import urlparse
import pathlib
from typing import Dict, List, Tuple, Set, Optional
from dataclasses import dataclass
from datetime import datetime, timezone
from PIL import Image
from supabase import create_client, Client
from dotenv import load_dotenv
load_dotenv()


# =========================
# Config (env overridable)
# =========================
API_BASE = os.getenv("API_BASE", "http://localhost:8001")
IMAGES_API_URL = os.getenv("IMAGES_API_URL", f"{API_BASE}/images")

IMAGES_PAGE_SIZE = int(os.getenv("IMAGES_PAGE_SIZE", "50"))
IMAGES_MAX_PAGES  = int(os.getenv("IMAGES_MAX_PAGES", "10"))

CAM_INDEX   = int(os.getenv("CAM_INDEX", "0"))
SCALE       = float(os.getenv("SCALE", "0.25"))
MODEL       = os.getenv("MODEL", "hog")  # "hog" (CPU) or "cnn" (requires dlib CUDA build)
TOLERANCE   = float(os.getenv("TOLERANCE", "0.50"))
GAP_MARGIN  = float(os.getenv("GAP_MARGIN", "0.10"))
VOTES_WINDOW   = int(os.getenv("VOTES_WINDOW", "7"))
VOTES_REQUIRED = int(os.getenv("VOTES_REQUIRED", "3"))
MIN_BOX_SIZE   = int(os.getenv("MIN_BOX_SIZE", "40"))  # pixels on original frame
TIME_FMT    = "%H:%M:%S"

# Presence / anti-flap
APPEAR_SUSTAIN_SEC = float(os.getenv("APPEAR_SUSTAIN_SEC", "0.8"))  # must be seen this long to check-in
ABSENCE_GRACE_SEC  = float(os.getenv("ABSENCE_GRACE_SEC", "2.0"))   # must be gone this long to check-out
EVENT_DEBOUNCE_SEC = float(os.getenv("EVENT_DEBOUNCE_SEC", "3.0"))  # min time between two toggles for same person
MIN_SESSION_SEC    = float(os.getenv("MIN_SESSION_SEC", "15.0"))    # min time from check-in to check-out (per person)

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")   # must allow writes (dev: service role)
UNKNOWN_BUCKET = os.getenv("UNKNOWN_BUCKET", "unknowns")  # public bucket for unknown snapshots

# =========================
# Supabase client + people cache
# =========================
_sb: Optional[Client] = None
def init_supabase() -> Client:
    global _sb
    if _sb is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError("SUPABASE_URL / SUPABASE_KEY not set")
        _sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _sb

_people_loaded = False
id_map_by_canonical: Dict[str, dict] = {}  # canonical(name) -> {id, external_id, name}
extid_map: Dict[str, dict] = {}            # external_id -> person

def _canonical_name(s: str) -> str:
    s = (s or "").strip().lower().replace(" ", "_")
    return "".join(ch for ch in s if (ch.isalnum() or ch in "._-")).strip("_")

def _load_people_cache():
    """Fetch all students and build mappings. Called at startup and on-demand."""
    global _people_loaded, id_map_by_canonical, extid_map
    try:
        sb = init_supabase()
        res = sb.table("students").select("id, external_id, name").execute()
        data = res.data or []
        id_map_by_canonical.clear()
        extid_map.clear()
        for p in data:
            nm = p.get("name") or ""
            ext = p.get("external_id") or ""
            can = _canonical_name(nm)
            if can:
                id_map_by_canonical[can] = p
            if ext:
                extid_map[ext] = p
        print(f"[INFO] Loaded {len(data)} people for ID mapping.")
    except Exception as e:
        print(f"[WARN] Loading people cache failed: {e}")
    finally:
        _people_loaded = True

def _get_student(sb: Client, *, external_id: Optional[str] = None, name: Optional[str] = None) -> Optional[dict]:
    # 1) external_id exact
    if external_id:
        if external_id in extid_map:
            return extid_map[external_id]
        res = sb.table("students").select("id, external_id, name").eq("external_id", external_id).limit(1).execute()
        if res.data:
            p = res.data[0]
            extid_map[external_id] = p
            id_map_by_canonical[_canonical_name(p.get("name") or "")] = p
            return p

    if not name:
        return None

    # 2) wildcard ilike
    try:
        res = sb.table("students").select("id, external_id, name").ilike("name", f"%{name}%").limit(1).execute()
        if res.data:
            p = res.data[0]
            ext = p.get("external_id") or ""
            if ext:
                extid_map[ext] = p
            id_map_by_canonical[_canonical_name(p.get("name") or "")] = p
            return p
    except Exception as e:
        print(f"[WARN] wildcard lookup failed: {e}")

    # 3) canonical cache (filename stem vs DB pretty name)
    can = _canonical_name(name)
    if can in id_map_by_canonical:
        return id_map_by_canonical[can]

    # 4) refresh cache once, retry
    _load_people_cache()
    return id_map_by_canonical.get(can)

# =========================
# Attendance DB operations
# =========================
def _toggle_attendance_for_today_direct(sb: Client, student_id: str, when: datetime) -> dict:
    today = when.date().isoformat()
    iso   = when.isoformat()

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

# =========================
# Unknown handling (fingerprint + snapshots)
# =========================
def encoding_fingerprint(enc: np.ndarray) -> str:
    v = np.round(enc.astype(np.float32), 2)
    return hashlib.sha1(v.tobytes()).hexdigest()

def _crop_face_bgr(frame_bgr: np.ndarray, box: Tuple[int,int,int,int], pad: int = 10) -> np.ndarray:
    top, right, bottom, left = box
    h, w = frame_bgr.shape[:2]
    y1 = max(0, top - pad); y2 = min(h, bottom + pad)
    x1 = max(0, left - pad); x2 = min(w, right + pad)
    if y2 <= y1 or x2 <= x1:
        return frame_bgr
    return frame_bgr[y1:y2, x1:x2]

def _bgr_to_jpeg_bytes(img_bgr: np.ndarray, quality: int = 85) -> bytes:
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    pil = Image.fromarray(img_rgb)
    buf = io.BytesIO()
    pil.save(buf, format="JPEG", quality=quality)
    return buf.getvalue()

def _upload_unknown_snapshot(sb: Client, jpeg_bytes: bytes, filename: str) -> Optional[str]:
    try:
        res = sb.storage.from_(UNKNOWN_BUCKET).upload(
            filename,
            jpeg_bytes,
            {"contentType": "image/jpeg", "upsert": "true"}
        )
        if getattr(res, "error", None):
            print(f"[WARN] upload unknown snapshot failed: {res.error}")
            return None
        pub = sb.storage.from_(UNKNOWN_BUCKET).get_public_url(filename)
        return pub if isinstance(pub, str) else pub.get("publicUrl")
    except Exception as e:
        print(f"[WARN] upload_unknown_snapshot error: {e}")
        return None

def _get_or_create_unknown(sb: Client, fingerprint: str, snapshot_url: Optional[str]) -> dict:
    res = sb.table("unknown_people").select("*").eq("fingerprint", fingerprint).limit(1).execute()
    if res.data:
        person = res.data[0]
        upd = {
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
            "visits": int(person.get("visits") or 0) + 1
        }
        if snapshot_url:
            upd["last_snapshot_url"] = snapshot_url
        sb.table("unknown_people").update(upd).eq("id", person["id"]).execute()
        return {**person, **upd}

    ins = {
        "fingerprint": fingerprint,
        "first_seen_at": datetime.now(timezone.utc).isoformat(),
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
        "visits": 1,
        "last_snapshot_url": snapshot_url
    }
    r2 = sb.table("unknown_people").insert(ins).execute()
    return (r2.data or [ins])[0]

def _toggle_unknown_attendance_today(sb: Client, unknown_id: str, snapshot_url: Optional[str]) -> dict:
    today  = datetime.now(timezone.utc).date().isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()

    sel = sb.table("unknown_attendance").select("*").eq("unknown_id", unknown_id).eq("date", today).limit(1).execute()
    rows = sel.data or []

    if not rows:
        ins = {
            "unknown_id": unknown_id,
            "date": today,
            "status": "checked-in",
            "check_in_at": now_iso,
            "check_out_at": None,
            "last_seen_at": now_iso,
            "visits": 1,
            "snapshot_url": snapshot_url
        }
        r = sb.table("unknown_attendance").insert(ins).execute()
        return (r.data or [ins])[0]

    row = rows[0]
    visits = int(row.get("visits") or 0)
    status = (row.get("status") or "absent").lower()

    if status == "checked-in" and not row.get("check_out_at"):
        upd = {
            "status": "checked-out",
            "check_out_at": now_iso,
            "last_seen_at": now_iso,
            "visits": visits + 1,
            "snapshot_url": snapshot_url or row.get("snapshot_url")
        }
    else:
        upd = {
            "status": "checked-in",
            "check_in_at": now_iso,
            "check_out_at": None,
            "last_seen_at": now_iso,
            "visits": visits + 1,
            "snapshot_url": snapshot_url or row.get("snapshot_url")
        }
    sb.table("unknown_attendance").update(upd).eq("id", row["id"]).execute()
    return {**row, **upd}

# =========================
# Recognition helpers
# =========================
def _infer_name_from_url(url: str) -> str:
    path = urlparse(url).path
    fname = pathlib.Path(path).name
    stem = pathlib.Path(fname).stem
    return _canonical_name(stem)

def _url_to_rgb_image(url: str) -> Optional[np.ndarray]:
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
    return {name: np.mean(np.vstack(vecs), axis=0) for name, vecs in known_faces.items()}

def decide_identity(enc, identities, known_faces, centroids):
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

# =========================
# Presence state machine (anti-flap)
# =========================
@dataclass
class PresenceState:
    present: bool = False
    first_seen_ts: float = 0.0     # first time we started seeing (entering window)
    last_seen_ts: float = 0.0      # last frame we saw this face
    entered_at: float = 0.0        # when check-in fired
    last_toggle_at: float = 0.0    # last time we toggled (in/out)
    missing_since: float = 0.0     # first time we noticed disappearance

presence_known: Dict[str, PresenceState] = {}      # key: canonical known name
presence_unknown: Dict[str, PresenceState] = {}    # key: unknown fingerprint
_last_event_at: Dict[str, float] = {}              # global debounce per entity

def _debounced(key: str) -> bool:
    now = time.time()
    last = _last_event_at.get(key, 0.0)
    if now - last < EVENT_DEBOUNCE_SEC:
        return False
    _last_event_at[key] = now
    return True

def notify_seen_known(name: str) -> Tuple[bool, Optional[str]]:
    """Toggle attendance for a known person."""
    if not _debounced(f"known:{name}"):
        return False, None
    try:
        sb = init_supabase()
        stu = _get_student(sb, external_id=None, name=name)
        if not stu:
            print(f"[WARN] Student not found for name={name!r}")
            return False, None
        att = _toggle_attendance_for_today_direct(sb, stu["id"], datetime.now(timezone.utc))
        status = (att.get("status") or "").lower() or None
        return True, status
    except Exception as e:
        print(f"[WARN] Direct DB toggle failed for known {name}: {e}")
        return False, None

def notify_seen_unknown(fingerprint: str, frame_bgr: np.ndarray, box: Optional[Tuple[int,int,int,int]]) -> Tuple[bool, Optional[str]]:
    """Toggle attendance for an unknown person, uploading a snapshot on entry; on exit box may be None."""
    if not _debounced(f"unknown:{fingerprint}"):
        return False, None
    try:
        sb = init_supabase()
        snapshot_url: Optional[str] = None
        if box is not None:
            crop = _crop_face_bgr(frame_bgr, box, pad=12)
            jpeg = _bgr_to_jpeg_bytes(crop, quality=85)
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            filename = f"{fingerprint}_{ts}.jpg"
            snapshot_url = _upload_unknown_snapshot(sb, jpeg, filename)
        person = _get_or_create_unknown(sb, fingerprint, snapshot_url)
        att = _toggle_unknown_attendance_today(sb, person["id"], snapshot_url)
        status = (att.get("status") or "").lower() or None
        return True, status
    except Exception as e:
        print(f"[WARN] Direct DB toggle failed for unknown {fingerprint[:8]}: {e}")
        return False, None

# =========================
# Main
# =========================
def main():
    _load_people_cache()  # cache students

    # Load known encodings
    known_faces = load_known_faces_from_api()
    if not known_faces:
        raise RuntimeError("No encodings loaded from /images.")
    identities = list(known_faces.keys())
    centroids = build_centroids(known_faces)
    print(f"[INFO] Loaded identities from images: {identities}")

    vote_buffers = defaultdict(lambda: deque(maxlen=VOTES_WINDOW))

    # CSV (debug log)
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

            # Work on downscaled RGB for face_recognition
            small = cv2.resize(frame, (0, 0), fx=SCALE, fy=SCALE)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            rgb_small = np.ascontiguousarray(rgb_small, dtype=np.uint8)

            face_locations = face_recognition.face_locations(rgb_small, model=MODEL)
            face_encodings = face_recognition.face_encodings(rgb_small, face_locations, num_jitters=0)

            final_draw: List[Tuple[str, Tuple[int,int,int,int]]] = []
            seen_known_this_frame: Set[str] = set()
            seen_unknown_this_frame: List[Tuple[str, Tuple[int,int,int,int]]] = []

            # ---------- per face ----------
            for idx, (loc, enc) in enumerate(zip(face_locations, face_encodings)):
                # scale box back to original coordinates
                top, right, bottom, left = loc
                top = int(top / SCALE); right = int(right / SCALE)
                bottom = int(bottom / SCALE); left = int(left / SCALE)

                w = right - left; h = bottom - top
                if w < MIN_BOX_SIZE or h < MIN_BOX_SIZE:
                    vote_buffers[idx].append("Unknown")
                    final_draw.append(("Unknown", (top, right, bottom, left)))
                    continue

                candidate, _, _ = decide_identity(enc, identities, known_faces, centroids)

                # temporal voting per detection index
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
                    seen_known_this_frame.add(name_final)
                else:
                    fp = encoding_fingerprint(enc)
                    seen_unknown_this_frame.append((fp, (top, right, bottom, left)))

            # ---------- presence state machine ----------
            now_ts = time.time()

            # KNOWN: seen → possible CHECK-IN
            for name in seen_known_this_frame:
                st = presence_known.get(name)
                if st is None:
                    st = PresenceState()
                    presence_known[name] = st

                st.last_seen_ts = now_ts
                st.missing_since = 0.0  # we currently see them

                if not st.present:
                    # entering window
                    if st.first_seen_ts == 0.0:
                        st.first_seen_ts = now_ts

                    if (now_ts - st.first_seen_ts) >= APPEAR_SUSTAIN_SEC and (now_ts - st.last_toggle_at) >= EVENT_DEBOUNCE_SEC:
                        ok, status = notify_seen_known(name)   # writes to DB
                        if ok:
                            st.present = True
                            st.entered_at = now_ts
                            st.last_toggle_at = now_ts
                            ln.writerow([name, datetime.now().strftime(TIME_FMT), status or 'checked-in'])
                            print(f"[ATTENDANCE] {name} -> {status or 'checked-in'}")

            # KNOWN: not seen → possible CHECK-OUT
            for name, st in list(presence_known.items()):
                if st.present:
                    if name not in seen_known_this_frame:
                        if st.missing_since == 0.0:
                            st.missing_since = now_ts

                        if (now_ts - st.missing_since) >= ABSENCE_GRACE_SEC \
                           and (now_ts - st.entered_at) >= MIN_SESSION_SEC \
                           and (now_ts - st.last_toggle_at) >= EVENT_DEBOUNCE_SEC:
                            ok, status = notify_seen_known(name)
                            if ok:
                                st.present = False
                                st.first_seen_ts = 0.0
                                st.entered_at = 0.0
                                st.last_toggle_at = now_ts
                                st.missing_since = 0.0
                                ln.writerow([name, datetime.now().strftime(TIME_FMT), status or 'checked-out'])
                                print(f"[ATTENDANCE] {name} -> {status or 'checked-out'}")
                    else:
                        st.missing_since = 0.0
                else:
                    # clean stale pre-entry state
                    if st.first_seen_ts and (now_ts - max(st.first_seen_ts, st.last_seen_ts)) > (ABSENCE_GRACE_SEC * 3):
                        del presence_known[name]

            # UNKNOWN: seen → possible CHECK-IN
            for fp, box in seen_unknown_this_frame:
                st = presence_unknown.get(fp)
                if st is None:
                    st = PresenceState()
                    presence_unknown[fp] = st

                st.last_seen_ts = now_ts
                st.missing_since = 0.0

                if not st.present:
                    if st.first_seen_ts == 0.0:
                        st.first_seen_ts = now_ts

                    if (now_ts - st.first_seen_ts) >= APPEAR_SUSTAIN_SEC and (now_ts - st.last_toggle_at) >= EVENT_DEBOUNCE_SEC:
                        ok, status = notify_seen_unknown(fp, frame, box)
                        if ok:
                            st.present = True
                            st.entered_at = now_ts
                            st.last_toggle_at = now_ts
                            ln.writerow([f"unknown:{fp[:8]}", datetime.now().strftime(TIME_FMT), status or 'checked-in'])
                            print(f"[UNKNOWN] {fp[:8]} -> {status or 'checked-in'}")

            # UNKNOWN: not seen → possible CHECK-OUT
            for fp, st in list(presence_unknown.items()):
                if st.present:
                    if all(fp != fp2 for fp2, _ in seen_unknown_this_frame):
                        if st.missing_since == 0.0:
                            st.missing_since = now_ts

                        if (now_ts - st.missing_since) >= ABSENCE_GRACE_SEC \
                           and (now_ts - st.entered_at) >= MIN_SESSION_SEC \
                           and (now_ts - st.last_toggle_at) >= EVENT_DEBOUNCE_SEC:
                            ok, status = notify_seen_unknown(fp, frame, None)  # no new snapshot on exit
                            if ok:
                                st.present = False
                                st.first_seen_ts = 0.0
                                st.entered_at = 0.0
                                st.last_toggle_at = now_ts
                                st.missing_since = 0.0
                                ln.writerow([f"unknown:{fp[:8]}", datetime.now().strftime(TIME_FMT), status or 'checked-out'])
                                print(f"[UNKNOWN] {fp[:8]} -> {status or 'checked-out'}")
                    else:
                        st.missing_since = 0.0
                else:
                    if st.first_seen_ts and (now_ts - max(st.first_seen_ts, st.last_seen_ts)) > (ABSENCE_GRACE_SEC * 3):
                        del presence_unknown[fp]

            # ---------- draw overlays ----------
            for name, (top, right, bottom, left) in final_draw:
                color = (0, 255, 0) if name != "Unknown" else (0, 0, 255)
                cv2.rectangle(frame, (left, top), (right, bottom), color, 2)
                label = name if name != "Unknown" else "Unknown"
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