import React, { useState } from 'react';
import { AnalyzeRequest } from '../types';
import { getDefaultDeparture, getMinDeparture, getMaxDeparture, formatNumber } from '../utils/format';
import { Truck, Navigation, Calendar, Scale, Loader2, ArrowRight } from 'lucide-react';

interface TripFormProps {
  onSubmit: (request: AnalyzeRequest) => void;
  isLoading: boolean;
  loadingMessage?: string;
  initialOrigin?: string;
  initialDestination?: string;
  initialLoadLb?: number;
}

interface FormErrors {
  origin?: string;
  destination?: string;
  departure?: string;
  load_lb?: string;
}

const QUICK_WEIGHTS = [20000, 40000, 80000];

export const TripForm: React.FC<TripFormProps> = ({
  onSubmit,
  isLoading,
  loadingMessage,
  initialOrigin = 'Atlanta, GA',
  initialDestination = 'Chicago, IL',
  initialLoadLb = 40000,
}) => {
  const [origin, setOrigin] = useState<string>(initialOrigin);
  const [destination, setDestination] = useState<string>(initialDestination);
  const [departure, setDeparture] = useState<string>(getDefaultDeparture());
  const [loadLb, setLoadLb] = useState<string>(initialLoadLb.toString());
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!origin.trim()) {
      newErrors.origin = 'Origin address or city is required.';
    }

    if (!destination.trim()) {
      newErrors.destination = 'Destination address or city is required.';
    }

    if (!departure) {
      newErrors.departure = 'Departure time is required.';
    } else {
      const depDate = new Date(departure);
      const now = new Date();
      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + 7.1);

      // Allow 5 minutes buffer in the past for form fill latency
      const minBuffer = new Date(now.getTime() - 5 * 60 * 1000);

      if (depDate < minBuffer) {
        newErrors.departure = 'Departure cannot be in the past.';
      } else if (depDate > maxDate) {
        newErrors.departure = 'Departure must be within the next 7 days.';
      }
    }

    const weightNum = Number(loadLb);
    if (loadLb === '' || isNaN(weightNum)) {
      newErrors.load_lb = 'Enter a valid load weight in pounds.';
    } else if (weightNum < 0 || weightNum > 120000) {
      newErrors.load_lb = 'Weight must be between 0 and 120,000 lb.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isLoading) return;

    onSubmit({
      origin: origin.trim(),
      destination: destination.trim(),
      departure_time: departure,
      load_lb: Math.round(Number(loadLb)),
    });
  };

  const handleQuickWeight = (val: number) => {
    setLoadLb(val.toString());
    if (errors.load_lb) {
      setErrors((prev) => ({ ...prev, load_lb: undefined }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Route Endpoints: Origin & Destination */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="origin-input" className="block text-xs font-semibold text-slate-700 mb-1">
            Origin
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <input
              id="origin-input"
              type="text"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                if (errors.origin) setErrors((prev) => ({ ...prev, origin: undefined }));
              }}
              placeholder="e.g. Atlanta, GA"
              disabled={isLoading}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 transition-colors ${
                errors.origin
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
          </div>
          {errors.origin && (
            <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.origin}</p>
          )}
        </div>

        <div>
          <label htmlFor="destination-input" className="block text-xs font-semibold text-slate-700 mb-1">
            Destination
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <input
              id="destination-input"
              type="text"
              value={destination}
              onChange={(e) => {
                setDestination(e.target.value);
                if (errors.destination) setErrors((prev) => ({ ...prev, destination: undefined }));
              }}
              placeholder="e.g. Chicago, IL"
              disabled={isLoading}
              className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 transition-colors ${
                errors.destination
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
          </div>
          {errors.destination && (
            <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.destination}</p>
          )}
        </div>
      </div>

      {/* Timing and Cargo Weight */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Departure Time */}
        <div>
          <label htmlFor="departure-input" className="block text-xs font-semibold text-slate-700 mb-1">
            Departure (Local)
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
            </div>
            <input
              id="departure-input"
              type="datetime-local"
              value={departure}
              min={getMinDeparture()}
              max={getMaxDeparture()}
              onChange={(e) => {
                setDeparture(e.target.value);
                if (errors.departure) setErrors((prev) => ({ ...prev, departure: undefined }));
              }}
              disabled={isLoading}
              className={`w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-1 transition-colors font-mono ${
                errors.departure
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
          </div>
          {errors.departure && (
            <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.departure}</p>
          )}
        </div>

        {/* Load Weight */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="load-weight-input" className="block text-xs font-semibold text-slate-700">
              Load Weight
            </label>
            <span className="text-[11px] text-slate-400 font-mono">0 – 120k lb</span>
          </div>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <input
              id="load-weight-input"
              type="number"
              min="0"
              max="120000"
              step="500"
              value={loadLb}
              onChange={(e) => {
                setLoadLb(e.target.value);
                if (errors.load_lb) setErrors((prev) => ({ ...prev, load_lb: undefined }));
              }}
              placeholder="e.g. 40000"
              disabled={isLoading}
              className={`w-full pl-8 pr-9 py-1.5 text-xs rounded-lg border bg-white text-slate-900 focus:outline-none focus:ring-1 transition-colors font-mono tabular-nums ${
                errors.load_lb
                  ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-500'
              }`}
            />
            <span className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-[11px] font-mono text-slate-400">
              lb
            </span>
          </div>
          {errors.load_lb && (
            <p className="mt-1 text-[11px] text-red-600 font-medium">{errors.load_lb}</p>
          )}
        </div>
      </div>

      {/* Quick Weight Selectors */}
      <div className="flex items-center gap-1.5 pt-0.5">
        <span className="text-[11px] text-slate-500 font-medium">Quick load:</span>
        {QUICK_WEIGHTS.map((wt) => {
          const isSelected = Number(loadLb) === wt;
          return (
            <button
              key={wt}
              type="button"
              onClick={() => handleQuickWeight(wt)}
              disabled={isLoading}
              className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              {formatNumber(wt)} lb
            </button>
          );
        })}
      </div>

      {/* Submit Button & Progress State */}
      <div className="pt-1">
        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-75 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-white" />
              <span>Analyzing Route Corridors...</span>
            </>
          ) : (
            <>
              <Truck className="w-4 h-4" />
              <span>Analyze routes</span>
            </>
          )}
        </button>

        {/* Dynamic Multi-Stage Progress Message */}
        {isLoading && loadingMessage && (
          <div className="mt-2.5 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-xs text-blue-900">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping shrink-0" />
            <span className="font-medium text-[11px] font-mono truncate">{loadingMessage}</span>
          </div>
        )}
      </div>
    </form>
  );
};
