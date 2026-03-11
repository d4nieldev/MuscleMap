# MuscleMap

MuscleMap is an MVP workout-analysis web app that maps exercise plans onto a browser-based 3D anatomy model.

## What it does

- accepts free-text workout plans like `Bench Press - 4x8`
- sends raw workout text to the LLM for both parsing and analysis
- constrains inference to canonical body-part IDs derived from a real anatomy source
- validates LLM output strictly against those IDs and ordered training-load labels
- renders per-exercise and whole-workout activations on an interactive 3D body
- supports mock mode with no API key required
- supports multiple saved workouts in the UI and all-workouts aggregation

## Anatomy source

This MVP derives canonical body-part IDs from the open `BodyExplorer` asset set:

- `frontend/public/assets/anatomy.glb`
- `backend/app/data/mesh_mapping.json`

Source project: `JohanBellander/BodyExplorer`

Canonical IDs are generated from the source metadata:

- BodyParts3D-backed structures use `bp3d:<BP_ID>`
- Z-Anatomy-only structures use deterministic fallback IDs like `zanatomy:left_latissimus_dorsi`

Those IDs are used everywhere:

- `GET /api/body-schema`
- backend validation
- LLM prompt constraints
- frontend mesh activation mapping

## Training load labels

Ordered labels used throughout the app:

- `none`
- `low`
- `moderate`
- `high`

The LLM now returns two parallel 0-3 dimensions for each exercise-to-muscle-group relationship:

- `load`: mechanical / strength / hypertrophy-style training stress
- `endurance`: repeated-effort / sustained-fatigue stress

## Stack

- frontend: React, TypeScript, Vite, React Three Fiber, drei, Three.js
- backend: FastAPI, Pydantic, SQLite cache

## Project structure

```text
frontend/   React app and 3D viewer
backend/    FastAPI API, schema extraction, inference, cache, tests
```

## Endpoints

- `GET /api/health`
- `GET /api/body-schema`
- `POST /api/parse-workout`
- `POST /api/infer-exercise`
- `POST /api/analyze-workout`

## Deploy on Render

This repo is set up for a single-service Render deploy using Docker. The FastAPI app serves both the API and the built frontend from the same public URL.

Files involved:

- `render.yaml`
- `Dockerfile`
- `.dockerignore`

### Recommended setup

1. Push the repo to GitHub
2. In Render, create a new Blueprint and point it at the repo
3. Render will detect `render.yaml` and create the `musclemap` web service
4. In the Render dashboard, set `LLM_API_KEY` to your real key
5. Deploy and open the generated `onrender.com` URL

### Default Render env vars

The blueprint sets these defaults:

```env
MUSCLEMAP_MOCK_MODE=false
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5-mini
LLM_TIMEOUT_SECONDS=180
```

You only need to add:

```env
LLM_API_KEY=your_api_key_here
```

If you prefer OpenRouter, change these in Render:

```env
LLM_PROVIDER=openrouter
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-5-mini
```

## Local setup

Install root tooling for the single-command dev runner:

```bash
npm install
```

### 1. Backend

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn app.main:app --app-dir backend --reload
```

Backend runs at `http://127.0.0.1:8000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://127.0.0.1:5173` and proxies `/api` to the backend.

For deployed frontend builds hosted separately from the API, set:

```env
VITE_API_BASE_URL=https://your-backend.example.com
```

If `VITE_API_BASE_URL` is unset, the frontend keeps using same-origin `/api` requests.

### Single command

After installing backend deps, frontend deps, and root deps, run both servers together with:

```bash
npm run dev
```

## LLM setup

The backend is already prepared for live inference through any OpenAI-compatible provider.

### Where to put the API key, model, and provider

1. Copy `.env.example` to `.env` in the repo root
2. Fill in these values:

```env
MUSCLEMAP_MOCK_MODE=false
LLM_PROVIDER=openai
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_SECONDS=180
```

The backend loads `.env` automatically.

### Supported provider format

This app currently expects an OpenAI-compatible `chat/completions` API. Good options include:

- `openai` with `https://api.openai.com/v1`
- `openrouter` with `https://openrouter.ai/api/v1`
- `groq` with `https://api.groq.com/openai/v1`
- `together` with `https://api.together.xyz/v1`

`LLM_PROVIDER` is mainly for configuration clarity and health reporting. The actual request target is `LLM_BASE_URL` + `/chat/completions`.

### Example providers

OpenAI:

```env
MUSCLEMAP_MOCK_MODE=false
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

OpenRouter:

```env
MUSCLEMAP_MOCK_MODE=false
LLM_PROVIDER=openrouter
LLM_API_KEY=sk-or-...
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=openai/gpt-4o-mini
```

Groq:

```env
MUSCLEMAP_MOCK_MODE=false
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_MODEL=llama-3.3-70b-versatile
```

### Start with live inference

After saving `.env`, run:

```bash
npm run dev
```

You can confirm the backend picked up your settings at `GET /api/health`.

## Mock mode

Mock mode is enabled by default.

- no API key required
- random exercise inference for demo purposes on each analysis run

To force live mode:

```bash
MUSCLEMAP_MOCK_MODE=false LLM_API_KEY=your_key_here .venv/bin/uvicorn app.main:app --app-dir backend --reload
```

Optional env vars:

- `LLM_PROVIDER` default: `openai`
- `LLM_API_KEY`
- `LLM_BASE_URL` default: `https://api.openai.com/v1`
- `LLM_MODEL` default: `gpt-4o-mini`
- `LLM_TIMEOUT_SECONDS` default: `180`
- `MUSCLEMAP_MOCK_MODE` default: `true`

Backward-compatible aliases also work:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

## Tests

Backend:

```bash
.venv/bin/pytest backend/tests
```

Frontend:

```bash
cd frontend
npm run test
npm run build
```

## Notes on inference

- the prompt includes only source-derived muscle-group IDs from `GET /api/body-schema`
- live mode uses one LLM call per workout and returns a structured hierarchy using recursive `section` nodes and `exercise` leaves
- those muscle-group activations are expanded back into real anatomy body-part IDs for rendering
- responses are parsed into strict Pydantic models
- unknown `muscle_group_id` values are rejected
- duplicate group activations for the same exercise are rejected
- whole-workout aggregation uses peak severity across exercises
- labels represent training load contribution, not just movement dominance

## Flexible workout text

The app accepts raw workout text and the LLM interprets structure, but the lightweight parser still exists for mock mode and debugging. It accepts more than one exercise per line when separators are present, for example:

```text
Workout A: Bench Press - 4x8; Squat - 5x5 then Romanian Deadlift - 4x8
```

## Attribution and licenses

The included anatomy source is derived from:

- BodyExplorer by Johan Bellander
- BodyParts3D, CC BY-SA 2.1 Japan
- Z-Anatomy, CC BY-SA 4.0

This MVP keeps the source-derived metadata and requires attribution for redistributed derivative assets. Review upstream licenses before shipping commercially.
