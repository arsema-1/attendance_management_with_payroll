# Work Log — Attendance System

A full-stack attendance and workforce management system for tracking employee check-ins, leave requests, and payroll.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (React), Tailwind CSS |
| Backend | Express.js (Node.js) |
| Database | PostgreSQL |
| Auth | JWT (JSON Web Tokens) |
| Charts | Recharts |

---

## Pages

### Public
- **`/login`** — Employee and admin login (tabbed)
- **`/attend`** — QR code attendance scanner (no login required)
- **`/attend/[id]`** — Pre-filled attendance page for a specific employee

### Employee (`/employee`)
- **`/employee`** — Dashboard with today's status, monthly stats, recent attendance
- **`/employee/leave`** — Apply for leave, view leave history, cancel pending requests

### Admin (`/admin`)
- **`/admin`** — Dashboard with live attendance overview, charts, pending leave panel
- **`/admin/employees`** — List/search employees, generate QR codes, deactivate accounts
- **`/admin/employees/add`** — Add new employee
- **`/admin/attendance`** — Daily attendance table with date picker and search
- **`/admin/leave`** — Review/approve/reject leave requests
- **`/admin/reports`** — Monthly attendance summary per employee

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Employee login (identifier + password) |
| POST | `/api/auth/admin/login` | Admin login (email + password) |
| POST | `/api/auth/register` | Create employee (admin only) |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance/status/:id` | Check employee's current attendance status |
| POST | `/api/attendance/check-in` | Mark check-in |
| POST | `/api/attendance/check-out` | Mark check-out |
| GET | `/api/attendance/today` | Get today's attendance for logged-in employee |
| GET | `/api/attendance/history` | Get attendance history |
| POST | `/api/attendance/sync` | Sync offline attendance records |

### Leave
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/leave/apply` | Apply for leave (employee) |
| GET | `/api/leave/my` | Get my leave requests + balance (employee) |
| PATCH | `/api/leave/:id/cancel` | Cancel a pending leave request (employee) |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Dashboard stats, charts, today's records |
| GET | `/api/admin/employees` | List all employees |
| POST | `/api/admin/employee/add` | Add new employee |
| PATCH | `/api/admin/employee/:id/deactivate` | Deactivate employee |
| GET | `/api/admin/leave` | List leave requests (filterable by status) |
| PATCH | `/api/admin/leave/:id/review` | Approve or reject leave |
| GET | `/api/admin/reports` | Monthly attendance reports |

### Payroll
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payroll/generate` | Generate payroll for a month (admin) |
| GET | `/api/payroll/report` | View payroll report |

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `departments` | Department names (Management, IT, HR, etc.) |
| `employees` | Employee accounts, leave balances, personal info |
| `admins` | Admin accounts with roles (super_admin, hr_admin, viewer) |
| `attendance` | Daily check-in/check-out records per employee |
| `leave_requests` | Leave applications with status workflow |
| `payroll_records` | Monthly payroll per employee |
| `face_embeddings` | Face recognition data for biometric attendance |
| `system_settings` | Company config (GPS coordinates, late threshold, etc.) |

---

## Leave Workflow

```
Employee applies → Status: pending
                      ↓
         ┌────────────┴────────────┐
    Admin approves            Admin rejects
    Status: approved          Status: rejected
    Balance deducted          With comment
    Attendance marked
    
    (Employee can also cancel → Status: canceled)
```

---

## Default Credentials

| Role | Email/ID | Password |
|------|----------|----------|
| Admin | `admin@company.com` | `Admin@1234` |
| Employee | `MKA-001` | `Admin@1234` |

---

## How to Run

### Backend (port 5000)
```bash
cd backend
npm install
npm run dev
```

### Frontend (port 3500)
```bash
cd frontend
npm install
npm run prod    # Production mode (stable)
# or
npm run dev     # Dev mode (hot reload)
```

---

## Key Features

- **QR Code Attendance** — Employees scan a QR code to check in/out without logging in
- **GPS Verification** — Optional location tracking on attendance
- **Offline Support** — Attendance works offline and syncs when back online (PWA)
- **Face Recognition** — Biometric attendance via camera (face-api.js)
- **Leave Management** — Apply, approve, reject, cancel leave requests
- **Leave Balance** — Automatic balance tracking (casual, sick, paid)
- **Payroll** — Generate monthly payroll based on attendance
- **Reports** — Monthly attendance summary with attendance percentage
- **Role-Based Access** — Separate admin and employee roles with JWT auth
