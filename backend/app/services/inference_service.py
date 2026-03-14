from __future__ import annotations

import hashlib
import json
import logging
import math
import random
import re
from typing import Any

import httpx
from pydantic import ValidationError

from app.config import get_settings
from app.models import (
    ActivationLabel,
    AggregateActivation,
    AggregateGroupActivation,
    AnalyzeWorkoutResponse,
    BodyPartActivation,
    ExerciseInference,
    GenerateWorkoutRequest,
    GenerateWorkoutResponse,
    GeneratedWorkoutDraft,
    LABEL_ORDER,
    MuscleGroupActivation,
    WorkoutGenerationSource,
    WorkoutAnalysisNode,
    WorkoutAnalysisResponse,
)
from app.services.cache_service import cache_service
from app.services.default_workouts import DEFAULT_WORKOUTS
from app.services.schema_service import (
    allowed_muscle_group_ids,
    body_part_to_muscle_group_ids,
    load_body_schema,
    muscle_group_map,
    slugify_name,
)
from app.services.parser_service import parse_workout_text


logger = logging.getLogger(__name__)


MOCK_MOVEMENT_PATTERNS = [
    "horizontal_push",
    "horizontal_pull",
    "vertical_push",
    "vertical_pull",
    "squat",
    "hinge",
    "carry",
    "rotation",
    "single_leg",
    "core_stability",
    "general_strength",
]

MOCK_GENERATOR_LIBRARY: dict[str, dict[str, list[str]]] = {
    "chest": {
        "load": [
            "Bench Press - 4x6-8",
            "Incline Dumbbell Press - 3x8-10",
            "Cable Fly - 3x12-15",
        ],
        "endurance": [
            "Push-ups - 4x15-20",
            "Incline Push-ups - 3x20",
            "Tempo Chest Press - 3x15",
        ],
    },
    "back": {
        "load": [
            "Chest-Supported Row - 4x8-10",
            "Lat Pulldown - 4x8-10",
            "Seated Cable Row - 3x10-12",
        ],
        "endurance": [
            "Band Rows - 4x20",
            "TRX Row - 4x15",
            "Straight-Arm Pulldown - 3x18",
        ],
    },
    "lats": {
        "load": [
            "Pull-ups or Assisted Pull-ups - 4x6-8",
            "Single-Arm Lat Pulldown - 3x10",
            "Straight-Arm Pulldown - 3x12",
        ],
        "endurance": [
            "Band Lat Pulldown - 4x20",
            "High-Rep Pulldown - 3x15-20",
            "Dead Hang Scap Pulls - 3x12",
        ],
    },
    "front_shoulders": {
        "load": [
            "Dumbbell Shoulder Press - 4x8-10",
            "Arnold Press - 3x10",
            "Landmine Press - 3x8 each side",
        ],
        "endurance": [
            "Seated Dumbbell Press - 3x15",
            "Plate Front Raise - 3x20",
            "Pike Push-ups - 3x12-15",
        ],
    },
    "side_shoulders": {
        "load": [
            "Cable Lateral Raise - 4x10-12",
            "Dumbbell Lateral Raise - 3x12",
            "Machine Lateral Raise - 3x12",
        ],
        "endurance": [
            "Lateral Raise Swings - 3x20",
            "Lean-Away Raise - 3x18",
            "Band Lateral Raise - 3x25",
        ],
    },
    "rear_shoulders": {
        "load": [
            "Reverse Pec Deck - 4x10-12",
            "Rear Delt Row - 3x10",
            "Face Pull - 3x12-15",
        ],
        "endurance": [
            "Band Face Pull - 4x20",
            "Reverse Fly - 3x18",
            "Prone Y Raise - 3x15",
        ],
    },
    "biceps": {
        "load": [
            "EZ-Bar Curl - 4x8-10",
            "Incline Dumbbell Curl - 3x10",
            "Hammer Curl - 3x10-12",
        ],
        "endurance": [
            "Cable Curl - 3x15-20",
            "Band Curl - 3x25",
            "Tempo Hammer Curl - 3x15",
        ],
    },
    "triceps": {
        "load": [
            "Cable Pushdown - 4x8-10",
            "Overhead Triceps Extension - 3x10",
            "Close-Grip Push-up - 3x12",
        ],
        "endurance": [
            "Rope Pushdown - 3x15-20",
            "Bench Dips - 3x20",
            "Band Pushdown - 3x25",
        ],
    },
    "quads": {
        "load": [
            "Front Squat - 4x6-8",
            "Bulgarian Split Squat - 3x8 each side",
            "Leg Press - 3x10",
        ],
        "endurance": [
            "Walking Lunge - 4x16 steps",
            "Goblet Squat - 3x20",
            "Step-up - 3x15 each side",
        ],
    },
    "glutes": {
        "load": [
            "Hip Thrust - 4x8-10",
            "Romanian Deadlift - 3x8-10",
            "Reverse Lunge - 3x10 each side",
        ],
        "endurance": [
            "Glute Bridge - 4x20",
            "Banded Lateral Walk - 3x20 steps",
            "Single-Leg Bridge - 3x15 each side",
        ],
    },
    "hamstrings": {
        "load": [
            "Romanian Deadlift - 4x6-8",
            "Seated Leg Curl - 4x10",
            "Good Morning - 3x8",
        ],
        "endurance": [
            "Swiss Ball Leg Curl - 4x15",
            "Single-Leg RDL - 3x15 each side",
            "Slider Leg Curl - 3x12-15",
        ],
    },
    "calves": {
        "load": [
            "Standing Calf Raise - 5x8-12",
            "Seated Calf Raise - 4x12",
            "Leg Press Calf Raise - 3x15",
        ],
        "endurance": [
            "Single-Leg Calf Raise - 4x20 each side",
            "Jump Rope - 5x1 min",
            "Seated Calf Raise - 3x25",
        ],
    },
    "abs": {
        "load": [
            "Cable Crunch - 4x10-12",
            "Hanging Knee Raise - 4x10",
            "Ab Wheel - 3x8-10",
        ],
        "endurance": [
            "Dead Bug - 3x16",
            "Reverse Crunch - 3x20",
            "Hollow Body Hold - 3x30-40s",
        ],
    },
    "obliques": {
        "load": [
            "Cable Woodchop - 4x10 each side",
            "Landmine Rotation - 3x10 each side",
            "Suitcase Carry - 4x30m",
        ],
        "endurance": [
            "Side Plank - 3x40-60s each side",
            "Russian Twist - 3x20",
            "Pallof Press Hold - 3x30s each side",
        ],
    },
    "spinal_erectors": {
        "load": [
            "Back Extension - 4x10-12",
            "Romanian Deadlift - 4x6-8",
            "Good Morning - 3x8",
        ],
        "endurance": [
            "Bird Dog - 3x16",
            "Back Extension Hold - 3x30s",
            "Superman - 3x15",
        ],
    },
}


def _normalize_text(text: str) -> str:
    return " ".join(text.split())


def _build_cache_key(workout_text: str) -> str:
    settings = get_settings()
    schema = load_body_schema()
    seed = {
        "workout_text": _normalize_text(workout_text),
        "model": settings.llm_model,
        "mock_mode": settings.mock_mode,
        "schema_version": schema.version,
        "analysis_contract_version": 3,
    }
    return hashlib.sha256(json.dumps(seed, sort_keys=True).encode("utf-8")).hexdigest()


def _build_generation_cache_key(request: GenerateWorkoutRequest) -> str:
    settings = get_settings()
    seed = {
        "request": {
            "metric_mode": request.metric_mode,
            "guidance": (request.guidance or "").strip(),
            "workouts": [
                {
                    "workout_name": workout.workout_name,
                    "workout_text": _normalize_text(workout.workout_text),
                    "exercise_names": [
                        exercise.exercise_name for exercise in workout.exercises
                    ],
                    "aggregate_groups": [
                        {
                            "muscle_group_id": item.muscle_group_id,
                            "load_label": item.load_label,
                            "endurance_label": item.endurance_label,
                        }
                        for item in workout.aggregate_group_activations
                    ],
                }
                for workout in request.workouts
            ],
        },
        "model": settings.llm_model,
        "mock_mode": settings.mock_mode,
        "schema_version": load_body_schema().version,
        "generation_contract_version": 2,
    }
    return hashlib.sha256(json.dumps(seed, sort_keys=True).encode("utf-8")).hexdigest()


def _exercise_side_hint(exercise_name: str) -> str | None:
    lowered = exercise_name.lower()
    if "left" in lowered:
        return "left"
    if "right" in lowered:
        return "right"
    return None


def _is_unilateral_hint(exercise_name: str) -> bool:
    lowered = exercise_name.lower()
    hints = [
        "single",
        "split squat",
        "lunge",
        "step-up",
        "one-arm",
        "one leg",
        "single-arm",
        "single-leg",
    ]
    return any(hint in lowered for hint in hints)


def _validate_group_activations(group_activations: list[MuscleGroupActivation]) -> None:
    valid_ids = allowed_muscle_group_ids()
    invalid_ids = [
        item.muscle_group_id
        for item in group_activations
        if item.muscle_group_id not in valid_ids
    ]
    if invalid_ids:
        raise ValueError(f"invalid muscle_group_id values: {', '.join(invalid_ids)}")
    ids = [item.muscle_group_id for item in group_activations]
    if len(ids) != len(set(ids)):
        raise ValueError(
            "group_activations must not contain duplicate muscle_group_id values"
        )


def _coerce_group_activations(
    group_activations: list[MuscleGroupActivation],
) -> list[MuscleGroupActivation]:
    valid_ids = allowed_muscle_group_ids()
    aliases = {
        slugify_name(group.muscle_group_id): group.muscle_group_id
        for group in load_body_schema().muscle_groups
    }
    aliases.update(
        {
            slugify_name(group.display_name): group.muscle_group_id
            for group in load_body_schema().muscle_groups
        }
    )
    for activation in group_activations:
        if activation.muscle_group_id in valid_ids:
            continue
        normalized = slugify_name(activation.muscle_group_id)
        coerced = aliases.get(normalized)
        if coerced:
            activation.muscle_group_id = coerced
    return group_activations


def _expand_group_activation(
    activation: MuscleGroupActivation, exercise_name: str, unilateral: bool
) -> list[BodyPartActivation]:
    group = muscle_group_map()[activation.muscle_group_id]
    side_hint = _exercise_side_hint(exercise_name) if unilateral else None
    member_ids = list(group.body_part_ids_center)
    if group.bilateral:
        if side_hint == "left":
            member_ids.extend(group.body_part_ids_left)
        elif side_hint == "right":
            member_ids.extend(group.body_part_ids_right)
        else:
            member_ids.extend(group.body_part_ids_left)
            member_ids.extend(group.body_part_ids_right)
    else:
        member_ids.extend(group.member_body_part_ids)
    unique_ids = list(dict.fromkeys(member_ids))
    return [
        BodyPartActivation(
            body_part_id=body_part_id,
            muscle_group_id=activation.muscle_group_id,
            load_label=activation.load_label,
            endurance_label=activation.endurance_label,
            reason=activation.reason,
        )
        for body_part_id in unique_ids
    ]


def _attach_materialized_activations(
    node: WorkoutAnalysisNode, path: list[str]
) -> tuple[WorkoutAnalysisNode, list[ExerciseInference]]:
    if node.type == "exercise":
        node_group_activations = _coerce_group_activations(node.group_activations)
        _validate_group_activations(node_group_activations)
        exercise_name = node.exercise_name or "Exercise"
        unilateral = bool(node.unilateral)
        body_part_activations: list[BodyPartActivation] = []
        seen: set[str] = set()
        for group_activation in node_group_activations:
            for activation in _expand_group_activation(
                group_activation, exercise_name, unilateral
            ):
                if activation.body_part_id in seen:
                    continue
                seen.add(activation.body_part_id)
                body_part_activations.append(activation)
        materialized_node = node.model_copy(
            update={"activations": body_part_activations}
        )
        exercise = ExerciseInference(
            exercise_name=exercise_name,
            path=path + [exercise_name],
            prescription=node.prescription,
            group_activations=node_group_activations,
            activations=body_part_activations,
            movement_pattern=node.movement_pattern or "general_strength",
            unilateral=unilateral,
            notes=node.notes,
        )
        return materialized_node, [exercise]

    next_path = path + ([node.title] if node.title else [node.type.title()])
    materialized_items: list[WorkoutAnalysisNode] = []
    exercises: list[ExerciseInference] = []
    for item in node.items:
        materialized_child, child_exercises = _attach_materialized_activations(
            item, next_path
        )
        materialized_items.append(materialized_child)
        exercises.extend(child_exercises)
    node_group_activations = _aggregate_node_group_activations(exercises)
    node_body_activations = _aggregate_node_body_activations(exercises)
    return (
        node.model_copy(
            update={
                "items": materialized_items,
                "group_activations": node_group_activations,
                "activations": node_body_activations,
            }
        ),
        exercises,
    )


def _aggregate_node_group_activations(
    exercises: list[ExerciseInference],
) -> list[MuscleGroupActivation]:
    sources: dict[str, tuple[ActivationLabel, ActivationLabel, set[str]]] = {}
    for exercise in exercises:
        for activation in exercise.group_activations:
            current = sources.get(activation.muscle_group_id)
            if (
                current is None
                or LABEL_ORDER[activation.load_label] > LABEL_ORDER[current[0]]
                or LABEL_ORDER[activation.endurance_label] > LABEL_ORDER[current[1]]
            ):
                sources[activation.muscle_group_id] = (
                    activation.load_label,
                    activation.endurance_label,
                    {exercise.exercise_name},
                )
            else:
                current[2].add(exercise.exercise_name)
    return [
        MuscleGroupActivation(
            muscle_group_id=muscle_group_id,
            load_label=load_label,
            endurance_label=endurance_label,
            reason=f"Aggregated from descendant exercises: {', '.join(sorted(exercise_names))}",
        )
        for muscle_group_id, (load_label, endurance_label, exercise_names) in sorted(
            sources.items()
        )
    ]


def _aggregate_node_body_activations(
    exercises: list[ExerciseInference],
) -> list[BodyPartActivation]:
    sources: dict[
        str, tuple[str | None, ActivationLabel, ActivationLabel, set[str]]
    ] = {}
    for exercise in exercises:
        for activation in exercise.activations:
            current = sources.get(activation.body_part_id)
            if (
                current is None
                or LABEL_ORDER[activation.load_label] > LABEL_ORDER[current[1]]
                or LABEL_ORDER[activation.endurance_label] > LABEL_ORDER[current[2]]
            ):
                sources[activation.body_part_id] = (
                    activation.muscle_group_id,
                    activation.load_label,
                    activation.endurance_label,
                    {exercise.exercise_name},
                )
            else:
                current[3].add(exercise.exercise_name)
    return [
        BodyPartActivation(
            body_part_id=body_part_id,
            muscle_group_id=muscle_group_id,
            load_label=load_label,
            endurance_label=endurance_label,
            reason=f"Aggregated from descendant exercises: {', '.join(sorted(exercise_names))}",
        )
        for body_part_id, (
            muscle_group_id,
            load_label,
            endurance_label,
            exercise_names,
        ) in sorted(sources.items())
    ]


def _materialize_workout_analysis(
    workout_analysis: WorkoutAnalysisResponse,
) -> tuple[WorkoutAnalysisResponse, list[ExerciseInference]]:
    materialized_items: list[WorkoutAnalysisNode] = []
    exercises: list[ExerciseInference] = []
    for item in workout_analysis.items:
        materialized_item, item_exercises = _attach_materialized_activations(
            item, [workout_analysis.workout_title]
        )
        materialized_items.append(materialized_item)
        exercises.extend(item_exercises)

    return (
        workout_analysis.model_copy(
            update={
                "items": materialized_items,
                "group_activations": _aggregate_node_group_activations(exercises),
                "activations": _aggregate_node_body_activations(exercises),
            }
        ),
        exercises,
    )


def _aggregate_exercises(
    exercises: list[ExerciseInference],
) -> tuple[list[AggregateGroupActivation], list[AggregateActivation]]:
    aggregate_groups: dict[str, AggregateGroupActivation] = {}
    aggregate_body_parts: dict[str, AggregateActivation] = {}
    body_part_groups = body_part_to_muscle_group_ids()

    for exercise in exercises:
        for activation in exercise.group_activations:
            current_group = aggregate_groups.get(activation.muscle_group_id)
            if (
                current_group is None
                or LABEL_ORDER[activation.load_label]
                > LABEL_ORDER[current_group.load_label]
                or LABEL_ORDER[activation.endurance_label]
                > LABEL_ORDER[current_group.endurance_label]
            ):
                aggregate_groups[activation.muscle_group_id] = AggregateGroupActivation(
                    muscle_group_id=activation.muscle_group_id,
                    load_label=activation.load_label,
                    endurance_label=activation.endurance_label,
                    exercise_names=[exercise.exercise_name],
                )
            elif exercise.exercise_name not in current_group.exercise_names:
                current_group.exercise_names.append(exercise.exercise_name)

        for activation in exercise.activations:
            current_part = aggregate_body_parts.get(activation.body_part_id)
            if (
                current_part is None
                or LABEL_ORDER[activation.load_label]
                > LABEL_ORDER[current_part.load_label]
                or LABEL_ORDER[activation.endurance_label]
                > LABEL_ORDER[current_part.endurance_label]
            ):
                aggregate_body_parts[activation.body_part_id] = AggregateActivation(
                    body_part_id=activation.body_part_id,
                    muscle_group_id=(
                        body_part_groups.get(activation.body_part_id) or [None]
                    )[0],
                    load_label=activation.load_label,
                    endurance_label=activation.endurance_label,
                    exercise_names=[exercise.exercise_name],
                )
            elif exercise.exercise_name not in current_part.exercise_names:
                current_part.exercise_names.append(exercise.exercise_name)

    return (
        sorted(
            aggregate_groups.values(),
            key=lambda item: (
                -LABEL_ORDER[item.load_label],
                -LABEL_ORDER[item.endurance_label],
                item.muscle_group_id,
            ),
        ),
        sorted(
            aggregate_body_parts.values(),
            key=lambda item: (
                -LABEL_ORDER[item.load_label],
                -LABEL_ORDER[item.endurance_label],
                item.body_part_id,
            ),
        ),
    )


def _mock_group_activations(
    rng: random.Random, exercise_name: str, prescription: str | None = None
) -> list[MuscleGroupActivation]:
    groups = list(load_body_schema().muscle_groups)
    rng.shuffle(groups)
    lowered = exercise_name.lower()
    warmup_like = any(
        token in lowered
        for token in [
            "warm",
            "band",
            "light",
            "machine",
            "mobility",
            "rotation",
            "pull-apart",
        ]
    )
    bodyweight_like = any(
        token in lowered
        for token in ["push-up", "plank", "sit-up", "bodyweight", "knee raise"]
    )
    if warmup_like:
        counts = [
            (ActivationLabel.moderate, rng.randint(0, 1)),
            (ActivationLabel.low, rng.randint(2, 4)),
        ]
    elif (
        bodyweight_like
        and prescription
        and any(token in prescription for token in ["1 x", "2 x", "12", "15"])
    ):
        counts = [
            (ActivationLabel.high, 1),
            (ActivationLabel.moderate, rng.randint(1, 2)),
            (ActivationLabel.low, rng.randint(1, 2)),
        ]
    else:
        counts = [
            (ActivationLabel.high, rng.randint(2, 4)),
            (ActivationLabel.moderate, rng.randint(2, 4)),
            (ActivationLabel.low, rng.randint(1, 2)),
        ]
    cursor = 0
    activations: list[MuscleGroupActivation] = []
    endurance_by_load = {
        ActivationLabel.high: ActivationLabel.moderate
        if not bodyweight_like
        else ActivationLabel.high,
        ActivationLabel.moderate: ActivationLabel.high
        if bodyweight_like
        else ActivationLabel.moderate,
        ActivationLabel.low: ActivationLabel.low,
    }
    for label, count in counts:
        for group in groups[cursor : cursor + count]:
            activations.append(
                MuscleGroupActivation(
                    muscle_group_id=group.muscle_group_id,
                    load_label=label,
                    endurance_label=endurance_by_load[label],
                    reason=f"Mock load/endurance assigned to {group.display_name}.",
                )
            )
        cursor += count
    return activations


def _mock_workout_analysis(workout_text: str) -> WorkoutAnalysisResponse:
    parsed = parse_workout_text(workout_text)
    rng = random.SystemRandom()
    items: list[WorkoutAnalysisNode] = []
    for exercise in parsed.exercises:
        items.append(
            WorkoutAnalysisNode(
                type="exercise",
                exercise_name=exercise.name,
                prescription=(
                    f"{exercise.sets} x {exercise.reps}"
                    if exercise.sets and exercise.reps
                    else None
                ),
                notes=exercise.notes or "",
                movement_pattern=rng.choice(MOCK_MOVEMENT_PATTERNS),
                unilateral=_is_unilateral_hint(exercise.name)
                or rng.choice([True, False]),
                group_activations=_mock_group_activations(
                    rng,
                    exercise.name,
                    f"{exercise.sets} x {exercise.reps}"
                    if exercise.sets and exercise.reps
                    else exercise.reps,
                ),
            )
        )
    return WorkoutAnalysisResponse(workout_title="Workout", notes="", items=items)


def _target_metric_label(
    activation: AggregateGroupActivation, metric_mode: str
) -> ActivationLabel:
    return (
        activation.load_label if metric_mode == "load" else activation.endurance_label
    )


def _parse_prescription_hints(
    prescription: str | None,
) -> tuple[int | None, int | None]:
    if not prescription:
        return None, None

    normalized = prescription.lower().replace("×", "x").strip()
    time_match = re.search(
        r"(\d+)(?:\s*-\s*(\d+))?\s*(s|sec|secs|seconds|min|mins|minutes)\b",
        normalized,
    )
    if time_match:
        upper = int(time_match.group(2) or time_match.group(1))
        unit = time_match.group(3)
        return None, upper * 60 if unit.startswith("min") else upper

    rep_matches = [
        int(match.group(2) or match.group(1))
        for match in re.finditer(r"(\d+)(?:\s*-\s*(\d+))?", normalized)
    ]
    return (rep_matches[-1] if rep_matches else None), None


def _endurance_prescription_multiplier(exercise: ExerciseInference) -> float:
    lowered_name = exercise.exercise_name.lower()
    lowered_pattern = exercise.movement_pattern.lower()
    reps_upper, seconds_upper = _parse_prescription_hints(exercise.prescription)
    multiplier = 1.0

    if seconds_upper is not None:
        if seconds_upper >= 120:
            multiplier += 0.95
        elif seconds_upper >= 60:
            multiplier += 0.7
        elif seconds_upper >= 30:
            multiplier += 0.4

    if reps_upper is not None:
        if reps_upper >= 30:
            multiplier += 0.8
        elif reps_upper >= 20:
            multiplier += 0.55
        elif reps_upper >= 15:
            multiplier += 0.3
        elif reps_upper <= 8:
            multiplier -= 0.15

    if (
        "core_stability" in lowered_pattern
        or "plank" in lowered_name
        or "carry" in lowered_name
    ):
        multiplier += 0.35

    if any(
        token in lowered_name
        for token in ["bike", "row machine", "machine", "walk", "jog"]
    ):
        multiplier += 0.45

    if "warm-up" in exercise.notes.lower() or "warm-up" in lowered_name:
        multiplier += 0.1

    return max(0.55, min(2.2, multiplier))


def _metric_group_score(
    exercise: ExerciseInference, metric_mode: str, label: ActivationLabel
) -> float:
    base = float(LABEL_ORDER[label])
    if metric_mode == "load":
        return base
    return base * _endurance_prescription_multiplier(exercise)


def _workout_group_intensities(
    exercises: list[ExerciseInference], metric_mode: str
) -> dict[str, float]:
    if not exercises:
        return {}

    tau = 4.5 if metric_mode == "load" else 6.0
    scores: dict[str, float] = {}
    for exercise in exercises:
        for activation in exercise.group_activations:
            label = _target_metric_label(activation, metric_mode)
            scores[activation.muscle_group_id] = scores.get(
                activation.muscle_group_id, 0.0
            ) + _metric_group_score(exercise, metric_mode, label)

    return {
        muscle_group_id: 1 - math.exp(-raw_score / tau)
        for muscle_group_id, raw_score in scores.items()
    }


def _combine_group_coverage(
    workouts: list[WorkoutGenerationSource], metric_mode: str
) -> list[tuple[str, float, list[str], ActivationLabel]]:
    combined: dict[str, tuple[float, set[str], ActivationLabel]] = {}
    for workout in workouts:
        workout_scores = _workout_group_intensities(workout.exercises, metric_mode)
        workout_labels = {
            activation.muscle_group_id: _target_metric_label(activation, metric_mode)
            for activation in workout.aggregate_group_activations
        }

        for group in load_body_schema().muscle_groups:
            current = combined.get(group.muscle_group_id)
            intensity = workout_scores.get(group.muscle_group_id, 0.0)
            label = workout_labels.get(group.muscle_group_id, ActivationLabel.none)
            if current is None:
                combined[group.muscle_group_id] = (
                    intensity,
                    {workout.workout_name} if intensity > 0 else set(),
                    label,
                )
                continue

            combined_intensity, covered_by, strongest_label = current
            next_intensity = min(1.0, combined_intensity + intensity)
            if intensity > 0:
                covered_by.add(workout.workout_name)
            combined[group.muscle_group_id] = (
                next_intensity,
                covered_by,
                label
                if LABEL_ORDER[label] > LABEL_ORDER[strongest_label]
                else strongest_label,
            )

    ranked: list[tuple[str, float, list[str], ActivationLabel]] = []
    for group in load_body_schema().muscle_groups:
        intensity, covered_by, label = combined.get(
            group.muscle_group_id, (0.0, set(), ActivationLabel.none)
        )
        ranked.append((group.muscle_group_id, intensity, sorted(covered_by), label))

    return sorted(
        ranked,
        key=lambda item: (item[1], muscle_group_map()[item[0]].display_name),
    )


def _select_target_muscle_groups(
    workouts: list[WorkoutGenerationSource], metric_mode: str, limit: int = 5
) -> list[str]:
    ranked = _combine_group_coverage(workouts, metric_mode)
    return [group_id for group_id, _, _, _ in ranked[:limit]]


def _build_generation_context(
    workouts: list[WorkoutGenerationSource], metric_mode: str
) -> list[dict[str, Any]]:
    schema_groups = muscle_group_map()
    return [
        {
            "muscle_group_id": group_id,
            "display_name": schema_groups[group_id].display_name,
            "current_score": round(score, 3),
            "current_label": label.value,
            "covered_by": workout_names,
        }
        for group_id, score, workout_names, label in _combine_group_coverage(
            workouts, metric_mode
        )
    ]


def _mock_generated_workout(
    workouts: list[WorkoutGenerationSource], metric_mode: str, guidance: str | None
) -> GenerateWorkoutResponse:
    target_groups = _select_target_muscle_groups(workouts, metric_mode)
    display_names = [
        muscle_group_map()[group_id].display_name for group_id in target_groups
    ]
    emphasis = "endurance" if metric_mode == "endurance" else "strength"
    prescriptions = "endurance" if metric_mode == "endurance" else "load"
    chosen_lines: list[str] = []
    for group_id in target_groups[:3]:
        chosen_lines.extend(
            MOCK_GENERATOR_LIBRARY.get(group_id, {}).get(prescriptions, [])
        )
    if not chosen_lines:
        chosen_lines = [
            "Goblet Squat - 4x10",
            "Push-up - 4x12",
            "Row Variation - 4x12",
            "Plank - 3x45s",
        ]
    workout_lines = [
        f"## Complementary {emphasis.title()} Session",
        "",
        "### Warm-up (5-8 min)",
        "- Light cardio - 3 min",
        "- Dynamic mobility for targeted areas - 2 rounds",
        "",
        "### Main Work",
    ]
    workout_lines.extend(f"- {line}" for line in chosen_lines[:6])
    if guidance:
        workout_lines.extend(
            ["", f"### Notes", f"- Guidance applied: {guidance.strip()}"]
        )
    rationale = f"Targets the least-covered muscle groups across all analyzed workouts for {metric_mode}: {', '.join(display_names)}."
    return GenerateWorkoutResponse(
        title="Complementary Workout",
        text="\n".join(workout_lines),
        target_muscle_groups=display_names,
        rationale=rationale,
        mock_mode=True,
    )


def _render_generated_workout_text(draft: GeneratedWorkoutDraft) -> str:
    lines = [f"## {draft.title}", ""]
    if draft.warmup:
        lines.append("### Warm-up")
        lines.extend(f"- {item}" for item in draft.warmup)
        lines.append("")

    for block in draft.blocks:
        lines.append(f"### {block.name}")
        lines.extend(f"- {exercise}" for exercise in block.exercises)
        lines.append("")

    if draft.finisher:
        lines.append("### Finisher")
        lines.extend(f"- {item}" for item in draft.finisher)
        lines.append("")

    if draft.notes:
        lines.append("### Notes")
        lines.extend(f"- {item}" for item in draft.notes)

    return "\n".join(lines).strip()


def _validate_generated_workout_draft(draft: GeneratedWorkoutDraft) -> None:
    total_exercises = sum(len(block.exercises) for block in draft.blocks)
    if total_exercises < 4:
        raise ValueError("Generated workout did not include enough concrete exercises.")
    malformed = [
        exercise
        for block in draft.blocks
        for exercise in block.exercises
        if " - " not in exercise
        and " x " not in exercise
        and not any(char.isdigit() for char in exercise)
    ]
    if malformed:
        raise ValueError(
            "Generated workout included exercise lines without prescriptions."
        )


def _generation_prompt(request: GenerateWorkoutRequest) -> str:
    target_groups = _select_target_muscle_groups(request.workouts, request.metric_mode)
    schema_groups = muscle_group_map()
    target_lines = "\n".join(
        f"- {schema_groups[group_id].display_name} ({group_id})"
        for group_id in target_groups
    )
    coverage_lines = "\n".join(
        f"- {item['display_name']} ({item['muscle_group_id']}): score {item['current_score']:.3f}, label {item['current_label']}; covered by {', '.join(item['covered_by']) if item['covered_by'] else 'none'}"
        for item in _build_generation_context(request.workouts, request.metric_mode)
    )
    workout_lines = "\n\n".join(
        f"Workout: {workout.workout_name}\n{workout.workout_text.strip()}"
        for workout in request.workouts
    )
    guidance = (request.guidance or "").strip() or "None provided."
    return f"""
Generate one complementary workout that balances the current program.

Primary goal:
- Emphasize the least-covered muscle groups across all analyzed workouts.
- Use {request.metric_mode} as the balancing dimension.

Optional user guidance:
{guidance}

Target muscle groups:
{target_lines}

Current program coverage:
{coverage_lines}

Source workouts:
{workout_lines}

Requirements:
- Return one complementary workout, not a full weekly program.
- Give the workout a relatively short, punchy title.
- Bias exercise selection toward the target muscle groups while keeping the session coherent.
- Respect the optional guidance if provided.
- Return structured workout content with a warmup array, 2-4 blocks, and optional finisher/notes.
- Every exercise string must be concrete and include a prescription like 'Exercise - 3x10-12' or 'Exercise - 3 x 45s'.
- Provide at least 4 exercise lines across the workout blocks.
- Do not put explanations, rationale, or narrative inside exercise lines.
- Avoid overemphasizing muscle groups that are already highly covered.
- Keep the workout practical and realistic.

Return only the JSON object that matches the provided response schema.
""".strip()


def _generation_response_format() -> dict[str, object]:
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "generated_workout",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "warmup": {"type": "array", "items": {"type": "string"}},
                    "blocks": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "name": {"type": "string"},
                                "exercises": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {"type": "string"},
                                },
                            },
                            "required": ["name", "exercises"],
                        },
                    },
                    "finisher": {"type": "array", "items": {"type": "string"}},
                    "notes": {"type": "array", "items": {"type": "string"}},
                    "target_muscle_groups": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                    "rationale": {"type": "string"},
                },
                "required": [
                    "title",
                    "warmup",
                    "blocks",
                    "finisher",
                    "notes",
                    "target_muscle_groups",
                    "rationale",
                ],
            },
        },
    }


def _llm_prompt(workout_text: str) -> str:
    schema = load_body_schema()
    allowed_groups = [
        {
            "muscle_group_id": group.muscle_group_id,
            "display_name": group.display_name,
            "category": group.category,
            "bilateral": group.bilateral,
        }
        for group in schema.muscle_groups
    ]
    allowed_group_lines = "\n".join(
        f"- {group['display_name']} ({group['muscle_group_id']}), category={group['category']}, bilateral={group['bilateral']}"
        for group in allowed_groups
    )
    allowed_labels = ", ".join(label.value for label in schema.labels)
    allowed_patterns = ", ".join(MOCK_MOVEMENT_PATTERNS)
    return f"""
Parse and analyze the following workout. Return a hierarchical JSON tree that matches the provided response schema.

Workout text:
{workout_text}

Supported node types:
- section
- exercise

Allowed labels:
- {allowed_labels}

Label definitions:
- none: No meaningful signal in this dimension.
- low: Light but noticeable signal.
- moderate: Meaningful but not primary signal.
- high: Substantial signal.

Allowed movement patterns:
- {allowed_patterns}

Allowed muscle groups:
{allowed_group_lines}

Examples:
- Push-ups - 2x12 in warm-up -> Chest may be involved biomechanically, but load is often low or moderate because it is warm-up work; endurance is often low to moderate too.
- Bench Press - 4x6-8 -> Chest usually receives high load because this is hard multi-set primary work; endurance is typically lower than load.
- 200 Push-ups -> Chest may receive moderate load but high endurance due to long repeated effort.

Rules:
- Only use the supported node types.
- Only exercise nodes may include group_activations.
- Container nodes may include title, notes, and items.
- Exercise nodes may include exercise_name, prescription, notes, movement_pattern, unilateral, and group_activations.
- Always set movement_pattern using one of the allowed movement patterns. If uncertain, use general_strength.
- For each muscle group, estimate both training load contribution and endurance contribution.
- Rate training load contribution, not biomechanical dominance alone.
- Use the prescription, sets, reps, duration, likely effort, and exercise role to estimate both how much load and how much endurance work each exercise introduces.
- Warm-up, prep, mobility, and activation drills usually produce low load even if a muscle is strongly involved biomechanically.
- Reserve high load for major training stress, typically hard multi-set work or heavy primary lifts.
- High-repetition or long-duration work can produce high endurance even when load is only low or moderate.
- A muscle group can be primary in an exercise but still receive low or moderate load if the work is light, brief, or warm-up oriented.
- Keep notes concise and practical; avoid overly long paragraphs.
- Set unilateral to false when an exercise is not clearly one-sided.
- Preserve hierarchy using nested sections when the workout text suggests blocks, supersets, circuits, warm-ups, or subsections.
- Use only the listed muscle_group_id values.
- For bilateral exercises, choose symmetric groups rather than one side only.

Return only the JSON object that matches the provided response schema.
""".strip()


def _response_format() -> dict[str, object]:
    labels = [label.value for label in ActivationLabel]
    allowed_group_ids = sorted(allowed_muscle_group_ids())
    node_schema: dict[str, Any] = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "type": {
                "type": "string",
                "enum": ["section", "exercise"],
            },
            "title": {"type": ["string", "null"]},
            "notes": {"type": "string"},
            "prescription": {"type": ["string", "null"]},
            "exercise_name": {"type": ["string", "null"]},
            "movement_pattern": {
                "type": ["string", "null"],
                "enum": [*MOCK_MOVEMENT_PATTERNS, None],
            },
            "unilateral": {"type": ["boolean", "null"]},
            "group_activations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "muscle_group_id": {
                            "type": "string",
                            "enum": allowed_group_ids,
                        },
                        "load_label": {"type": "string", "enum": labels},
                        "endurance_label": {"type": "string", "enum": labels},
                        "reason": {"type": "string"},
                    },
                    "required": [
                        "muscle_group_id",
                        "load_label",
                        "endurance_label",
                        "reason",
                    ],
                },
            },
            "items": {"type": "array", "items": {"$ref": "#/$defs/workout_node"}},
        },
        "required": ["type", "notes", "group_activations", "items"],
    }
    node_schema["required"] = [
        "type",
        "title",
        "notes",
        "prescription",
        "exercise_name",
        "movement_pattern",
        "unilateral",
        "group_activations",
        "items",
    ]
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "workout_analysis",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "$defs": {"workout_node": node_schema},
                "properties": {
                    "workout_title": {"type": "string"},
                    "notes": {"type": "string"},
                    "items": {
                        "type": "array",
                        "items": {"$ref": "#/$defs/workout_node"},
                    },
                },
                "required": ["workout_title", "notes", "items"],
            },
        },
    }


def _extract_message_content(response_json: dict[str, Any]) -> str:
    message = response_json["choices"][0]["message"]
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        joined = "".join(
            item.get("text", "") for item in content if isinstance(item, dict)
        ).strip()
        if joined:
            return joined
    refusal = message.get("refusal")
    if refusal:
        raise ValueError(f"LLM refused the request: {refusal}")
    raise ValueError("LLM returned no JSON content")


def _preview_text(value: str, limit: int = 500) -> str:
    compact = " ".join(value.split())
    return compact[:limit]


def _raise_for_status_with_detail(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = response.text.strip()
        raise ValueError(
            f"LLM provider request failed with {response.status_code}: {detail or response.reason_phrase}"
        ) from exc


def _build_http_timeout() -> httpx.Timeout:
    timeout_seconds = get_settings().llm_timeout_seconds
    return httpx.Timeout(timeout_seconds, connect=min(timeout_seconds, 20.0))


def _estimate_token_count(value: str) -> int:
    compact = value.strip()
    if not compact:
        return 0
    return max(1, len(compact) // 4)


def _log_llm_token_usage(
    *, operation: str, payload: dict[str, Any], response_json: dict[str, Any]
) -> None:
    usage = response_json.get("usage") if isinstance(response_json, dict) else None
    prompt_tokens = usage.get("prompt_tokens") if isinstance(usage, dict) else None
    completion_tokens = (
        usage.get("completion_tokens") if isinstance(usage, dict) else None
    )

    if prompt_tokens is None:
        prompt_tokens = _estimate_token_count(
            json.dumps(payload.get("messages", []), ensure_ascii=False)
        )
    if completion_tokens is None:
        try:
            completion_tokens = _estimate_token_count(
                _extract_message_content(response_json)
            )
        except ValueError:
            completion_tokens = 0

    logger.info(
        "LLM token usage operation=%s input_tokens=%s output_tokens=%s",
        operation,
        prompt_tokens,
        completion_tokens,
    )


def infer_exercise(exercise_name: str) -> ExerciseInference:
    analysis = analyze_workout(exercise_name)
    return analysis.exercises[0]


def analyze_workout(workout_text: str) -> AnalyzeWorkoutResponse:
    settings = get_settings()
    if settings.mock_mode:
        workout_analysis = _mock_workout_analysis(workout_text)
    else:
        cache_key = _build_cache_key(workout_text)
        cached = cache_service.get(cache_key)
        if cached is not None:
            return AnalyzeWorkoutResponse.model_validate(cached)
        payload = {
            "model": settings.llm_model,
            "messages": [
                {"role": "system", "content": "You are a strict JSON API."},
                {"role": "user", "content": _llm_prompt(workout_text)},
            ],
            "response_format": _response_format(),
        }
        headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
        try:
            with httpx.Client(timeout=_build_http_timeout()) as client:
                response = client.post(
                    f"{settings.llm_base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                )
        except httpx.TimeoutException as exc:
            raise ValueError(
                f"LLM provider timed out after {settings.llm_timeout_seconds:.0f}s. "
                "Try a smaller workout, a faster model, or increase LLM_TIMEOUT_SECONDS."
            ) from exc
        except httpx.RequestError as exc:
            raise ValueError(
                "Could not connect to the configured LLM provider. "
                "Check LLM_BASE_URL / OPENAI_BASE_URL and your network connection."
            ) from exc
        _raise_for_status_with_detail(response)
        data = response.json()
        _log_llm_token_usage(
            operation="analyze_workout", payload=payload, response_json=data
        )
        raw_content = _extract_message_content(data)
        try:
            workout_analysis = WorkoutAnalysisResponse.model_validate_json(raw_content)
        except ValidationError as exc:
            logger.warning(
                "Workout analysis validation failed. workout_preview=%r response_preview=%r validation_error=%s",
                _preview_text(workout_text, 200),
                _preview_text(raw_content),
                exc,
            )
            raise ValueError(
                "LLM returned invalid workout JSON for the required schema. "
                "Check backend logs for the validation details and response preview."
            ) from exc

    try:
        materialized_workout, exercises = _materialize_workout_analysis(
            workout_analysis
        )
    except ValueError as exc:
        logger.warning(
            "Workout materialization failed. workout_preview=%r error=%s",
            _preview_text(workout_text, 200),
            exc,
        )
        raise
    aggregate_groups, aggregate_body_parts = _aggregate_exercises(exercises)
    result = AnalyzeWorkoutResponse(
        workout_analysis=materialized_workout,
        exercises=exercises,
        aggregate_group_activations=aggregate_groups,
        aggregate_activations=aggregate_body_parts,
        schema_version=load_body_schema().version,
        mock_mode=settings.mock_mode,
    )
    if not settings.mock_mode:
        cache_service.set(
            _build_cache_key(workout_text), result.model_dump(mode="json")
        )
    return result


def generate_complementary_workout(
    request: GenerateWorkoutRequest,
) -> GenerateWorkoutResponse:
    settings = get_settings()
    if settings.mock_mode:
        return _mock_generated_workout(
            request.workouts, request.metric_mode, request.guidance
        )

    cache_key = _build_generation_cache_key(request)
    cached = cache_service.get(cache_key)
    if cached:
        return GenerateWorkoutResponse.model_validate(cached)

    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": "You are a strict JSON API."},
            {"role": "user", "content": _generation_prompt(request)},
        ],
        "response_format": _generation_response_format(),
    }
    headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
    try:
        with httpx.Client(timeout=_build_http_timeout()) as client:
            response = client.post(
                f"{settings.llm_base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
    except httpx.TimeoutException as exc:
        raise ValueError(
            f"LLM provider timed out after {settings.llm_timeout_seconds:.0f}s. "
            "Try a faster model or increase LLM_TIMEOUT_SECONDS."
        ) from exc
    except httpx.RequestError as exc:
        raise ValueError(
            "Could not connect to the configured LLM provider. "
            "Check LLM_BASE_URL / OPENAI_BASE_URL and your network connection."
        ) from exc

    _raise_for_status_with_detail(response)
    data = response.json()
    _log_llm_token_usage(
        operation="generate_workout", payload=payload, response_json=data
    )
    raw_content = _extract_message_content(data)
    try:
        draft = GeneratedWorkoutDraft.model_validate_json(raw_content)
        _validate_generated_workout_draft(draft)
    except ValidationError as exc:
        logger.warning(
            "Workout generation validation failed. response_preview=%r validation_error=%s",
            _preview_text(raw_content),
            exc,
        )
        raise ValueError(
            "LLM returned invalid workout generation JSON. Check backend logs for details."
        ) from exc
    except ValueError as exc:
        logger.warning(
            "Workout generation content validation failed. response_preview=%r error=%s",
            _preview_text(raw_content),
            exc,
        )
        raise ValueError(
            "LLM returned a workout shell without enough concrete exercise lines. Please try again."
        ) from exc

    result = GenerateWorkoutResponse(
        title=draft.title,
        text=_render_generated_workout_text(draft),
        target_muscle_groups=draft.target_muscle_groups,
        rationale=draft.rationale,
        mock_mode=False,
    )
    cache_service.set(cache_key, result.model_dump(mode="json"))
    return result


def warm_default_prompt_cache() -> None:
    settings = get_settings()
    if settings.mock_mode:
        logger.info("Skipping default LLM cache warmup in mock mode.")
        return
    if not settings.llm_api_key:
        logger.warning(
            "Skipping default LLM cache warmup because no API key is configured."
        )
        return

    logger.info("Warming default workout prompt cache.")

    analyzed_workouts: list[tuple[dict[str, str], AnalyzeWorkoutResponse]] = []
    for workout in DEFAULT_WORKOUTS:
        analysis = analyze_workout(workout["text"])
        analyzed_workouts.append((workout, analysis))

    sources = [
        WorkoutGenerationSource(
            workout_name=workout["name"],
            workout_text=workout["text"],
            exercises=analysis.exercises,
            aggregate_group_activations=analysis.aggregate_group_activations,
        )
        for workout, analysis in analyzed_workouts
    ]

    for metric_mode in ("load", "endurance"):
        request = GenerateWorkoutRequest(
            workouts=sources,
            metric_mode=metric_mode,
            guidance=None,
        )
        generated = generate_complementary_workout(request)
        try:
            analyze_workout(generated.text)
        except ValueError as exc:
            logger.warning(
                "Default cache warmup skipped generated workout analysis for metric_mode=%s error=%s",
                metric_mode,
                exc,
            )

    logger.info("Default workout prompt cache warmed successfully.")
