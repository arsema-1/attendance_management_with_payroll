# API Integration Explained — For a Dummy (Me Included) 🧠

Welcome! This folder explains **how this project talks between the frontend and the backend**, in the simplest possible language.

If you have ever wondered *"what even is an API?"* or *"why does the frontend need a token?"* — start here.

---

## 📚 What's in this folder

Read the files in this order:

| # | File | What you'll learn | Read this if... |
|---|------|-------------------|-----------------|
| 1 | [01-api-basics.md](./01-api-basics.md) | What an API is, using a restaurant analogy | You're brand new to this |
| 2 | [02-how-this-project-does-it.md](./02-how-this-project-does-it.md) | The actual `api.js` file and how every request is made | You want to see the real code explained |
| 3 | [03-authentication-flow.md](./03-authentication-flow.md) | How login works and how the backend knows who you are (JWT) | You want to understand tokens |
| 4 | [04-endpoint-reference.md](./04-endpoint-reference.md) | Every API endpoint in the project, in one table | You want a cheat sheet |
| 5 | [05-end-to-end-flows.md](./05-end-to-end-flows.md) | Full walkthroughs: check-in, leave approval, offline sync | You want to trace a real action start-to-finish |
| 6 | [06-error-handling.md](./06-error-handling.md) | What happens when things go wrong (401, 409, 500...) | You want to understand errors |

---

## 🏗️ The 10-second version of the whole system

```
┌──────────────┐         HTTP requests          ┌──────────────┐        SQL queries       ┌──────────────┐
│   FRONTEND   │ ─────────────────────────────▶ │   BACKEND    │ ───────────────────────▶ │   DATABASE   │
│  (Next.js)   │ ◀───────────────────────────── │  (Express)   │ ◀─────────────────────── │ (PostgreSQL) │
└──────────────┘         JSON responses          └──────────────┘          rows             └──────────────┘
   What you see               "here's the              The brain                  The memory
   and click                    data"                (decides who               (saves every-
                                                    gets what)                    thing)
```

**One rule to remember:** The frontend **never** touches the database directly. Everything goes through the backend API. This is like how you never walk into a restaurant kitchen yourself — you always order through the waiter.

---

## 🗂️ Where the actual code lives

| Piece | File in this project | What it does |
|-------|---------------------|--------------|
| The API client (frontend) | `frontend/src/utils/api.js` | One axios instance used by the whole app |
| Login logic (frontend) | `frontend/src/context/AuthContext.jsx` | Calls login endpoints, saves the token |
| Offline storage (frontend) | `frontend/src/utils/offlineDB.js` | Saves records in the browser when there's no internet |
| The API "front door" (backend) | `backend/src/app.js` | Accepts all requests, applies security rules, routes them |
| URL map (backend) | `backend/src/routes/*.routes.js` | Decides which controller handles which URL |
| Business logic (backend) | `backend/src/controllers/*.controller.js` | Does the actual work (validate, query DB, respond) |
| Security guards (backend) | `backend/src/middleware/auth.middleware.js` | Checks the token before allowing access |
| Error handler (backend) | `backend/src/middleware/error.middleware.js` | Turns errors into clean JSON responses |
| Database connection | `backend/src/config/database.js` | One shared PostgreSQL connection pool |

---

## ✅ After reading this folder, you should be able to answer:

1. What happens, step by step, when an employee taps "Check In"?
2. How does the backend know a request came from a logged-in admin and not a random stranger?
3. Why do some endpoints need a token and others don't?
4. What happens when you check in with no internet?
5. Where in the code would you add a brand-new endpoint?
