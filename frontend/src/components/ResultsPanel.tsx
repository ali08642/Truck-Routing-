import React from 'react';
import { AnalyzeResponse } from '../types';
import { RouteCard } from './RouteCard';
import { AlertTriangle, Info, ShieldCheck, AlertCircle } from 'lucide-react';

interface ResultsPanelProps {
  data: AnalyzeResponse | null;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  error: string | null;
  isLoading: boolean;
}

export const ResultsPanel: React.FC<ResultsPanelProps> = ({
  data,
  selectedRouteId,
  onSelectRoute,
  error,
  isLoading,
}) => {
  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 space-y-2">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-red-950 uppercase tracking-wide">
              Analysis Error
            </h4>
            <p className="text-xs text-red-800 mt-1 leading-relaxed">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (isLoading && !data) {
    return (
      <div className="space-y-3 pt-2">
        <div className="h-16 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
        <div className="h-44 rounded-xl bg-slate-100 animate-pulse border border-slate-200/60" />
      </div>
    );
  }

  if (!data || !data.routes || data.routes.length === 0) {
    return (
      <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center bg-slate-50/50">
        <Info className="w-6 h-6 text-slate-400 mx-auto mb-2" />
        <p className="text-xs font-medium text-slate-700">No route analysis generated yet</p>
        <p className="text-[11px] text-slate-500 mt-1">
          Submit trip origin, destination, and payload weight to calculate safest weather corridors.
        </p>
      </div>
    );
  }

  // Sort routes strictly by rank ascending
  const sortedRoutes = [...data.routes].sort((a, b) => a.rank - b.rank);

  return (
    <div className="space-y-3.5">
      {/* 1. Recommendation Explanation Banner */}
      {data.explanation && (
        <div className="p-3.5 rounded-xl bg-slate-900 text-white shadow-xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400">
                Dispatch Recommendation
              </div>
              <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                {data.explanation}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Amber Notice for Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-950">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Severe Weather & Regulatory Advisories</span>
          </div>
          <ul className="text-xs text-amber-800 space-y-1 pl-5 list-disc">
            {data.warnings.map((warn, i) => (
              <li key={i} className="leading-snug">
                {warn}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 2. Route Cards Sorted by Rank */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
          <span className="font-semibold text-slate-700">
            Available Corridors ({sortedRoutes.length})
          </span>
          <span className="text-[11px]">Click or press Enter to inspect</span>
        </div>

        {sortedRoutes.map((route) => (
          <RouteCard
            key={route.id}
            route={route}
            isSelected={route.id === selectedRouteId}
            onSelect={onSelectRoute}
          />
        ))}
      </div>
    </div>
  );
};
