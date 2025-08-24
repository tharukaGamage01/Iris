#  Iris — Facial Recognition Smart Attendance System  



Iris is a **real-time face recognition attendance system** designed for accuracy, speed, and a bit of style.  
No more calling names. No more proxies. Just **look at the camera, and you’re checked in.**  

---

## What’s Inside?

### 1. **facerec (backend)**
- Built with **FastAPI** (because who likes waiting?)  
- Stores attendance in **Supabase** (Postgres + Storage)  
- A Python **camera client** that recognizes faces in real-time and marks attendance automatically.

### 2. **admin-dashboard (frontend)**
- **Next.js + React** for a snappy UI  
- Manage students, view attendance logs, and feel like you’re running a mission control center.

---

## Getting Started  

### **Backend Setup (`facerec`)**

#### 1. Create and activate a virtual environment
```bash
python -m venv venv   # MacOS
source venv/bin/activate
```

#### 2. Install dependencies
```bash
pip install -r requirements.txt
```

#### 3. Add your environment variables  
Create a `.env` inside `facerec` and paste:  
```env
DATABASE_URL=postgresql://postgres:91PZNsDWgu7Mi6cy@db.aufuhhidcwyjtpafwckk.supabase.co:5432/postgres

SUPABASE_URL=https://aufuhhidcwyjtpafwckk.supabase.co
SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZnVoaGlkY3d5anRwYWZ3Y2trIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTI3OTA1OCwiZXhwIjoyMDcwODU1MDU4fQ.qnblIS0jkND4KCZDYzo98wTFAksPXU_wH69VZ7FiktQ
SUPABASE_BUCKET=images

API_BASE=http://localhost:8001
IMAGES_API_URL=http://localhost:8001/images

TOLERANCE=0.50
GAP_MARGIN=0.10
VOTES_WINDOW=7
VOTES_REQUIRED=3
MIN_BOX_SIZE=40

APPEAR_SUSTAIN_SEC=0.8
ABSENCE_GRACE_SEC=2.0
EVENT_DEBOUNCE_SEC=3.0
MIN_SESSION_SEC=15.0

CAM_INDEX=0
SCALE=0.25
MODEL=hog
IMAGES_PAGE_SIZE=50
IMAGES_MAX_PAGES=10
```

#### 4. Fire it up  
Terminal 1 — Start API server:  
```bash
source venv/bin/activate
python -m uvicorn app.api:app --host 127.0.0.1 --port 8001 --reload
```
Terminal 2 — Start camera client:  
```bash
source venv/bin/activate
python client/program.py
```

---

### **Frontend Setup (`admin-dashboard`)**

#### 1. Install dependencies
```bash
cd admin-dashboard
pnpm install
```

#### 2. Add your environment variables  
Create a `.env.local` inside `admin-dashboard` and paste:  
```env
NEXT_PUBLIC_SUPABASE_URL=https://aufuhhidcwyjtpafwckk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1ZnVoaGlkY3d5anRwYWZ3Y2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUyNzkwNTgsImV4cCI6MjA3MDg1NTA1OH0.UTR3wtj48Tl_xTkXzFuhpXSwpl4LdbPlTZpMrrwn3iA
NEXT_PUBLIC_SUPABASE_BUCKET=images
NEXT_PUBLIC_API_BASE_URL=http://localhost:8001
```

#### 3. Run the dev server  
```bash
pnpm run dev
```

---

##  Tech Stack
- **Backend:** FastAPI, Python, face_recognition, Supabase  
- **Frontend:** Next.js, React, Tailwind CSS  
- **Database:** Postgres (Supabase)  
- **Storage:** Supabase bucket  

---

##  Why Iris?
- **Fast & Accurate** — no more false check-ins (unless you have an evil twin).  
- **Real-Time Updates** — attendance as it happens.  
- **Dashboard Control** — admin panel that’s actually pleasant to use.  

---

##  How It Works
1. **Enroll a student** by capturing their face.  
2. **Stand in front of the camera** — the system detects and matches your face.  
3. **Attendance logged automatically** into Supabase.  
4. **Admin dashboard** keeps everything organized.  

---

## License
This project is open for learning and development purposes.  
Feel free to fork, tweak, and improve Iris — she won’t mind.  

---
