import { beforeEach, describe, expect, test } from 'vitest';

import { clearPersistedAppState, loadPersistedAppState, sanitizeWorkoutsForPersistence, savePersistedAppState, STORAGE_KEY, toRuntimeWorkouts } from './persistence';
import type { PersistedAppState, WorkoutRecord } from '../types';

const sampleState: PersistedAppState = {
  workouts: [
    {
      id: 'workout-1',
      name: 'Saved Workout',
      text: 'Bench Press - 4x8',
      analysis: null,
      lastAnalyzedText: null,
    },
  ],
  activeWorkoutId: 'workout-1',
  selectedWorkoutId: 'workout-1',
  selectedScopePath: '__aggregate__',
  selectedBodyPartId: null,
  metricMode: 'load',
  exerciseDetailMode: 'groups',
  generatorGuidance: 'Keep it short.',
  lastGeneratedTargets: ['Chest'],
  lastGenerationRationale: 'Balances pushing volume.',
};

describe('persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('saves and loads persisted app state', () => {
    savePersistedAppState(sampleState);

    expect(loadPersistedAppState()).toEqual(sampleState);
  });

  test('returns null for invalid stored payloads', () => {
    window.localStorage.setItem(STORAGE_KEY, '{bad json');
    expect(loadPersistedAppState()).toBeNull();

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, state: sampleState }));
    expect(loadPersistedAppState()).toBeNull();
  });

  test('sanitizes runtime workouts and restores safe runtime defaults', () => {
    const workouts: WorkoutRecord[] = [
      {
        id: 'workout-1',
        name: 'Runtime Workout',
        text: 'Squat - 5x5',
        analysis: null,
        lastAnalyzedText: 'Squat - 5x5',
        isAnalyzing: true,
        isCollapsed: true,
      },
    ];

    const persisted = sanitizeWorkoutsForPersistence(workouts);
    expect(persisted).toEqual([
      {
        id: 'workout-1',
        name: 'Runtime Workout',
        text: 'Squat - 5x5',
        analysis: null,
        lastAnalyzedText: 'Squat - 5x5',
      },
    ]);

    expect(toRuntimeWorkouts(persisted)).toEqual([
      {
        id: 'workout-1',
        name: 'Runtime Workout',
        text: 'Squat - 5x5',
        analysis: null,
        lastAnalyzedText: 'Squat - 5x5',
        isAnalyzing: false,
        isCollapsed: false,
      },
    ]);
  });

  test('clears persisted state', () => {
    savePersistedAppState(sampleState);
    clearPersistedAppState();

    expect(loadPersistedAppState()).toBeNull();
  });
});
