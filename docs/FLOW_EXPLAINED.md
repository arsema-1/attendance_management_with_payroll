# Project Flow Explained — How Everything Connects

This file explains the **full flow** of the Work Log attendance system in plain language — from the moment someone opens the app to the moment data is saved in the database.

---

## The Big Picture

There are three main pieces:

```
Browser (Frontend)          Server (Backend)           Database (PostgreSQL)
     Next.js + React              Express.js                  Tables
     port 3500                    port 5000                  port 5432
```

1. **Frontend** — what the user sees and clicks. Runs in the browser.
2. **Backend** — the brain. Validates requests, talks to the database, enforces permissions.
3. **Database** — where everything is stored permanently.

The frontend never talks to the database directly. Everything goes through the backend. This is the standard, safe way to build web apps.

---

## User Roles at a Glance

| Role | Login | Main area | Key actions |
|------|-------|-----------|-------------|
| **Employee** | Employee ID / phone / email + password | `/employee` | Check in/out, view own stats, apply for leave |
| **HR Officer** | Email + password (HR role) | `/hr` | Manage employees, review leave |
| **Admin** | Email + password (admin role) | `/admin` | Full dashboard, employees, attendance, leave, payroll, reports |

Each role gets a different JWT token type (`employee`, `hr_officer`, `admin`), and the backend checks the type before allowing access.

---

## Flow 1 — First Time / Login

### Step-by-step:

1. **User opens the app** → browser goes to `/` → Next.js redirects to `/attend` (the default page).
2. User clicks "Sign In" or navigates to `/login`.
3. On `/login`, user picks a tab: Employee, HR Officer, or Admin.
4. User enters credentials and clicks submit.

#### If Employee:

- Frontend calls `POST /api/auth/login` with `{ identifier, password }`.
- Backend looks up the employee by ID, email, or phone.
- Backend compares the password with the stored bcrypt hash.
- If correct: backend creates a JWT with `{ employee_id, name, type: 'employee' }`, expires in 7 days.
- Backend returns `{ success: true, token, employee }`.
- Frontend saves `employee_token` and `employee_data` to localStorage.
- Frontend also saves the token to IndexedDB (for offline sync).
- Frontend redirects to `/employee`.

#### If Admin or HR:

- Frontend calls `POST /api/auth/admin/login` with `{ email, password }`.
- Backend looks up the admin by email.
- Backend compares the password.
- If correct: backend creates a JWT with `{ id, name, email, role, type: 'admin' }`, expires in 8 hours.
- Backend returns `{ success: true, token, admin }`.
- Frontend saves the appropriate token (`admin_token` or `hr_token`) and data.
- Frontend redirects to `/admin` or `/hr`.

5. From now on, every request from the frontend includes the token in the `Authorization` header automatically (done by `api.js`).

---

## Flow 2 — Employee Checks In (QR Code, No Login)

This is the most important flow because it's what happens every morning.

### Before the employee arrives:

- Admin has printed a QR code and posted it in the office.
- The QR code contains a link like: `https://your-app.vercel.app/attend`.

### Step-by-step:

1. **Employee scans the QR code** with their phone camera.
2. Phone opens `/attend` in the browser.
3. The page shows a form: "Enter your Employee ID" and optionally "Allow location".
4. Employee types their ID (e.g., `MKA-001`).
5. Employee taps "Check In".

#### What happens on the backend:

- Frontend calls `POST /api/attendance/check-in` with:
  ```json
  {
    "employee_id": "MKA-001",
    "latitude": 22.5726,
    "longitude": 88.3639,
    "device_id": "...",
    "method": "qr"
  }
  ```
- Backend receives the request. No token is needed — this endpoint is public.
- Backend looks up the employee by ID. If not found or inactive → error.
- Backend checks GPS (if provided):
  - Calculates distance from the office coordinates (stored in `system_settings`).
  - If within the office radius: `gps_verified = true`, `gps_allowed = true`.
  - If outside: `gps_verified = true`, `gps_allowed = false` (records it but doesn't block — admin can review later).
- Backend checks for duplicate check-in: "Has this employee already checked in today?"
  - If yes → returns 409 with the existing check-in time. Frontend shows "Already checked in at 9:15 AM".
  - If no → continues.
- Backend checks if the arrival is late:
  - Compares current time with the "late threshold" setting (default 09:30).
  - If later → `is_late = true`, calculates `late_minutes`.
- Backend inserts a new row into the `attendance` table:
  ```sql
  INSERT INTO attendance (employee_id, date, check_in_time, checkin_lat, checkin_lng,
                          gps_verified, device_id, ip_address, method, is_late, late_minutes, status)
  VALUES ('MKA-001', '2026-09-09', '2026-09-09T09:15:00Z', ..., true, ..., 'qr', false, 0, 'present');
  ```
- Backend returns the created record with extra info (employee name, is_late, gps info).

#### What happens on the frontend:

- React Query / page receives the response.
- Shows a success toast or confirmation.
- The employee sees "Checked in at 09:15 AM".

### Later — Employee checks out:

1. Employee goes back to `/attend` (or taps "Mark Check-Out" on the dashboard).
2. Frontend calls `POST /api/attendance/check-out` with the employee ID and optional GPS.
3. Backend:
   - Finds today's attendance record.
   - If no check-in → error "No check-in found for today".
   - If already checked out → error "Already checked out today".
   - Otherwise → updates `check_out_time`, calculates `working_minutes` (the difference between check-in and check-out).
   - Returns the updated record with `working_hours: "8h 30m"`.

### The attendance record in the database:

| Column | Example value |
|--------|--------------|
| `employee_id` | `MKA-001` |
| `date` | `2026-09-09` |
| `check_in_time` | `2026-09-09T09:15:00Z` |
| `check_out_time` | `2026-09-09T18:30:00Z` |
| `status` | `present` |
| `is_late` | `false` |
| `working_minutes` | `555` (computed by a database trigger or application logic) |

This record is what payroll and reports are based on.

---

## Flow 3 — Employee Views Dashboard

1. Employee is on `/employee`.
2. Frontend uses React Query to fetch:
   - `GET /api/attendance/today` → today's check-in/out status.
   - `GET /api/attendance/history?from=2026-09-01&limit=30` → this month's records.
   - `GET /api/leave/my` → own leave requests + balance.
3. Backend verifies the employee token (from the `Authorization` header).
4. Backend uses `req.user.employee_id` to fetch only that employee's data.
5. Frontend renders:
   - Welcome card with today's status.
   - "Mark Attendance" button (links to `/attend`).
   - Three stat cards: Present, Late, Leaves.
   - Recent attendance list (last 7 records).
   - Leave requests list.

All of this happens automatically when the page loads. React Query handles caching and loading states.

---

## Flow 4 — Employee Applies for Leave

1. Employee goes to `/employee/leave`.
2. Fills the form: leave type (casual/sick/paid), from date, to date, reason.
3. Frontend calculates the number of days (excluding weekends, usually).
4. Frontend calls `POST /api/leave/apply` with:
   ```json
   {
     "leave_type": "casual",
     "from_date": "2026-09-20",
     "to_date": "2026-09-21",
     "days_requested": 2,
     "reason": "Family event"
   }
   ```
5. Backend:
   - Verifies the employee token.
   - Creates a `leave_requests` row with `status = 'pending'`.
   - Does NOT deduct the balance yet.
   - Returns the created request.
6. Frontend shows the new request in the list with a "Pending" badge.

---

## Flow 5 — Admin Reviews Leave Requests

1. Admin goes to `/admin/leave`.
2. Frontend calls `GET /api/admin/leave?status=pending`.
3. Backend returns all pending leave requests with employee names and departments.
4. Admin sees a list like:
   - `MKA-001 — Casual Leave — Sep 20-21 — Pending`
   - `MKA-002 — Sick Leave — Sep 22 — Pending`
5. Admin clicks "Approve" on the first one.
6. Frontend calls `PATCH /api/admin/leave/:id/review` with:
   ```json
   { "status": "approved", "comment": "Approved." }
   ```
7. Backend:
   - Finds the leave request.
   - Deducts 2 days from `MKA-001`'s `casual_leave_balance`.
   - Creates attendance records for Sep 20 and Sep 21 with `status = 'leave'`.
   - Updates the leave request status to `approved`.
   - Returns the updated record.
8. Frontend refreshes the list — the request now shows "Approved".

If the admin rejects instead:
- Backend sets status to `rejected` with the comment.
- No balance is deducted.
- The employee sees "Rejected" in their own leave list.

---

## Flow 6 — Admin Sees the Dashboard

1. Admin goes to `/admin`.
2. Frontend calls `GET /api/admin/dashboard`.
3. Backend runs several queries in parallel:
   - Total active employees count.
   - Today's attendance for all employees (joined with departments).
   - Count of pending leave requests.
   - Present count per department.
   - 30-day attendance trend (present/absent/on_leave per day).
4. Backend combines everything into one response:
   ```json
   {
     "success": true,
     "data": {
       "summary": { "total": 50, "present": 42, "absent": 5, "on_leave": 3, "late": 4, "pending_leaves": 7 },
       "today_records": [ ... ],
       "department_stats": [ ... ],
       "attendance_trend": [ ... ]
     }
   }
   ```
5. Frontend renders:
   - Summary numbers at the top.
   - A table of today's attendance.
   - A chart showing the 30-day trend (using Recharts).
   - A panel showing pending leave requests with quick-approve/reject buttons.

Because the backend uses `Promise.all`, all queries run at the same time, so the dashboard loads in one round-trip instead of five.

---

## Flow 7 — Admin Adds a New Employee

1. Admin goes to `/admin/employees/add`.
2. Fills the form: employee ID, name, email, phone, department, designation, joining date, salary, password, bank info.
3. Frontend calls `POST /api/admin/employee/add` with all the data.
4. Backend:
   - Verifies the admin token (must be HR role).
   - Validates all required fields.
   - Hashes the password with bcrypt.
   - Inserts into the `employees` table.
   - Returns the new employee record.
5. Frontend shows a success message.

The new employee can now log in with their ID and the password the admin set.

---

## Flow 8 — Offline Attendance (Field Workers)

Some employees work where there's no internet. This system handles that.

### Step-by-step:

1. Employee opens `/attend` while offline.
2. Frontend detects `navigator.onLine === false`.
3. Employee enters their ID and taps "Check In".
4. Frontend saves the record to **IndexedDB** (a browser database) using `savePendingRecord()`.
   - The record includes: employee_id, check_in_time, date, method, GPS (if available).
5. The employee sees "Saved offline — will sync when online".
6. Later, when the employee comes back to the office and the browser goes online:
   - Frontend detects the `online` event.
   - Frontend calls `getPendingRecords()` to get all saved records.
   - Frontend calls `POST /api/attendance/sync` with the array of records.
   - Backend inserts each record into the `attendance` table.
     - If a record already exists for that employee on that day, it's skipped (`ON CONFLICT DO NOTHING`).
   - Backend returns `{ synced: 3, skipped: 0, errors: [] }`.
   - Frontend clears the pending records from IndexedDB.
   - The records now appear in the employee's history and the admin's dashboard.

The sync endpoint is designed to be safe to call multiple times — duplicate records are silently skipped.

---

## Flow 9 — Reports and Payroll

### Reports:

1. Admin goes to `/admin/reports`.
2. Selects a month and year (or a date range).
3. Optionally filters by department or employee.
4. Frontend calls `GET /api/admin/reports?month=9&year=2026&department=IT`.
5. Backend:
   - Generates a list of working days (Monday-Friday) for that month using `generate_series`.
   - For each employee: counts present days, leave days, late days, and calculates absent days.
   - Returns a per-employee summary.
6. Frontend renders a table or chart.

### Payroll:

1. Admin goes to `/admin/payroll` (or wherever payroll is).
2. Clicks "Generate Payroll" for a month.
3. Frontend calls `POST /api/payroll/generate` with the month and year.
4. Backend:
   - For each active employee: looks up their attendance for that month.
   - Calculates: base salary, deductions for late days, deductions for unapproved absences, etc.
   - Creates a `payroll_records` row with `status = 'draft'`.
5. Admin reviews and marks as paid.
6. The payroll record is used for actual salary disbursement (outside the app).

---

## The Data Model (How Tables Connect)

```
departments (1) ──< (many) employees
employees   (1) ──< (many) attendance
employees   (1) ──< (many) leave_requests
employees   (1) ──< (many) payroll_records
admins      (separate, no direct link to employees except through actions)
```

- **`departments`** — just a list of department names. Each employee belongs to one department.
- **`employees`** — the core table. Contains personal info, leave balances, password hash, bank info, active status.
- **`attendance`** — one row per employee per day. Linked to `employees` by `employee_id`.
- **`leave_requests`** — one row per leave application. Linked to `employees` by `employee_id`. Status goes: pending → approved/rejected/canceled.
- **`payroll_records`** — one row per employee per month. Linked to `employees` by `employee_id`. Status: draft → paid.
- **`system_settings`** — key-value pairs for config like office GPS, late threshold, QR URL.

---

## The Auth System (How the Backend Knows Who's Who)

### The token is the key:

When the frontend makes a request, it includes:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The backend middleware:
1. Extracts the token.
2. Calls `jwt.verify(token, JWT_SECRET)`.
3. Gets back the decoded payload: `{ employee_id, name, type }` or `{ id, name, email, role, type }`.
4. Attaches it to `req.user` or `req.admin`.
5. The controller uses that info to fetch the right data.

### Different tokens for different roles:

- **Employee token**: contains `employee_id`, `name`, `type: 'employee'`. Expires in 7 days.
- **Admin token**: contains `id`, `name`, `email`, `role`, `type: 'admin'`. Expires in 8 hours (shorter because admins have more power).
- **HR token**: same as admin token, but with `role: 'hr_officer'`.

The backend checks the `type` field first (employee vs admin), then checks the `role` field for finer-grained permissions (super_admin vs hr_admin vs hr_officer).

---

## The CORS Setup (Why the Frontend Can Talk to the Backend)

The frontend runs on one domain (e.g., `https://your-app.vercel.app` or `http://localhost:3500`). The backend runs on another (e.g., `https://your-api.onrender.com` or `http://localhost:5000`).

By default, browsers block JavaScript from making requests across domains. **CORS** is how the backend says "it's okay, this domain is allowed."

In `app.js`:

```js
const allowedOrigins = process.env.CORS_ORIGIN
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
// e.g. ['https://your-app.vercel.app', 'http://localhost:3500']
```

When the frontend makes a request, the browser sends an `Origin` header. The backend checks if that origin is in the allowed list. If yes, it responds with `Access-Control-Allow-Origin: <origin>` and the browser allows the request. If not, the browser blocks it and shows a CORS error in the console.

This is why, when deploying:
1. You set `CORS_ORIGIN` to your Vercel domain on Render.
2. You set `NEXT_PUBLIC_API_URL` to your Render API URL on Vercel.
3. Everything connects.

---

## The Environment Variables (What Controls What)

### Backend (`.env`):

| Variable | What it does |
|----------|-------------|
| `DATABASE_URL` | Connection string to PostgreSQL |
| `DB_SSL` | Whether to use SSL (true in production with Supabase) |
| `JWT_SECRET` | Secret key for signing/verifying tokens — keep this safe |
| `JWT_EXPIRES_IN` | How long employee tokens last (default: 7d) |
| `JWT_ADMIN_EXPIRES_IN` | How long admin tokens last (default: 8h) |
| `CORS_ORIGIN` | Allowed frontend domains |
| `OFFICE_LATITUDE` / `OFFICE_LONGITUDE` | Office GPS coordinates for check-in validation |
| `OFFICE_RADIUS` | Radius in meters for GPS check |
| `FACE_CONFIDENCE_THRESHOLD` | For face recognition feature |
| `NODE_ENV` | `production` or `development` |
| `PORT` | Server port (default: 5000) |

### Frontend (`.env.local` or Vercel env):

| Variable | What it does |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API |
| `NEXT_PUBLIC_APP_NAME` | App name shown in the UI |
| `NEXT_PUBLIC_OFFICE_LAT` / `NEXT_PUBLIC_OFFICE_LNG` | Office coordinates (used by frontend for GPS UI) |

---

## The Full Picture in One Diagram

```
User opens app
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js, port 3500 or Vercel)                   │
│                                                             │
│  1. Renders login page (/login)                             │
│  2. User picks role, enters credentials                     │
│  3. Calls POST /api/auth/login or /api/auth/admin/login    │
│  4. Receives JWT token + user data                          │
│  5. Saves token to localStorage + IndexedDB                │
│  6. Redirects to /employee, /admin, or /hr                 │
│                                                             │
│  --- Logged in ---                                          │
│                                                             │
│  7. Renders dashboard (employee or admin)                  │
│  8. React Query calls API endpoints automatically          │
│  9. api.js attaches the JWT token to every request         │
│ 10. Shows data, charts, lists, forms                       │
│                                                             │
│  --- Attendance ---                                         │
│                                                             │
│ 11. User goes to /attend                                    │
│ 12. Enters employee ID (no login needed)                   │
│ 13. Calls POST /api/attendance/check-in                    │
│ 14. If offline: saves to IndexedDB                         │
│ 15. If online: sends to backend, gets response             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
  │                         │                         │
  │  HTTP requests          │                         │
  ▼                         ▼                         ▼
┌──────────────────────────┴─────────────────────────┐
│  BACKEND (Express.js, port 5000 or Render)         │
│                                                     │
│  Middleware stack:                                  │
│   → Helmet (security headers)                      │
│   → CORS (allow listed origins)                    │
│   → Body parser (read JSON)                        │
│   → Rate limiter (prevent abuse)                   │
│   → Auth middleware (verify JWT, if required)      │
│                                                     │
│  Route handling:                                    │
│   → /api/auth/*        → auth.controller.js        │
│   → /api/attendance/*  → attendance.controller.js  │
│   → /api/leave/*       → leave.controller.js       │
│   → /api/admin/*       → admin.controller.js       │
│   → /api/payroll/*     → payroll.controller.js     │
│                                                     │
│  Each controller:                                   │
│   → Validates input                                 │
│   → Queries PostgreSQL                              │
│   → Returns JSON response                           │
│                                                     │
└─────────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────────┐
│  DATABASE (PostgreSQL)                                       │
│                                                               │
│  tables: employees, admins, departments,                     │
│          attendance, leave_requests, payroll_records,        │
│          system_settings, face_embeddings                     │
│                                                               │
│  Stores everything permanently.                              │
│  The backend is the only one that talks to it.               │
└─────────────────────────────────────────────────────────────┘
```

---

## Common Questions a Beginner Might Have

### Q: Why does the frontend save tokens to localStorage? Isn't that insecure?

A: localStorage is accessible to JavaScript, which means if someone injects malicious JavaScript into your page (XSS attack), they could steal the token. For a small internal tool like this, it's acceptable. For high-security apps, you'd use httpOnly cookies instead. This app uses localStorage for simplicity.

### Q: Why are check-in/check-out public? Can't someone fake attendance?

A: The check-in endpoint only requires an employee ID. An attacker could theoretically check in as someone else if they know the ID. However:
- GPS verification adds a layer (the request should come from near the office).
- The system logs IP addresses and device IDs.
- Admins can review suspicious records.
- For higher security, you'd add face recognition or PIN verification. This app has a face recognition feature (face-api.js) for that purpose.

### Q: What happens if the backend is down?

A: The frontend shows an error. For attendance, offline records are saved to IndexedDB and synced when the backend is back up. The admin dashboard won't load, but that's expected during downtime.

### Q: How does the leave balance work?

A: Each employee has three balances: casual, sick, and paid leave. When an admin approves a leave request, the corresponding balance is decremented by the number of days. If the balance is insufficient, the approval might be blocked or flagged. When a leave is rejected or canceled, no balance is deducted.

### Q: What's the difference between HR Officer and Admin?

A: Both can view the dashboard and employees. But:
- **Admin (super_admin)**: can create other admins, manage all admin accounts.
- **HR Officer**: can add/edit/deactivate employees, review leave, manage bank info. Cannot create admin accounts.
- **Admin (hr_admin)**: similar to HR Officer but with higher-level HR permissions.

The `requireRole` middleware enforces this by checking `req.admin.role`.

---

## Summary

1. **Frontend** = what users see. Built with Next.js. Handles login forms, dashboards, attendance forms, leave forms, admin panels. Talks to the backend through an axios client that auto-attaches JWT tokens.

2. **Backend** = the brain. Built with Express.js. Receives requests, checks permissions, talks to PostgreSQL, returns JSON. Organized into routes (URLs), controllers (logic), and middleware (guards).

3. **Database** = the memory. PostgreSQL stores all data in tables. The backend queries it with parameterized SQL (safe from SQL injection).

4. **Auth** = JWT tokens. The backend gives a token on login. The frontend sends it with every request. The backend verifies it and knows who's making the request.

5. **Attendance** = public check-in/check-out (for QR codes) + protected history (for logged-in employees). Records are stored per employee per day.

6. **Leave** = apply (employee) → pending → approve/reject (admin) → balance deducted on approval.

7. **Offline** = IndexedDB saves records when there's no internet. A sync endpoint uploads them when back online.

8. **Deployment** = Supabase (database) → Render (backend) → Vercel (frontend). The three are connected via environment variables and CORS settings.
