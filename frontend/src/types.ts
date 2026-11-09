export type Risk = "low" | "moderate" | "high" | "severe" | "no_travel";

export interface Checkpoint {
  lat: number;
  lon: number;
  mile: number;
  segment_miles: number;
  eta: string;
  wind_mph: number;
  rain_in_hr: number;
  snow_in_hr: number;
  risk: Risk;
  driver: "wind" | "rain" | "snow" | "load";
  load_rule_applied: boolean;
}

export interface RouteResult {
  id: string;
  rank: number;
  is_recommended: boolean;
  distance_miles: number;
  duration_hours: number;
  spacing_miles: number;
  geometry: [number, number][]; /* [lat, lon] */
  summary: {
    miles_by_risk: Record<Risk, number>;
    avg_risk: number; /* 0-4 */
    worst_risk: Risk;
  };
  checkpoints: Checkpoint[];
}

export interface Place {
  query: string;
  lat: number;
  lon: number;
}

export interface AnalyzeResponse {
  origin: Place;
  destination: Place;
  departure_time: string;
  load_lb: number;
  recommended_route_id: string;
  decided_by: string;
  explanation: string;
  warnings: string[];
  routes: RouteResult[];
}

export interface AnalyzeRequest {
  origin: string;
  destination: string;
  departure_time: string;
  load_lb: number;
}

export interface HeatmapResponse {
  start_time: string;
  hours: number;
  load_lb: number;
  cell_size: { lat: number; lon: number };
  cells: [number, number][]; // [lat, lon] centres
  risk: number[][]; // risk[h][i] = risk of cell i, h hours after start_time. 0=Low 1=Moderate 2=High 3=Severe 4=No Travel.
  wind_mph: number[][];
  rain_in_hr: number[][];
  snow_in_hr: number[][];
}

export interface HeatmapRequest {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  departure_time: string;
  load_lb: number;
}

export interface ApiErrorResponse {
  detail?: string;
  [field: string]: string | string[] | undefined;
}

