import { discreteMetricColor, metricTitle } from '../lib/colors';
import { activationLabels } from '../types';

import type { MetricMode } from '../lib/colors';

type LegendProps = {
  className?: string;
  aggregateMode?: boolean;
  metricMode?: MetricMode;
};

export function Legend({ className = '', aggregateMode = false, metricMode = 'load' }: LegendProps) {
  if (aggregateMode) {
    return (
      <div className={`legend-card ${className}`.trim()}>
        <div className="section-title">{metricMode === 'load' ? 'Cumulative Strength' : 'Cumulative Endurance'}</div>
        <div className={metricMode === 'load' ? 'legend-gradient' : 'legend-gradient legend-gradient-endurance'} />
        <div className="legend-range">
          <span>low</span>
          <span>high</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`legend-card ${className}`.trim()}>
      <div className="section-title">{metricMode === 'load' ? 'Strength Focus' : metricTitle(metricMode)}</div>
      <div className="legend-scale">
        {activationLabels.map((label) => (
          <div className="legend-item" key={label}>
            <span className="legend-swatch" style={{ background: discreteMetricColor(label, metricMode) }} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
