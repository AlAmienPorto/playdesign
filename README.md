# Playdesign Office CRM

An AI-agent CRM for a creative studio: pipeline, tasks, approvals, content schedule and an
agent fleet. Built with React + Vite + Tailwind, with a PRD-aligned API on **Cloudflare
Workers** backed by **D1**.

The UI is a **demo shell** seeded in the browser. The Worker API and D1 database are the
production data surface. Seeded rows are always labelled `demo-seed`; nothing is presented as
live data.

## Stack

- React 19, React Router 7, TypeScript, Vite 8, Tailwind 3
- Cloudflare Workers (Workers Assets + D1), Wrangler 4
- No secrets in the frontend bundle, database fixtures or repository

## Agent roster (PRD roles)

| Workspace | Agent | PRD role | Jobdesk |
| --- | --- | --- | --- |
| Playdesign Studio | Raka Pratama | Specialist Agent | Revenue operations: inbox triage, follow-ups, CRM hygiene |
| Playdesign Studio | Salsabila Rahma | Specialist Agent | Research and evidence: web research, source checks |
| Playdesign Studio | Arif Nugroho | SPV/QC Agent | QC gate: verifies evidence and completeness before owner review |
| Brandal-Gbee | Dimas Anggara | Specialist Agent | Content production: captions, brand voice, calendar |
| Brandal-Gbee | Ayu Lestari | Specialist Agent | Market research: pricing and competitor scans (unavailable) |
| Brandal-Gbee | Nadia Kusuma | SPV/QC Agent | QC gate: brand voice and claims before owner review |

Human authority stays with the workspace **Owner** (`ja` in both workspaces); agents and
operators draft, operators submit, and only the owner approves.

## Local UI

```bash
npm install
npm run dev
```

## Local API (Worker + D1)

```bash
cp .dev.vars.example .dev.vars      # set API_TOKEN for local use
npm run db:migrate:local            # apply migrations/0001_init.sql
npm run db:seed:local               # load seed/seed.sql (synthetic demo data)
npm run cf:dev                      # builds the SPA, then serves it on http://127.0.0.1:8787
```

`npm run cf:dev` runs `vite build` first because Workers Assets serves `./dist` and the Worker
handles `/api/*` first.

Try it:

```bash
curl http://127.0.0.1:8787/api/health

curl -H "Authorization: Bearer local-dev-token" \
  "http://127.0.0.1:8787/api/office?workspace=playdesign"
```

All API calls except `/api/health` require `Authorization: Bearer <API_TOKEN>`.
Actors are identified with `X-Actor-Id` (default `ja`); the actor must be a member of the
requested workspace.

## Deploy to Cloudflare

1. Create the D1 database and copy its `database_id`:

   ```bash
   npx wrangler login
   npx wrangler d1 create office-crm
   ```

2. Replace the placeholder `database_id` in `wrangler.jsonc` with the returned id.

3. Apply the schema and seed remotely (the seed is demo data — skip it for a clean instance):

   ```bash
   npm run db:migrate:remote
   npm run db:seed:remote
   ```

4. Set the API token secret (use a long random value, e.g. `openssl rand -hex 32`):

   ```bash
   npx wrangler secret put API_TOKEN
   ```

5. Deploy:

   ```bash
   npm run cf:deploy
   ```

Per the PRD, do not push or deploy to production before the owner has reviewed the change.

## API (PRD §12)

| Method | Route | Notes |
| --- | --- | --- |
| GET | `/api/health` | Public liveness + D1 check |
| GET | `/api/office?workspace=` | Workspace, agents, tasks, approvals, runs, content, deals, leads, reports |
| GET | `/api/tasks?workspace=` | Task list with evidence, approvals, comments |
| POST | `/api/tasks` | Create task; requires `Idempotency-Key` |
| GET | `/api/tasks/:id?workspace=` | Task detail |
| PATCH | `/api/tasks/:id` | Update, submit for review, assign; requires `Idempotency-Key` |
| GET | `/api/approvals?workspace=` | Pending approvals |
| POST | `/api/approvals/:id/decision` | Owner-only decision; versions checked, idempotent |
| GET | `/api/activity?workspace=` | Audit trail |
| GET | `/api/schedules?workspace=` | Content queue with approval state |
| GET | `/api/reports?workspace=` | Stored reports plus computed summary |
| POST | `/api/copilot/preview` | Proposal only; no run is created |
| POST | `/api/copilot/execute` | Confirms a preview token, then queues a run |
| GET | `/api/runs?workspace=` | Run list with timeline |
| GET | `/api/runs/:id?workspace=` | Run detail |
| POST | `/api/runs/:id/decision` | Owner decision for a run in `owner_review` |
| POST | `/api/runs/:id/stop` | Stop an active run |

### Governance rules enforced by the API

- Every read and write is scoped to one workspace; cross-workspace ids return `404`.
- Approval decisions target an immutable output version and reject stale decisions.
- `done` is impossible without an approved current version.
- Idempotency keys are recorded; replays return the stored response
  (`idempotent-replay: true`) and payload mismatches return `409`.
- Copilot preview issues a short-lived token; execute re-checks agent availability and can
  only run once.
- Unavailable agents fail honestly (`agent_unavailable`), and no run is created.
- Every mutation appends to `activity_events` with actor, action, result and metadata.
- Errors use a structured shape: `{ "error": { "code", "message", "details?" } }`.

## Database

`migrations/0001_init.sql` covers the PRD model — `workspaces`, `actors`, `agents`, `tasks`,
`task_outputs`, `evidence`, `approvals`, `activity_events` — plus runs, content, deals, leads,
reports, idempotency keys and copilot proposals. `seed/seed.sql` is synthetic demo data.
