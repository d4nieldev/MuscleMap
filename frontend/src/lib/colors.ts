import type { ActivationLabel } from '../types';

export type MetricMode = 'load' | 'endurance';

export function formatActivationLabel(label: ActivationLabel) {
  return label.replace('_', ' ');
}

export const activationColorMap: Record<ActivationLabel, string> = {
  none: '#f3ece8',
  low: '#d7a893',
  moderate: '#bd6548',
  high: '#812315'
};

export const enduranceColorMap: Record<ActivationLabel, string> = {
  none: '#edf2ed',
  low: '#a9c8b0',
  moderate: '#5f9570',
  high: '#214f36'
};

export const activationTextColorMap: Record<ActivationLabel, string> = {
  none: '#4d2f26',
  low: '#4d2f26',
  moderate: '#fff7f3',
  high: '#fff7f3'
};

export const enduranceTextColorMap: Record<ActivationLabel, string> = {
  none: '#2d3a31',
  low: '#2d3a31',
  moderate: '#f5fbf7',
  high: '#f5fbf7'
};

export function discreteMetricColor(label: ActivationLabel, metricMode: MetricMode) {
  return metricMode === 'load' ? activationColorMap[label] : enduranceColorMap[label];
}

export function discreteMetricTextColor(label: ActivationLabel, metricMode: MetricMode) {
  return metricMode === 'load' ? activationTextColorMap[label] : enduranceTextColorMap[label];
}

export function metricTitle(metricMode: MetricMode) {
  return metricMode === 'load' ? 'Strength' : 'Endurance';
}

export function metricVerb(metricMode: MetricMode) {
  return metricMode === 'load' ? 'worked for strength' : 'trained for endurance';
}

export function metricBadgeLabel(label: ActivationLabel, metricMode: MetricMode) {
  return `${formatActivationLabel(label)} ${metricMode}`;
}

export const activationRank: Record<ActivationLabel, number> = {
  none: 0,
  low: 1,
  moderate: 2,
  high: 3
};

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
}

export function aggregateActivationColor(normalizedScore: number) {
  const start = hexToRgb('#f3ece8');
  const end = hexToRgb('#812315');
  const clamped = Math.max(0, Math.min(1, normalizedScore));
  return rgbToHex(
    start.r + (end.r - start.r) * clamped,
    start.g + (end.g - start.g) * clamped,
    start.b + (end.b - start.b) * clamped
  );
}

export function aggregateEnduranceColor(normalizedScore: number) {
  const start = hexToRgb('#edf2ed');
  const end = hexToRgb('#214f36');
  const clamped = Math.max(0, Math.min(1, normalizedScore));
  return rgbToHex(
    start.r + (end.r - start.r) * clamped,
    start.g + (end.g - start.g) * clamped,
    start.b + (end.b - start.b) * clamped
  );
}

export function aggregateMetricColor(normalizedScore: number, metricMode: MetricMode) {
  return metricMode === 'load'
    ? aggregateActivationColor(normalizedScore)
    : aggregateEnduranceColor(normalizedScore);
}
