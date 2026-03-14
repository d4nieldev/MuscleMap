export const activationLabels = ['none', 'low', 'moderate', 'high'] as const;

export type ActivationLabel = (typeof activationLabels)[number];

export type BodyPartSchemaItem = {
  body_part_id: string;
  canonical_name: string;
  mesh_name: string;
  source: string;
  source_body_id: string | null;
  fma_id: string | null;
  is_tendon: boolean;
  aliases: string[];
};

export type MuscleGroupSchemaItem = {
  muscle_group_id: string;
  display_name: string;
  category: string;
  member_body_part_ids: string[];
  body_part_ids_left: string[];
  body_part_ids_right: string[];
  body_part_ids_center: string[];
  bilateral: boolean;
};

export type BodySchemaResponse = {
  version: string;
  labels: ActivationLabel[];
  body_parts: BodyPartSchemaItem[];
  muscle_groups: MuscleGroupSchemaItem[];
};

export type HealthResponse = {
  status: string;
  mock_mode: boolean;
  provider: string;
  model: string;
};

export type BodyPartActivation = {
  body_part_id: string;
  muscle_group_id: string | null;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  reason: string;
};

export type MuscleGroupActivation = {
  muscle_group_id: string;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  reason: string;
};

export type ExerciseInference = {
  exercise_name: string;
  path: string[];
  prescription: string | null;
  group_activations: MuscleGroupActivation[];
  activations: BodyPartActivation[];
  movement_pattern: string;
  unilateral: boolean;
  notes: string;
};

export type WorkoutAnalysisNode = {
  type: 'section' | 'exercise';
  title: string | null;
  notes: string;
  prescription: string | null;
  exercise_name: string | null;
  movement_pattern: string | null;
  unilateral: boolean | null;
  group_activations: MuscleGroupActivation[];
  activations: BodyPartActivation[];
  items: WorkoutAnalysisNode[];
};

export type WorkoutAnalysisResponse = {
  workout_title: string;
  notes: string;
  items: WorkoutAnalysisNode[];
  group_activations: MuscleGroupActivation[];
  activations: BodyPartActivation[];
};

export type AggregateActivation = {
  body_part_id: string;
  muscle_group_id: string | null;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  exercise_names: string[];
};

export type AggregateGroupActivation = {
  muscle_group_id: string;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  exercise_names: string[];
};

export type AnalyzeWorkoutResponse = {
  workout_analysis: WorkoutAnalysisResponse;
  exercises: ExerciseInference[];
  aggregate_group_activations: AggregateGroupActivation[];
  aggregate_activations: AggregateActivation[];
  schema_version: string;
  mock_mode: boolean;
};

export type WorkoutRecord = {
  id: string;
  name: string;
  text: string;
  analysis: AnalyzeWorkoutResponse | null;
  lastAnalyzedText?: string | null;
  isAnalyzing: boolean;
  isCollapsed: boolean;
};

export type PersistedWorkout = {
  id: string;
  name: string;
  text: string;
  analysis: AnalyzeWorkoutResponse | null;
  lastAnalyzedText: string | null;
};

export type PersistedAppState = {
  workouts: PersistedWorkout[];
  activeWorkoutId: string;
  selectedWorkoutId: string;
  selectedScopePath: string;
  selectedBodyPartId: string | null;
  metricMode: 'load' | 'endurance';
  exerciseDetailMode: 'groups' | 'muscles';
  generatorGuidance: string;
  lastGeneratedTargets: string[];
  lastGenerationRationale: string | null;
};

export type WorkoutGenerationSource = {
  workout_name: string;
  workout_text: string;
  exercises: ExerciseInference[];
  aggregate_group_activations: AggregateGroupActivation[];
};

export type GenerateWorkoutResponse = {
  title: string;
  text: string;
  target_muscle_groups: string[];
  rationale: string;
  mock_mode: boolean;
};

export type ParsedWorkoutExercise = {
  name: string;
  sets: number | null;
  reps: string | null;
  notes: string | null;
};

export type ParseWorkoutResponse = {
  exercises: ParsedWorkoutExercise[];
  source: string;
};
