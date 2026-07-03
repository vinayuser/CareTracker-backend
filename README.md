# CareTraker Backend API

Node.js + Express + MongoDB backend for the CareTraker admin panel.

Follows the same layered structure as the pool_game project:

```
backend/
├── app.js
├── config/.env
├── routes/
├── controller/
├── services/
├── models/
├── validation/
├── common/
└── seed/
```

## Setup

1. Install dependencies:

```bash
cd backend
npm install
```

2. Ensure MongoDB is running locally (default URI: `mongodb://127.0.0.1:27017/caretracker_backend`).

3. Copy environment config if needed:

```bash
cp config/.env.example config/.env
```

4. Start the server:

```bash
npm run dev
```

API runs at `http://localhost:3000/api`.

## Default credentials

On first startup, the seed script creates:

- **Email:** `admin@caretraker.com`
- **Password:** `Admin@123`

## API routes

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/auth/login` | Public |
| GET | `/api/agencies` | Admin |
| GET/POST/PUT/DELETE | `/api/agencies/:id` | Admin |
| GET | `/api/subscription-plans` | Admin |
| GET | `/api/subscription-plans/active` | Public |
| GET/POST/PUT/DELETE | `/api/subscription-plans/:id` | Admin |
| GET | `/api/invitations/stats` | Admin |
| GET/POST | `/api/invitations` | Admin |
| POST | `/api/invitations/:id/resend` | Admin |
| GET | `/api/invitations/validate?token=` | Public |
| GET | `/api/registration/check-user-id?email=` | Public |
| POST | `/api/registration/account` | Public |
| POST | `/api/registration/submit` | Public |
| POST | `/api/registration/payment` | Public |

## Response format

All responses use the pool_game envelope:

```json
{
  "statusCode": 200,
  "message": "Success",
  "data": {},
  "status": 1
}
```

The frontend axios client unwraps `data` automatically.

## Production (PM2)

```bash
cd backend
mkdir -p logs
pm2 start ecosystem.config.js
pm2 save
```

Health check: `curl http://127.0.0.1:5000/api/health`

Ensure `NODE_PORT` in `config/.env` matches nginx `proxy_pass` (see `admin/deploy/nginx-host-caretraker.conf`).

Set `RUN_SEED=false` in production after the first deploy to skip seed work on every restart.

### If all APIs return "Not Found" after a while

1. **Check PM2 logs** — `pm2 logs caretraker-api --lines 100`  
   Look for `MongoDB disconnected`, `Unhandled rejection`, or `Failed to start API`.

2. **Verify port alignment** — nginx must proxy to the same port PM2 uses (`5000` in `ecosystem.config.js`).

3. **Check API URL** — frontend `VITE_API_BASE_URL` must be `https://caretraker.com/api` (not `/api/api`).  
   A double `/api` path hits Express with no matching route → 404 for every call.

4. **MongoDB** — if MongoDB restarts or drops idle connections, the API now reconnects automatically.  
   Before this fix, a crash during restart could leave a broken process listening without a DB.

5. **Health endpoint** — when broken, `curl http://127.0.0.1:5000/api/health` returns `503` if MongoDB is down.

## Frontend connection

Set in admin `.env`:

```
VITE_API_BASE_URL=http://localhost:3000/api
```
