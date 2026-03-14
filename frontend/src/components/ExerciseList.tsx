import { useEffect, useMemo, useState } from 'react';

import type { AnalyzeWorkoutResponse, WorkoutAnalysisNode } from '../types';

function openExerciseYoutubeSearch(exerciseName: string) {
  const query = encodeURIComponent(`${exerciseName} exercise`);
  window.open(`https://www.youtube.com/results?search_query=${query}`, '_blank', 'noopener,noreferrer');
}

type ExerciseListProps = {
  workoutName: string;
  analysis: AnalyzeWorkoutResponse | null;
  selectedScopePath: string;
  selectedWorkoutId: string;
  activeWorkoutId: string;
  revealScopePath?: string | null;
  pulseScopePath?: string | null;
  onSelectScope: (workoutId: string, scopePath: string) => void;
};

type NodeCounts = {
  sections: number;
  exercises: number;
};

function nodeLabel(node: WorkoutAnalysisNode) {
  return node.type === 'exercise' ? node.exercise_name ?? 'Exercise' : node.title ?? 'Section';
}

function countDescendants(node: WorkoutAnalysisNode): NodeCounts {
  if (node.type === 'exercise') {
    return { sections: 0, exercises: 1 };
  }

  return node.items.reduce(
    (acc, child) => {
      const childCounts = countDescendants(child);
      return {
        sections: acc.sections + (child.type === 'section' ? 1 : 0) + childCounts.sections,
        exercises: acc.exercises + childCounts.exercises,
      };
    },
    { sections: 0, exercises: 0 }
  );
}

function renderSummary(counts: NodeCounts) {
  return (
    <span className="tree-summary" aria-label={`${counts.sections} sections, ${counts.exercises} exercises`}>
      {Array.from({ length: counts.sections }).map((_, index) => (
        <span className="tree-summary-square" key={`section-${index}`} />
      ))}
      {Array.from({ length: counts.exercises }).map((_, index) => (
        <span className="tree-summary-dot" key={`exercise-${index}`} />
      ))}
    </span>
  );
}

type TreeNodeProps = {
  node: WorkoutAnalysisNode;
  parentPath: string[];
  workoutId: string;
  selectedWorkoutId: string;
  selectedScopePath: string;
  pulseScopePath?: string | null;
  expandedPaths: Set<string>;
  onTogglePath: (path: string) => void;
  onSelectScope: (workoutId: string, scopePath: string) => void;
};

function TreeNode({
  node,
  parentPath,
  workoutId,
  selectedWorkoutId,
  selectedScopePath,
  pulseScopePath,
  expandedPaths,
  onTogglePath,
  onSelectScope,
}: TreeNodeProps) {
  const label = nodeLabel(node);
  const currentPath = [...parentPath, label].join(' > ');
  const active = selectedWorkoutId === workoutId && selectedScopePath === currentPath;
  const expandable = node.type === 'section' && node.items.length > 0;
  const expanded = expandedPaths.has(currentPath);
  const counts = useMemo(() => countDescendants(node), [node]);

  return (
    <div className="tree-node" key={`${workoutId}-${currentPath}`}>
      <div className="tree-row">
        {expandable ? (
          <button
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            className="tree-toggle"
            type="button"
            onClick={() => onTogglePath(currentPath)}
          >
            {expanded ? '−' : '+'}
          </button>
        ) : (
          <span className="tree-toggle-placeholder" />
        )}
        <button
          className={pulseScopePath === currentPath ? (active ? 'subtab-button active navigator-pulse' : 'subtab-button navigator-pulse') : (active ? 'subtab-button active' : 'subtab-button')}
          type="button"
          onClick={() => onSelectScope(workoutId, currentPath)}
        >
          <span>{label}</span>
          {node.type === 'section' ? renderSummary(counts) : null}
        </button>
        {node.type === 'exercise' ? (
          <button
            aria-label={`Search ${label} on YouTube`}
            className="tree-link-button"
            title="Search on YouTube"
            type="button"
            onClick={() => openExerciseYoutubeSearch(label)}
          >
            YouTube
          </button>
        ) : null}
      </div>
      {expandable && expanded ? (
        <div className="tree-children">
          {node.items.map((child) => (
            <TreeNode
              key={`${workoutId}-${currentPath}-${nodeLabel(child)}`}
              node={child}
              parentPath={[...parentPath, label]}
              workoutId={workoutId}
              selectedWorkoutId={selectedWorkoutId}
              selectedScopePath={selectedScopePath}
              pulseScopePath={pulseScopePath}
              expandedPaths={expandedPaths}
              onTogglePath={onTogglePath}
              onSelectScope={onSelectScope}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ExerciseList({
  workoutName,
  analysis,
  selectedScopePath,
  selectedWorkoutId,
  activeWorkoutId,
  revealScopePath,
  pulseScopePath,
  onSelectScope,
}: ExerciseListProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!analysis || !revealScopePath) {
      return;
    }

    if (!revealScopePath.startsWith(`${analysis.workout_analysis.workout_title} > `)) {
      return;
    }

    const segments = revealScopePath.split(' > ');
    if (segments.length <= 2) {
      return;
    }

    setExpandedPaths((current) => {
      const next = new Set(current);
      for (let index = 1; index < segments.length - 1; index += 1) {
        next.add(segments.slice(0, index + 1).join(' > '));
      }
      return next;
    });
  }, [analysis, revealScopePath]);

  function onTogglePath(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  return (
    <div className="exercise-list-card">
      <div className="panel-header compact-header">
        <div>
          <div className="section-title">Navigator</div>
          <div className="title-with-info">
            <h3>{workoutName}</h3>
            <span className="info-tooltip" tabIndex={0} aria-label="Navigator help">
              <span className="info-tooltip-trigger">i</span>
              <span className="info-tooltip-content">Browse the analyzed workout tree, switch between the full workout and this workout, and click any section or exercise to inspect its muscle activity.</span>
            </span>
          </div>
        </div>
      </div>
      <button className={selectedWorkoutId === '__all__' && selectedScopePath === '__aggregate__' ? 'tab-button active' : 'tab-button'} type="button" onClick={() => onSelectScope('__all__', '__aggregate__')}>
        All Workouts
      </button>
      <button className={selectedWorkoutId === activeWorkoutId && selectedScopePath === '__aggregate__' ? 'tab-button active' : 'tab-button'} type="button" onClick={() => onSelectScope(activeWorkoutId, '__aggregate__')}>
        This Workout
      </button>
      {analysis ? (
        <div className="exercise-nav-rows tree-root">
          {analysis.workout_analysis.items.map((node) => (
            <TreeNode
              key={`${activeWorkoutId}-${nodeLabel(node)}`}
              node={node}
              parentPath={[analysis.workout_analysis.workout_title]}
              workoutId={activeWorkoutId}
              selectedWorkoutId={selectedWorkoutId}
              selectedScopePath={selectedScopePath}
              pulseScopePath={pulseScopePath}
              expandedPaths={expandedPaths}
              onTogglePath={onTogglePath}
              onSelectScope={onSelectScope}
            />
          ))}
        </div>
      ) : (
        <div className="empty-note">Analyze the current workout to unlock its structure and exercise navigation.</div>
      )}
    </div>
  );
}
