import { describe, expect, it } from 'vitest';

import { aggregateActivationsFromScopeEntry, buildScopeIndex, combinedWorkoutActivations, CUMULATIVE_ENDURANCE_TAU, CUMULATIVE_LOAD_TAU, normalizedActivationsFromExercises } from './workoutTree';
import type { AnalyzeWorkoutResponse, ExerciseInference } from '../types';


const analysis: AnalyzeWorkoutResponse = {
  schema_version: 'test',
  mock_mode: true,
  workout_analysis: {
    workout_title: 'Workout',
    notes: '',
    group_activations: [
      { muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'All pressing' },
      { muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'Shoulder work' },
    ],
    activations: [
      { body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'root' },
      { body_part_id: 'bp3d:BP7573', muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'root' },
    ],
    items: [
      {
        type: 'section',
        title: 'Strength',
        notes: '',
        prescription: null,
        exercise_name: null,
        movement_pattern: null,
        unilateral: null,
        group_activations: [
          { muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'section' },
          { muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'section' },
        ],
        activations: [
          { body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'section' },
          { body_part_id: 'bp3d:BP7573', muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'section' },
        ],
        items: [
          {
            type: 'exercise',
            title: null,
            notes: '',
            prescription: '4 x 8',
            exercise_name: 'Bench Press',
            movement_pattern: 'horizontal_push',
            unilateral: false,
            group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' }],
            activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' }],
            items: [],
          },
          {
            type: 'exercise',
            title: null,
            notes: '',
            prescription: '3 x 8',
            exercise_name: 'Overhead Press',
            movement_pattern: 'vertical_push',
            unilateral: false,
            group_activations: [{ muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'ohp' }],
            activations: [{ body_part_id: 'bp3d:BP7573', muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'ohp' }],
            items: [],
          },
          {
            type: 'section',
            title: 'Superset A',
            notes: '',
            prescription: null,
            exercise_name: null,
            movement_pattern: null,
            unilateral: null,
            group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'superset' }],
            activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'superset' }],
            items: [
              {
                type: 'exercise',
                title: null,
                notes: '',
                prescription: '3 x 10',
                exercise_name: 'Incline Dumbbell Press',
                movement_pattern: 'horizontal_push',
                unilateral: false,
                group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'incline' }],
                activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'incline' }],
                items: [],
              },
              {
                type: 'exercise',
                title: null,
                notes: '',
                prescription: '3 x 12',
                exercise_name: 'Cable Fly',
                movement_pattern: 'horizontal_push',
                unilateral: false,
                group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'fly' }],
                activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'fly' }],
                items: [],
              },
            ],
          },
        ],
      },
    ],
  },
  exercises: [
      {
        exercise_name: 'Bench Press',
        path: ['Workout', 'Strength', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' }],
      activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' }],
      movement_pattern: 'horizontal_push',
      unilateral: false,
      notes: '',
    },
      {
        exercise_name: 'Overhead Press',
        path: ['Workout', 'Strength', 'Overhead Press'],
        prescription: '3 x 8',
        group_activations: [{ muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'ohp' }],
      activations: [{ body_part_id: 'bp3d:BP7573', muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', reason: 'ohp' }],
      movement_pattern: 'vertical_push',
      unilateral: false,
      notes: '',
    },
      {
        exercise_name: 'Incline Dumbbell Press',
        path: ['Workout', 'Strength', 'Superset A', 'Incline Dumbbell Press'],
        prescription: '3 x 10',
        group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'incline' }],
      activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'incline' }],
      movement_pattern: 'horizontal_push',
      unilateral: false,
      notes: '',
    },
      {
        exercise_name: 'Cable Fly',
        path: ['Workout', 'Strength', 'Superset A', 'Cable Fly'],
        prescription: '3 x 12',
        group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'fly' }],
      activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'fly' }],
      movement_pattern: 'horizontal_push',
      unilateral: false,
      notes: '',
    },
  ],
  aggregate_group_activations: [
    { muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', exercise_names: ['Bench Press'] },
    { muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', exercise_names: ['Overhead Press'] },
  ],
  aggregate_activations: [
    { body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', exercise_names: ['Bench Press'] },
    { body_part_id: 'bp3d:BP7573', muscle_group_id: 'front_shoulders', load_label: 'high', endurance_label: 'high', exercise_names: ['Overhead Press'] },
  ],
};


describe('buildScopeIndex', () => {
  it('keeps recursive descendant exercises and node activations aligned', () => {
    const scopeIndex = buildScopeIndex(analysis);

    expect(scopeIndex.get('__aggregate__')?.exercises).toHaveLength(4);
    expect(scopeIndex.get('__aggregate__')?.activations).toHaveLength(2);

    const section = scopeIndex.get('Workout > Strength');
    expect(section?.exercises.map((item) => item.exercise_name)).toEqual(['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Cable Fly']);
    expect(section?.activations.map((item) => item.body_part_id)).toEqual(['bp3d:BP5582', 'bp3d:BP7573']);

    const superset = scopeIndex.get('Workout > Strength > Superset A');
    expect(superset?.exercises.map((item) => item.exercise_name)).toEqual(['Incline Dumbbell Press', 'Cable Fly']);
    expect(aggregateActivationsFromScopeEntry(section)?.map((item) => item.body_part_id)).toEqual(['bp3d:BP5582', 'bp3d:BP7573']);

    const bench = scopeIndex.get('Workout > Strength > Bench Press');
    expect(bench?.exercises).toHaveLength(1);
    expect(bench?.activations.map((item) => item.body_part_id)).toEqual(['bp3d:BP5582']);
  });

  it('sums and normalizes aggregate exercise intensity', () => {
    const normalized = normalizedActivationsFromExercises([
      {
        exercise_name: 'Bench Press',
        path: ['Workout', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [],
        activations: [
          { body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' },
          { body_part_id: 'triceps', muscle_group_id: 'triceps', load_label: 'moderate', endurance_label: 'moderate', reason: 'bench' }
        ],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: ''
      },
      {
        exercise_name: 'Overhead Press',
        path: ['Workout', 'Overhead Press'],
        prescription: '3 x 8',
        group_activations: [],
        activations: [
          { body_part_id: 'triceps', muscle_group_id: 'triceps', load_label: 'high', endurance_label: 'high', reason: 'press' }
        ],
        movement_pattern: 'vertical_push',
        unilateral: false,
        notes: ''
      }
    ]);

    expect(normalized.find((item) => item.body_part_id === 'chest')?.raw_score).toBe(3);
    expect(normalized.find((item) => item.body_part_id === 'chest')?.display_intensity).toBeCloseTo(1 - Math.exp(-3 / CUMULATIVE_LOAD_TAU));
    expect(normalized.find((item) => item.body_part_id === 'triceps')?.raw_score).toBe(5);
    expect(normalized.find((item) => item.body_part_id === 'triceps')?.display_intensity).toBeCloseTo(1 - Math.exp(-5 / CUMULATIVE_LOAD_TAU));
    expect((normalized.find((item) => item.body_part_id === 'triceps')?.display_intensity ?? 0)).toBeGreaterThan(
      normalized.find((item) => item.body_part_id === 'chest')?.display_intensity ?? 0
    );
  });

  it('weights endurance by prescription differently than load', () => {
    const endurance = normalizedActivationsFromExercises([
      {
        exercise_name: 'Push-ups',
        path: ['Workout', 'Push-ups'],
        prescription: '200 reps',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'moderate', endurance_label: 'high', reason: 'pushups' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: ''
      },
      {
        exercise_name: 'Bench Press',
        path: ['Workout', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'moderate', reason: 'bench' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: ''
      }
    ], 'endurance');

    const load = normalizedActivationsFromExercises([
      {
        exercise_name: 'Push-ups',
        path: ['Workout', 'Push-ups'],
        prescription: '200 reps',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'moderate', endurance_label: 'high', reason: 'pushups' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: ''
      },
      {
        exercise_name: 'Bench Press',
        path: ['Workout', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'moderate', reason: 'bench' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: ''
      }
    ], 'load');

    expect(endurance[0].raw_score).toBeGreaterThan(load[0].raw_score);
    expect(endurance[0].display_intensity).toBeCloseTo(1 - Math.exp(-endurance[0].raw_score / CUMULATIVE_ENDURANCE_TAU));
  });

  it('combines multiple workouts linearly after per-workout load calculation', () => {
    const workoutA: ExerciseInference[] = [
      {
        exercise_name: 'Bench Press',
        path: ['A', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'bench' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: '',
      },
    ];
    const workoutB: ExerciseInference[] = [
      {
        exercise_name: 'Push-up',
        path: ['B', 'Push-up'],
        prescription: '200 reps',
        group_activations: [],
        activations: [{ body_part_id: 'chest', muscle_group_id: 'chest', load_label: 'moderate', endurance_label: 'moderate', reason: 'push-up' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: '',
      },
    ];

    const chestA = normalizedActivationsFromExercises(workoutA).find((item) => item.body_part_id === 'chest')?.display_intensity ?? 0;
    const chestB = normalizedActivationsFromExercises(workoutB).find((item) => item.body_part_id === 'chest')?.display_intensity ?? 0;
    const combined = combinedWorkoutActivations([
      { workoutId: 'a', exercises: workoutA },
      { workoutId: 'b', exercises: workoutB },
    ]);

    expect(combined.find((item) => item.body_part_id === 'chest')?.display_intensity).toBeCloseTo(Math.min(1, chestA + chestB));
  });
});
