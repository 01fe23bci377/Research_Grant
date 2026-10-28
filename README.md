# apniLeap AURA — Research Grant Management System

An eight-agent grant pipeline that takes a faculty brief and produces a **validated, evidence-grounded, costed and compliance-checked proposal package** — then stops at a hard human approval gate. Built on the 14-lab worklet specification (Agentic AI Worklets — *Research Grant Management System*).

![Dashboard](docs/screenshots/dashboard.png)

---

## What is in the box

| Layer | Stack | Location |
| --- | --- | --- |
| Console | React 19, Vite 8, hand-built design system | `frontend/` |
| API + agents | Node 24, Express 5, no agent framework | `backend/` |
| Drafting model | **Groq · `openai/gpt-oss-120b`** (reasoning effort: low) | `backend/src/groq.js`, `backend/src/llm-drafting.js` |
| System of record | **MongoDB Atlas** (Mongoose), JSON fallback | `backend/src/models/`, `backend/src/persistence.js` |
| Data corpus | Seeded calls, literature, policies, people | `backend/src/seed.js` |
| Tests | `node:test` acceptance/integration suite | `backend/tests/pipeline.test.js` |

The backend serves the built SPA when `frontend/dist` exists, so one process runs the whole product:

```bash
cd backend
npm install
npm start            # http://localhost:3000
```

For development, run the API and Vite separately (Vite proxies `/api` → `127.0.0.1:3000`):

```bash
cd backend  && npm run dev      # node --watch
cd frontend && npm run dev      # http://localhost:5173
```

Rebuild the console after frontend changes:

```bash
cd frontend && npm run build
```

**First boot seeds the sanctioned project portfolio** (30 approved projects, 2020-21 → 2023-24). The earlier synthetic demo runs have been removed. To clear runs, delete `runs`, `audit_events` and `versions` in MongoDB and delete `backend/data/state.json`.

### Signing in

The console is authenticated. Pick any institutional profile on the login screen (demo password `password123`), or use the account switcher in the top bar — **Dr. Uma Mudengudi**, Dean R&D, can approve and roll back; the Research Office can review; a PI owns drafts and the budget.

### The project portfolio and faculty budget

The **Projects** screen is the home page. It lists all 30 sanctioned projects with **Year (academic year only)**, department, project title, PI/Co-PI, funding agency, sanctioned amount and an **Approved** status. Completion state is deliberately not stored or displayed.

Every project (and every new proposal) has a **faculty-owned budget**:

- rows are **Requirement + Cost**, with an **Add requirement** control;
- the faculty member types every line — the LLM never proposes, rounds, allocates or changes an amount;
- the system only totals the lines, applies the agency's published overhead/contingency percentages, checks the agency ceiling and reconciles;
- JRF/SRF positions are not offered anywhere in the budget form.

There is no automatic submission: the PI can **revise the draft** (section-by-section) before the package goes to the Dean. A revision is re-validated, re-packaged with a new version and returned to the approval queue.

![Projects](docs/screenshots/projects.png)
![Faculty budget](docs/screenshots/projects-budget.png)

### Configuration

`backend/.env` (git-ignored; see `.env.example`):

```ini
GROQ_API_KEY=...                       # Groq Cloud key
GROQ_MODEL=openai/gpt-oss-120b
AURA_LLM=on                            # off for deterministic drafting
AURA_LLM_CONCURRENCY=1
AURA_LLM_SECTIONS=abstract,background,methodology,outcomes

MONGODB_URI=mongodb+srv://mnag7278:...@cluster-pro.g8el1ce.mongodb.net/research_grant
MONGODB_DB=research_grant
AURA_PORT=3000
```

---

## Language model (Groq)

Group C drafts four key sections (`abstract`, `background`, `methodology`, `outcomes`) with `openai/gpt-oss-120b` over Groq's OpenAI-compatible API. The other sections stay deterministic to keep a run inside the on-demand 8k tokens/minute allowance.

The model is treated as an **untrusted author**:

1. It receives only the matched call's guidelines, the retrieved corpus and the faculty's project facts.
2. It must return strict JSON paragraphs, each tagged with 1–3 source ids.
3. Every id is resolved back to the canonical source record; unknown ids are dropped.
4. Paragraphs are rejected if they contain unsupported results language or a number that is not in the evidence/facts (budget, percentages).
5. If fewer than two valid paragraphs remain, the section falls back to the deterministic composer — the run never ships a half-grounded section.

Each run records `run.llm` (model, calls, prompt/completion tokens, latency, fallbacks), shown on the run Overview and in `/api/llm/status`. Rate-limited calls honour Groq's reset hint and retry before falling back.

![Models and data](docs/screenshots/platform-models.png)

---

## MongoDB schema and links

MongoDB is the system of record when connected. Four collections:

| Collection | Required fields | Purpose |
| --- | --- | --- |
| `users` | **`Name`, `Role`, `Dept`, `email`** (+ `title`, `userId`, `permissions`, `isActive`) | Institutional directory. `Role` enum: `dean`, `pi`, `faculty`, `research_office`, `admin`; `email` unique. |
| `runs` | `runId`, `status`, `actorRef`, `actor` snapshot, `payload` | Full run document plus indexed summary (call, budget, evidence, compliance, approval, LLM usage). |
| `audit_events` | `eventId`, `runId`, `actorRef`, `agent`, `phase`, `intent`, `action` | Every agent step, linked to the owning person. |
| `versions` | `versionId`, `runId`, `v`, `checksum`, `approvedByRef`, `snapshot` | Immutable published releases. |

Links:

```
users._id  ←  runs.actorRef                  (PI who owns the run)
users._id  ←  runs.approval.decidedByRef     (Dean / Research Office who approved)
users._id  ←  audit_events.actorRef          (inherited owner for agent steps)
users._id  ←  versions.approvedByRef         (authoriser of the release)
```

The API exposes `/api/users`, `/api/users/:id`, `/api/people`, `/api/people/:id` and `/api/mongo/status`. The People panel in Governance shows Name, Role, Dept, email and the linked run/approval counts; the Platform → Models & data tab shows database health, collections and the live schema.



---

## The eight agents

Exactly the operating model from the brief — seven agentic specialists under one coordinator, plus the human authority as a first-class gate.

| Order | Agent | Group | Stage | Guardrails enforced in code |
| --- | --- | --- | --- | --- |
| 0 | **apniLeap AURA Coordinator** | Orchestration | Intake & orchestration | Never bypass human approval; data scope, audit logging, source citation, exception routing |
| 1 | **Funding Discovery Agent** | Group A | Parallel discovery | Verified agencies only; never surface expired or unverified calls; cite source + deadline |
| 2 | **Literature Review Agent** | Group B | Parallel discovery | Every claim cited to a resolvable source; never fabricate; flag thin coverage instead of overstating novelty |
| 3 | **Proposal Drafting Agent** | Group C | Sequential drafting | Draft only within faculty scope; mark AI text; never present preliminary findings as results |
| 4 | **Budget Planning Agent** | Group D | Parallel budget & compliance | Agency templates and ceilings only; flag cap breaches; show the basis for every adjustment |
| 5 | **Compliance Checking Agent** | Group E | Parallel budget & compliance | Check only the matched call's published guidelines; no pass without evidence; ambiguous items go to a human |
| 6 | **Submission Agent** | Group F | Sequential packaging | No submission without sign-off; version-controlled record; no figure change after sign-off without re-review |
| 7 | **Dean R&D / HoD / Research Office** | Human authority | Stakeholder approval | Final authority for authorising submission |

Each agent's full role text, tools, inputs and outputs are exposed at `GET /api/agents` and rendered on the **Agents** page.

![Agents](docs/screenshots/agents.png)

---

## Pipeline

```
Gate 1 intake (consent + permissions)
        │
        ├── Funding Discovery ──┐        parallel
        └── Literature Review ──┘
                │
        Plan reconciled to the matched call
                │
        Proposal Drafting (parallel section swarm, merged by plan alignment)
                │
        ├── Budget Planning ────┐        parallel
        └── Compliance Check ───┘
                │
        Validate → diagnose → targeted repair (bounded: 3 attempts)
                │
        Package (manifest + SHA-256 checksum)
                │
        Acceptance suite — HARD GATE
                │
        Dean R&D / Research Office decision
                │
        Publish version (rollback-able) + dashboard
```

The graph, nodes and retry edge are defined once in `backend/src/engine.js` (`GRAPH`) and returned with every run, so the UI stepper cannot drift from the engine.

![Run overview](docs/screenshots/run-overview.png)

---

## How the 14 labs map to the implementation

| Lab | Capability | Where it lives | How to see it |
| --- | --- | --- | --- |
| 1 | Agent vs chatbot | `engine.clarify()` | A vague brief returns ≥2 clarifying questions and blocks launch until complete |
| 2 | Tool-using agent | `core/tools.js` | Every fact read goes through the connector; budget arithmetic only in `computeBudget`/`capReport` |
| 3 | Reusable skills | `core.skills` (`plan`, `format`) | Typed JSON schemas; the same plan skill serves all three funder domains |
| 4 | Memory vs state | `core.memory` | TF-IDF cosine + tag retrieval over the corpus; run state is never written into the archive |
| 5 | MCP-style connector | `core.connector` | Six sources, 13 typed endpoints, agent token, every call audited; `POST /api/connector/invoke` |
| 6 | Runtime | `core.runtime` | Step/tool budgets, checkpoints, intent → action → result audit, resume |
| 7 | Agentic node graph | `engine.execute()` | Explicit graph with parallel fan-out and a bounded `validate → repair` edge |
| 8 | Parallel swarm | `core.swarm` | Draft sections run concurrently; merge accepts only plan-aligned output (`speedup` reported) |
| 9 | Deep research / grounding | `engine.evidence` | Claim-level evidence table; unresolved or out-of-scope sources are rejected |
| 10 | Operations resilience | `engine.validate` + `applyRepair` | Failure injection on intake; diagnosis log shows which artifact was repaired |
| 11 | SDLC factory | `engine.runAcceptance` | 15-test acceptance suite is a hard gate before review |
| 12 | Safety & governance | `engine.governance` | Role-checked approval, immutable versions, one-click rollback |
| 13 | Domain specialists | `core.specialists` | Government / industry / international templates, budget schemes and checkable contracts |
| 14 | Capstone | whole system | Projects portfolio, dashboard, audit trail, approvals |

---

## Evidence discipline

Every sentence in the draft is a **claim** with one or more evidence links:

```json
{
  "id": "C-METHODOL-3",
  "sectionKey": "methodology",
  "text": "Models are trained with federated learning under secure aggregation …",
  "evidence": [{
    "sourceId": "lit-003",
    "sourceType": "literature",
    "locator": "Health Data Science Review; DOI 10.5555/aura.demo.003",
    "quote": "Reviews 74 studies and finds that differential privacy and secure aggregation are rarely combined …"
  }]
}
```

In-scope means one of: a guideline locator from the **matched call**, an approved literature record, an institutional policy, institutional history, or the personnel/rate register. Anything else fails `claims_grounded` and the claim is removed — not softened.

![Draft](docs/screenshots/draft.png)

---

## Budget correctness

- All arithmetic runs in typed compute tools (`computeBudget`, `capReport`), never in prose.
- The total is balanced to the requested amount *and* the agency ceiling; capped categories are enforced and rebalanced into consumables with a recorded basis.
- Manpower is apportioned to the agency salary ceiling, and the natural-vs-allocated reduction is written into the budget notes.
- Validation recomputes line items and caps **live**, so a stale cached total cannot pass.

![Budget](docs/screenshots/budget.png)

---

## Compliance

The rulebook (18 rules) is scoped to the matched call's funding type and its published guidelines. Each check carries an evidence locator and a remediation. Ambiguous requirements are marked **manual** and routed to a human rather than guessed.

![Compliance](docs/screenshots/compliance.png)

---

## Self-healing demo

On **New proposal**, expand *Failure injection (Lab 10)* and select any of:

- drop the methodology section
- break budget reconciliation (`+₹75,000` on a line)
- push equipment past its ceiling
- insert an unsupported “preliminary results” claim
- remove the ethics clearance
- point the run at an expired call

The run detects each failure, diagnoses the owning artifact, repairs **only that part** within the 3-attempt budget, and records the diagnosis log. The expiry case re-selects an active call and rebuilds dependent artifacts.

![Package](docs/screenshots/package.png)

---

## Governance

- Only actors with `review:approve` (Dean R&D, Research Office, admin) can approve; the PI is rejected with `403`.
- Approval requires the acceptance suite to be green, creates an immutable version with checksum, and publishes it.
- `request_changes` routes back to the owning agent; `reject` closes the package.
- Rollback restores a snapshot and publishes a new version that records the restore — nothing is deleted.

![Governance](docs/screenshots/governance.png)

---

## API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/bootstrap` | Agents, users, specialists, graph, metrics, connector catalogue |
| POST | `/api/intake/clarify` | Gate 1 questions and clarified parameters |
| POST | `/api/plan/preview` | Locked plan preview for a brief |
| POST | `/api/runs` | Create and start a run |
| GET | `/api/runs`, `/api/runs/:id` | List / full run state |
| POST | `/api/runs/:id/resume` | Resume from checkpoint |
| POST | `/api/runs/:id/inject` | Inject faults and re-validate |
| POST | `/api/runs/:id/review` | Authorised decision (approve / changes / reject) |
| POST | `/api/runs/:id/rollback` | Restore a version |
| GET | `/api/runs/:id/files/:name` | Download a package file |
| GET | `/api/calls`, `/api/literature`, `/api/policies` | Catalogue |
| GET | `/api/connector`, POST `/api/connector/invoke` | Governed connector probe |
| GET | `/api/metrics`, `/api/audit`, `/api/versions` | Operations |

Acting user is selected with the `x-actor-id` header (the console's top-right switcher) and defaults to the PI.

---

## Tests

```bash
cd backend && npm test
```

Nine tests cover: clarification, plan reusability, budget arithmetic, connector auth, a full end-to-end run, injected-fault repair, approval permissions + rollback, and the eligibility guardrail.

---

## Demo walkthrough (3 minutes)

1. **Projects** — 30 approved sanctioned projects, filter by year/department, no completion state.
2. Open a project → **Budget** — add Requirement + Cost rows with **Add requirement**, then **Save budget**. The total is computed from your rows only.
3. **New proposal** — enter the brief, add the faculty budget rows, **Prepare plan → Launch run**. Watch discovery, drafting, budget and compliance.
4. On the run, as the PI, click **Revise draft**, edit a section, **Save & resubmit**. The package is rebuilt as a new version and returns to the Dean queue.
5. Switch the actor (top right) to **Dr. Uma Mudengudi — Dean** → **Review package → Approve**. The run publishes v1 and **Versions** offers rollback.
6. **Platform → Models & data** shows Groq and MongoDB; **Audit trail** shows every step with inputs and outputs.

---

## Notes and limitations

- **Real portfolio, synthetic corpus.** The 30 sanctioned projects are transcribed from the supplied institutional tables (amounts in lakh INR) and are all stored as approved; completion status is ignored by design. The literature/call corpus used for drafting remains illustrative demo data (`10.5555/aura.demo.*`).
- **Budget ownership.** Budget figures come only from the faculty Requirement + Cost form. The LLM and the drafting agents never create or change amounts; overhead and contingency are applied from the agency rules, and caps are checked without silently repricing faculty lines.
- **Drafting model.** Group C uses Groq `openai/gpt-oss-120b` for four key sections; the rest are deterministic. Groq's on-demand tier allows 8,000 tokens/minute, so a run budgets four calls. Rate-limited calls retry using Groq's reset hint and fall back to the deterministic composer if they still fail. Set `AURA_LLM=off` for fully offline runs.
- **Secrets.** The Groq key and Atlas password live in `backend/.env` (git-ignored); the Atlas URI also carries a working default in `backend/src/database.js` because this workspace was requested that way. Rotate both before sharing the repository.
- **Demo authentication.** Institutional sign-in uses the seeded accounts with password `password123`. It is a demo identity layer, not production SSO; passwords are stored as plain seeded strings.
- **Dual store.** MongoDB is the system of record when reachable. The JSON state in `backend/data/` remains a fallback so the app boots offline; the two are reconciled on startup by hydrating runs/versions/audit from Mongo.
- **Dates.** Project records show only the academic year. New-proposal runs still use month-level work plans because the drafting template needs them.
- **Ports.** The API and built console run on `http://localhost:3000` (`PORT`); Vite's dev server proxies `/api` there.
- **Concurrent-writer note.** A second process edited these folders during the build. The console screens are isolated under `frontend/src/pages/aura-*.jsx`; shared files (App shell, login, dashboards) may also carry edits from that session.

---

## Layout

```
backend/
  index.js                 boot: Mongo connect → hydrate → API + static console + demo seed
  src/
    core.js                config, store, connector, tools, memory, skills, runtime, specialists, swarm
    seed.js                8 agents, institution, calls, literature, history, policies, rules
    agents.js              Groups A–F + repair helpers
    engine.js              graph, evidence, validation/repair, acceptance, governance, metrics
    api.js                 REST surface (auth, runs, users, people, llm, mongo)
    groq.js                Groq chat-completions client (retries, JSON mode, reasoning effort)
    llm-drafting.js        contract-checked Groq drafting with numeric/source guardrails
    database.js            Mongoose connection + seed upserts
    persistence.js         Mongo ↔ run/audit/version linking, debounced writes, hydration
    models/User.js         Name · Role · Dept · email (+ permissions, title, userId)
    models/Run.js          run summary + full payload, actorRef, approval.decidedByRef
    models/AuditEvent.js   append-only steps linked to run and person
    models/Version.js      immutable releases linked to approver
    projects.js            sanctioned project portfolio (30 approved projects)
    project-store.js       portfolio queries + faculty budget persistence
    models/Project.js      project + faculty budget lines
  tests/pipeline.test.js
  .env / .env.example      Groq + Atlas + port configuration
frontend/
  src/
    App.jsx                shell, routing, auth gate, role-aware dashboards
    index.css              design system
    components/            ui kit, icons
    lib/                   api client (token + actor), formatting
    pages/aura-*.jsx       dashboard, intake, runs, run detail, agents, calls, platform, governance, audit
    pages/DeanDashboard.jsx, FacultyDashboard.jsx, Login.jsx
    pages/runTabsA/B.jsx   run detail tabs
docs/screenshots/          rendered captures
```
