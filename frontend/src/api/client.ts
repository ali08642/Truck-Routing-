import { AnalyzeRequest, AnalyzeResponse, ApiErrorResponse, HeatmapRequest, HeatmapResponse } from '../types';
import { generateMockAnalyzeResponse, generateMockHeatmapResponse } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Default to mock mode in Bolt/preview environments unless explicitly set to 'false'
export const isMockModeDefault = import.meta.env.VITE_USE_MOCK !== 'false';

export class RouteAnalysisError extends Error {
  public status?: number;
  public fieldErrors?: Record<string, string[]>;

  constructor(message: string, status?: number, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = 'RouteAnalysisError';
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Normalizes backend error responses (400, 502, field errors) into readable messages
 */
function parseErrorMessage(data: unknown, fallbackMessage: string): string {
  if (!data || typeof data !== 'object') {
    return fallbackMessage;
  }

  const errObj = data as ApiErrorResponse;

  if (typeof errObj.detail === 'string') {
    return errObj.detail;
  }

  const messages: string[] = [];
  for (const [key, value] of Object.entries(errObj)) {
    if (key === 'detail') continue;
    if (Array.isArray(value)) {
      messages.push(`${key}: ${value.join(', ')}`);
    } else if (typeof value === 'string') {
      messages.push(`${key}: ${value}`);
    }
  }

  return messages.length > 0 ? messages.join(' | ') : fallbackMessage;
}

export async function analyzeRoutes(
  req: AnalyzeRequest,
  useMock = isMockModeDefault
): Promise<AnalyzeResponse> {
  if (useMock) {
    // Simulate ~1.2s delay for mock preview
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return generateMockAnalyzeResponse(
      req.origin || 'Atlanta, GA',
      req.destination || 'Chicago, IL',
      req.departure_time,
      req.load_lb
    );
  }

  const url = `${BASE_URL.replace(/\/+$/, '')}/api/routes/analyze/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        origin: req.origin.trim(),
        destination: req.destination.trim(),
        departure_time: new Date(req.departure_time).toISOString(),
        load_lb: Math.round(Number(req.load_lb)),
      }),
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      const message = parseErrorMessage(
        errorData,
        `Analysis failed with status ${response.status} (${response.statusText || 'Server Error'})`
      );

      throw new RouteAnalysisError(message, response.status);
    }

    const data: AnalyzeResponse = await response.json();
    return data;
  } catch (err: unknown) {
    if (err instanceof RouteAnalysisError) {
      throw err;
    }

    const errorMsg =
      err instanceof Error
        ? err.message
        : 'Failed to connect to route analysis service.';

    throw new RouteAnalysisError(
      `Network error connecting to ${url}: ${errorMsg}. You can toggle "Mock Mode" in the header to preview sample route corridors.`,
      0
    );
  }
}

export async function fetchWeatherHeatmap(
  req: HeatmapRequest,
  useMock = isMockModeDefault
): Promise<HeatmapResponse> {
  if (useMock) {
    // Simulate background weather calculation delay (~400ms)
    await new Promise((resolve) => setTimeout(resolve, 400));
    return generateMockHeatmapResponse(
      req.origin,
      req.destination,
      req.departure_time,
      req.load_lb
    );
  }

  const url = `${BASE_URL.replace(/\/+$/, '')}/api/weather/heatmap/`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        origin: { lat: req.origin.lat, lon: req.origin.lon },
        destination: { lat: req.destination.lat, lon: req.destination.lon },
        departure_time: new Date(req.departure_time).toISOString(),
        load_lb: Math.round(Number(req.load_lb)),
      }),
    });

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = null;
      }

      const message = parseErrorMessage(
        errorData,
        `Weather heatmap failed with status ${response.status}`
      );

      throw new Error(message);
    }

    const data: HeatmapResponse = await response.json();
    return data;
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : 'Failed to connect to weather heatmap service.';
    throw new Error(errorMsg);
  }
}

