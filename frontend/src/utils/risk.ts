import { Risk } from '../types';

export const RISK_COLORS: Record<Risk, string> = {
  low: '#16a34a',
  moderate: '#eab308',
  high: '#f97316',
  severe: '#dc2626',
  no_travel: '#111827',
};

export const RISK_LABELS: Record<Risk, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
};

export const RISK_ORDER: Risk[] = ['low', 'moderate', 'high', 'severe', 'no_travel'];

export function getRiskColor(risk: Risk): string {
  return RISK_COLORS[risk] ?? '#94a3b8';
}

export function getRiskLabel(risk: Risk): string {
  return RISK_LABELS[risk] ?? 'Unknown';
}

export function getRiskBadgeStyle(risk: Risk): { background: string; color: string; border: string } {
  switch (risk) {
    case 'low':
      return { background: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
    case 'moderate':
      return { background: '#fefce8', color: '#a16207', border: '#fef08a' };
    case 'high':
      return { background: '#fff7ed', color: '#c2410c', border: '#fed7aa' };
    case 'severe':
      return { background: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
    case 'no_travel':
      return { background: '#111827', color: '#f9fafb', border: '#374151' };
    default:
      return { background: '#f8fafc', color: '#475569', border: '#e2e8f0' };
  }
}

export function getDriverLabel(driver: 'wind' | 'rain' | 'snow' | 'load'): string {
  switch (driver) {
    case 'wind':
      return 'High Crosswinds';
    case 'rain':
      return 'Heavy Precipitation';
    case 'snow':
      return 'Snow & Ice Accumulation';
    case 'load':
      return 'Vehicle Weight / Stability';
  }
}

export const NUMERIC_RISK_MAP: Record<number, Risk> = {
  0: 'low',
  1: 'moderate',
  2: 'high',
  3: 'severe',
  4: 'no_travel',
};

export function getRiskFromCode(code: number): Risk {
  return NUMERIC_RISK_MAP[code] ?? 'low';
}

