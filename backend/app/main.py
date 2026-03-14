from __future__ import annotations

import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.models import (
    AnalyzeWorkoutRequest,
    GenerateWorkoutRequest,
    InferExerciseRequest,
    ParseWorkoutRequest,
)
from app.services.inference_service import (
    analyze_workout,
    generate_complementary_workout,
    infer_exercise,
    warm_default_prompt_cache,
)
from app.services.parser_service import parse_structured_exercises, parse_workout_text
from app.services.schema_service import load_body_schema


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        warm_default_prompt_cache()
    except Exception:
        logger.exception("Default prompt cache warmup failed during startup.")
    yield


app = FastAPI(
    title=get_settings().app_name,
    version=get_settings().app_version,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str | bool]:
    settings = get_settings()
    return {
        "status": "ok",
        "mock_mode": settings.mock_mode,
        "provider": settings.llm_provider,
        "model": settings.llm_model,
    }


@app.get("/api/body-schema")
def body_schema():
    return load_body_schema()


@app.post("/api/parse-workout")
def parse_workout(request: ParseWorkoutRequest):
    if request.exercises:
        return parse_structured_exercises(request.exercises)
    return parse_workout_text(request.text or "")


@app.post("/api/infer-exercise")
def infer_exercise_endpoint(request: InferExerciseRequest):
    try:
        return infer_exercise(request.exercise_name)
    except ValueError as exc:
        logger.warning("Infer exercise failed for %r: %s", request.exercise_name, exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/analyze-workout")
def analyze_workout_endpoint(request: AnalyzeWorkoutRequest):
    text = request.text or "\n".join(
        exercise.name for exercise in request.exercises or []
    )
    try:
        return analyze_workout(text)
    except ValueError as exc:
        logger.warning(
            "Analyze workout failed. text_preview=%r error=%s",
            text[:200],
            exc,
        )
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/generate-workout")
def generate_workout_endpoint(request: GenerateWorkoutRequest):
    try:
        return generate_complementary_workout(request)
    except ValueError as exc:
        logger.warning("Generate workout failed. error=%s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from exc


settings = get_settings()
frontend_dist = settings.root_dir / "frontend" / "dist"
frontend_assets = frontend_dist / "assets"

if frontend_assets.exists():
    app.mount("/assets", StaticFiles(directory=frontend_assets), name="assets")


def _frontend_index() -> Path:
    index_path = frontend_dist / "index.html"
    if not index_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Frontend build not found. Run the frontend build before serving static files.",
        )
    return index_path


@app.get("/")
def frontend_root():
    return FileResponse(_frontend_index())


@app.get("/{full_path:path}")
def frontend_app(full_path: str):
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(_frontend_index())
