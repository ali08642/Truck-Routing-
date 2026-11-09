import React from 'react';
import { RouteResult } from '../types';
import { formatDuration, formatDistance, formatLocalEta, getRouteLetter } from '../utils/format';
import { getRiskBadgeStyle, getRiskLabel } from '../utils/risk';
import { RiskBar } from './RiskBar';
import { CheckCircle2, Clock, MapPin, Gauge } from 'lucide-react';

interface RouteCardProps {
  route: RouteResult;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

export const RouteCard: React.FC<RouteCardProps> = ({
  route,
  isSelected,
  onSelect,
}) => {
  const letter = getRouteLetter(route.rank);
  const worstRiskStyle = getRiskBadgeStyle(route.summary.worst_risk);
  const lastEta = route.checkpoints[route.checkpoints.length - 1]?.eta || '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(route.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Route ${letter}, ${route.is_recommended ? 'Recommended, ' : ''}${formatDistance(route.distance_miles)}, ${formatDuration(route.duration_hours)}, worst risk ${getRiskLabel(route.summary.worst_risk)}`}
      onClick={() => onSelect(route.id)}
      onKeyDown={handleKeyDown}
      className={`group relative rounded-xl border p-4 transition-all duration-150 cursor-pointer text-left focus:outline-none ${
        isSelected
          ? 'bg-blue-50/40 border-blue-600 ring-2 ring-blue-600/20 shadow-sm'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60 shadow-xs'
      }`}
    >
      {/* Header Row: Route Letter + Badges */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'
            }`}
          >
            {letter}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-900 text-sm tracking-tight">
                Corridor {letter}
              </span>
              {route.is_recommended && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Recommended
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
              <span>Rank #{route.rank}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatDistance(route.distance_miles)}</span>
            </div>
          </div>
        </div>

        {/* Worst Risk Badge */}
        <div className="text-right shrink-0">
          <span
            className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide uppercase border"
            style={{
              backgroundColor: worstRiskStyle.background,
              color: worstRiskStyle.color,
              borderColor: worstRiskStyle.border,
            }}
          >
            {getRiskLabel(route.summary.worst_risk)}
          </span>
          <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider font-mono">
            Peak Risk
          </div>
        </div>
      </div>

      {/* Metrics Row: Duration, Arrival, Avg Risk */}
      <div className="grid grid-cols-3 gap-2 py-2.5 my-2 border-y border-slate-100 text-xs">
        <div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Drive Time</span>
          </div>
          <div className="font-semibold text-slate-900 mt-0.5 tabular-nums">
            {formatDuration(route.duration_hours)}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-slate-400" />
            <span>Est. Arrival</span>
          </div>
          <div className="font-semibold text-slate-900 mt-0.5 truncate text-[11px]" title={formatLocalEta(lastEta)}>
            {formatLocalEta(lastEta)}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1">
            <Gauge className="w-3 h-3 text-slate-400" />
            <span>Avg Risk</span>
          </div>
          <div className="font-semibold text-slate-900 mt-0.5 font-mono tabular-nums">
            {route.summary.avg_risk.toFixed(2)}{' '}
            <span className="text-[10px] font-normal text-slate-400">/ 4.0</span>
          </div>
        </div>
      </div>

      {/* Stacked Risk Mileage Bar */}
      <div className="mt-2.5">
        <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 mb-1 flex items-center justify-between">
          <span>Weather Exposure By Mile</span>
          <span className="text-slate-500 font-medium">
            {route.checkpoints.length} Checkpoints
          </span>
        </div>
        <RiskBar
          milesByRisk={route.summary.miles_by_risk}
          totalMiles={route.distance_miles}
          showLegend={isSelected}
          compact={!isSelected}
        />
      </div>
    </div>
  );
};
