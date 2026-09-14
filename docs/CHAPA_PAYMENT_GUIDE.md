# Chapa Payment Integration — Explained for a Dummy 🧠💸

This guide explains **how salaries actually get paid** in this project using **Chapa**, an Ethiopian payment provider. No prior knowledge needed.

---

## 1. What is Chapa? (the 30-second version)

**Chapa is like a bank messenger.** 🏦

When your company owes you a salary, someone has to actually move the money from the company's account to *your* bank account. Chapa is the service that does this electronically:

```
┌────────────┐    "pay Abebe 15,000 ETB"    ┌──────────┐    transfer     ┌─────────┐
│ OUR BACKEND│ ───────────────────────────▶ │  CHAPA   │ ──────────────▶ │  BANK   │
│  (Express) │ ◀─────────────────────────── │ (middle- │ ◀────────────── │ (CBE,   │
└────────────┘    "ok, transfer started"    │   man)   │   "done/fail"   │ Abyssinia…)│
                                            └──────────┘                 └─────────┘
```

- We never talk to the bank directly. We ask Chapa, Chapa talks to the bank.
- Chapa is **asynchronous**: "I started the transfer" ≠ "the money arrived". That's why our code has a **verify** step. (Remember this — it explains the whole design.)

---

## 2. The files responsible (THE file map) 📂

If someone asks *"where is Chapa integrated?"* — these are the exact files:

### Backend (the real work happens here)

| # | File | What it does in plain English |
|---|------|-------------------------------|
| 1 | `backend/src/services/chapa.service.js` | **The Chapa talker.** A tiny axios wrapper with the secret key. The ONLY file that calls `api.chapa.co`. |
| 2 | `backend/src/controllers/payment.controller.js` | **The brain.** Decides when to pay, checks permissions & statuses, saves every attempt to the database, notifies employees. |
| 3 | `backend/src/routes/payment.routes.js` | **The door.** Maps URLs like `POST /api/payments/:payrollId/initiate` to the controller functions, and checks *who* is allowed (HR vs Admin). |
| 4 | `backend/src/middleware/auth.middleware.js` | **The security guard.** All payment routes require a valid admin/HR JWT token. |
| 5 | `backend/.env` (see `.env.example`) | **The keys drawer.** Holds `CHAPA_SECRET_KEY` and `CHAPA_BASE_URL`. |

### Frontend (buttons that trigger the backend)

| # | File | What it does |
|---|------|--------------|
| 6 | `frontend/src/app/admin/payroll/page.jsx` | **The pay button.** Admin clicks "Transfer" → chains initiate → verify → (finalize) in one go. Also handles retry for failed payments. |
| 7 | `frontend/src/app/hr/payroll/page.jsx` | HR submits a finalized payroll for payment approval + checks payment status. |
| 8 | `frontend/src/app/admin/payroll/transactions/page.jsx` | **The audit log view.** Lists every payment attempt with status. |
| 9 | `frontend/src/components/shared/BankInfoModal.jsx` + `frontend/src/app/admin/employees/add/page.jsx` | Fetch Chapa's bank list (`GET /payments/banks`) to fill the bank dropdown when entering employee bank details. |

### Database (where every payment is remembered)

| Table | Purpose |
|-------|---------|
| `payroll_records` | One row per employee per month. Its `status` column is the heart of the workflow (draft → finalized → pending_admin_approval → paid / failed). |
| `payment_transactions` | One row per **payment attempt**. Stores `tx_ref`, amount, bank info, `chapa_transfer_id`, `chapa_status`, and the **raw Chapa response** for auditing. |
| `employee_notifications` | Gets a row when salary is paid: "Your salary has been paid 💸". |
| `employees` | Holds each employee's `bank_name`, `bank_code`, `account_number`, `account_name` — the destination of the money. |

---

## 3. The keys 🔑

In `backend/.env` (copied from `.env.example`):

```env
CHAPA_SECRET_KEY=CHASECK_TEST-your-secret-key-here
CHAPA_BASE_URL=https://api.chapa.co/v1
```

| Key | Meaning |
|-----|---------|
| `CHASECK_TEST-…` | **Test mode key.** You get it from dashboard.chapa.co → Settings → API. No real money moves. |
| `CHASECK-…` (no `_TEST`) | **Live key.** Real money. Be careful. |
| `CHAPUBK-…` | **Public key — do NOT use here!** Our service even checks for this mistake and refuses to start (see below). |

**Golden rule:** the secret key lives **only** in the backend `.env`. The frontend never sees it — the frontend talks to *our* API, and *our* backend talks to Chapa.

---

## 4. The service layer — `chapa.service.js` 📞

This file is small on purpose. It creates **one axios client** with the key attached:

```js
const chapaClient = axios.create({
  baseURL: BASE_URL,                                   // https://api.chapa.co/v1
  headers: {
    Authorization: `Bearer ${SECRET_KEY}`,             // the ID card
    'Content-Type': 'application/json',
  },
  timeout: 30_000,                                     // give up after 30s
});
```

…and exports exactly **3 functions**:

| Function | Chapa endpoint it calls | What it means |
|----------|------------------------|---------------|
| `initiateTransfer(payload)` | `POST /transfers` | "Hey Chapa, send this money." |
| `verifyTransfer(txRef)` | `GET /transfers/verify/:tx_ref` | "Hey Chapa, did that transfer actually go through?" |
| `getBanks()` | `GET /banks` | "Which banks can you send money to?" (for our dropdowns) |

The `tx_ref` (transaction reference) is our own unique ID for each payment, built like:

```
PAY-MKA-001-42-A1B2C3D4
 │    │      │    └── random 8 chars
 │    │      └── payroll record id
 │    └── employee id
 └── prefix
```

It also has a `assertValidSecretKey()` guard that **fails fast** with a helpful message if:
- the key is missing, or
- you pasted a public key (`CHAPUBK…`) instead of a secret key.

---

## 5. The workflow — the heart of it all 💓

Payments are **not** one click. They are a **relay race between HR and Admin**, with Chapa as the runner in the middle. Each step is guarded — you can't skip ahead.

### The relay race:

```
        HR OFFICER                    ADMIN                     CHAPA
        ───────────                  ─────────                 ────────
Payroll is 'finalized'
   │
   │ ① SUBMIT
   ▼
'pending_admin_approval' ──────▶ (admins get a notification 🔔)
                                  │
                                  │ ② INITIATE  ────────▶  POST /transfers
                                  │                        "transfer started"
                                  │                        ◀── transfer_id
                                  │   tx saved in DB as 'pending'
                                  │
                                  │ ③ VERIFY ───────────▶  GET /transfers/verify/:tx_ref
                                  │                          ◀── success / failed
                                  │
                       ┌──────────┴───────────┐
                       ▼                      ▼
                   'paid' ✅             'failed' ❌
                       │                      │
             employee notified 🔔       ④ RETRY (back to ②)
```

### Step-by-step in human words:

**① HR submits** — `PATCH /api/payments/:payrollId/submit`
- Payroll must be `finalized` (salary already calculated & reviewed). Anything else → **409 Conflict**.
- Checks the employee actually has bank details saved. No bank info → **400** "Update the employee profile first."
- Status becomes `pending_admin_approval`.
- **All super_admin/hr_admin accounts get a notification**: "Abebe's payroll (ETB 15,000) submitted for payment approval."
- ⚠️ Note: **HR can never move money.** HR can only submit for approval.

**② Admin initiates** — `POST /api/payments/:payrollId/initiate`
- Admin only. Payroll must be `pending_admin_approval` (or `failed` → auto-resets and retries).
- Guards: bank details present, net salary **> 0** (Chapa rejects zero/negative).
- Creates a `payment_transactions` row **FIRST** (status `pending`), *then* calls Chapa. ← smart order: if the server crashes mid-call, we still have a record of the attempt.
- On success: saves `chapa_transfer_id` + the whole raw Chapa response.
- On failure: marks tx `failed` with `failure_reason`, marks payroll `failed`, returns **502** with a human-readable message.

**③ Admin verifies** — `POST /api/payments/:payrollId/verify` (body: `{ "tx_ref": "PAY-…" }`)
- Asks Chapa: "did the money actually arrive?"
- Translates Chapa's answer words → our statuses:

  | Chapa says | Our transaction | Our payroll |
  |---|---|---|
  | `success` / `successful` / `transferred` | `successful` | **`paid`** ✅ |
  | `failed` / `error` / `cancelled` | `failed` | `failed` ❌ |
  | anything else (still processing) | `pending` | `pending_payment` |

- If paid: inserts an `employee_notifications` row → the employee sees *"Your September 2026 salary has been paid — ETB 15,000 transferred to your bank account."*

**④ Finalize** — `POST /api/payments/:payrollId/finalize`
- Admin's explicit sign-off → payroll `paid`, records `payment_finalized_by/at`, notifies employee.
- Needed when Chapa's status was unclear (`pending_payment`). The admin frontend usually chains this automatically (see §7).

**⑤ Retry** — `POST /api/payments/:payrollId/retry`
- Only for `failed` payments. Resets status and re-runs initiate (new `tx_ref`, new attempt).

> **Why verify at all?** Because Chapa is async. "Transfer started" is a promise, not proof. Verify is how we get proof before telling an employee they've been paid.

---

## 6. Our API endpoint reference 📋

All routes live under `/api/payments` and require a **JWT** (`router.use(authenticateAdmin)`).

| Method | Endpoint | Who | What it does |
|--------|----------|-----|--------------|
| `PATCH` | `/:payrollId/submit` | HR or above | Submit finalized payroll for payment approval |
| `POST` | `/:payrollId/initiate` | **Admin only** | Start the Chapa transfer |
| `POST` | `/:payrollId/verify` | **Admin only** | Ask Chapa if the transfer succeeded |
| `POST` | `/:payrollId/finalize` | **Admin only** | Manually confirm → payroll `paid` |
| `POST` | `/:payrollId/retry` | **Admin only** | Re-attempt a failed payment |
| `GET` | `/:payrollId/status` | HR or above | Payroll status + all its transactions |
| `GET` | `/transactions` | HR or above | Paginated audit list (filters: month, year, status) |
| `GET` | `/banks` | HR or above | Chapa's bank list (proxied — no key exposed) |

Every response follows the project-wide shape:
```json
{ "success": true,  "message": "…", "data": { … } }
{ "success": false, "error": "ERROR_CODE", "message": "human-readable reason" }
```

Common error codes you'll see:

| Code | HTTP | Why |
|------|------|-----|
| `CONFLICT` | 409 | Wrong status for that action (e.g., initiating a payroll that isn't `pending_admin_approval`) |
| `VALIDATION_ERROR` | 400 | Missing bank info, or net salary ≤ 0 |
| `PAYMENT_FAILED` | 502 | Chapa refused/errored during initiate |
| `PAYMENT_VERIFY_FAILED` | 502 | Chapa verification call itself failed |
| `NOT_FOUND` | 404 | Payroll or transaction doesn't exist |

---

## 7. How the frontend uses it 🖱️

**Admin — `admin/payroll/page.jsx`:** one "Transfer" button chains all the steps (so the admin doesn't click three times):

```js
// Step 1: start the transfer via Chapa
const initRes  = await api.post(`/payments/${payrollId}/initiate`);
const { tx_ref } = initRes.data.data;

// Step 2: ask Chapa if it worked (this also sets payroll to paid/failed)
const verifyRes = await api.post(`/payments/${payrollId}/verify`, { tx_ref });

// Step 3: only if Chapa's answer was unclear, do the manual finalize
if (verifyRes.data.data?.payroll_status === 'pending_payment') {
  return api.post(`/payments/${payrollId}/finalize`);
}
```

Failed payment? The button automatically becomes **"Retry transfer"**. A `window.confirm` asks before any money moves.

**HR — `hr/payroll/page.jsx`:** "Submit for payment" button → `PATCH /payments/:id/submit`, and a status modal → `GET /payments/:id/status`.

**Remember the double `.data`:** `initRes.data` = axios unwrapping the HTTP body; the second `.data` = our API's `data` field. So `initRes.data.data.tx_ref` is normal, not a typo.

---

## 8. Design decisions worth mentioning (e.g., in a presentation) 🎤

1. **Secret key never leaves the backend.** The frontend only knows *our* endpoints; `/payments/banks` is a proxy so even the bank list fetch never touches Chapa directly.
2. **Record before you call.** The transaction row is inserted *before* the Chapa request, so no payment attempt is ever lost — even if the server dies mid-call.
3. **Full audit trail.** Every raw Chapa response is stored in `payment_transactions.raw_response`. Disputes can be settled with evidence.
4. **Human-in-the-loop.** Money never moves automatically. HR submits → a *different* person (admin) initiates and verifies. Separation of duties.
5. **Fail-fast config.** Wrong/missing key = instant, clearly-worded error instead of a mysterious Chapa 500 later.
6. **Friendly errors.** Chapa sometimes returns weird nested error objects — `extractChapaErrorReason()` in the controller untangles them so the admin sees *"Insufficient balance"* instead of *"[object Object]"*.
7. **Idempotency-friendly refs.** Each attempt gets a unique `tx_ref`, so retries never collide with old attempts.

---

## 9. How to test it yourself 🧪

1. Get a **test** secret key from [dashboard.chapa.co](https://dashboard.chapa.co) → Settings → API.
2. Put it in `backend/.env` as `CHAPA_SECRET_KEY=CHASECK_TEST-…` and restart the backend.
3. Log in as **admin** → Payroll → generate/approve a payroll for a test employee (make sure the employee has bank details — use Chapa's sandbox-supported bank codes).
4. Click **Transfer** → watch the toasts.
5. See the attempt (and its raw Chapa response) in **Payroll → Transactions**.
6. Test mode uses Chapa's sandbox — no real ETB moves.

---

## 10. Cheat card (pin this) 📌

- **Chapa** = the bank messenger. We ask, it pays.
- **Async** = initiate ≠ paid. Always verify.
- **Service** (`chapa.service.js`) = 3 calls: initiate, verify, banks. Only place with the key.
- **Controller** (`payment.controller.js`) = the rules & the record-keeping.
- **Routes** (`payment.routes.js`) = the doors, HR vs Admin enforced here.
- **Frontend** (`admin/payroll/page.jsx`) = chains initiate → verify → finalize.
- **Audit** = every attempt stored forever in `payment_transactions`.
- **HR submits. Admin pays. Nobody skips a step.**
