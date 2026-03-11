from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class ActivationLabel(str, Enum):
    none = "none"
    low = "low"
    moderate = "moderate"
    high = "high"


LABEL_ORDER = {
    ActivationLabel.none: 0,
    ActivationLabel.low: 1,
    ActivationLabel.moderate: 2,
    ActivationLabel.high: 3,
}


class BodyPartActivation(BaseModel):
    body_part_id: str
    muscle_group_id: str | None = None
    load_label: ActivationLabel
    endurance_label: ActivationLabel
    reason: str = Field(min_length=3, max_length=200)


class MuscleGroupActivation(BaseModel):
    muscle_group_id: str
    load_label: ActivationLabel
    endurance_label: ActivationLabel
    reason: str = Field(min_length=3, max_length=200)


class ExerciseInference(BaseModel):
    exercise_name: str = Field(min_length=1)
    path: list[str] = Field(default_factory=list)
    prescription: str | None = None
    group_activations: list[MuscleGroupActivation] = Field(default_factory=list)
    activations: list[BodyPartActivation]
    movement_pattern: str = Field(min_length=1)
    unilateral: bool = False
    notes: str = Field(default="", max_length=2000)

    @model_validator(mode="after")
    def ensure_unique_body_parts(self) -> "ExerciseInference":
        ids = [activation.body_part_id for activation in self.activations]
        if len(ids) != len(set(ids)):
            raise ValueError(
                "activations must not contain duplicate body_part_id values"
            )
        group_ids = [
            activation.muscle_group_id for activation in self.group_activations
        ]
        if len(group_ids) != len(set(group_ids)):
            raise ValueError(
                "group_activations must not contain duplicate muscle_group_id values"
            )
        return self


class InferExerciseRequest(BaseModel):
    exercise_name: str = Field(min_length=1)
    context: dict[str, Any] | None = None


class WorkoutExerciseInput(BaseModel):
    name: str = Field(min_length=1)
    sets: int | None = Field(default=None, ge=1, le=20)
    reps: str | None = None
    notes: str | None = None


class ParseWorkoutRequest(BaseModel):
    text: str | None = None
    exercises: list[WorkoutExerciseInput] | None = None

    @model_validator(mode="after")
    def require_input(self) -> "ParseWorkoutRequest":
        if not self.text and not self.exercises:
            raise ValueError("Provide text or exercises")
        return self


class ParsedWorkoutExercise(BaseModel):
    name: str
    sets: int | None = None
    reps: str | None = None
    notes: str | None = None


class ParseWorkoutResponse(BaseModel):
    exercises: list[ParsedWorkoutExercise]
    source: str


class AnalyzeWorkoutRequest(BaseModel):
    text: str | None = None
    exercises: list[WorkoutExerciseInput] | None = None

    @model_validator(mode="after")
    def require_input(self) -> "AnalyzeWorkoutRequest":
        if not self.text and not self.exercises:
            raise ValueError("Provide text or exercises")
        return self


class WorkoutAnalysisNode(BaseModel):
    type: str
    title: str | None = None
    notes: str = Field(default="", max_length=2000)
    prescription: str | None = None
    exercise_name: str | None = None
    movement_pattern: str | None = None
    unilateral: bool | None = None
    group_activations: list[MuscleGroupActivation] = Field(default_factory=list)
    activations: list[BodyPartActivation] = Field(default_factory=list)
    items: list["WorkoutAnalysisNode"] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_node_shape(self) -> "WorkoutAnalysisNode":
        if self.type == "exercise":
            if not self.exercise_name:
                raise ValueError("exercise nodes require exercise_name")
            if self.items:
                raise ValueError("exercise nodes cannot contain items")
        elif self.type == "section":
            if not self.items:
                raise ValueError(f"{self.type} nodes require items")
            if self.exercise_name is not None:
                raise ValueError("container nodes cannot define exercise_name")
        else:
            raise ValueError("unsupported node type")
        return self


class WorkoutAnalysisResponse(BaseModel):
    workout_title: str
    notes: str = Field(default="", max_length=2000)
    items: list[WorkoutAnalysisNode]
    group_activations: list[MuscleGroupActivation] = Field(default_factory=list)
    activations: list[BodyPartActivation] = Field(default_factory=list)


class AggregateActivation(BaseModel):
    body_part_id: str
    muscle_group_id: str | None = None
    load_label: ActivationLabel
    endurance_label: ActivationLabel
    exercise_names: list[str]


class AggregateGroupActivation(BaseModel):
    muscle_group_id: str
    load_label: ActivationLabel
    endurance_label: ActivationLabel
    exercise_names: list[str]


class AnalyzeWorkoutResponse(BaseModel):
    workout_analysis: WorkoutAnalysisResponse
    exercises: list[ExerciseInference]
    aggregate_group_activations: list[AggregateGroupActivation]
    aggregate_activations: list[AggregateActivation]
    schema_version: str
    mock_mode: bool


class WorkoutGenerationSource(BaseModel):
    workout_name: str = Field(min_length=1)
    workout_text: str = Field(min_length=1)
    exercises: list[ExerciseInference] = Field(default_factory=list)
    aggregate_group_activations: list[AggregateGroupActivation] = Field(
        default_factory=list
    )


class GenerateWorkoutRequest(BaseModel):
    workouts: list[WorkoutGenerationSource]
    metric_mode: str = Field(pattern="^(load|endurance)$")
    guidance: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def require_workouts(self) -> "GenerateWorkoutRequest":
        if not self.workouts:
            raise ValueError("Provide at least one analyzed workout")
        return self


class GenerateWorkoutResponse(BaseModel):
    title: str
    text: str
    target_muscle_groups: list[str]
    rationale: str
    mock_mode: bool = False


class GeneratedWorkoutBlock(BaseModel):
    name: str = Field(min_length=1)
    exercises: list[str] = Field(min_length=1)


class GeneratedWorkoutDraft(BaseModel):
    title: str = Field(min_length=1)
    warmup: list[str] = Field(default_factory=list)
    blocks: list[GeneratedWorkoutBlock] = Field(min_length=1)
    finisher: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    target_muscle_groups: list[str] = Field(min_length=1)
    rationale: str = Field(min_length=10)


class BodyPartSchemaItem(BaseModel):
    body_part_id: str
    canonical_name: str
    mesh_name: str
    source: str
    source_body_id: str | None = None
    fma_id: str | None = None
    is_tendon: bool
    aliases: list[str] = Field(default_factory=list)

    @field_validator("source_body_id", "fma_id", mode="before")
    @classmethod
    def blank_to_none(cls, value: str | None) -> str | None:
        if value == "":
            return None
        return value


class BodySchemaResponse(BaseModel):
    version: str
    labels: list[ActivationLabel]
    body_parts: list[BodyPartSchemaItem]
    muscle_groups: list["MuscleGroupSchemaItem"]


class MuscleGroupSchemaItem(BaseModel):
    muscle_group_id: str
    display_name: str
    category: str
    member_body_part_ids: list[str]
    body_part_ids_left: list[str] = Field(default_factory=list)
    body_part_ids_right: list[str] = Field(default_factory=list)
    body_part_ids_center: list[str] = Field(default_factory=list)
    bilateral: bool = True
