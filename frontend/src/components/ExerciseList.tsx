import { useMemo, useState } from 'react';

import type { AnalyzeWorkoutResponse, WorkoutAnalysisNode } from '../types';

export type WorkoutRecord = {
  id: string;
  name: string;
  text: string;
  analysis: AnalyzeWorkoutResponse | null;
  isAnalyzing: boolean;
  isCollapsed: boolean;
};

type ExerciseListProps = {
  workoutName: string;
  analysis: AnalyzeWorkoutResponse | null;
  selectedScopePath: string;
  selectedWorkoutId: string;
  activeWorkoutId: string;
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
          className={active ? 'subtab-button active' : 'subtab-button'}
          type="button"
          onClick={() => onSelectScope(workoutId, currentPath)}
        >
          <span>{label}</span>
          {node.type === 'section' ? renderSummary(counts) : <span className="tree-summary"><span className="tree-summary-dot" /></span>}
        </button>
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
  onSelectScope,
}: ExerciseListProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

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
          <h3>{workoutName}</h3>
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
