import { activationRank, type MetricMode } from './colors';
import type { AggregateActivation, AnalyzeWorkoutResponse, BodyPartActivation, ExerciseInference, WorkoutAnalysisNode } from '../types';

export type ScopeEntry = {
  type: 'root' | WorkoutAnalysisNode['type'];
  activations: BodyPartActivation[];
  exercises: ExerciseInference[];
};

export type NormalizedActivation = {
  body_part_id: string;
  raw_score: number;
  display_intensity: number;
  contributing_exercise_names: string[];
};

export type CombinedWorkoutActivation = {
  body_part_id: string;
  display_intensity: number;
  contributing_workout_ids: string[];
};

export type CombinedWorkoutGroupActivation = {
  muscle_group_id: string;
  display_intensity: number;
  contributing_workout_ids: string[];
};

export const CUMULATIVE_LOAD_TAU = 4.5;
export const CUMULATIVE_ENDURANCE_TAU = 6.0;

type MetricAggregationConfig = {
  tau: number;
  scoreForActivation: (exercise: ExerciseInference, activation: BodyPartActivation) => number;
};

function parsePrescriptionHints(prescription: string | null) {
  if (!prescription) {
    return { repsUpper: null as number | null, secondsUpper: null as number | null, isMinutes: false };
  }

  const normalized = prescription.toLowerCase().replace(/×/g, 'x').trim();
  const timeMatch = normalized.match(/(\d+)(?:\s*-\s*(\d+))?\s*(s|sec|secs|seconds|min|mins|minutes)\b/);
  if (timeMatch) {
    const upper = Number(timeMatch[2] ?? timeMatch[1]);
    const unit = timeMatch[3];
    return {
      repsUpper: null,
      secondsUpper: unit.startsWith('min') ? upper * 60 : upper,
      isMinutes: unit.startsWith('min')
    };
  }

  const repMatches = [...normalized.matchAll(/(\d+)(?:\s*-\s*(\d+))?/g)].map((match) => Number(match[2] ?? match[1]));
  const repsUpper = repMatches.length > 0 ? repMatches[repMatches.length - 1] : null;
  return { repsUpper, secondsUpper: null, isMinutes: false };
}

function endurancePrescriptionMultiplier(exercise: ExerciseInference) {
  const loweredName = exercise.exercise_name.toLowerCase();
  const loweredPattern = exercise.movement_pattern.toLowerCase();
  const hints = parsePrescriptionHints(exercise.prescription);
  let multiplier = 1;

  if (hints.secondsUpper !== null) {
    if (hints.secondsUpper >= 120) multiplier += 0.95;
    else if (hints.secondsUpper >= 60) multiplier += 0.7;
    else if (hints.secondsUpper >= 30) multiplier += 0.4;
  }

  if (hints.repsUpper !== null) {
    if (hints.repsUpper >= 30) multiplier += 0.8;
    else if (hints.repsUpper >= 20) multiplier += 0.55;
    else if (hints.repsUpper >= 15) multiplier += 0.3;
    else if (hints.repsUpper <= 8) multiplier -= 0.15;
  }

  if (loweredPattern.includes('core_stability') || loweredName.includes('plank') || loweredName.includes('carry')) {
    multiplier += 0.35;
  }

  if (loweredName.includes('bike') || loweredName.includes('row machine') || loweredName.includes('machine') || loweredName.includes('walk') || loweredName.includes('jog')) {
    multiplier += 0.45;
  }

  if (exercise.notes.toLowerCase().includes('warm-up') || loweredName.includes('warm-up')) {
    multiplier += 0.1;
  }

  return Math.max(0.55, Math.min(2.2, multiplier));
}

function metricAggregationConfig(metric: MetricMode): MetricAggregationConfig {
  if (metric === 'load') {
    return {
      tau: CUMULATIVE_LOAD_TAU,
      scoreForActivation: (_exercise, activation) => activationRank[activation.load_label],
    };
  }

  return {
    tau: CUMULATIVE_ENDURANCE_TAU,
    scoreForActivation: (exercise, activation) => activationRank[activation.endurance_label] * endurancePrescriptionMultiplier(exercise),
  };
}

export function nodeLabel(node: WorkoutAnalysisNode) {
  return node.type === 'exercise' ? node.exercise_name ?? 'Exercise' : node.title ?? node.type;
}

export function buildScopeIndex(analysis: AnalyzeWorkoutResponse) {
  const exerciseMap = new Map(analysis.exercises.map((exercise) => [exercise.path.join(' > '), exercise]));
  const scopeIndex = new Map<string, ScopeEntry>();

  function visit(node: WorkoutAnalysisNode, parentPath: string[]): ExerciseInference[] {
    const path = [...parentPath, nodeLabel(node)];
    const pathKey = path.join(' > ');

    if (node.type === 'exercise') {
      const matchedExercise = exerciseMap.get(pathKey);
      const exercises = matchedExercise ? [matchedExercise] : [];
      scopeIndex.set(pathKey, { type: node.type, activations: node.activations, exercises });
      return exercises;
    }

    const descendantExercises = node.items.flatMap((child) => visit(child, path));
    scopeIndex.set(pathKey, { type: node.type, activations: node.activations, exercises: descendantExercises });
    return descendantExercises;
  }

  analysis.workout_analysis.items.forEach((item) => {
    visit(item, [analysis.workout_analysis.workout_title]);
  });
  scopeIndex.set('__aggregate__', {
    type: 'root',
    activations: analysis.workout_analysis.activations,
    exercises: analysis.exercises,
  });
  return scopeIndex;
}

export function aggregateActivationsFromExercises(exercises: ExerciseInference[]): AggregateActivation[] {
  const map = new Map<string, AggregateActivation>();
  exercises.forEach((exercise) => {
    exercise.activations.forEach((activation) => {
      const current = map.get(activation.body_part_id);
      if (!current || activationRank[activation.load_label] > activationRank[current.load_label]) {
        map.set(activation.body_part_id, {
          body_part_id: activation.body_part_id,
          muscle_group_id: activation.muscle_group_id,
          load_label: activation.load_label,
          endurance_label: activation.endurance_label,
          exercise_names: [exercise.exercise_name],
        });
      } else if (!current.exercise_names.includes(exercise.exercise_name)) {
        current.exercise_names.push(exercise.exercise_name);
      }
    });
  });
  return Array.from(map.values());
}

export function aggregateActivationsFromScopeEntry(entry: ScopeEntry | undefined): AggregateActivation[] {
  if (!entry) return [];
  return entry.activations.map((activation) => ({
    body_part_id: activation.body_part_id,
    muscle_group_id: activation.muscle_group_id,
    load_label: activation.load_label,
    endurance_label: activation.endurance_label,
    exercise_names: entry.exercises
      .filter((exercise) => exercise.activations.some((item) => item.body_part_id === activation.body_part_id))
      .map((exercise) => exercise.exercise_name),
  }));
}

export function normalizedActivationsFromExercises(exercises: ExerciseInference[], metric: MetricMode = 'load'): NormalizedActivation[] {
  if (exercises.length === 0) return [];
  const config = metricAggregationConfig(metric);
  const scores = new Map<string, { raw: number; exercises: Set<string> }>();

  exercises.forEach((exercise) => {
    exercise.activations.forEach((activation) => {
      const current = scores.get(activation.body_part_id) ?? { raw: 0, exercises: new Set<string>() };
      current.raw += config.scoreForActivation(exercise, activation);
      current.exercises.add(exercise.exercise_name);
      scores.set(activation.body_part_id, current);
    });
  });

  return Array.from(scores.entries())
    .map(([body_part_id, value]) => ({
      body_part_id,
      raw_score: value.raw,
      display_intensity: 1 - Math.exp(-value.raw / config.tau),
      contributing_exercise_names: Array.from(value.exercises),
    }))
    .sort((a, b) => b.display_intensity - a.display_intensity || a.body_part_id.localeCompare(b.body_part_id));
}

export function combinedWorkoutActivations(
  workouts: Array<{ workoutId: string; exercises: ExerciseInference[] }>,
  metric: MetricMode = 'load'
): CombinedWorkoutActivation[] {
  const combined = new Map<string, { intensity: number; workoutIds: Set<string> }>();

  workouts.forEach((workout) => {
    normalizedActivationsFromExercises(workout.exercises, metric).forEach((activation) => {
      const current = combined.get(activation.body_part_id) ?? { intensity: 0, workoutIds: new Set<string>() };
      current.intensity = Math.min(1, current.intensity + activation.display_intensity);
      current.workoutIds.add(workout.workoutId);
      combined.set(activation.body_part_id, current);
    });
  });

  return Array.from(combined.entries())
    .map(([body_part_id, value]) => ({
      body_part_id,
      display_intensity: value.intensity,
      contributing_workout_ids: Array.from(value.workoutIds),
    }))
    .sort((a, b) => b.display_intensity - a.display_intensity || a.body_part_id.localeCompare(b.body_part_id));
}

export function combinedWorkoutGroupIntensities(
  workouts: Array<{ workoutId: string; exercises: ExerciseInference[] }>,
  metric: MetricMode = 'load'
): CombinedWorkoutGroupActivation[] {
  const combined = new Map<string, { intensity: number; workoutIds: Set<string> }>();

  workouts.forEach((workout) => {
    const config = metricAggregationConfig(metric);
    const scores = new Map<string, number>();

    workout.exercises.forEach((exercise) => {
      exercise.group_activations.forEach((activation) => {
        scores.set(
          activation.muscle_group_id,
          (scores.get(activation.muscle_group_id) ?? 0) + config.scoreForActivation(exercise, {
            ...activation,
            body_part_id: activation.muscle_group_id,
            muscle_group_id: activation.muscle_group_id,
          })
        );
      });
    });

    scores.forEach((rawScore, muscle_group_id) => {
      const intensity = 1 - Math.exp(-rawScore / config.tau);
      const current = combined.get(muscle_group_id) ?? { intensity: 0, workoutIds: new Set<string>() };
      current.intensity = Math.min(1, current.intensity + intensity);
      current.workoutIds.add(workout.workoutId);
      combined.set(muscle_group_id, current);
    });
  });

  return Array.from(combined.entries())
    .map(([muscle_group_id, value]) => ({
      muscle_group_id,
      display_intensity: value.intensity,
      contributing_workout_ids: Array.from(value.workoutIds),
    }))
    .sort((a, b) => a.display_intensity - b.display_intensity || a.muscle_group_id.localeCompare(b.muscle_group_id));
}
