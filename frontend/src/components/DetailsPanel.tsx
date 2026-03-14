import { discreteMetricColor, discreteMetricTextColor, formatActivationLabel, metricVerb } from '../lib/colors';
import type { MetricMode } from '../lib/colors';
import type { ActivationLabel, AggregateActivation, BodySchemaResponse, ExerciseInference } from '../types';

type Contribution = {
  workout_id: string;
  scope_path: string;
  exercise_name: string;
  workout_name: string;
  load_label: ActivationLabel;
  endurance_label: ActivationLabel;
  reason: string;
  movement_pattern: string;
  unilateral: boolean;
  muscle_group_name: string;
};

type DetailsPanelProps = {
  schema: BodySchemaResponse | null;
  metricMode: MetricMode;
  selectedBodyPartId: string | null;
  selectedExercise: string;
  exercises: ExerciseInference[];
  aggregateActivations: AggregateActivation[];
  contributions: Contribution[];
  normalizedScore?: number | null;
  onSelectContribution?: (workoutId: string, scopePath: string) => void;
};

export function DetailsPanel({ schema, metricMode, selectedBodyPartId, selectedExercise, exercises, aggregateActivations, contributions, normalizedScore = null, onSelectContribution }: DetailsPanelProps) {
  const part = schema?.body_parts.find((item) => item.body_part_id === selectedBodyPartId) ?? null;
  const aggregate = aggregateActivations.find((item) => item.body_part_id === selectedBodyPartId) ?? null;
  const exercise = exercises.find((item) => item.path.join(' > ') === selectedExercise || item.exercise_name === selectedExercise) ?? null;
  const exerciseActivation = exercise?.activations.find((item) => item.body_part_id === selectedBodyPartId) ?? null;
  const muscleGroupId = exerciseActivation?.muscle_group_id ?? aggregate?.muscle_group_id ?? null;
  const muscleGroup = schema?.muscle_groups.find((item) => item.muscle_group_id === muscleGroupId) ?? null;
  const active = selectedExercise === '__aggregate__' ? aggregate : exerciseActivation ?? aggregate;

  if (!part) {
    return <p className="muted">Click a highlighted body region to inspect why it is {metricVerb(metricMode)} and which exercises contribute.</p>;
  }

  return (
    <div className="muscle-inspector-content">
      <h3>{part.canonical_name}</h3>
      <div className="meta-grid">
        <span>Muscle Group</span>
        <span>{muscleGroup?.display_name ?? 'n/a'}</span>
        <span>Body ID</span>
        <code>{part.body_part_id}</code>
        <span>Source</span>
        <span>{part.source}</span>
        <span>FMA</span>
        <span>{part.fma_id ?? 'n/a'}</span>
      </div>
      {active ? <div className="activation-chip" style={{ background: discreteMetricColor(metricMode === 'load' ? active.load_label : active.endurance_label, metricMode), color: discreteMetricTextColor(metricMode === 'load' ? active.load_label : active.endurance_label, metricMode) }}>{formatActivationLabel(metricMode === 'load' ? active.load_label : active.endurance_label)}</div> : <div className="activation-chip muted-chip">none</div>}
      {normalizedScore !== null && normalizedScore > 0 && <p className="mini-meta">Cumulative {metricMode === 'load' ? 'strength' : 'endurance'} intensity: {normalizedScore.toFixed(2)}</p>}
      {exerciseActivation?.reason && <p>{exerciseActivation.reason}</p>}
      {contributions.length > 0 && (
        <div className="contribution-list compact-list">
          {contributions.map((item) => (
            <button className="contribution-row contribution-row-button" key={`${item.workout_name}-${item.exercise_name}-${metricMode === 'load' ? item.load_label : item.endurance_label}`} type="button" onClick={() => onSelectContribution?.(item.workout_id, item.scope_path)}>
              <div className="contribution-topline">
                <strong>{item.exercise_name}</strong>
                <span className="mini-meta">{item.workout_name} · {item.movement_pattern} · {item.unilateral ? 'unilateral' : 'bilateral'}</span>
              </div>
              <div className="mini-meta">{item.muscle_group_name}</div>
              <div
                className="contribution-badge"
                style={{
                  background: discreteMetricColor(metricMode === 'load' ? item.load_label : item.endurance_label, metricMode),
                  color: discreteMetricTextColor(metricMode === 'load' ? item.load_label : item.endurance_label, metricMode)
                }}
              >
                {formatActivationLabel(metricMode === 'load' ? item.load_label : item.endurance_label)}
              </div>
              <div className="mini-meta">Strength: {formatActivationLabel(item.load_label)} · Endurance: {formatActivationLabel(item.endurance_label)}</div>
              <p>{item.reason}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
