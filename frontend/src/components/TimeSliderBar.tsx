import React from 'react';
import { formatSliderTime } from '../utils/format';
import { Play, Pause, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';

interface TimeSliderBarProps {
  startTimeIso?: string;
  hours?: number;
  sliderHour: number;
  onHourChange: (hour: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  isLoading: boolean;
  error: string | null;
}

export const TimeSliderBar: React.FC<TimeSliderBarProps> = ({
  startTimeIso = '',
  hours = 48,
  sliderHour,
  onHourChange,
  isPlaying,
  onTogglePlay,
  showHeatmap,
  onToggleHeatmap,
  isLoading,
  error,
}) => {
  const timeLabel = formatSliderTime(startTimeIso, sliderHour);

  return (
    <div
      className="bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl shadow-lg px-3 py-2.5 sm:px-4 sm:py-3 transition-all duration-200 text-xs"
      role="region"
      aria-label="Weather forecast timeline controls"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Left Side: Playback Control & Timestamp */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={isLoading || Boolean(error)}
            aria-label={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
            className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            )}
          </button>

          {/* Formatted Local Time + Offset */}
          <div className="flex flex-col">
            <span className="font-semibold text-slate-900 font-mono tracking-tight text-xs tabular-nums">
              {timeLabel}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Departure Forecast Model
            </span>
          </div>
        </div>

        {/* Center: Range Slider (0..hours) */}
        <div className="flex-1 min-w-[160px] sm:mx-2 flex flex-col justify-center">
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max={hours}
              step="1"
              value={sliderHour}
              onChange={(e) => onHourChange(Number(e.target.value))}
              disabled={isLoading || Boolean(error)}
              aria-label="Forecast departure hour"
              aria-valuemin={0}
              aria-valuemax={hours}
              aria-valuenow={sliderHour}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1 px-0.5">
            <span>0 h (Dep)</span>
            <span>+12 h</span>
            <span>+24 h</span>
            <span>+36 h</span>
            <span>+{hours} h</span>
          </div>
        </div>

        {/* Right Side: Status & Heatmap Toggle */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 border-t sm:border-t-0 pt-1.5 sm:pt-0 border-slate-100">
          {isLoading && (
            <div className="flex items-center gap-1.5 text-blue-600 text-[11px] font-medium font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Loading weather...</span>
            </div>
          )}

          {error && !isLoading && (
            <div className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-medium">
              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!error && !isLoading && (
            <button
              type="button"
              onClick={onToggleHeatmap}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                showHeatmap
                  ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
              }`}
              title={showHeatmap ? 'Hide weather heatmap' : 'Show weather heatmap'}
              aria-pressed={showHeatmap}
            >
              {showHeatmap ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  <span>Heatmap On</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>Heatmap Off</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
