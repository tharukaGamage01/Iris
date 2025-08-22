Project: Face Attendance (Iris)

Overview

This repository contains a face-recognition-based attendance system with two main parts:

- `facerec/` — FastAPI backend, Supabase integration (storage + Postgres), and a Python camera client that recognizes faces and records attendance.
- `admin-dashboard/` — Next.js + React admin dashboard for viewing students and attendance.

This README explains how to run the project locally, what environment variables are required, how to push changes to GitHub, and how to add environment variables as GitHub repository secrets for deployment.

Quick repo layout

- admin-dashboard/ — frontend (Next.js + pnpm)
- facerec/ — backend (FastAPI) and camera client
- photos/ and img/ — sample images used for enrollment/testing

Prerequisites

- Node.js (LTS) and pnpm (or npm/yarn). pnpm is used in this repo.
- Python 3.10+ (venv recommended)
- Git and (optionally) GitHub CLI (`gh`) for automating secret creation
- A Supabase project with:
  - Storage bucket for images (recommended public or signed URLs)
  - Postgres schema with `students` and `attendance` tables (see backend app code for expected columns)

Local setup — backend (facerec)

1. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

2. Install Python dependencies

```bash
pip install -r requirements.txt
```

3. Create a `.env` file in `facerec/` (do NOT commit this) with the variables below. Example content:

```env
SUPABASE_URL=https://xyz.supabase.co
SUPABASE_KEY=your_service_role_or_anon_key
SUPABASE_BUCKET=images
VERIFY_THRESHOLD=0.75
IDENTIFY_MARGIN=0.12
```

Important: Use a server-side service role key only on the backend. Do NOT expose the service role key to the browser. For frontend deployments use the Supabase anon/public key stored in the frontend's environment (NEXT_PUBLIC_...)

4. Run the backend (development):

```bash
source venv/bin/activate
python -m uvicorn app.api:app --host 127.0.0.1 --port 8001 --reload
```

Local setup — frontend (admin-dashboard)

1. Install dependencies and run dev server

```bash
cd admin-dashboard
pnpm install
pnpm run dev
```

2. Create `.env.local` in `admin-dashboard/` (do NOT commit) with these keys:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001
```

Camera client (optional)

- The camera client in `facerec/client/program.py` expects the backend or Supabase credentials in its own `.env`.
- It can either call the backend `/attendance/seen` endpoint or write directly to Supabase (see the code and environment variables used).

Environment variables (summary)

Backend (`facerec/.env`)
- SUPABASE_URL — your Supabase project URL
- SUPABASE_KEY — service role key (server-only) or anon key depending on your usage (service key provides DB writes)
- SUPABASE_BUCKET — optional (default: images)
- VERIFY_THRESHOLD, IDENTIFY_MARGIN — optional tuning values

Frontend (`admin-dashboard/.env.local`)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_API_BASE_URL

CI / Deployment secrets (GitHub repo secrets — use these names or map them in your CI):
- SUPABASE_URL
- SUPABASE_KEY
- SUPABASE_BUCKET
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_API_BASE_URL

How to add environment variables to GitHub repository secrets

Option A — GitHub web UI

1. Go to the repository on github.com.
2. Click Settings → Secrets and variables → Actions (or "Environments" for environment-scoped secrets).
3. Click "New repository secret".
4. Enter the Name (e.g., `SUPABASE_URL`) and the Secret value, then click "Add secret".

Option B — GitHub CLI (faster, repeatable)

Install `gh` and authenticate: `gh auth login`

```bash
# example: create a repository secret
gh secret set SUPABASE_URL --body "https://xyz.supabase.co"
gh secret set SUPABASE_KEY --body "your_service_role_key"
# For frontend public keys, set NEXT_PUBLIC_... names
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --body "your_anon_key"
```

Notes on secrets

- Keep the SUPABASE service role key private and only use it server-side.
- For Vercel/Render deployments, set these repository/ project-level environment variables in the hosting provider dashboard instead of committing them to the repo.

How to push your local changes to GitHub

If your local folder is already a git repository with a remote configured, the steps are:

```bash
git status
git add .
git commit -m "Describe your changes"
git push
```

If this is a new repository and you need to add a remote:

```bash
git remote add origin git@github.com:youruser/yourrepo.git
git branch -M main
git push -u origin main
```

If you prefer HTTPS:

```bash
git remote add origin https://github.com/youruser/yourrepo.git
git push -u origin main
```

Deployment suggestions (quick)

- Frontend: Vercel is simple for Next.js. Connect the repo, set `NEXT_PUBLIC_*` variables in Vercel UI, and deploy.
- Backend: Render or Railway are good choices. Add the `SUPABASE_*` secrets in the service settings and deploy the `facerec` app pointing to `uvicorn app.api:app`.

Security and final notes

- Never commit `.env` files or secret keys. Add `.env` to `.gitignore` if not already ignored.
- Confirm database schema and indexes in Supabase to match the code's expectations (student id, external_id, name; attendance entries with check_in_at/check_out_at/visits/last_seen_at).

If you want, I can:
- Add this README to the repository (I just created it).
- Create a tidy `DEPLOY.md` with provider-specific steps for Vercel + Render.
- Create a small GitHub Actions workflow that injects secrets and deploys (you tell me which provider you'd like to target).

--
README added to repository root. If you'd like me to also create a small `DEPLOY.md` or a GitHub Actions example for your chosen host, tell me which host and I will add it.
