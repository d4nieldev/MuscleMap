import { useEffect, useMemo, useState } from 'react';

import { analyzeWorkout, generateWorkout, getBodySchema } from './lib/api';
import { BodyViewer } from './components/BodyViewer';
import { DetailsPanel } from './components/DetailsPanel';
import { ExerciseList, type WorkoutRecord } from './components/ExerciseList';
import { activationRank, discreteMetricColor, discreteMetricTextColor, formatActivationLabel, metricBadgeLabel, metricVerb } from './lib/colors';
import { aggregateActivationsFromExercises, aggregateActivationsFromScopeEntry, buildScopeIndex, combinedWorkoutActivations, combinedWorkoutGroupIntensities, normalizedActivationsFromExercises } from './lib/workoutTree';
import type { ActivationLabel, AggregateActivation, BodyPartActivation, BodySchemaResponse, ExerciseInference, MuscleGroupActivation, WorkoutGenerationSource } from './types';
import type { MetricMode } from './lib/colors';

const starterWorkouts = [
  {
    id: 'workout-a',
    name: 'A - Pull',
    text: '## A - Pull (~60 min)\n\n### Warm-up (5 min)\n- Row machine - 2 min\n- Band pull-aparts - 2x15\n- Light lat pulldown - 1x12\n\n### Back\n- Pull-ups / Lat Pulldown - 4x8-10\n- Seated Cable Row - 3x10-12\n- Face Pull - 3x12-15\n\n### Biceps (Superset)\n- EZ-bar or Dumbbell Curl - 3x8-10\n- Hammer Curl - 3x10-12\n\n### Core (3 rounds)\n- Hanging Knee Raises - 12\n- Cable Crunch - 15\n- Plank - 45-60s'
  },
  {
    id: 'workout-b',
    name: 'B - Push',
    text: '## B - Push (~60 min)\n\n### Warm-up (5 min)\n- Push-ups - 2x12\n- Band shoulder rotations - 2x15\n\n### Chest\n- Bench Press / Dumbbell Bench - 4x6-8\n- Incline Dumbbell Press - 3x8-10\n\n### Shoulders\n- Dumbbell Shoulder Press - 3x8-10\n- Lateral Raises - 4x12-15\n\n### Triceps (Superset)\n- Cable Pushdown - 3x10-12\n- Overhead Dumbbell Extension - 3x10-12\n\n### Core (2-3 rounds)\n- Cable Woodchopper - 12 each side\n- Ab Machine / Sit-ups - 15\n- Plank - 45s'
  },
  {
    id: 'workout-c',
    name: 'C - Legs',
    text: '## C - Legs (~60 min)\n\n### Warm-up (5 min)\n- Bike - 3 min\n- Bodyweight Squats - 2x12\n\n### Main Lifts\n- Barbell Squat / Hack Squat - 4x6-8\n- Romanian Deadlift - 3x8-10\n\n### Quads\n- Leg Press - 3x10-12\n\n### Hamstrings\n- Leg Curl - 3x12-15\n\n### Calves\n- Standing / Seated Calf Raise - 4x12-15\n\n### Core (2-3 rounds)\n- Hanging Knee Raises - 12\n- Back Extension - 12-15\n- Side Plank - 30-40s each side'
  }
];

type ScopeContribution = {
  exercise_name: string;
  workout_name: string;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  reason: string;
  movement_pattern: string;
  unilateral: boolean;
  muscle_group_name: string;
};

function aggregateAcrossWorkouts(workouts: WorkoutRecord[]): AggregateActivation[] {
  const map = new Map<string, AggregateActivation>();
  workouts.forEach((workout) => {
    workout.analysis?.aggregate_activations.forEach((activation) => {
      const current = map.get(activation.body_part_id);
      if (!current || activationRank[activation.load_label] > activationRank[current.load_label]) {
        map.set(activation.body_part_id, { ...activation, exercise_names: [...activation.exercise_names] });
      } else {
        activation.exercise_names.forEach((name) => {
          if (!current.exercise_names.includes(name)) current.exercise_names.push(name);
        });
      }
    });
  });
  return Array.from(map.values());
}

function selectionTitle(selectedWorkoutId: string, selectedScopePath: string, activeWorkoutName: string) {
  if (selectedWorkoutId === '__all__') return 'All Workouts';
  if (selectedScopePath === '__aggregate__') return activeWorkoutName;
  return selectedScopePath.split(' > ').slice(-1)[0];
}

function Icon({ path, label }: { path: string; label: string }) {
  return (
    <svg aria-hidden="true" className="icon-svg" viewBox="0 0 24 24">
      <title>{label}</title>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function LoadingGlyph() {
  return (
    <span aria-label="Analyzing" className="loading-glyph" role="status">
      <svg aria-hidden="true" className="icon-svg loading-svg" viewBox="0 0 24 24">
        <path d="M7 2h10v4h-2V4H9v2H7V2Zm10 20H7v-4h2v2h6v-2h2v4ZM8 7h8v3l-2 2 2 2v3H8v-3l2-2-2-2V7Zm2 2v.17L12.83 12 10 14.83V15h4v-.17L11.17 12 14 9.17V9h-4Z" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function App() {
  const [schema, setSchema] = useState<BodySchemaResponse | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>(starterWorkouts.map((workout) => ({ ...workout, analysis: null, isAnalyzing: false, isCollapsed: false })));
  const [activeWorkoutId, setActiveWorkoutId] = useState(starterWorkouts[0].id);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(starterWorkouts[0].id);
  const [selectedScopePath, setSelectedScopePath] = useState('__aggregate__');
  const [selectedBodyPartId, setSelectedBodyPartId] = useState<string | null>(null);
  const [metricMode, setMetricMode] = useState<MetricMode>('load');
  const [exerciseDetailMode, setExerciseDetailMode] = useState<'groups' | 'muscles'>('groups');
  const [workoutSearch, setWorkoutSearch] = useState('');
  const [generatorGuidance, setGeneratorGuidance] = useState('');
  const [isGeneratingWorkout, setIsGeneratingWorkout] = useState(false);
  const [lastGeneratedTargets, setLastGeneratedTargets] = useState<string[]>([]);
  const [lastGenerationRationale, setLastGenerationRationale] = useState<string | null>(null);
  const [highlightedTargetMuscleGroupId, setHighlightedTargetMuscleGroupId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false);

  useEffect(() => {
    getBodySchema().then(setSchema).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unknown error'));
  }, []);

  const filteredWorkouts = useMemo(() => workouts.filter((workout) => workout.name.toLowerCase().includes(workoutSearch.toLowerCase())), [workoutSearch, workouts]);
  const activeWorkoutIndex = workouts.findIndex((workout) => workout.id === activeWorkoutId);
  const activeWorkout = workouts[activeWorkoutIndex] ?? workouts[0];

  const allExercises = useMemo(
    () => workouts.flatMap((workout) => (workout.analysis?.exercises ?? []).map((exercise) => ({ ...exercise, workoutName: workout.name, workoutId: workout.id }))),
    [workouts]
  );
  const allAggregateActivations = useMemo(() => aggregateAcrossWorkouts(workouts), [workouts]);
  const analyzedWorkouts = useMemo(() => workouts.filter((workout) => workout.analysis), [workouts]);
  const allWorkoutCombinedIntensities = useMemo(() => {
    const combined = combinedWorkoutActivations(
      workouts
        .filter((workout) => workout.analysis)
        .map((workout) => ({ workoutId: workout.id, exercises: workout.analysis?.exercises ?? [] })),
      metricMode
    );
    return new Map(combined.map((item) => [item.body_part_id, item.display_intensity]));
  }, [metricMode, workouts]);
  const currentScopeIndex = useMemo(() => (activeWorkout?.analysis ? buildScopeIndex(activeWorkout.analysis) : new Map()), [activeWorkout]);
  const weakestMuscleGroups = useMemo(() => {
    if (!schema) return [];
    const coverage = new Map(
      combinedWorkoutGroupIntensities(
        workouts
          .filter((workout) => workout.analysis)
          .map((workout) => ({ workoutId: workout.id, exercises: workout.analysis?.exercises ?? [] })),
        metricMode
      ).map((activation) => [activation.muscle_group_id, activation.display_intensity])
    );
    return schema.muscle_groups
      .map((group) => ({
        muscle_group_id: group.muscle_group_id,
        display_name: group.display_name,
        score: coverage.get(group.muscle_group_id) ?? 0
      }))
      .sort((a, b) => a.score - b.score || a.display_name.localeCompare(b.display_name))
      .slice(0, 5);
  }, [metricMode, schema, workouts]);
  const highlightedTargetBodyPartIds = useMemo(() => {
    if (!schema || !highlightedTargetMuscleGroupId) return new Set<string>();
    const group = schema.muscle_groups.find((item) => item.muscle_group_id === highlightedTargetMuscleGroupId);
    return new Set(group?.member_body_part_ids ?? []);
  }, [highlightedTargetMuscleGroupId, schema]);

  const scopedExercises = useMemo(() => {
    if (selectedWorkoutId === '__all__') {
      return selectedScopePath === '__aggregate__' ? allExercises : allExercises.filter((exercise) => exercise.path.join(' > ').startsWith(selectedScopePath));
    }
    return currentScopeIndex.get(selectedScopePath)?.exercises ?? [];
  }, [allExercises, currentScopeIndex, selectedScopePath, selectedWorkoutId]);

  const scopeAggregateActivations = useMemo(() => {
    if (selectedWorkoutId === '__all__') {
      return selectedScopePath === '__aggregate__' ? allAggregateActivations : aggregateActivationsFromExercises(scopedExercises);
    }
    return aggregateActivationsFromScopeEntry(currentScopeIndex.get(selectedScopePath));
  }, [allAggregateActivations, currentScopeIndex, scopedExercises, selectedScopePath, selectedWorkoutId]);

  const currentContributions = useMemo<ScopeContribution[]>(() => {
    if (!selectedBodyPartId) return [];
    return scopedExercises.flatMap((exercise: any) => {
      const activation = exercise.activations.find((item: any) => item.body_part_id === selectedBodyPartId);
      if (!activation) return [];
      return [{
        exercise_name: exercise.exercise_name,
        workout_name: exercise.workoutName ?? activeWorkout?.name ?? 'Workout',
        load_label: activation.load_label,
        endurance_label: activation.endurance_label,
        reason: activation.reason,
        movement_pattern: exercise.movement_pattern,
        unilateral: exercise.unilateral,
        muscle_group_name: schema?.muscle_groups.find((item) => item.muscle_group_id === activation.muscle_group_id)?.display_name ?? 'Unknown group'
      }];
    });
  }, [activeWorkout, schema, scopedExercises, selectedBodyPartId]);

  const selectedBodyPartNormalizedScore = useMemo(() => {
    if (!selectedBodyPartId || scopedExercises.length <= 1) {
      return null;
    }
    if (selectedWorkoutId === '__all__' && selectedScopePath === '__aggregate__') {
      return allWorkoutCombinedIntensities.get(selectedBodyPartId) ?? null;
    }
    return normalizedActivationsFromExercises(scopedExercises, metricMode).find((item) => item.body_part_id === selectedBodyPartId)?.display_intensity ?? null;
  }, [allWorkoutCombinedIntensities, metricMode, scopedExercises, selectedBodyPartId, selectedScopePath, selectedWorkoutId]);

  const selectedExerciseDetail = useMemo(() => {
    if (selectedScopePath === '__aggregate__' || selectedWorkoutId === '__all__') return null;
    const exactExercise = scopedExercises.find((exercise: ExerciseInference) => exercise.path.join(' > ') === selectedScopePath);
    if (!exactExercise) return null;
    const groups = exactExercise.group_activations.map((activation: MuscleGroupActivation) => ({
      muscle_group_id: activation.muscle_group_id,
      muscle_group_name: schema?.muscle_groups.find((item) => item.muscle_group_id === activation.muscle_group_id)?.display_name ?? activation.muscle_group_id,
      label: metricMode === 'load' ? activation.load_label : activation.endurance_label,
      load_label: activation.load_label,
      endurance_label: activation.endurance_label,
      reason: activation.reason,
    }));
    const muscles: Array<{ body_part_id: string; body_part_name: string; muscle_group_name: string; label: ActivationLabel; load_label: ActivationLabel; endurance_label: ActivationLabel; reason: string }> = exactExercise.activations.map((activation: BodyPartActivation) => ({
      body_part_id: activation.body_part_id,
      body_part_name: schema?.body_parts.find((item) => item.body_part_id === activation.body_part_id)?.canonical_name ?? activation.body_part_id,
      muscle_group_name: schema?.muscle_groups.find((item) => item.muscle_group_id === activation.muscle_group_id)?.display_name ?? 'Unknown group',
      label: metricMode === 'load' ? activation.load_label : activation.endurance_label,
      load_label: activation.load_label,
      endurance_label: activation.endurance_label,
      reason: activation.reason,
    }));
    return { exercise: exactExercise, groups, muscles };
  }, [metricMode, schema, scopedExercises, selectedScopePath, selectedWorkoutId]);

  async function handleAnalyzeWorkout(workoutId: string) {
    const workout = workouts.find((item) => item.id === workoutId);
    if (!workout) return;
    setError(null);
    setWorkouts((current) => current.map((item) => (item.id === workoutId ? { ...item, isAnalyzing: true } : item)));
    try {
      const analysis = await analyzeWorkout(workout.text);
      setWorkouts((current) => current.map((item) => (item.id === workoutId ? { ...item, analysis, isAnalyzing: false } : item)));
      setActiveWorkoutId(workoutId);
      setSelectedWorkoutId(workoutId);
      setSelectedScopePath('__aggregate__');
      setSelectedBodyPartId(null);
    } catch (caught) {
      setWorkouts((current) => current.map((item) => (item.id === workoutId ? { ...item, isAnalyzing: false } : item)));
      setError(caught instanceof Error ? caught.message : 'Unknown error');
    }
  }

  async function handleAnalyzeAllWorkouts() {
    setError(null);
    setIsAnalyzingAll(true);
    const workoutsToAnalyze = workouts.filter((workout) => workout.text.trim());
    setWorkouts((current) => current.map((item) => (
      workoutsToAnalyze.some((workout) => workout.id === item.id)
        ? { ...item, isAnalyzing: true }
        : item
    )));

    try {
      const results = await Promise.allSettled(
        workoutsToAnalyze.map(async (workout) => ({
          workoutId: workout.id,
          analysis: await analyzeWorkout(workout.text),
        }))
      );

      const successfulResults = new Map(
        results
          .filter((result): result is PromiseFulfilledResult<{ workoutId: string; analysis: Awaited<ReturnType<typeof analyzeWorkout>> }> => result.status === 'fulfilled')
          .map((result) => [result.value.workoutId, result.value.analysis])
      );

      setWorkouts((current) => current.map((item) => {
        const analysis = successfulResults.get(item.id);
        if (analysis) {
          return { ...item, analysis, isAnalyzing: false };
        }
        if (workoutsToAnalyze.some((workout) => workout.id === item.id)) {
          return { ...item, isAnalyzing: false };
        }
        return item;
      }));

      const rejectedResults = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (rejectedResults.length > 0) {
        throw rejectedResults[0].reason;
      }

      setSelectedWorkoutId('__all__');
      setSelectedScopePath('__aggregate__');
      setSelectedBodyPartId(null);
    } catch (caught) {
      setWorkouts((current) => current.map((item) => ({ ...item, isAnalyzing: false })));
      setError(caught instanceof Error ? caught.message : 'Unknown error');
    } finally {
      setIsAnalyzingAll(false);
    }
  }

  async function handleGenerateWorkout() {
    if (analyzedWorkouts.length === 0) return;
    setError(null);
    setIsGeneratingWorkout(true);
    try {
      const sources: WorkoutGenerationSource[] = analyzedWorkouts.map((workout) => ({
        workout_name: workout.name,
        workout_text: workout.text,
        exercises: workout.analysis?.exercises ?? [],
        aggregate_group_activations: workout.analysis?.aggregate_group_activations ?? []
      }));
      const generated = await generateWorkout(sources, metricMode, generatorGuidance);
      const next = workouts.length + 1;
      const newWorkout = {
        id: `workout-${next}`,
        name: generated.title || `Workout ${next}`,
        text: generated.text,
        analysis: null,
        isAnalyzing: false,
        isCollapsed: false,
      };
      setWorkouts((current) => [...current, newWorkout]);
      setActiveWorkoutId(newWorkout.id);
      setSelectedWorkoutId(newWorkout.id);
      setSelectedScopePath('__aggregate__');
      setSelectedBodyPartId(null);
      setHighlightedTargetMuscleGroupId(null);
      setLastGeneratedTargets(generated.target_muscle_groups);
      setLastGenerationRationale(generated.rationale);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unknown error');
    } finally {
      setIsGeneratingWorkout(false);
    }
  }

  function updateWorkout(workoutId: string, patch: Partial<WorkoutRecord>) {
    setWorkouts((current) => current.map((item) => (item.id === workoutId ? { ...item, ...patch, analysis: patch.text !== undefined ? null : item.analysis } : item)));
  }

  function addWorkout() {
    const next = workouts.length + 1;
    const newWorkout = { id: `workout-${next}`, name: `Workout ${next}`, text: '', analysis: null, isAnalyzing: false, isCollapsed: false };
    setWorkouts((current) => [...current, newWorkout]);
    setActiveWorkoutId(newWorkout.id);
    setSelectedWorkoutId(newWorkout.id);
    setSelectedScopePath('__aggregate__');
    setSelectedBodyPartId(null);
  }

  function createEmptyWorkout(index: number) {
    return {
      id: `workout-${index}`,
      name: `Workout ${index}`,
      text: '',
      analysis: null,
      isAnalyzing: false,
      isCollapsed: false,
    };
  }

  function deleteWorkout(workoutId: string) {
    const nextWorkouts = workouts.filter((item) => item.id !== workoutId);
    setWorkouts(nextWorkouts);
    if (!nextWorkouts.length) return;
    if (activeWorkoutId === workoutId) setActiveWorkoutId(nextWorkouts[0].id);
    if (selectedWorkoutId === workoutId) {
      setSelectedWorkoutId(nextWorkouts[0].id);
      setSelectedScopePath('__aggregate__');
      setSelectedBodyPartId(null);
    }
  }

  function deleteAllWorkouts() {
    const fallbackWorkout = createEmptyWorkout(1);
    setWorkouts([fallbackWorkout]);
    setActiveWorkoutId(fallbackWorkout.id);
    setSelectedWorkoutId(fallbackWorkout.id);
    setSelectedScopePath('__aggregate__');
    setSelectedBodyPartId(null);
    setWorkoutSearch('');
  }

  function stepWorkout(direction: -1 | 1) {
    if (!workouts.length) return;
    const nextIndex = (activeWorkoutIndex + direction + workouts.length) % workouts.length;
    const nextWorkout = workouts[nextIndex];
    setActiveWorkoutId(nextWorkout.id);
    if (selectedWorkoutId !== '__all__') {
      setSelectedWorkoutId(nextWorkout.id);
      setSelectedScopePath('__aggregate__');
      setSelectedBodyPartId(null);
    }
  }

  const inspectorTitle = selectedBodyPartId
    ? 'Muscle Inspector'
    : selectedExerciseDetail
      ? 'Exercise Inspector'
      : 'Scope Inspector';

  return (
    <div className="app-shell app-shell-rebuilt">
      <aside className="left-column workspace-column">
        <div className="input-card workspace-card">
          <div className="panel-header">
            <div>
              <div className="section-title">Workouts</div>
              <h2>Browse and edit</h2>
            </div>
            <div className="toolbar-row">
              <button aria-label="Analyze all workouts" className="icon-button icon-button-analyze" title="Analyze all workouts" type="button" onClick={() => void handleAnalyzeAllWorkouts()} disabled={isAnalyzingAll}>
                <Icon label="Analyze all workouts" path="M5 6v12l8-6-8-6Zm8 0v12l8-6-8-6Z" />
              </button>
              <button aria-label="Delete all workouts" className="icon-button icon-button-danger" title="Delete all workouts" type="button" onClick={deleteAllWorkouts}>
                <Icon label="Delete all workouts" path="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Z" />
              </button>
              <button aria-label="Add workout" className="icon-button" title="Add workout" type="button" onClick={addWorkout}>
                <Icon label="Add workout" path="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
              </button>
            </div>
          </div>
          <div className="workout-switcher">
            <button aria-label="Previous workout" className="icon-button" title="Previous workout" type="button" onClick={() => stepWorkout(-1)}>
              <Icon label="Previous workout" path="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </button>
            <input className="search-input" value={workoutSearch} onChange={(event) => setWorkoutSearch(event.target.value)} placeholder="Search workouts" />
            <button aria-label="Next workout" className="icon-button" title="Next workout" type="button" onClick={() => stepWorkout(1)}>
              <Icon label="Next workout" path="m8.59 16.59 1.41 1.41 6-6-6-6-1.41 1.41L13.17 12z" />
            </button>
          </div>
          <div className="workout-chip-row">
            {filteredWorkouts.map((workout) => (
              <button key={workout.id} className={activeWorkoutId === workout.id ? 'chip-button active' : 'chip-button'} type="button" onClick={() => { setActiveWorkoutId(workout.id); if (selectedWorkoutId !== '__all__') { setSelectedWorkoutId(workout.id); setSelectedScopePath('__aggregate__'); setSelectedBodyPartId(null); } }}>
                <span>{workout.name}</span>
                {workout.isAnalyzing ? <LoadingGlyph /> : null}
              </button>
            ))}
          </div>
          {activeWorkout && (
            <div className="workout-editor single-editor">
              <div className="workout-editor-header">
                <div className="workout-name-row">
                  <input value={activeWorkout.name} onChange={(event) => updateWorkout(activeWorkout.id, { name: event.target.value })} />
                  {activeWorkout.isAnalyzing ? <LoadingGlyph /> : null}
                </div>
                <div className="workout-editor-actions">
                  <button aria-label="Analyze workout" className="icon-button icon-button-analyze" title="Analyze workout" type="button" onClick={() => void handleAnalyzeWorkout(activeWorkout.id)} disabled={activeWorkout.isAnalyzing || !activeWorkout.text.trim()}>
                    {activeWorkout.isAnalyzing ? <span className="icon-dot">...</span> : <Icon label="Analyze workout" path="M8 5v14l11-7z" />}
                  </button>
                  <button aria-label="Delete workout" className="icon-button icon-button-danger" title="Delete workout" type="button" onClick={() => deleteWorkout(activeWorkout.id)}>
                    <Icon label="Delete workout" path="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Z" />
                  </button>
                </div>
              </div>
              <textarea value={activeWorkout.text} onChange={(event) => updateWorkout(activeWorkout.id, { text: event.target.value })} rows={12} placeholder="Write the workout naturally. The model will organize it into sections and exercises." />
            </div>
          )}
          <div className="generator-panel">
            <div className="panel-header compact-header generator-header">
              <div>
                <div className="section-title">Program Balance</div>
                <h3>Generate complementary workout</h3>
              </div>
              <button className="ghost-button generator-button" type="button" onClick={() => void handleGenerateWorkout()} disabled={isGeneratingWorkout || analyzedWorkouts.length === 0}>
                {isGeneratingWorkout ? 'Generating...' : 'Generate Workout'}
              </button>
            </div>
            <p className="mini-meta">Uses all analyzed workouts together and targets the least-covered muscle groups for the current {metricMode} mode.</p>
            <input
              className="generator-input"
              value={generatorGuidance}
              onChange={(event) => setGeneratorGuidance(event.target.value)}
              placeholder="Optional guidance: no gym, 45 minutes, more endurance focused..."
            />
            <div className="generator-targets">
              {weakestMuscleGroups.map((group) => (
                <button
                  className={highlightedTargetMuscleGroupId === group.muscle_group_id ? 'generator-target-chip active' : 'generator-target-chip'}
                  key={group.muscle_group_id}
                  type="button"
                  onClick={() => {
                    setHighlightedTargetMuscleGroupId((current) => current === group.muscle_group_id ? null : group.muscle_group_id);
                    setSelectedBodyPartId(null);
                  }}
                >
                  {group.display_name} · {(group.score * 100).toFixed(0)}%
                </button>
              ))}
            </div>
            {lastGenerationRationale && <p className="mini-meta">Last result: {lastGenerationRationale}</p>}
            {lastGeneratedTargets.length > 0 && <p className="mini-meta">Last targets: {lastGeneratedTargets.join(', ')}</p>}
          </div>
        </div>

      </aside>

      <main className="center-column anatomy-focus-column">
        <div className="status-bar status-card">
          <span>Schema: {schema?.version ?? 'loading'}</span>
          <span>Mode: {workouts.some((workout) => workout.analysis && !workout.analysis.mock_mode) ? 'live LLM' : 'mock / live ready'}</span>
          <span>{selectionTitle(selectedWorkoutId, selectedScopePath, activeWorkout?.name ?? 'Workout')}</span>
        </div>
        <div className="viewer-card viewer-card-compact">
          <div className="viewer-header compact-header">
            <div>
              <div className="section-title">Body Overview</div>
              <h2>{selectionTitle(selectedWorkoutId, selectedScopePath, activeWorkout?.name ?? 'Workout')}</h2>
            </div>
            <div className="toggle-row">
              <button className={metricMode === 'load' ? 'toggle-button active' : 'toggle-button'} type="button" onClick={() => setMetricMode('load')}>Load</button>
              <button className={metricMode === 'endurance' ? 'toggle-button active' : 'toggle-button'} type="button" onClick={() => setMetricMode('endurance')}>Endurance</button>
            </div>
          </div>
          <BodyViewer metricMode={metricMode} schema={schema} selectedExercise={selectedScopePath === '__aggregate__' ? '__aggregate__' : selectedScopePath} exercises={scopedExercises} aggregateActivations={scopeAggregateActivations} aggregateIntensityMap={selectedWorkoutId === '__all__' && selectedScopePath === '__aggregate__' ? allWorkoutCombinedIntensities : undefined} selectedBodyPartId={selectedBodyPartId} highlightedBodyPartIds={highlightedTargetBodyPartIds} onSelectBodyPart={(bodyPartId) => { setSelectedBodyPartId(bodyPartId); if (bodyPartId) setHighlightedTargetMuscleGroupId(null); }} />
        </div>
      </main>

      <aside className="right-column inspector-column right-column-split">
        <ExerciseList
          workoutName={activeWorkout?.name ?? 'Workout'}
          analysis={activeWorkout?.analysis ?? null}
          selectedScopePath={selectedScopePath}
          selectedWorkoutId={selectedWorkoutId}
          activeWorkoutId={activeWorkout?.id ?? ''}
          onSelectScope={(workoutId, scopePath) => {
            setSelectedWorkoutId(workoutId);
            setSelectedScopePath(scopePath);
            setSelectedBodyPartId(null);
          }}
        />
        <div className="details-card inspector-card">
          <div className="panel-header compact-header">
            <div>
              <div className="section-title">{inspectorTitle}</div>
              <h3>
                {selectedBodyPartId
                  ? `Why this muscle is ${metricVerb(metricMode)}`
                  : selectedExerciseDetail
                    ? selectedExerciseDetail.exercise.exercise_name
                    : selectionTitle(selectedWorkoutId, selectedScopePath, activeWorkout?.name ?? 'Workout')}
              </h3>
            </div>
            {selectedExerciseDetail && !selectedBodyPartId && (
              <div className="toggle-row">
                <button className={exerciseDetailMode === 'groups' ? 'toggle-button active' : 'toggle-button'} type="button" onClick={() => setExerciseDetailMode('groups')}>Muscle Groups</button>
                <button className={exerciseDetailMode === 'muscles' ? 'toggle-button active' : 'toggle-button'} type="button" onClick={() => setExerciseDetailMode('muscles')}>Specific Muscles</button>
              </div>
            )}
          </div>

          {selectedBodyPartId ? (
            <DetailsPanel metricMode={metricMode} schema={schema} selectedBodyPartId={selectedBodyPartId} selectedExercise={selectedScopePath === '__aggregate__' ? '__aggregate__' : selectedScopePath} exercises={scopedExercises} aggregateActivations={scopeAggregateActivations} contributions={currentContributions} normalizedScore={selectedBodyPartNormalizedScore} />
          ) : selectedExerciseDetail ? (
            <div className="contribution-list">
              {(exerciseDetailMode === 'groups' ? selectedExerciseDetail.groups : selectedExerciseDetail.muscles).map((item: any) => (
                <div className="contribution-row" key={`${selectedExerciseDetail.exercise.exercise_name}-${item.muscle_group_id ?? item.body_part_id}`}>
                  <div className="contribution-topline">
                    <strong>{item.muscle_group_name ?? item.body_part_name}</strong>
                    <span className="mini-meta">{'body_part_name' in item ? item.muscle_group_name : 'Muscle group'}</span>
                  </div>
                  <div
                    className="contribution-badge"
                    style={{
                        background: discreteMetricColor(item.label, metricMode),
                        color: discreteMetricTextColor(item.label, metricMode)
                     }}
                   >
                     {metricBadgeLabel(item.label, metricMode)}
                   </div>
                   <div className="mini-meta">Load: {formatActivationLabel(item.load_label)} · Endurance: {formatActivationLabel(item.endurance_label)}</div>
                   <p>{item.reason}</p>
                 </div>
               ))}
            </div>
          ) : (
            <div className="contribution-list">
              {scopedExercises.length === 0 ? (
                <p className="muted">Analyze the current workout, then select a section or exercise to inspect it.</p>
              ) : (
                scopedExercises.map((exercise: any) => (
                  <div className="contribution-row" key={`${exercise.path.join(' > ')}`}>
                    <div className="contribution-topline">
                      <strong>{exercise.exercise_name}</strong>
                      <span className="mini-meta">{exercise.movement_pattern} · {exercise.unilateral ? 'unilateral' : 'bilateral'}</span>
                    </div>
                    <p>{exercise.notes || 'Contained in current scope.'}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
        {error && <div className="error-card">{error}</div>}
      </aside>
    </div>
  );
}
