/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { useAnalyze } from './hooks/useAnalyze';
import { TripForm } from './components/TripForm';
import { ResultsPanel } from './components/ResultsPanel';
import { RouteMap } from './components/RouteMap';
import { getDefaultDeparture } from './utils/format';
import { Truck, Shield, Database } from 'lucide-react';

export default function App() {
  const {
    data,
    selectedRouteId,
    setSelectedRouteId,
    isLoading,
    loadingMessage,
    error,
    useMock,
    setUseMock,
    executeAnalyze,
    heatmapData,
    isHeatmapLoading,
    heatmapError,
    showHeatmap,
    setShowHeatmap,
    sliderHour,
    setSliderHour,
    isPlaying,
    setIsPlaying,
  } = useAnalyze();

  // Run initial analysis on mount so preview loads immediately with 3 realistic corridors
  useEffect(() => {
    executeAnalyze({
      origin: 'Atlanta, GA',
      destination: 'Chicago, IL',
      departure_time: getDefaultDeparture(),
      load_lb: 40000,
    });
  }, [executeAnalyze]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900 overflow-hidden select-none">
      {/* Top Navigation Bar: Logistics Dashboard Header */}
      <header className="h-14 border-b border-slate-200 bg-white px-4 lg:px-6 flex items-center justify-between gap-4 shrink-0 z-20">
        {/* Zone 1: Brand Wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Truck className="w-4 h-4 text-blue-400" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-900 whitespace-nowrap">
            Weather-Aware Truck Routing
          </span>
        </div>

        {/* Zone 2: Navigation / System Scope */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
          <span className="text-slate-900 font-semibold flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            Corridor Risk Engine
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-slate-500">FMCSA Weather-Load Compliance</span>
        </nav>

        {/* Zone 3: API Mode Selector (Mock / Live Backend) */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setUseMock(true)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                useMock
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Runs inside sandbox with realistic Atlanta to Chicago sample data"
            >
              Mock Data
            </button>
            <button
              type="button"
              onClick={() => setUseMock(false)}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium flex items-center gap-1 cursor-pointer ${
                !useMock
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Queries {VITE_API_BASE_URL}/api/routes/analyze/"
            >
              <Database className="w-3 h-3" />
              <span>Live API</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Area
          Desktop: Left sidebar (~420px, scrollable) with form on top, results below; map fills rest.
          Mobile: Stacked, map first.
      */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Left Sidebar: Form & Results */}
        <aside
          className="w-full lg:w-[420px] lg:shrink-0 flex flex-col h-full bg-white border-t lg:border-t-0 lg:border-r border-slate-200 order-last lg:order-first z-10 overflow-hidden shadow-xs"
          aria-label="Trip Configuration and Corridor Results"
        >
          <div className="flex-1 overflow-y-auto p-4 lg:p-5 space-y-6">
            {/* Form Section */}
            <div>
              <div className="mb-3">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Trip Parameters
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Route alternatives calculated against forecasted precipitation & crosswinds.
                </p>
              </div>

              <TripForm
                onSubmit={executeAnalyze}
                isLoading={isLoading}
                loadingMessage={loadingMessage}
                initialOrigin={data?.origin?.query || 'Atlanta, GA'}
                initialDestination={data?.destination?.query || 'Chicago, IL'}
                initialLoadLb={data?.load_lb || 40000}
              />
            </div>

            <div className="h-px bg-slate-200" role="separator" />

            {/* Results Section */}
            <div>
              <div className="mb-3">
                <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                  Corridor Analysis
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ranked by cumulative severe weather exposure along route mileage.
                </p>
              </div>

              <ResultsPanel
                data={data}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
                error={error}
                isLoading={isLoading}
              />
            </div>
          </div>
        </aside>

        {/* Map Viewport Area: Mobile: First; Desktop: Remaining flex space */}
        <main
          className="flex-1 h-[45vh] lg:h-full relative order-first lg:order-last overflow-hidden"
          aria-label="Interactive Route Map"
        >
          <RouteMap
            origin={data?.origin}
            destination={data?.destination}
            routes={data?.routes || []}
            selectedRouteId={selectedRouteId}
            onSelectRoute={setSelectedRouteId}
            heatmapData={heatmapData}
            isHeatmapLoading={isHeatmapLoading}
            heatmapError={heatmapError}
            showHeatmap={showHeatmap}
            onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
            sliderHour={sliderHour}
            onHourChange={setSliderHour}
            isPlaying={isPlaying}
            onTogglePlay={() => setIsPlaying(!isPlaying)}
            departureTimeIso={data?.departure_time}
          />
        </main>
      </div>
    </div>
  );
}
