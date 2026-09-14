# Frontend Explained — Like You're New to This

This file explains the **frontend** (what users see in their browser) in plain language.

---

## What Is the Frontend?

The frontend is everything the user **sees and clicks on**. It's built with:

- **Next.js 14** — a React framework. Think of it as "smart HTML + JavaScript that changes based on who's logged in."
- **Tailwind CSS** — a tool to style things without writing custom CSS files. Classes like `bg-white`, `rounded-2xl`, `shadow-xl` are Tailwind.
- **React Query (TanStack Query)** — a tool that handles "fetch data from the backend and show it on screen" automatically.
- **React Hot Toast** — small popup notifications like "Welcome back!" or "Login failed."
- **Axios** — a tool to send requests to the backend API.

---

## Folder Layout (Simplified)

```
frontend/src/
├── app/                  # Each folder here = a page URL
│   ├── login/            → /login        (login screen)
│   ├── attend/           → /attend       (QR code attendance scanner)
│   ├── attend/[id]/      → /attend/:id   (pre-filled attendance for one employee)
│   ├── employee/         → /employee     (employee dashboard)
│   ├── employee/leave/   → /employee/leave
│   ├── employee/payroll/ → /employee/payroll
│   ├── admin/            → /admin
│   ├── admin/employees/  → /admin/employees
│   ├── admin/attend/     → /admin/attendance
│   ├── admin/leave/      → /admin/leave
│   ├── admin/reports/    → /admin/reports
│   ├── hr/               → /hr           (HR officer view)
│   ├── page.jsx          → / (home — just redirects to /attend)
│   ├── layout.jsx        → wraps every page (shared header/nav)
│   └── globals.css       → global styles
├── components/           # Reusable pieces like Logo, QRScanner, cards
├── context/              # Shared state (e.g. online/offline)
├── utils/
│   ├── api.js            # The axios client — sends requests to backend
│   └── offlineDB.js      # IndexedDB helpers for offline attendance
└── ...
```

**Key idea:** In Next.js, a file at `app/login/page.jsx` automatically becomes the page at URL `/login`. No extra wiring needed.

---

## The Three Types of Users

This app has three roles, each with their own login tab and their own area:

| Role | Where they log in | Where they go after | What they can do |
|------|------------------|---------------------|------------------|
| **Employee** | `/login` → "Employee" tab | `/employee` | View own dashboard, mark attendance, apply for leave |
| **HR Officer** | `/login` → "HR Officer" tab | `/hr` | Manage employees, review leave (similar to admin but scoped) |
| **Admin** | `/login` → "Admin" tab | `/admin` | Full control: dashboard, employees, attendance, leave, payroll, reports |

The login page (`frontend/src/app/login/page.jsx`) shows three tabs. When you pick one and submit:

1. It sends a POST request to the backend.
2. If successful, the backend returns a **JWT token** + user data.
3. The frontend saves the token + data into **localStorage** (browser storage that survives page refreshes).
4. It redirects to the right dashboard.

For example, employee login saves: `employee_token` and `employee_data`. Admin login saves: `admin_token` and `admin_data`. The frontend keeps them separate so a stale admin token doesn't accidentally hijack an employee session.

---

## How a Request Works (The "API Client")

File: `frontend/src/utils/api.js`

This is a small wrapper around **axios**. It does two important things automatically:

### 1. Attaches the token to every request

Before sending any request, it checks localStorage:
- If there's an `admin_token`, use it.
- Else if there's an `hr_token`, use it.
- Else if there's an `employee_token`, use it.

Then it sets the HTTP header: `Authorization: Bearer <token>`.

That way, the backend knows who's making the request without you manually adding the token every time.

### 2. Handles 401 (unauthorized) globally

If the backend says "401 — your session expired," the API client automatically:
- Clears all tokens from localStorage.
- Redirects the user to `/login`.

You don't have to handle that in every page — it's done once, centrally.

---

## The Login Page — Step by Step

File: `frontend/src/app/login/page.jsx`

1. User picks a tab (Employee / HR Officer / Admin).
2. User types identifier (Employee ID, phone, or email for employees; email for admins) and password.
3. On submit:
   - If **Employee**: calls `POST /api/auth/login` with `{ identifier, password }`.
   - If **Admin or HR**: calls `POST /api/auth/admin/login` with `{ email, password }`.
4. On success:
   - Saves token + user data to localStorage.
   - Also saves the token to **IndexedDB** (more on that below).
   - Shows a toast "Welcome, [name]!".
   - Redirects to the right page.
5. On failure:
   - Shows a red toast with the error message.

---

## The Attendance Page (QR Scanner) — No Login Needed

File: `frontend/src/app/attend/page.jsx`

This page renders a `<QRScanner>` component. The idea:

- There's a QR code posted in the office.
- When an employee scans it (with their phone camera), it opens `/attend`.
- The page asks for the employee ID and optional GPS location.
- It calls `POST /api/attendance/check-in` **without needing a login token**.

This is intentional: people on the factory floor or field sites shouldn't need to remember a password just to mark attendance. The QR code contains a link to this page, and the backend identifies the employee by their ID.

There's also a public endpoint `GET /api/attendance/status/:employee_id` that anyone can call to check whether someone is checked in today — useful for the QR page to show status before scanning.

---

## The Employee Dashboard

File: `frontend/src/app/employee/page.jsx`

This is what an employee sees after logging in.

### What it shows:

- **Welcome card** — name, employee ID, designation, today's date, and whether they've checked in yet.
- A big button: "Mark Attendance" / "Mark Check-Out" / "Attendance Complete" — links to `/attend`.
- **Three stat cards** — Present days this month, Late days, Approved leaves.
- **Recent attendance list** — last 7 records with date, check-in/out times, status badge (Present / Late / Leave / Absent), and working minutes.
- **My leave requests** — recent leave applications with status badges.

### How it gets data:

It uses **React Query** (`useQuery`). For example:

```js
const { data: todayAtt } = useQuery({
  queryKey: ['today-status'],
  queryFn: async () => {
    const { data } = await api.get('/attendance/today');
    return data.data;
  },
  enabled: !!employee,  // only run if employee is logged in
});
```

React Query:
- Automatically calls the backend when the page loads.
- Caches the result (so if you go to another page and come back, it doesn't refetch).
- Shows nothing until data arrives (no flickering).

### Online / Offline indicator:

The dashboard checks `navigator.onLine` and shows a green "Online" or red "Offline" badge. It listens to `online` and `offline` browser events and updates accordingly.

### Bottom navigation:

A fixed bar at the bottom with 4 icons: Home, Attend, Leave, Salary. Each is a link. This works like a mobile app.

---

## The Admin Dashboard

File: `frontend/src/app/admin/page.jsx` (and related admin pages)

Admins see:
- **Summary numbers**: total employees, present, absent, on leave, late, pending leave requests.
- **Today's attendance list**: every employee with their check-in/out status.
- **Department stats**: how many present per department.
- **Attendance trend chart**: 30-day present/absent/on-leave counts (rendered with Recharts).
- **Pending leave panel**: quick-approve/reject buttons.

Admin pages use the same `api` client, but because they send the `admin_token`, the backend knows to give admin-only data.

---

## How JWT Tokens Work (Simplified)

**JWT** = JSON Web Token. It's a string the backend gives you after login. It looks like gibberish but contains:

- Who you are (employee ID, name, or admin ID, name, role).
- What type you are (`employee` or `admin`).
- When it expires (7 days for employees, 8 hours for admins by default).

The frontend just stores it and sends it back with every request. The backend verifies it (checks the signature) and decides what data to return.

**Important:** The frontend never reads or decodes the token. It just stores and sends it. That's the right way to do it.

---

## Offline Support (For Field Workers)

Files: `frontend/src/utils/offlineDB.js`, `frontend/src/components/QRScanner.jsx` (likely)

Some employees work where there's no internet (fields, remote sites). This app supports that:

1. **IndexedDB** — a browser database that works offline. The `offlineDB.js` file has helpers:
   - `savePendingRecord(record)` — saves an attendance record locally.
   - `getPendingRecords()` — retrieves all saved records.
   - `clearPendingRecords()` — deletes them after syncing.
   - `saveTokenToIDB(token)` — saves the auth token for background sync (service worker).

2. **Sync endpoint** — `POST /api/attendance/sync` accepts an array of offline records and inserts them into the database. If a record conflicts (already exists for that day), it's skipped safely (`ON CONFLICT DO NOTHING`).

3. **Flow:**
   - Employee marks attendance offline → record saved to IndexedDB.
   - When the browser comes back online, the app detects it and calls `/sync` with the pending records.
   - On success, the pending records are cleared.

---

## The Overall Frontend Flow (A Typical Day)

### Employee:

1. Opens the app → redirected to `/login`.
2. Logs in as Employee with ID `MKA-001` and password.
3. Token + data saved → redirected to `/employee`.
4. Sees dashboard: welcome card, stats, recent attendance, leave requests.
5. Taps "Mark Attendance" → goes to `/attend` → enters employee ID → calls check-in API → record saved.
6. Later, taps "Mark Check-Out" → calls check-out API.
7. Admin reviews the day's attendance from `/admin`.

### Admin:

1. Logs in as Admin → redirected to `/admin`.
2. Sees summary: X present, Y absent, Z pending leaves.
3. Clicks "Employees" → searches/adds/deactivates employees.
4. Clicks "Leave" → sees all leave requests → approves or rejects.
5. Clicks "Reports" → selects month → sees per-employee attendance summary.

---

## What Each Kit Does (Cheat Sheet)

| File / Folder | What it is |
|---------------|-----------|
| `app/login/page.jsx` | Login screen with 3 tabs |
| `app/attend/page.jsx` | QR attendance page (no login) |
| `app/employee/page.jsx` | Employee dashboard |
| `app/admin/...` | Admin pages (dashboard, employees, attendance, leave, reports) |
| `app/hr/...` | HR officer pages |
| `utils/api.js` | Axios client that auto-attaches tokens |
| `utils/offlineDB.js` | IndexedDB helpers for offline records |
| `components/QRScanner` | The QR attendance component |
| `components/shared/Logo` | Reusable logo component |
| `app/layout.jsx` | Wraps all pages (shared structure) |

---

## In One Sentence

The frontend is a set of Next.js pages that let employees mark attendance and check their stats, and let admins manage employees, review leave, and view reports — all talking to the backend through a single axios client that automatically sends the right JWT token.
