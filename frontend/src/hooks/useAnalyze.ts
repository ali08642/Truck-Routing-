import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalyzeRequest, AnalyzeResponse, HeatmapResponse, RouteResult } from '../types';
import { analyzeRoutes, fetchWeatherHeatmap, isMockModeDefault, RouteAnalysisError } from '../api/client';

const PROGRESS_STAGES = [
  'Querying highway corridor alternatives...',
  'Sampling high-resolution surface weather...',
  'Evaluating crosswinds against load weight profile...',
  'Aggregating segment risk exposure scores...',
  'Finalizing safety recommendations...',
];

export function useAnalyze() {
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState<boolean>(isMockModeDefault);

  // Heatmap State
  const [heatmapData, setHeatmapData] = useState<HeatmapResponse | null>(null);
  const [isHeatmapLoading, setIsHeatmapLoading] = useState<boolean>(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [sliderHour, setSliderHour] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearProgressTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startProgressCycle = (isMock: boolean) => {
    clearProgressTimer();
    let index = 0;
    setLoadingMessage(PROGRESS_STAGES[0]);

    // Fast pace for mock mode (approx 250ms per step), ~1000ms for live mode (~5s total)
    const intervalMs = isMock ? 260 : 1000;

    timerRef.current = setInterval(() => {
      index++;
      if (index < PROGRESS_STAGES.length) {
        setLoadingMessage(PROGRESS_STAGES[index]);
      }
    }, intervalMs);
  };

  // Background fetch for the weather heatmap after a successful analyze response
  const triggerHeatmapFetch = useCallback(
    async (analyzeResult: AnalyzeResponse, departureIso: string, mockMode: boolean) => {
      setIsHeatmapLoading(true);
      setHeatmapError(null);

      try {
        const heatmap = await fetchWeatherHeatmap(
          {
            origin: { lat: analyzeResult.origin.lat, lon: analyzeResult.origin.lon },
            destination: { lat: analyzeResult.destination.lat, lon: analyzeResult.destination.lon },
            departure_time: departureIso,
            load_lb: analyzeResult.load_lb,
          },
          mockMode
        );
        setHeatmapData(heatmap);
        setSliderHour(0);
      } catch (err: unknown) {
        setHeatmapError('Heatmap unavailable');
      } finally {
        setIsHeatmapLoading(false);
      }
    },
    []
  );

  const executeAnalyze = useCallback(
    async (request: AnalyzeRequest) => {
      setIsLoading(true);
      setError(null);
      setIsPlaying(false);
      startProgressCycle(useMock);

      try {
        const result = await analyzeRoutes(request, useMock);
        setData(result);
        setSelectedRouteId(result.recommended_route_id || result.routes[0]?.id || null);

        // Background call once after successful analyze response (non-blocking)
        triggerHeatmapFetch(result, request.departure_time, useMock);
      } catch (err: unknown) {
        if (err instanceof RouteAnalysisError) {
          setError(err.message);
        } else if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('An unexpected error occurred while analyzing routes.');
        }
      } finally {
        clearProgressTimer();
        setIsLoading(false);
        setLoadingMessage('');
      }
    },
    [useMock, triggerHeatmapFetch]
  );

  // Play/Pause timer: advances 1 hour every 400 ms, loop at the end
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    const maxHours = heatmapData?.hours ?? 48;
    playTimerRef.current = setInterval(() => {
      setSliderHour((prev) => (prev >= maxHours ? 0 : prev + 1));
    }, 400);

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, heatmapData?.hours]);

  useEffect(() => {
    return () => {
      clearProgressTimer();
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, []);

  const selectedRoute: RouteResult | null =
    data?.routes.find((r) => r.id === selectedRouteId) ||
    data?.routes.find((r) => r.is_recommended) ||
    data?.routes[0] ||
    null;

  return {
    data,
    selectedRoute,
    selectedRouteId,
    setSelectedRouteId,
    isLoading,
    loadingMessage,
    error,
    setError,
    useMock,
    setUseMock,
    executeAnalyze,
    // Heatmap & Time Slider State
    heatmapData,
    isHeatmapLoading,
    heatmapError,
    showHeatmap,
    setShowHeatmap,
    sliderHour,
    setSliderHour,
    isPlaying,
    setIsPlaying,
  };
}
