import React from 'react';
import { Risk } from '../types';
import { RISK_COLORS, RISK_LABELS, RISK_ORDER } from '../utils/risk';

interface RiskBarProps {
  milesByRisk: Record<Risk, number>;
  totalMiles: number;
  showLegend?: boolean;
  compact?: boolean;
}

export const RiskBar: React.FC<RiskBarProps> = ({
  milesByRisk,
  totalMiles,
  showLegend = true,
  compact = false,
}) => {
  const safeTotal = Math.max(totalMiles, 1);

  return (
    <div className="w-full space-y-1.5">
      {/* Horizontal Stacked Bar */}
      <div
        className={`w-full overflow-hidden flex rounded-full bg-slate-100 ${
          compact ? 'h-2' : 'h-2.5'
        }`}
        role="progressbar"
        aria-label="Route distance breakdown by weather risk"
      >
        {RISK_ORDER.map((risk) => {
          const miles = milesByRisk[risk] || 0;
          if (miles <= 0) return null;
          const percentage = (miles / safeTotal) * 100;
          return (
            <div
              key={risk}
              style={{
                width: `${percentage}%`,
                backgroundColor: RISK_COLORS[risk],
              }}
              title={`${RISK_LABELS[risk]}: ${Math.round(miles)} mi (${Math.round(percentage)}%)`}
              className="h-full transition-all duration-300"
            />
          );
        })}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] text-slate-500 font-mono">
          {RISK_ORDER.map((risk) => {
            const miles = milesByRisk[risk] || 0;
            if (miles <= 0) return null;
            return (
              <div key={risk} className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full inline-block shrink-0"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                  aria-hidden="true"
                />
                <span className="text-slate-600">{RISK_LABELS[risk]}:</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {Math.round(miles)} mi
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
