from __future__ import annotations

import re

from app.models import ParseWorkoutResponse, ParsedWorkoutExercise, WorkoutExerciseInput


LINE_PATTERN = re.compile(
    r"^(?P<name>[A-Za-z0-9\-\s]+?)(?:\s*[-:]\s*(?P<details>.*))?$"
)

HEADER_PATTERN = re.compile(r"^(day|workout|session)\b", re.IGNORECASE)


def _candidate_segments(text: str) -> list[str]:
    normalized = text.replace("\r", "\n")
    normalized = re.sub(r"[•·]", "\n", normalized)
    normalized = re.sub(r"\s*;\s*", "\n", normalized)
    normalized = re.sub(r"\bthen\b", "\n", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"[ \t]{2,}", " ", normalized)
    segments: list[str] = []
    for raw_line in normalized.splitlines():
        line = re.sub(r"^\s*(?:\d+[.)]|[-*])\s*", "", raw_line).strip()
        if not line:
            continue
        if HEADER_PATTERN.match(line):
            _, _, remainder = line.partition(":")
            line = remainder.strip()
            if not line:
                continue
        chunk = line.strip(" ,")
        if chunk:
            segments.append(chunk)
    return segments


def _extract_sets_reps(details: str) -> tuple[int | None, str | None, str | None]:
    sets = None
    reps = None
    notes = details.strip() or None
    match = re.search(
        r"(?P<sets>\d+)\s*x\s*(?P<reps>[0-9\-+,\s]+)", details, re.IGNORECASE
    )
    if match:
        sets = int(match.group("sets"))
        reps = match.group("reps").strip()
    return sets, reps, notes


def parse_workout_text(text: str) -> ParseWorkoutResponse:
    exercises: list[ParsedWorkoutExercise] = []
    for line in _candidate_segments(text):
        match = LINE_PATTERN.match(line)
        if not match:
            continue
        details = match.group("details") or ""
        sets, reps, notes = _extract_sets_reps(details)
        exercises.append(
            ParsedWorkoutExercise(
                name=match.group("name").strip(), sets=sets, reps=reps, notes=notes
            )
        )
    return ParseWorkoutResponse(exercises=exercises, source="free_text")


def parse_structured_exercises(
    exercises: list[WorkoutExerciseInput],
) -> ParseWorkoutResponse:
    return ParseWorkoutResponse(
        exercises=[
            ParsedWorkoutExercise(**exercise.model_dump()) for exercise in exercises
        ],
        source="structured",
    )
