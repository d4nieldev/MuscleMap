import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import App from './App';

vi.mock('./components/BodyViewer', () => ({
  BodyViewer: () => <div>3D Viewer Mock</div>
}));

vi.mock('./lib/api', () => ({
  getHealth: vi.fn(async () => ({
    status: 'ok',
    mock_mode: false,
    provider: 'openai',
    model: 'gpt-5-mini'
  })),
  getBodySchema: vi.fn(async () => ({
    version: 'test-schema',
    labels: ['none', 'low', 'moderate', 'high'],
    body_parts: [
      {
        body_part_id: 'bp3d:BP5582',
        canonical_name: 'clavicular part of right pectoralis major',
        mesh_name: 'clavicular part of right pectoralis major',
        source: 'bp3d',
        source_body_id: 'BP5582',
        fma_id: 'FMA34690',
        is_tendon: false,
        aliases: ['clavicular part of right pectoralis major']
      }
    ],
    muscle_groups: [
      {
        muscle_group_id: 'chest',
        display_name: 'Chest',
        category: 'upper_body',
        member_body_part_ids: ['bp3d:BP5582'],
        body_part_ids_left: [],
        body_part_ids_right: ['bp3d:BP5582'],
        body_part_ids_center: [],
        bilateral: false
      }
    ]
  })),
  analyzeWorkout: vi.fn(async () => ({
    schema_version: 'test-schema',
    mock_mode: true,
    workout_analysis: {
      workout_title: 'Workout',
      notes: '',
      group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }],
      activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }],
      items: [
        {
          type: 'exercise',
          title: null,
          notes: '',
          prescription: '4 x 8',
          exercise_name: 'Bench Press',
          movement_pattern: 'horizontal_push',
          unilateral: false,
          group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }],
          activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }],
          items: []
        }
      ]
    },
    exercises: [
      {
        exercise_name: 'Bench Press',
        path: ['Workout', 'Bench Press'],
        prescription: '4 x 8',
        group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }],
        movement_pattern: 'horizontal_push',
        unilateral: false,
        notes: '',
        activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', reason: 'Primary chest driver.' }]
      }
    ],
    aggregate_group_activations: [{ muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', exercise_names: ['Bench Press'] }],
    aggregate_activations: [{ body_part_id: 'bp3d:BP5582', muscle_group_id: 'chest', load_label: 'high', endurance_label: 'high', exercise_names: ['Bench Press'] }]
  })),
  generateWorkout: vi.fn(async () => ({
    title: 'Complementary Workout',
    text: '## Complementary Workout\n\n- Pull-ups - 4x8\n- Row - 3x12',
    target_muscle_groups: ['Back', 'Lats'],
    rationale: 'Targets the least-covered muscle groups across all analyzed workouts.',
    mock_mode: true,
  }))
}));

test('renders workout library and legend', async () => {
  render(<App />);
  expect((await screen.findAllByText(/Workouts/i)).length).toBeGreaterThan(0);
  expect((await screen.findAllByRole('button', { name: /Analyze/i })).length).toBeGreaterThan(0);
  expect(await screen.findByText(/Body Overview/i)).toBeInTheDocument();
  expect(await screen.findByText(/Scope Inspector/i)).toBeInTheDocument();
  expect(await screen.findByText(/Mode: live LLM/i)).toBeInTheDocument();
});

test('generates a complementary workout draft', async () => {
  render(<App />);
  const analyzeButtons = await screen.findAllByRole('button', { name: /Analyze workout/i });
  fireEvent.click(analyzeButtons[0]);

  const generateButton = await screen.findByRole('button', { name: /Generate Workout/i });
  fireEvent.click(generateButton);

  expect(await screen.findByDisplayValue('Complementary Workout')).toBeInTheDocument();
  expect(await screen.findByDisplayValue(/Pull-ups - 4x8/)).toBeInTheDocument();
  expect(await screen.findByText(/Last targets: Back, Lats/i)).toBeInTheDocument();
});
