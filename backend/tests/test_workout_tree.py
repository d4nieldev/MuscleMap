from app.models import (
    MuscleGroupActivation,
    WorkoutAnalysisNode,
    WorkoutAnalysisResponse,
)
from app.services.inference_service import (
    _materialize_workout_analysis,
    analyze_workout,
)


def test_materialize_workout_analysis_aggregates_root_and_containers() -> None:
    workout = WorkoutAnalysisResponse(
        workout_title="Workout",
        items=[
            WorkoutAnalysisNode(
                type="section",
                title="Strength",
                items=[
                    WorkoutAnalysisNode(
                        type="exercise",
                        exercise_name="Bench Press",
                        movement_pattern="horizontal_push",
                        unilateral=False,
                        group_activations=[
                            MuscleGroupActivation(
                                muscle_group_id="chest",
                                load_label="high",
                                endurance_label="high",
                                reason="Primary chest press",
                            )
                        ],
                    ),
                    WorkoutAnalysisNode(
                        type="exercise",
                        exercise_name="Overhead Press",
                        movement_pattern="vertical_push",
                        unilateral=False,
                        group_activations=[
                            MuscleGroupActivation(
                                muscle_group_id="front_shoulders",
                                load_label="high",
                                endurance_label="high",
                                reason="Primary shoulder press",
                            )
                        ],
                    ),
                    WorkoutAnalysisNode(
                        type="section",
                        title="Superset A",
                        items=[
                            WorkoutAnalysisNode(
                                type="exercise",
                                exercise_name="Incline Dumbbell Press",
                                movement_pattern="horizontal_push",
                                unilateral=False,
                                group_activations=[
                                    MuscleGroupActivation(
                                        muscle_group_id="chest",
                                        load_label="high",
                                        endurance_label="high",
                                        reason="Upper chest press",
                                    )
                                ],
                            ),
                            WorkoutAnalysisNode(
                                type="exercise",
                                exercise_name="Cable Fly",
                                movement_pattern="horizontal_push",
                                unilateral=False,
                                group_activations=[
                                    MuscleGroupActivation(
                                        muscle_group_id="chest",
                                        load_label="high",
                                        endurance_label="high",
                                        reason="Chest isolation",
                                    )
                                ],
                            ),
                        ],
                    ),
                ],
            )
        ],
    )

    materialized, exercises = _materialize_workout_analysis(workout)

    assert len(exercises) == 4

    root_group_ids = {item.muscle_group_id for item in materialized.group_activations}
    assert {"chest", "front_shoulders"}.issubset(root_group_ids)

    section = materialized.items[0]
    section_group_ids = {item.muscle_group_id for item in section.group_activations}
    assert {"chest", "front_shoulders"}.issubset(section_group_ids)

    superset = section.items[2]
    superset_group_ids = {item.muscle_group_id for item in superset.group_activations}
    assert superset_group_ids == {"chest"}

    overhead_press = next(
        item for item in exercises if item.exercise_name == "Overhead Press"
    )
    section_body_ids = {item.body_part_id for item in section.activations}
    root_body_ids = {item.body_part_id for item in materialized.activations}
    overhead_body_ids = {item.body_part_id for item in overhead_press.activations}

    assert overhead_body_ids
    assert overhead_body_ids.issubset(section_body_ids)
    assert section_body_ids.issubset(root_body_ids)


def test_analyze_workout_root_matches_aggregate_output() -> None:
    result = analyze_workout("Bench Press\nSquat")
    root_body_ids = {item.body_part_id for item in result.workout_analysis.activations}
    aggregate_body_ids = {item.body_part_id for item in result.aggregate_activations}
    root_group_ids = {
        item.muscle_group_id for item in result.workout_analysis.group_activations
    }
    aggregate_group_ids = {
        item.muscle_group_id for item in result.aggregate_group_activations
    }

    assert root_body_ids == aggregate_body_ids
    assert root_group_ids == aggregate_group_ids
