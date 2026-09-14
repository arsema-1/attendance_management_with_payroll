# 02 — How This Project Actually Integrates the API 🔌

This is the most important file in the folder. It explains the **real code** in `frontend/src/utils/api.js` — the single file that every API call in the app goes through.

---

## The one client to rule them all

The whole frontend uses **one single axios instance**, created in `frontend/src/utils/api.js`:

```js
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15_000,
});
```

What this means, line by line:

| Line | Plain English |
|------|---------------|
| `baseURL: ...` | "Every request I make should go to this server." In dev it's `localhost:5000`, in production the env var points to the Render URL. So pages just write `/attendance/today`, not the full URL. |
| `Content-Type: application/json` | "Everything I send is JSON." |
| `timeout: 15_000` | "If the server doesn't answer in 15 seconds, give up and throw an error." |

And the export at the bottom:

```js
export default api;
```

Every page/component that needs data does:

```js
import api from '@/utils/api';
```

> **Why one shared client?** Because now every request automatically gets the same base URL, the same headers, the same timeout, and (below) the same token-attaching and error-handling behavior. If you had to configure all that on every call, you'd forget one — and debugging would be hell.

---

## The two interceptors: the magic

Axios **interceptors** are like security gates every request/response passes through. This project has two.

### Interceptor 1 — Request: "attach my ID card automatically"

```js
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const adminToken    = localStorage.getItem('admin_token');
    const hrToken       = localStorage.getItem('hr_token');
    const employeeToken = localStorage.getItem('employee_token');
    const token = adminToken || hrToken || employeeToken;
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**What it does:** Before *any* request leaves the browser, it checks localStorage for a saved login token and attaches it as a header.

So when a page writes:

```js
const { data } = await api.get('/attendance/today');
```

the actual request that goes over the wire is:

```
GET http://localhost:5000/api/attendance/today
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Nobody has to remember to add the token.** That's the whole point. Individual pages never deal with authentication headers.

Notes:

- **Priority order:** admin token → HR token → employee token. If you're logged in as an admin in the same browser, the admin token wins (needed for `/payroll`, `/admin`, etc.).
- `typeof window !== 'undefined'` — localStorage only exists in the browser, not during Next.js server-side rendering. This check prevents crashes.

### Interceptor 2 — Response: "if we got kicked out, log everyone out"

```js
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const isLoginRequest = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isLoginRequest && typeof window !== 'undefined') {
      localStorage.removeItem('employee_token');
      localStorage.removeItem('admin_token');
      localStorage.removeItem('hr_token');
      localStorage.removeItem('employee_data');
      localStorage.removeItem('admin_data');
      localStorage.removeItem('hr_data');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

**What it does:** When *any* response comes back with status **401 (Unauthorized)** — meaning "your token is invalid or expired" — it:

1. Clears all saved tokens and user data from localStorage.
2. Redirects the browser to `/login`.

**Why the `isLoginRequest` check?** A failed login attempt (`POST /auth/login` with a wrong password) also returns 401 — but you obviously don't want a redirect loop when someone just typos their password. So login endpoints are excluded.

**Why `window.location.href` instead of the router?** The interceptor lives outside React components, so it uses a plain browser redirect. A hard redirect also resets all app state cleanly.

---

## How pages use the client

Two patterns exist in the codebase:

### Pattern A — React Query for reading data (automatic fetching + caching)

```js
// frontend/src/app/employee/page.jsx
const { data: today, isLoading } = useQuery({
  queryKey: ['todayAttendance'],
  queryFn: async () => {
    const { data } = await api.get('/attendance/today');
    return data.data;              // ← unwrap: axios puts JSON in .data, then the API puts records in .data
  },
});
```

### Pattern B — Mutations for changing data (with loading/error states + cache refresh)

```js
// frontend/src/app/employee/leave/page.jsx
const applyMutation = useMutation({
  mutationFn: (payload) => api.post('/leave/apply', payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['myLeaves'] });  // refetch the list
  },
});
```

> **The double `.data` gotcha:** `response.data` = the JSON the backend sent. That JSON *itself* has a `data` field with the records. So `res.data.data` is normal, not a typo!

---

## The complete journey of one request

When `api.get('/attendance/today')` runs while logged in as an employee:

```
┌─ FRONTEND (browser) ─────────────────────────────────────────────┐
│ 1. React Query fires the queryFn                                 │
│ 2. api.get('/attendance/today') → axios                          │
│ 3. REQUEST INTERCEPTOR: finds employee_token in localStorage,    │
│    adds header: Authorization: Bearer eyJhbGci...                │
│ 4. Request sent to http://localhost:5000/api/attendance/today    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ BACKEND (Express) ──────────────────────────────────────────────┐
│ 5. helmet/cors/parsers run (app.js)                              │
│ 6. Rate limiter: "is this IP spamming us?" (max 120/min)         │
│ 7. Router matches /api/attendance/* → attendance.routes.js       │
│ 8. Route says: authenticateEmployee → auth.middleware.js runs:   │
│      - reads Authorization header                                │
│      - jwt.verify(token, JWT_SECRET)                             │
│      - checks token type is 'employee'                           │
│      - attaches req.user = { employee_id, name, type }           │
│ 9. Controller getTodayStatus runs:                               │
│      - uses req.user.employee_id (NEVER trusts a body param!)    │
│      - queries PostgreSQL: attendance of that employee today     │
│ 10. Responds 200: { success: true, data: {...} }                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─ FRONTEND ───────────────────────────────────────────────────────┐
│ 11. RESPONSE INTERCEPTOR: status 200 → all good, pass through    │
│ 12. React Query caches it, component re-renders with the data    │
└──────────────────────────────────────────────────────────────────┘
```

If step 8 failed (expired token), the backend would return 401 → interceptor #2 clears storage → browser lands on `/login`. One central place handles that for the *entire app*.

---

## How to add a new API call (the recipe)

Say you want a new endpoint `GET /api/attendance/summary`:

**Backend — 2 files:**

1. `backend/src/controllers/attendance.controller.js`:
```js
const getSummary = async (req, res, next) => {
  try {
    const { employee_id } = req.user;              // from the token!
    const r = await db.query(
      'SELECT COUNT(*) FROM attendance WHERE employee_id = $1',
      [employee_id]
    );
    return res.json({ success: true, data: r.rows[0] });
  } catch (err) { next(err); }
};
```
2. `backend/src/routes/attendance.routes.js`:
```js
router.get('/summary', authenticateEmployee, getSummary);   // add to exports too
```

**Frontend — 1 place:**
```js
const { data } = await api.get('/attendance/summary');
```

That's it. Token attaching, 401 handling, error formatting — all inherited for free because everything goes through the shared client and shared middleware.

---

**Next up:** [03-authentication-flow.md](./03-authentication-flow.md) — what that token actually is and how the backend verifies it.
