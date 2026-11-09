import { AnalyzeResponse, RouteResult, Checkpoint, Risk, HeatmapResponse } from '../types';

/**
 * Generates realistic interpolated points between two coordinates with optional sway
 */
function interpolatePoints(
  p1: [number, number],
  p2: [number, number],
  steps: number,
  swayLat = 0,
  swayLon = 0
): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bend = Math.sin(t * Math.PI);
    const lat = p1[0] + (p2[0] - p1[0]) * t + bend * swayLat;
    const lon = p1[1] + (p2[1] - p1[1]) * t + bend * swayLon;
    points.push([Number(lat.toFixed(5)), Number(lon.toFixed(5))]);
  }
  return points;
}

export function generateMockAnalyzeResponse(
  originQuery = 'Atlanta, GA',
  destQuery = 'Chicago, IL',
  departureIso?: string,
  loadWeight = 40000
): AnalyzeResponse {
  const baseDeparture = departureIso ? new Date(departureIso) : new Date();

  // Route 1: I-65 North Corridor (Recommended)
  // Atlanta -> Chattanooga -> Nashville -> Louisville -> Indianapolis -> Chicago
  const waypoints1: [number, number][] = [
    [33.749, -84.388], // Atlanta
    [34.301, -84.912], // Calhoun
    [35.0456, -85.3097], // Chattanooga
    [35.518, -86.082], // Manchester
    [36.1627, -86.7816], // Nashville
    [36.9903, -86.4436], // Bowling Green
    [37.6934, -85.8596], // Elizabethtown
    [38.2527, -85.7585], // Louisville
    [39.1619, -85.9214], // Columbus, IN
    [39.7684, -86.1581], // Indianapolis
    [40.4167, -86.8753], // Lafayette
    [41.1578, -87.2798], // Roselawn
    [41.5934, -87.3464], // Gary
    [41.8781, -87.6298], // Chicago
  ];

  // Route 2: I-24 / I-57 Western Illinois Corridor
  // Atlanta -> Chattanooga -> Nashville -> Clarksville -> Paducah -> Mt Vernon -> Effingham -> Chicago
  const waypoints2: [number, number][] = [
    [33.749, -84.388], // Atlanta
    [34.7699, -84.9702], // Dalton
    [35.0456, -85.3097], // Chattanooga
    [35.6888, -86.2941], // Murfreesboro
    [36.1627, -86.7816], // Nashville
    [36.5298, -87.3595], // Clarksville
    [37.0834, -88.6001], // Paducah, KY
    [37.7306, -88.9331], // Marion, IL
    [38.3173, -88.9031], // Mt Vernon, IL
    [39.1200, -88.5434], // Effingham, IL
    [40.1164, -88.2434], // Champaign, IL
    [41.1189, -87.8611], // Kankakee, IL
    [41.8781, -87.6298], // Chicago
  ];

  // Route 3: I-75 / I-74 Eastern Corridor via Cincinnati
  // Atlanta -> Knoxville -> Lexington -> Cincinnati -> Indianapolis -> Chicago
  const waypoints3: [number, number][] = [
    [33.749, -84.388], // Atlanta
    [34.7699, -84.9702], // Dalton
    [35.9606, -83.9207], // Knoxville, TN
    [36.7828, -84.1531], // Williamsburg, KY
    [37.5684, -84.2963], // Berea, KY
    [38.0406, -84.5037], // Lexington, KY
    [38.7073, -84.5478], // Dry Ridge, KY
    [39.1031, -84.512], // Cincinnati, OH
    [39.3364, -85.4853], // Greensburg, IN
    [39.7684, -86.1581], // Indianapolis
    [40.4167, -86.8753], // Lafayette
    [41.3895, -87.3644], // Crown Point
    [41.8781, -87.6298], // Chicago
  ];

  // Build dense geometries
  const buildGeometry = (pts: [number, number][]): [number, number][] => {
    const fullGeo: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = interpolatePoints(pts[i], pts[i + 1], 6);
      if (i > 0) seg.shift();
      fullGeo.push(...seg);
    }
    return fullGeo;
  };

  const geo1 = buildGeometry(waypoints1);
  const geo2 = buildGeometry(waypoints2);
  const geo3 = buildGeometry(waypoints3);

  // Helper to build 14-16 realistic checkpoints along a route
  const createCheckpoints = (
    pts: [number, number][],
    totalMiles: number,
    totalHours: number,
    riskSequence: { risk: Risk; driver: 'wind' | 'rain' | 'snow' | 'load'; wind: number; rain: number; snow: number; loadRule?: boolean }[]
  ): Checkpoint[] => {
    const count = riskSequence.length;
    const segmentMiles = totalMiles / count;
    const checkpoints: Checkpoint[] = [];

    for (let i = 0; i < count; i++) {
      const ratio = (i + 1) / count;
      const ptIdx = Math.min(Math.floor(ratio * (pts.length - 1)), pts.length - 1);
      const coord = pts[ptIdx];
      const mile = Math.round((i + 1) * segmentMiles);
      const hoursFromDep = (ratio * totalHours);
      const etaDate = new Date(baseDeparture.getTime() + hoursFromDep * 3600 * 1000);

      const item = riskSequence[i];
      // Check if weight causes load_rule_applied
      const isLoadRule = item.loadRule || (loadWeight > 65000 && item.wind > 28);
      const effectiveRisk = isLoadRule && item.risk === 'moderate' ? 'high' : item.risk;

      checkpoints.push({
        lat: coord[0],
        lon: coord[1],
        mile,
        segment_miles: Math.round(segmentMiles),
        eta: etaDate.toISOString(),
        wind_mph: item.wind,
        rain_in_hr: item.rain,
        snow_in_hr: item.snow,
        risk: effectiveRisk,
        driver: isLoadRule ? 'load' : item.driver,
        load_rule_applied: isLoadRule,
      });
    }
    return checkpoints;
  };

  // Route 1 checkpoints (15 checkpoints, Mostly Low/Mod, 1 High in northern Indiana)
  const route1Risks: { risk: Risk; driver: 'wind' | 'rain' | 'snow' | 'load'; wind: number; rain: number; snow: number }[] = [
    { risk: 'low', driver: 'wind', wind: 8, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 11, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'rain', wind: 18, rain: 0.22, snow: 0.0 },
    { risk: 'moderate', driver: 'wind', wind: 24, rain: 0.15, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 14, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 16, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'wind', wind: 26, rain: 0.05, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 15, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 19, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'snow', wind: 23, rain: 0.0, snow: 0.15 },
    { risk: 'high', driver: 'wind', wind: 36, rain: 0.0, snow: 0.4 },
    { risk: 'moderate', driver: 'snow', wind: 25, rain: 0.0, snow: 0.2 },
    { risk: 'moderate', driver: 'wind', wind: 28, rain: 0.0, snow: 0.1 },
    { risk: 'low', driver: 'wind', wind: 17, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 12, rain: 0.0, snow: 0.0 },
  ];

  // Route 2 checkpoints (15 checkpoints, Includes Severe snow squall in Illinois)
  const route2Risks: { risk: Risk; driver: 'wind' | 'rain' | 'snow' | 'load'; wind: number; rain: number; snow: number; loadRule?: boolean }[] = [
    { risk: 'low', driver: 'wind', wind: 9, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 14, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'rain', wind: 22, rain: 0.35, snow: 0.0 },
    { risk: 'moderate', driver: 'wind', wind: 27, rain: 0.18, snow: 0.0 },
    { risk: 'moderate', driver: 'wind', wind: 25, rain: 0.0, snow: 0.0 },
    { risk: 'high', driver: 'wind', wind: 34, rain: 0.1, snow: 0.0, loadRule: true },
    { risk: 'high', driver: 'wind', wind: 37, rain: 0.0, snow: 0.3 },
    { risk: 'severe', driver: 'snow', wind: 42, rain: 0.0, snow: 1.25 },
    { risk: 'severe', driver: 'snow', wind: 44, rain: 0.0, snow: 1.1 },
    { risk: 'high', driver: 'snow', wind: 35, rain: 0.0, snow: 0.6 },
    { risk: 'moderate', driver: 'snow', wind: 26, rain: 0.0, snow: 0.2 },
    { risk: 'moderate', driver: 'wind', wind: 24, rain: 0.0, snow: 0.05 },
    { risk: 'low', driver: 'wind', wind: 18, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 15, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 12, rain: 0.0, snow: 0.0 },
  ];

  // Route 3 checkpoints (15 checkpoints, Includes No Travel blizzard/black ice in Cumberland/Ohio valley)
  const route3Risks: { risk: Risk; driver: 'wind' | 'rain' | 'snow' | 'load'; wind: number; rain: number; snow: number; loadRule?: boolean }[] = [
    { risk: 'low', driver: 'wind', wind: 10, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 13, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'rain', wind: 20, rain: 0.28, snow: 0.0 },
    { risk: 'high', driver: 'wind', wind: 38, rain: 0.12, snow: 0.1 },
    { risk: 'severe', driver: 'snow', wind: 45, rain: 0.0, snow: 1.4 },
    { risk: 'no_travel', driver: 'snow', wind: 56, rain: 0.0, snow: 2.1 },
    { risk: 'no_travel', driver: 'wind', wind: 58, rain: 0.0, snow: 1.8 },
    { risk: 'severe', driver: 'snow', wind: 43, rain: 0.0, snow: 0.9 },
    { risk: 'high', driver: 'snow', wind: 36, rain: 0.0, snow: 0.4 },
    { risk: 'moderate', driver: 'wind', wind: 28, rain: 0.0, snow: 0.1 },
    { risk: 'moderate', driver: 'wind', wind: 22, rain: 0.0, snow: 0.0 },
    { risk: 'moderate', driver: 'wind', wind: 24, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 16, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 14, rain: 0.0, snow: 0.0 },
    { risk: 'low', driver: 'wind', wind: 11, rain: 0.0, snow: 0.0 },
  ];

  const buildSummary = (checkpoints: Checkpoint[]) => {
    const milesByRisk: Record<Risk, number> = {
      low: 0,
      moderate: 0,
      high: 0,
      severe: 0,
      no_travel: 0,
    };

    const riskRankWeight: Record<Risk, number> = {
      low: 0,
      moderate: 1,
      high: 2,
      severe: 3,
      no_travel: 4,
    };

    let totalScore = 0;
    let worstRisk: Risk = 'low';

    for (const cp of checkpoints) {
      milesByRisk[cp.risk] = (milesByRisk[cp.risk] || 0) + cp.segment_miles;
      totalScore += riskRankWeight[cp.risk] * cp.segment_miles;
      if (riskRankWeight[cp.risk] > riskRankWeight[worstRisk]) {
        worstRisk = cp.risk;
      }
    }

    const totalMiles = checkpoints.reduce((acc, c) => acc + c.segment_miles, 0);
    const avgRisk = Number((totalScore / Math.max(totalMiles, 1)).toFixed(2));

    return {
      miles_by_risk: milesByRisk,
      avg_risk: avgRisk,
      worst_risk: worstRisk,
    };
  };

  const cp1 = createCheckpoints(waypoints1, 716, 11.4, route1Risks);
  const cp2 = createCheckpoints(waypoints2, 742, 11.9, route2Risks);
  const cp3 = createCheckpoints(waypoints3, 778, 12.6, route3Risks);

  const routes: RouteResult[] = [
    {
      id: 'rt-i65-recommended',
      rank: 1,
      is_recommended: true,
      distance_miles: 716,
      duration_hours: 11.4,
      spacing_miles: 48,
      geometry: geo1,
      summary: buildSummary(cp1),
      checkpoints: cp1,
    },
    {
      id: 'rt-i57-alternate',
      rank: 2,
      is_recommended: false,
      distance_miles: 742,
      duration_hours: 11.9,
      spacing_miles: 49,
      geometry: geo2,
      summary: buildSummary(cp2),
      checkpoints: cp2,
    },
    {
      id: 'rt-i75-eastern',
      rank: 3,
      is_recommended: false,
      distance_miles: 778,
      duration_hours: 12.6,
      spacing_miles: 52,
      geometry: geo3,
      summary: buildSummary(cp3),
      checkpoints: cp3,
    },
  ];

  return {
    origin: {
      query: originQuery,
      lat: 33.749,
      lon: -84.388,
    },
    destination: {
      query: destQuery,
      lat: 41.8781,
      lon: -87.6298,
    },
    departure_time: baseDeparture.toISOString(),
    load_lb: loadWeight,
    recommended_route_id: 'rt-i65-recommended',
    decided_by: 'lowest_risk_exposure',
    explanation:
      'Route A (I-65 N) minimizes severe winter weather exposure across the Midwest corridor. Routes B and C encounter active squalls and unsafe 55+ mph crosswind thresholds.',
    warnings: [
      'Gale-force crosswinds forecasted along I-65 near Lafayette, IN between Mile 570 and 620. Maintain reduced speeds for loads over 40,000 lb.',
      'Route C (I-75/I-74) contains active No-Travel winter storm warnings near the Kentucky/Tennessee border with freezing precipitation.',
    ],
    routes,
  };
}

export function generateMockHeatmapResponse(
  origin = { lat: 33.749, lon: -84.388 },
  destination = { lat: 41.8781, lon: -87.6298 },
  departureIso?: string,
  loadWeight = 40000
): HeatmapResponse {
  const startTime = departureIso ? new Date(departureIso).toISOString() : new Date().toISOString();
  const hours = 48;

  // Grid bounding box with corridor margins
  const minLat = Math.min(origin.lat, destination.lat) - 1.2;
  const maxLat = Math.max(origin.lat, destination.lat) + 1.2;
  const minLon = Math.min(origin.lon, destination.lon) - 2.5;
  const maxLon = Math.max(origin.lon, destination.lon) + 2.5;

  const latStep = 0.5;
  const lonStep = 0.6;
  const cells: [number, number][] = [];

  for (let lat = minLat; lat <= maxLat; lat += latStep) {
    for (let lon = minLon; lon <= maxLon; lon += lonStep) {
      cells.push([Number(lat.toFixed(4)), Number(lon.toFixed(4))]);
    }
  }

  const numCells = cells.length;
  const risk: number[][] = [];
  const wind_mph: number[][] = [];
  const rain_in_hr: number[][] = [];
  const snow_in_hr: number[][] = [];

  // Generate 0..48 hours of weather data
  for (let h = 0; h <= hours; h++) {
    const hourRisk: number[] = new Array(numCells);
    const hourWind: number[] = new Array(numCells);
    const hourRain: number[] = new Array(numCells);
    const hourSnow: number[] = new Array(numCells);

    // Dynamic storm center tracks smoothly from southwest to northeast
    const stormProgress = h / hours;
    const centerLat = 33.2 + stormProgress * 9.5;
    const centerLon = -89.8 + stormProgress * 8.8;

    for (let i = 0; i < numCells; i++) {
      const [cLat, cLon] = cells[i];

      // Distance to tilted squall front
      const frontDist = Math.abs((cLat - centerLat) - 0.75 * (cLon - centerLon));
      // Distance to convective core
      const coreDist = Math.hypot(cLat - centerLat, (cLon - centerLon) * 0.9);

      let intensity = 0;
      if (frontDist < 3.2) {
        const frontWeight = Math.max(0, 1 - frontDist / 3.2);
        const coreWeight = Math.max(0, 1 - coreDist / 4.5);
        intensity = frontWeight * 0.65 + coreWeight * 0.45;
        intensity += 0.08 * Math.sin(cLat * 3 + h * 0.25);
      }
      intensity = Math.max(0, Math.min(1, intensity));

      let cellRisk = 0;
      let wind = 8;
      let rain = 0;
      let snow = 0;

      if (intensity < 0.22) {
        cellRisk = 0; // Low
        wind = 8 + Math.round(intensity * 20);
        rain = 0;
        snow = 0;
      } else if (intensity < 0.48) {
        cellRisk = 1; // Moderate
        wind = 18 + Math.round((intensity - 0.22) * 35);
        rain = Number((0.08 + (intensity - 0.22) * 0.4).toFixed(2));
        snow = cLat > 39.0 ? Number(((intensity - 0.22) * 0.3).toFixed(2)) : 0;
      } else if (intensity < 0.72) {
        cellRisk = 2; // High
        wind = 32 + Math.round((intensity - 0.48) * 30);
        rain = Number((0.25 + (intensity - 0.48) * 0.6).toFixed(2));
        snow = cLat > 38.5 ? Number((0.2 + (intensity - 0.48) * 0.7).toFixed(2)) : 0;
      } else if (intensity < 0.87) {
        cellRisk = 3; // Severe
        wind = 46 + Math.round((intensity - 0.72) * 35);
        rain = Number((0.6 + (intensity - 0.72) * 0.8).toFixed(2));
        snow = cLat > 37.8 ? Number((0.6 + (intensity - 0.72) * 1.5).toFixed(2)) : 0;
      } else {
        cellRisk = 4; // No Travel
        wind = 58 + Math.round((intensity - 0.87) * 40);
        rain = Number((1.1 + (intensity - 0.87) * 0.9).toFixed(2));
        snow = cLat > 37.0 ? Number((1.4 + (intensity - 0.87) * 2.2).toFixed(2)) : 0;
      }

      // Check load rule
      if (loadWeight > 70000 && wind > 30 && cellRisk < 3) {
        cellRisk = Math.min(4, cellRisk + 1);
      } else if (loadWeight < 25000 && wind > 35 && cellRisk < 3) {
        cellRisk = Math.min(4, cellRisk + 1);
      }

      hourRisk[i] = cellRisk;
      hourWind[i] = wind;
      hourRain[i] = rain;
      hourSnow[i] = snow;
    }

    risk.push(hourRisk);
    wind_mph.push(hourWind);
    rain_in_hr.push(hourRain);
    snow_in_hr.push(hourSnow);
  }

  return {
    start_time: startTime,
    hours,
    load_lb: loadWeight,
    cell_size: { lat: latStep, lon: lonStep },
    cells,
    risk,
    wind_mph,
    rain_in_hr,
    snow_in_hr,
  };
}

