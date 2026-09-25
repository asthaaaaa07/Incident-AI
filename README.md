# Incident-AI

Repository event monitoring and transparent, rule-based incident intelligence — built on GitHub webhooks, Express, and PostgreSQL.

## 1. Problem statement

When you push code, you find out something broke by waiting for someone to notice. Incident-AI listens to your GitHub repository's activity in real time, stores a full history of events, and flags patterns that often correlate with problems (failure-related commit messages, repeated failures, unusually frequent changes) — with a plain-language explanation of *why* each flag was raised, so a human always makes the final call.

## 2. Features

- Receives GitHub webhook events (`push`, with a structure that supports adding more event types later)
- Verifies webhook authenticity via `X-Hub-Signature-256` when a secret is configured
- Normalizes and persists every event to PostgreSQL (no data lost on restart)
- Handles GitHub's webhook retries without creating duplicate events
- Transparent rule-based incident detection (no invented "AI confidence scores")
- Incident lifecycle: `open → investigating → resolved`, plus `ignored` for false positives
- REST API with pagination, filtering, and validation
- A dashboard (plain HTML/CSS/JS) showing the live event timeline and incidents, with filters and an incident detail view
- Defensive error handling: the server does not crash on malformed payloads, missing fields, or database hiccups

## 3. Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express 5 |
| Database | PostgreSQL (via `pg`) |
| Frontend | Plain HTML, CSS, vanilla JavaScript |
| Tunneling | ngrok (for exposing your local server to GitHub) |
| Config | dotenv |

No Docker, no Kubernetes, no message queues, no React — deliberately, so the whole system stays readable end-to-end.

## 4. System architecture

```
GitHub repository
      │  (push event)
      ▼
   ngrok tunnel  ──────────────►  http://localhost:3000/webhook/github
                                          │
                                          ▼
                              routes/webhook.js
                        (verify signature, validate payload)
                                          │
                                          ▼
                            services/eventService.js
                        (normalize payload → save to DB)
                                          │
                                          ▼
                                    PostgreSQL
                              (events, incidents,
                               incident_events tables)
                                          │
                                          ▼
                          services/incidentService.js
                        (rule-based detection engine)
                                          │
                                          ▼
                    routes/events.js & routes/incidents.js
                              (REST API, JSON)
                                          │
                                          ▼
                             public/ (dashboard)
                        fetch() polling every 15s
```

## 5. Folder structure

```
incident-ai/
├── servers.js              # Express app entry point
├── package.json
├── .env.example             # copy to .env
├── .gitignore
├── README.md
│
├── db/
│   ├── connection.js         # PostgreSQL pool + health check
│   └── schema.sql            # events, incidents, incident_events tables
│
├── routes/
│   ├── webhook.js            # POST /webhook/github
│   ├── events.js             # GET /events, GET /events/:id
│   └── incidents.js          # GET/PATCH /incidents...
│
├── services/
│   ├── eventService.js       # payload normalization + event queries
│   └── incidentService.js    # detection rules + incident queries
│
├── scripts/
│   ├── setupDb.js            # applies schema.sql (npm run db:setup)
│   └── test.js                # integration test suite (npm test)
│
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── utils/
    └── validation.js
```

## 6. Installation

```bash
git clone https://github.com/asthaaaaa07/Incident-AI.git
cd incident-ai
npm install
```

> **Note:** this repo currently has a duplicated nested `incident-ai/` folder from an earlier commit (containing its own copy of `servers.js` / `package.json`). Delete that nested folder before committing this new structure, so there's a single source of truth at the repo root.

## 7. PostgreSQL setup

1. Install PostgreSQL locally if you don't already have it (e.g. via the official installer on Windows, or `sudo apt install postgresql` on Linux).
2. Start the PostgreSQL service.
3. Create the database:
   ```bash
   createdb incident_ai
   # or, from psql:
   # CREATE DATABASE incident_ai;
   ```
4. Apply the schema:
   ```bash
   npm run db:setup
   ```
   This runs `db/schema.sql` against the database in your `DATABASE_URL` and creates the `events`, `incidents`, and `incident_events` tables with their indexes. It's safe to run more than once (`CREATE TABLE IF NOT EXISTS`).

## 8. Environment configuration

```bash
cp .env.example .env
```

Then edit `.env`:

```
PORT=3000
DATABASE_URL=postgresql://<your-username>:<your-password>@localhost:5432/incident_ai
NODE_ENV=development
WEBHOOK_SECRET=
```

`WEBHOOK_SECRET` is optional for local testing but strongly recommended once your server is reachable from the internet via ngrok — see section 14 below.

## 9. How to run the server

```bash
npm start
```

You should see:

```
🚀 Incident-AI server running on http://localhost:3000
   Dashboard: http://localhost:3000
   Webhook endpoint: POST http://localhost:3000/webhook/github
```

Open `http://localhost:3000` in your browser to see the dashboard. `npm run dev` restarts the server automatically on file changes (uses Node's built-in `--watch`).

## 10. How to run ngrok

GitHub needs a public URL to send webhooks to, so we tunnel to your local server:

```bash
ngrok http 3000
```

ngrok prints a forwarding URL like `https://abcd1234.ngrok-free.app`. Your webhook URL is:

```
https://abcd1234.ngrok-free.app/webhook/github
```

Keep the ngrok process running while you test — the URL changes every time you restart it on the free tier, so you'll need to update the GitHub webhook config each time.

## 11. How to configure GitHub Webhooks

1. Go to your repository → **Settings → Webhooks → Add webhook**.
2. **Payload URL**: your ngrok URL + `/webhook/github` (see above).
3. **Content type**: `application/json`.
4. **Secret**: paste a random string here, and put the same string in `WEBHOOK_SECRET` in your `.env`. Restart the server after changing `.env`.
5. **Which events**: "Just the push event" is enough to start.
6. Save. GitHub immediately sends a `ping` event — check your server logs for `✅ Received GitHub ping event`.
7. Push a commit. You should see it logged on the server and appear in the dashboard within ~15 seconds (or immediately on refresh).

## 12. API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Health text, also serves the dashboard |
| GET | `/health` | Server + database status as JSON |
| POST | `/webhook/github` | GitHub webhook receiver |
| GET | `/events` | List events. Query: `page`, `limit`, `repository`, `event_type`, `branch`, `from`, `to` |
| GET | `/events/:id` | Single event |
| GET | `/incidents` | List incidents. Query: `page`, `limit`, `repository`, `severity`, `status` |
| GET | `/incidents/summary` | Counts by status/severity, used by the dashboard cards |
| GET | `/incidents/:id` | Incident detail, including related events |
| PATCH | `/incidents/:id/status` | Body: `{ "status": "open" \| "investigating" \| "resolved" \| "ignored" }` |

All responses are JSON with consistent shapes: list endpoints return `{ data: [...], pagination: {...} }`, single-item endpoints return `{ data: {...} }`, and errors return `{ error: "..." }` with an appropriate HTTP status code.

## 13. Incident detection rules

All rules are transparent and rule-based — there is no machine learning model and no fabricated confidence score. Every incident records which rule fired and a plain-language reason, so you can review and override it.

| Rule | Trigger | Default severity |
|---|---|---|
| **A — Failure keyword** | A commit message contains a term like `hotfix`, `rollback`, `production issue`, `outage`, `fix crash`, or `revert` | medium |
| **B — Repeated failures** | 3+ failure-keyword commits to the same repository within 60 minutes | high |
| **C — Repeated changes** | 5+ pushes to the same repository within 15 minutes | low |
| **D — Deployment failure** *(not yet active)* | Reserved for when `deployment_status` events are integrated — will use GitHub's actual `state` field rather than guessing from a push | — |

These thresholds are intentionally simple starting points (see `services/incidentService.js`) — a natural next step once you're comfortable with the codebase is to make them configurable via `.env`, or to add real ML/LLM-based detection using the events already stored in PostgreSQL.

Duplicate incidents are avoided: if an open or investigating incident already exists for the same repository + rule, new matching events are linked to it instead of creating a new incident.

## 14. Webhook security

GitHub signs every webhook request with your configured secret, using HMAC-SHA256 over the raw request body. The signature arrives in the `X-Hub-Signature-256` header.

If `WEBHOOK_SECRET` is set in `.env`, the server recomputes the signature from the raw body and compares it (using a timing-safe comparison) before accepting the request — anything that doesn't match is rejected with `401`.

**If `WEBHOOK_SECRET` is left blank, no verification happens at all**, and the server logs a warning every time. This is acceptable for a few minutes of local testing but means anyone who discovers your ngrok URL could POST fake events to your server. Set a real secret before leaving your tunnel running unattended.

## 15. Known limitations

- Only the `push` GitHub event is fully processed today; other event types are stored generically but not deeply parsed.
- Detection thresholds are fixed constants, not yet configurable per repository.
- No authentication on the dashboard or API — fine for local use, not for deploying publicly as-is.
- ngrok's free tier gives you a new URL on every restart, so the GitHub webhook config needs re-pointing each session.
- The frontend polls every 15 seconds rather than pushing updates live (a deliberate simplicity trade-off — see section 13 of the original project brief).

## 16. Future improvements

- Add `deployment_status` and `check_run` event support so Rule D can use real CI/CD failure signals.
- Make detection thresholds configurable via environment variables or a settings table.
- Add authentication for the dashboard.
- Add a "why was this NOT flagged" explainability view.
- Explore ML/LLM-assisted triage once enough labeled incident data (confirmed vs. ignored) has accumulated.

## 17. Screenshots

_Add screenshots of the dashboard here once you've run it locally._

---

## Testing

Run the integration test suite (starts the real server against your configured database and exercises the API end-to-end):

```bash
npm run db:setup   # make sure the schema exists first
npm test
```

This covers: server startup, `/`, `/health`, webhook ingestion, database persistence, event retrieval, duplicate-delivery handling, invalid payload handling, incident detection, incident status updates, frontend serving, and empty-state filtering — 12 checks in total, matching the project's testing checklist.
