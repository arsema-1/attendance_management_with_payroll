# Backend Explained — Like You're New to This

This file explains the **backend** (the server that does the real work) in plain language.

---

## What Is the Backend?

The backend is the **server** that:

- Receives requests from the frontend (login, check-in, leave requests, etc.).
- Checks if the user is who they say they are.
- Talks to the database (PostgreSQL).
- Sends back a response (success/failure, data, etc.).

It's built with:

- **Node.js** — JavaScript that runs on the server, not the browser.
- **Express.js** — a framework that makes it easy to set up routes, handle requests, and attach middleware.
- **PostgreSQL** — a relational database (tables with rows and columns).
- **JSON Web Tokens (JWT)** — for authentication.
- **bcrypt** — for hashing passwords so they're never stored as plain text.

---

## The Two Main Entry Files

### `backend/src/server.js` — "Start the server"

```js
require("dotenv").config();
const app = require("./app");
const db = require("./config/database");
const seedAdmin = require("./utils/seedAdmin");
```

This file:

1. Loads environment variables from `.env` (database URL, JWT secret, etc.).
2. Imports the Express app (from `app.js`).
3. Imports the database connection.
4. Calls `seedAdmin()` — automatically creates the default admin account if it doesn't exist yet.
5. Starts listening on port 5000.

When you run `node src/server.js`:

- It connects to the database.
- Creates the admin if needed.
- Prints "🚀 Server running on port 5000".
- Waits for incoming requests.

### `backend/src/app.js` — "Set up the app"

This file:

1. Creates an Express app.
2. Sets up **security headers** (helmet).
3. Sets up **CORS** — controls which websites can talk to this backend.
4. Sets up **body parsers** — so Express can read JSON from the request body.
5. Sets up an **HTTP logger** (morgan) — logs every request like a web server log.
6. Sets up **rate limiters** — prevents abuse:
   - Global: 120 requests per minute.
   - Auth endpoints: 10 attempts per 15 minutes (stricter, to stop brute force).
   - Attendance endpoints: 20 per minute (QR scans can be frequent).
7. Mounts all the route files (auth, attendance, admin, leave, payroll, etc.).
8. Adds a `/health` endpoint — returns `{"status":"ok"}` for health checks.
9. Adds a 404 handler — returns a JSON error for unknown routes.
10. Adds an **error handler** — catches all errors and returns a consistent JSON format.

---

## Middleware — The "Guards" That Run Before Your Code

**Middleware** is code that runs **before** the actual route handler. Think of it as a series of checkpoints.

### 1. CORS (Cross-Origin Resource Sharing)

```js
app.use(cors({ origin: ..., credentials: true, ... }));
```

Browsers block frontend JavaScript from calling a backend on a different domain unless the backend explicitly allows it. CORS is that "allow list."

Example: The frontend runs on `http://localhost:3500`. The backend runs on `http://localhost:5000`. Without CORS, the browser would block the request. With CORS, the backend says "yes, `localhost:3500` is allowed."

In production: `CORS_ORIGIN=https://your-app.vercel.app`.

### 2. Helmet

Sets security headers (like telling the browser "don't allow this page to be embedded in an iframe"). It's a safety measure.

### 3. Body Parsers

```js
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
```

Without this, `req.body` would be empty. These lines tell Express: "If the request has a JSON body, parse it and make it available as `req.body`."

### 4. Rate Limiters

Prevents one person from spamming the server. For example, the auth limiter says "only 10 login attempts per 15 minutes per IP." This stops brute-force password guessing.

### 5. Auth Middleware (the most important one)

File: `backend/src/middleware/auth.middleware.js`

This is how the backend knows who's making a request.

#### How it works:

1. It looks for a token in:
   - The `Authorization` header (format: `Bearer <token>`), or
   - The `?token=` query parameter (for file downloads, etc.).
2. It verifies the token using `jwt.verify(token, JWT_SECRET)`.
3. If valid:
   - It attaches the decoded data to `req.user` (for employees) or `req.admin` (for admins).
   - It calls `next()` to move to the actual route handler.
4. If invalid or expired:
   - It calls `next(error)` with a proper error, which the error handler turns into a JSON response.

#### Different auth middleware for different purposes:

| Middleware | What it checks |
|-----------|---------------|
| `authenticateEmployee` | Token must be of type `employee` |
| `authenticateAdmin` | Token must be of type `admin` |
| `authenticateUser` | Token can be either employee or admin |
| `requireRole('hr_officer', 'hr_admin')` | Admin must have one of these roles |

Example:

```js
router.get('/dashboard', authenticateAdmin, getDashboard);
```

This means: "Only admins can call this. If not an admin, stop here and return 403."

---

## Routes — "What URL does what"

File: `backend/src/app.js` (mounting)

Each feature has its own route file. For example:

```js
app.use('/api/auth',       authLimiter,   authRoutes);
app.use('/api/attendance', attendLimiter, attendanceRoutes);
app.use('/api/admin',      authenticateAdmin, adminRoutes);
```

This means:
- Anything starting with `/api/auth` goes to `authRoutes`.
- Anything starting with `/api/attendance` goes to `attendanceRoutes`.
- Anything starting with `/api/admin` first passes through `authenticateAdmin` middleware, then goes to `adminRoutes`.

### Auth routes (`backend/src/routes/auth.routes.js`)

| Method | Endpoint | What it does | Who can call |
|--------|----------|-------------|-------------|
| POST | `/api/auth/login` | Employee login | Anyone |
| POST | `/api/auth/admin/login` | Admin/HR login | Anyone |
| POST | `/api/auth/register` | Create employee | Admin (super_admin or hr_admin only) |
| POST | `/api/auth/admin/create` | Create admin | super_admin only |
| GET | `/api/auth/admin/list` | List all admins | super_admin only |

### Attendance routes (`backend/src/routes/attendance.routes.js`)

| Method | Endpoint | What it does | Who can call |
|--------|----------|-------------|-------------|
| GET | `/api/attendance/status/:employee_id` | Check if employee is checked in | Anyone (public, for QR) |
| POST | `/api/attendance/check-in` | Mark check-in | Anyone (public, for QR) |
| POST | `/api/attendace/check-out` | Mark check-out | Anyone (public) |
| GET | `/api/attendance/today` | Get today's record for logged-in employee | Employee (authenticated) |
| GET | `/api/attendance/history` | Get attendance history | Employee (authenticated) |
| POST | `/api/attendance/sync` | Upload offline records | Employee (authenticated) |

Notice: check-in, check-out, and status are **public**. They don't require a token. This is what makes the QR code flow work — an employee scans a QR code, lands on `/attend`, enters their ID, and checks in without logging in.

### Admin routes (`backend/src/routes/admin.routes.js`)

All admin routes require `authenticateAdmin` first. Then:

| Method | Endpoint | Who can call | What it does |
|--------|----------|-------------|-------------|
| GET | `/api/admin/dashboard` | Any admin | Dashboard stats |
| GET | `/api/admin/employees` | Any admin | List employees |
| POST | `/api/admin/employee/add` | HR roles only | Add employee |
| PATCH | `/api/admin/employee/:id` | HR roles only | Update employee |
| PATCH | `/api/admin/employee/:id/deactivate` | HR roles only | Deactivate employee |
| PATCH | `/api/admin/employee/:id/bank` | HR roles only | Update bank info |
| GET | `/api/admin/leave` | Any admin | List leave requests |
| PATCH | `/api/admin/leave/:id/review` | HR roles only | Approve/reject leave |
| GET | `/api/admin/reports` | Any admin | Monthly reports |

---

## Controllers — "The actual logic"

A controller is a function that handles one specific request. It lives in `backend/src/controllers/`.

### Example: Employee Login Controller

File: `backend/src/controllers/auth.controller.js` → `employeeLogin`

```js
const employeeLogin = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    // 1. Find employee by ID, email, or phone
    const result = await db.query(
      `SELECT * FROM employees
       WHERE (employee_id = $1 OR LOWER(email) = LOWER($1) OR phone = $1) AND is_active = TRUE`,
      [normalizedIdentifier]
    );

    // 2. If not found → error
    if (!result.rows.length)
      throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    // 3. Check password (bcrypt compare)
    const ok = await bcrypt.compare(password, emp.password_hash);
    if (!ok) throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);

    // 4. Create JWT token
    const token = jwt.sign(
      { employee_id: emp.employee_id, name: emp.full_name, type: 'employee' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // 5. Send back token + employee data (without password hash)
    return res.json({ success: true, token, employee: safe });
  } catch (err) { next(err); }
};
```

**Key points:**
- Passwords are never stored as plain text. They're hashed with bcrypt. To check a password, you use `bcrypt.compare`, not string equality.
- The JWT token includes the employee's ID and type. That's how the backend knows who's who later.
- The token expires (7 days for employees, 8 hours for admins). After that, the user must log in again.
- The response includes `success: true` and the data. The frontend checks `success` and reads `data`.

### Example: Check-In Controller

File: `backend/src/controllers/attendance.controller.js` → `checkIn`

This is the heart of the attendance system. Here's what it does step by step:

1. **Get the employee ID** from the request body.
2. **Verify the employee exists** (and is active).
3. **Optional GPS check**: If latitude/longitude are provided, check if the location is within the office radius using `isWithinOffice()`. This sets `gps_verified` and `gps_allowed` flags. The check is a **warning**, not a block — the record is still created, and admins can review GPS-flagged records later.
4. **Prevent duplicate check-in**: Check if there's already a record for today. If yes, return a 409 error with the existing check-in time.
5. **Determine if late**: Compare the current time with the "late threshold" setting (default 09:30). If later, mark as late and calculate late minutes.
6. **Insert the record** into the `attendance` table.
7. **Return the record** with extra computed fields (employee name, is_late, gps info).

The `checkOut` controller is similar:
- Verifies the employee checked in today.
- Prevents double check-out.
- Updates the record with check-out time and calculates `working_minutes`.

### Example: Leave Review Controller

File: `backend/src/controllers/leave.controller.js` → `reviewLeave`

When an admin approves or rejects a leave request:

1. Finds the leave request.
2. If approving:
   - Deducts the leave days from the employee's balance (casual, sick, or paid).
   - Updates the leave request status to `approved`.
3. If rejecting:
   - Sets status to `rejected` with a comment.
4. Returns the updated record.

The leave workflow (from the employee side) is in `backend/src/controllers/leave.controller.js`:

- `applyLeave` — employee submits a leave request. Status: `pending`.
- `getMyLeaves` — employee sees their own requests + balance.
- `cancelLeave` — employee cancels a pending request. Status: `canceled`.

---

## The Database — "Where data lives"

File: `backend/src/config/database.js` (or wherever the DB connection is set up)

The backend uses **PostgreSQL** with the `pg` library. The pattern is:

```js
const db = require('../config/database');
const result = await db.query('SELECT * FROM employees WHERE ...', [params]);
```

### How the DB connection works:

1. When the server starts (`server.js`), it runs `db.query('SELECT NOW()')` to test the connection.
2. If it fails, the server exits with an error.
3. If it succeeds, the server continues.

### Database tables (simplified):

| Table | What it stores |
|-------|---------------|
| `employees` | Employee accounts: ID, name, email, phone, department, leave balances, password hash, active status |
| `admins` | Admin accounts: name, email, password hash, role (super_admin, hr_admin, hr_officer, viewer) |
| `departments` | Department names (Management, IT, HR, etc.) |
| `attendance` | Daily check-in/check-out records: employee_id, date, check_in_time, check_out_time, status, is_late, GPS info, method |
| `leave_requests` | Leave applications: employee_id, leave_type, from_date, to_date, days_requested, status (pending/approved/rejected/canceled), comment |
| `payroll_records` | Monthly payroll: employee_id, month, year, base_salary, gross, net, status (draft/paid) |
| `system_settings` | Company config: office GPS coordinates, late threshold, QR URL, etc. |

### Key database design choices:

- **Employees are looked up by multiple fields**: The login and check-in endpoints search by `employee_id`, `email`, or `phone`. This makes it flexible — an employee can log in with whatever they remember.
- **`is_active` flag**: Instead of deleting employees, the app sets `is_active = FALSE`. Deactivated employees can't log in or check in, but their history is preserved.
- **Leave balances**: Stored directly on the `employees` table as `casual_leave_balance`, `sick_leave_balance`, `paid_leave_balance`. When a leave is approved, the balance is decremented.
- **Attendance is per-day**: There's one record per employee per day. The unique constraint is on `(employee_id, date)` — you can't have two check-ins for the same day.

---

## The JWT Authentication Flow (Step by Step)

### Step 1: Login

Frontend sends:
```
POST /api/auth/login
Body: { identifier: "MKA-001", password: "Admin@1234" }
```

Backend:
1. Looks up the employee by ID/email/phone.
2. Compares the password with the stored hash.
3. If correct: creates a JWT with the employee's ID, name, and type.
4. Returns: `{ success: true, token: "eyJ...", employee: { ... } }`.

### Step 2: Subsequent Requests

Frontend stores the token in localStorage. For every future request, the `api.js` client attaches it:

```
GET /api/attendance/today
Headers: Authorization: Bearer eyJ...
```

Backend auth middleware:
1. Extracts the token from the header.
2. Verifies it with `jwt.verify(token, JWT_SECRET)`.
3. If valid: attaches `{ employee_id, name, type }` to `req.user`.
4. The controller uses `req.user.employee_id` to fetch the right data.

### Step 3: Token Expiry

When the token expires (7 days for employees):
- The backend returns 401.
- The `api.js` response interceptor catches it.
- Clears localStorage.
- Redirects to `/login`.

---

## The Attendance Flow (End to End)

### Check-In (QR — no login):

1. Employee scans QR code → opens `/attend`.
2. Frontend shows a form (employee ID + optional GPS).
3. Employee submits.
4. Frontend calls `POST /api/attendance/check-in` with `{ employee_id, latitude, longitude }`.
5. Backend:
   - Finds the employee.
   - Checks GPS (if provided).
   - Checks for duplicate check-in.
   - Calculates late status.
   - Inserts into `attendance` table.
   - Returns the record.
6. Frontend shows success.

### Check-Out (logged in):

1. Employee goes to `/attend` (or taps "Mark Check-Out" on dashboard).
2. Frontend calls `POST /api/attendance/check-out` with the employee ID (from the token) and optional GPS.
3. Backend:
   - Finds today's attendance record.
   - Updates `check_out_time`.
   - Calculates `working_minutes`.
   - Returns the updated record.

### Checking Status (public):

1. Anyone can call `GET /api/attendance/status/MKA-001`.
2. Backend returns: `{ status: "checked_in", check_in_time: "...", check_out_time: null }`.
3. This is how the QR page shows "Already checked in" before the employee submits.

---

## The Leave Flow (End to End)

### Employee applies for leave:

1. Employee goes to `/employee/leave`.
2. Fills form: leave type (casual/sick/paid), from date, to date, reason.
3. Frontend calls `POST /api/leave/apply`.
4. Backend:
   - Creates a `leave_requests` record with status `pending`.
   - Does NOT deduct balance yet (deduction happens on approval).
5. Returns the created request.

### Admin reviews:

1. Admin goes to `/admin/leave`.
2. Sees all pending requests with employee name, dates, type.
3. Clicks Approve or Reject.
4. Frontend calls `PATCH /api/admin/leave/:id/review` with `{ status: "approved", comment: "..." }`.
5. Backend:
   - If approved: deducts days from the employee's leave balance, marks attendance as `leave` for those dates, sets status to `approved`.
   - If rejected: sets status to `rejected`, stores comment.
6. Returns the updated record.

### Employee cancels:

1. Employee sees a pending request.
2. Clicks Cancel.
3. Frontend calls `PATCH /api/leave/:id/cancel`.
4. Backend sets status to `canceled`.
5. No balance was deducted (because it wasn't approved yet), so nothing to reverse.

---

## The Admin Dashboard Flow

File: `backend/src/controllers/admin.controller.js` → `getDashboard`

When an admin opens `/admin`:

1. Frontend calls `GET /api/admin/dashboard`.
2. Backend runs **multiple queries in parallel** using `Promise.all`:
   - Total active employees.
   - Today's attendance records (joined with employees and departments).
   - Count of pending leave requests.
   - Department stats (present count per department).
   - 30-day attendance trend (present/absent/on_leave per day).
3. Backend combines the results into one JSON response.
4. Frontend renders charts and stats from that data.

The key trick: `Promise.all` runs all queries at the same time instead of one after another. This makes the dashboard load faster.

---

## Error Handling — "Everything fails, gracefully"

File: `backend/src/middleware/error.middleware.js` and `backend/src/utils/AppError.js`

The backend uses a custom `AppError` class:

```js
throw new AppError('INVALID_CREDENTIALS', 'Invalid credentials.', 401);
```

The error handler middleware catches all errors and returns a consistent format:

```json
{
  "success": false,
  "error": "INVALID_CREDENTIALS",
  "message": "Invalid credentials."
}
```

This way, the frontend always knows what went wrong, and it can show the right message.

There's also a 404 handler for unknown routes:
```json
{
  "success": false,
  "error": "NOT_FOUND",
  "message": "Route not found."
}
```

---

## The Config and Utility Files

| File | What it does |
|------|-------------|
| `backend/src/config/database.js` | Sets up the PostgreSQL connection pool |
| `backend/src/utils/AppError.js` | Custom error class with a code, message, and status |
| `backend/src/utils/logger.js` | Logs messages to console/file in a structured way |
| `backend/src/utils/seedAdmin.js` | Creates the default admin account on first run |
| `backend/src/middleware/error.middleware.js` | Central error handler that formats all errors |

---

## The Overall Request Flow (One Picture)

```
Browser (Frontend)
   |
   |  1. User clicks "Check In"
   v
Next.js page (frontend/src/app/attend/page.jsx)
   |
   |  2. Calls api.post('/attendance/check-in', { employee_id, ... })
   v
Axios client (frontend/src/utils/api.js)
   |
   |  3. Attaches any available token (not needed for check-in, but does it anyway)
   |  4. Sends HTTP POST to http://localhost:5000/api/attendance/check-in
   v
Express server (backend/src/app.js)
   |
   |  5. Rate limiter checks (attendance limiter: max 20/min)
   |  6. Body parser reads the JSON
   |  7. Routes to attendance.routes.js
   v
Attendance route handler (backend/src/routes/attendance.routes.js)
   |
   |  8. Calls checkIn controller
   v
Check-in controller (backend/src/controllers/attendance.controller.js)
   |
   |  9. Looks up employee in DB
   | 10. Checks GPS (if provided)
   | 11. Checks for duplicate check-in
   | 12. Calculates late status
   | 13. Inserts record into attendance table
   | 14. Returns JSON response
   v
Express error handler (if anything threw an error)
   |
   | 15. Returns formatted error JSON
   v
Axios client receives response
   |
   | 16. React Query / page updates the UI
   v
User sees "Checked in at 09:15 AM"
```

---

## Summary — The Backend in Plain Terms

- **Express** is the web server. It listens on port 5000 and routes requests to the right handler.
- **Middleware** runs before your code: CORS lets the frontend talk to it, rate limiters stop abuse, auth middleware checks tokens.
- **Routes** define which URL does what. `/api/auth/login` handles login, `/api/attendance/check-in` handles check-in, etc.
- **Controllers** contain the actual logic: look up the employee, check the password, insert the record, etc.
- **PostgreSQL** stores everything. The backend uses `db.query(sql, params)` to talk to it.
- **JWT** is how the backend knows who's logged in. The frontend sends the token with every request; the backend verifies it and attaches the user info to the request.
- **Check-in/out** are public (no token needed) so QR code attendance works. Everything else (viewing history, dashboard, managing employees) requires a token.
- **Leave** flows from employee applies → admin approves/rejects → balance is deducted on approval.
- **Errors** are all formatted the same way, so the frontend can show the right message.
