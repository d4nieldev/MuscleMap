import type { PersistedAppState, PersistedWorkout, WorkoutRecord } from '../types';

const STORAGE_KEY = 'musclemap.app-state.v1';

type PersistedEnvelopeV1 = {
  version: 1;
  savedAt: string;
  state: PersistedAppState;
};

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isPersistedWorkout(value: unknown): value is PersistedWorkout {
  if (!value || typeof value !== 'object') return false;
  const workout = value as PersistedWorkout;
  return typeof workout.id === 'string'
    && typeof workout.name === 'string'
    && typeof workout.text === 'string'
    && 'analysis' in workout
    && 'lastAnalyzedText' in workout;
}

function isPersistedAppState(value: unknown): value is PersistedAppState {
  if (!value || typeof value !== 'object') return false;
  const state = value as PersistedAppState;
  return Array.isArray(state.workouts)
    && state.workouts.every(isPersistedWorkout)
    && typeof state.activeWorkoutId === 'string'
    && typeof state.selectedWorkoutId === 'string'
    && typeof state.selectedScopePath === 'string'
    && (typeof state.selectedBodyPartId === 'string' || state.selectedBodyPartId === null)
    && (state.metricMode === 'load' || state.metricMode === 'endurance')
    && (state.exerciseDetailMode === 'groups' || state.exerciseDetailMode === 'muscles')
    && typeof state.generatorGuidance === 'string'
    && Array.isArray(state.lastGeneratedTargets)
    && state.lastGeneratedTargets.every((item) => typeof item === 'string')
    && (typeof state.lastGenerationRationale === 'string' || state.lastGenerationRationale === null);
}

export function toRuntimeWorkouts(workouts: PersistedWorkout[]): WorkoutRecord[] {
  return workouts.map((workout) => ({
    ...workout,
    isAnalyzing: false,
    isCollapsed: false,
  }));
}

export function sanitizeWorkoutsForPersistence(workouts: WorkoutRecord[]): PersistedWorkout[] {
  return workouts.map((workout) => ({
    id: workout.id,
    name: workout.name,
    text: workout.text,
    analysis: workout.analysis,
    lastAnalyzedText: workout.lastAnalyzedText ?? null,
  }));
}

export function loadPersistedAppState(): PersistedAppState | null {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedEnvelopeV1;
    if (parsed.version !== 1 || !isPersistedAppState(parsed.state)) {
      return null;
    }
    return parsed.state;
  } catch {
    return null;
  }
}

export function savePersistedAppState(state: PersistedAppState) {
  if (!canUseStorage()) return;

  const payload: PersistedEnvelopeV1 = {
    version: 1,
    savedAt: new Date().toISOString(),
    state,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

export function clearPersistedAppState() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export { STORAGE_KEY };
