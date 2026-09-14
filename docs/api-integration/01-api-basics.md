# 01 — API Basics: What Even Is an API? 🍽️

## The restaurant analogy

Imagine you walk into a restaurant:

```
    YOU                    WAITER                   KITCHEN
 (the frontend)          (the API)              (the backend + DB)
    🧑                     🤵                        👨‍🍳
```

1. You sit at your table and **look at the menu** (the API documentation / list of endpoints).
2. You **place an order** with the waiter: "I'd like the chicken biryani" (`GET /api/attendance/history`).
3. The waiter **takes your order to the kitchen**. You don't go into the kitchen yourself.
4. The kitchen **cooks it** (the backend queries the database, does calculations).
5. The waiter **brings the food back to your table** (a JSON response).

Key points from the analogy:

- **You (frontend)** never enter the kitchen (database). You don't know how the food is made — and you don't need to.
- **The menu (endpoints)** lists exactly what you're allowed to order. If the menu says "biryani," you can't order "a live chicken" — the waiter will refuse.
- **The waiter (API)** is the *messenger*, not the cook. The API doesn't store your data; it just carries requests and responses.
- **Some dishes require membership** (authentication). A VIP table (admin) can order things a normal customer (visitor) cannot.

---

## What an API call actually looks like on the wire

An API call is just an **HTTP request** — the same thing your browser does when it loads a webpage, but instead of asking for a page, it asks for *data*.

### A request has these parts:

```
POST /api/attendance/check-in          ← the method + the endpoint URL
Host: localhost:5000                   ← which server
Content-Type: application/json         ← "my message is JSON"
Authorization: Bearer eyJhbGci...      ← "here's my ID card (token)"
                                       ← blank line ←
{                                      ← the body: the actual data
  "employee_id": "MKA-001",
  "latitude": 22.5726,
  "longitude": 88.3639,
  "method": "qr"
}
```

### The four parts of a request:

| Part | Analogy | Example from this project |
|------|---------|---------------------------|
| **Method** | What kind of action? | `GET` (fetch something), `POST` (create something), `PATCH` (change something), `DELETE` (remove something) |
| **URL/Endpoint** | Which dish? | `/api/attendance/check-in` |
| **Headers** | Your ID card + instructions | `Authorization: Bearer <token>` |
| **Body** | The details of your order | `{ "employee_id": "MKA-001" }` |

### The response:

```
HTTP/1.1 201 Created                   ← status code: "Done! Made something new."
Content-Type: application/json
{
  "success": true,                     ← did it work?
  "message": "Check-in recorded.",
  "data": {                            ← the actual food
    "employee_id": "MKA-001",
    "check_in_time": "2026-09-12T09:15:00Z",
    "is_late": false
  }
}
```

---

## Status codes: how the kitchen answers

Every response has a **status code** — a 3-digit number:

| Code | Meaning | Analogy | In this project |
|------|---------|---------|-----------------|
| `200` | OK — success | "Here's your food!" | Any successful GET |
| `201` | Created — success | "Here's your receipt, the dish is being made" | Check-in created |
| `400` | Bad Request — **your** mistake | "You ordered a dish that doesn't exist" | Missing `employee_id` |
| `401` | Unauthorized — you have no ID | "I need to see your membership card first" | No/expired token |
| `403` | Forbidden — your ID isn't good enough | "VIP area, you can't come in" | HR token trying admin-only endpoint |
| `404` | Not Found | "That table doesn't exist" | Unknown URL / employee not found |
| `409` | Conflict | "You already ordered that!" | Duplicate check-in (`DUPLICATE_CHECKIN`) |
| `429` | Too Many Requests | "Calm down, one order at a time" | Rate limiting (120 req/min) |
| `500` | Internal Server Error — **our** mistake | "The kitchen caught fire" | Unexpected backend crash |

**Easy trick:** `4xx` = the caller's fault. `5xx` = the server's fault.

---

## JSON: the language everyone speaks

JSON (JavaScript Object Notation) is just text formatted like this:

```json
{
  "success": true,
  "data": {
    "employee_id": "MKA-001",
    "is_late": false
  }
}
```

- Both frontend and backend understand JSON, so they can exchange complex data (numbers, strings, lists, nested objects).
- In this project, **every** API response follows the same shape: `{ success, message?, error?, data? }`. Once you know that, you can read any endpoint's response.

---

## Why not let the frontend touch the database directly?

Three big reasons:

1. **Security** — if the browser knew the database password, every user could steal all data. The backend keeps the password secret (in `.env`) and only exposes carefully chosen actions.
2. **Validation** — the backend is the bouncer. It checks "are you really an admin?" and "is that check-in a duplicate?" before anything touches the DB.
3. **Consistency** — business rules (e.g., "deduct leave balance on approval") live in ONE place (the backend), not copied into every screen.

---

## Key vocabulary (the cheat card)

| Term | Plain English | This project |
|------|---------------|--------------|
| **API** | The messenger between two programs | The Express backend's `/api/*` URLs |
| **Endpoint** | One specific "dish" on the menu | `POST /api/attendance/check-in` |
| **HTTP method** | Type of action (read/create/update/delete) | GET / POST / PATCH / DELETE |
| **Request** | Your order | JSON body + headers sent to an endpoint |
| **Response** | The kitchen's answer | `{ success, data }` JSON |
| **JSON** | The data format | Used everywhere |
| **Token (JWT)** | Your temporary ID card | Created at login, sent with every request |
| **Client** | The thing making the request | The Next.js frontend |
| **Server** | The thing answering | The Express backend on port 5000 |

---

**Next up:** [02-how-this-project-does-it.md](./02-how-this-project-does-it.md) — the real code, explained line by line.
