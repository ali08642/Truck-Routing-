import React, { useMemo, useEffect } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Popup,
  Marker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { Place, RouteResult, Checkpoint, Risk, HeatmapResponse } from '../types';
import { RISK_COLORS, RISK_LABELS, RISK_ORDER, getDriverLabel, getRiskBadgeStyle } from '../utils/risk';
import { formatLocalEta, getRouteLetter } from '../utils/format';
import { WeatherHeatmapLayer } from './WeatherHeatmapLayer';
import { TimeSliderBar } from './TimeSliderBar';
import { Wind, CloudRain, Snowflake, AlertCircle, Info } from 'lucide-react';

interface RouteMapProps {
  origin?: Place;
  destination?: Place;
  routes: RouteResult[];
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  // Weather Heatmap & Time Slider Props
  heatmapData: HeatmapResponse | null;
  isHeatmapLoading: boolean;
  heatmapError: string | null;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  sliderHour: number;
  onHourChange: (hour: number) => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  departureTimeIso?: string;
}

/**
 * Haversine formula to calculate distance between two lat/lon points in miles.
 */
function haversineMiles(coord1: [number, number], coord2: [number, number]): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const lat1 = coord1[0];
  const lon1 = coord1[1];
  const lat2 = coord2[0];
  const lon2 = coord2[1];

  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface SegmentWithRisk {
  points: [number, number][];
  risk: Risk;
}

/**
 * Splits route geometry into contiguous sub-polylines coloured by weather risk.
 * 1. Calculates cumulative distance along the geometry.
 * 2. Maps each coordinate step's midpoint distance to the covering checkpoint.
 * 3. Batches contiguous same-risk coordinates into polylines for optimal Leaflet canvas performance.
 */
function computeRiskColoredSegments(
  geometry: [number, number][],
  checkpoints: Checkpoint[],
  totalRouteMiles: number
): SegmentWithRisk[] {
  if (geometry.length < 2 || checkpoints.length === 0) return [];

  // 1. Calculate cumulative distance at each geometry vertex
  const cumDists: number[] = [0];
  for (let i = 1; i < geometry.length; i++) {
    const dist = haversineMiles(geometry[i - 1], geometry[i]);
    cumDists.push(cumDists[i - 1] + dist);
  }

  const totalGeoDist = cumDists[cumDists.length - 1] || 1;
  const scale = totalRouteMiles > 0 ? totalRouteMiles / totalGeoDist : 1;

  // Sorted checkpoints by mile
  const sortedCheckpoints = [...checkpoints].sort((a, b) => a.mile - b.mile);

  // Helper to find checkpoint risk covering a specific route mile
  const getRiskAtMile = (mile: number): Risk => {
    // Check if within any checkpoint's range [mile - segment_miles, mile]
    for (const cp of sortedCheckpoints) {
      const startMile = Math.max(0, cp.mile - cp.segment_miles);
      if (mile >= startMile && mile <= cp.mile) {
        return cp.risk;
      }
    }
    // Fallback: find closest checkpoint by absolute mile distance
    let closest = sortedCheckpoints[0];
    let minDiff = Math.abs(sortedCheckpoints[0].mile - mile);
    for (let i = 1; i < sortedCheckpoints.length; i++) {
      const diff = Math.abs(sortedCheckpoints[i].mile - mile);
      if (diff < minDiff) {
        minDiff = diff;
        closest = sortedCheckpoints[i];
      }
    }
    return closest.risk;
  };

  const segments: SegmentWithRisk[] = [];
  let currentSegmentPoints: [number, number][] = [geometry[0]];
  let currentRisk: Risk = getRiskAtMile(0);

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const midDistScaled = ((cumDists[i] + cumDists[i + 1]) / 2) * scale;
    const stepRisk = getRiskAtMile(midDistScaled);

    if (stepRisk === currentRisk) {
      currentSegmentPoints.push(p2);
    } else {
      // Risk changed: finalize the current stretch and start new one
      currentSegmentPoints.push(p2);
      segments.push({
        points: currentSegmentPoints,
        risk: currentRisk,
      });
      // Start next segment from p1 so there are no visual gaps
      currentSegmentPoints = [p1, p2];
      currentRisk = stepRisk;
    }
  }

  if (currentSegmentPoints.length >= 2) {
    segments.push({
      points: currentSegmentPoints,
      risk: currentRisk,
    });
  }

  return segments;
}

/**
 * Fits bounds whenever routes change, with responsive padding
 */
const BoundsFitter: React.FC<{ routes: RouteResult[] }> = ({ routes }) => {
  const map = useMap();

  useEffect(() => {
    if (!routes || routes.length === 0) return;

    const allPoints: [number, number][] = [];
    routes.forEach((r) => {
      if (r.geometry && r.geometry.length > 0) {
        allPoints.push(...r.geometry);
      }
    });

    if (allPoints.length === 0) return;

    const bounds = L.latLngBounds(allPoints);
    map.fitBounds(bounds, {
      padding: [40, 40],
      maxZoom: 11,
      animate: true,
    });
  }, [map, routes]);

  return null;
};

/**
 * Invalidates Leaflet container size after mounting and layout changes
 */
const MapInvalidator: React.FC = () => {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
};

// Custom SVG Icons for Origin and Destination Pins
const originIcon = L.divIcon({
  className: 'custom-map-icon',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#10b981;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,0.3);color:#ffffff;font-size:12px;font-weight:700;font-family:sans-serif;">A</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

const destinationIcon = L.divIcon({
  className: 'custom-map-icon',
  html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;background:#1e293b;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 3px 8px rgba(0,0,0,0.3);color:#ffffff;font-size:12px;font-weight:700;font-family:sans-serif;">B</div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export const RouteMap: React.FC<RouteMapProps> = ({
  origin,
  destination,
  routes,
  selectedRouteId,
  onSelectRoute,
  heatmapData,
  isHeatmapLoading,
  heatmapError,
  showHeatmap,
  onToggleHeatmap,
  sliderHour,
  onHourChange,
  isPlaying,
  onTogglePlay,
  departureTimeIso,
}) => {
  const selectedRoute = useMemo(
    () => routes.find((r) => r.id === selectedRouteId) || routes[0] || null,
    [routes, selectedRouteId]
  );

  const unselectedRoutes = useMemo(
    () => routes.filter((r) => r.id !== selectedRoute?.id),
    [routes, selectedRoute]
  );

  // Compute risk-coloured polylines for the selected route
  const coloredSegments = useMemo(() => {
    if (!selectedRoute) return [];
    return computeRiskColoredSegments(
      selectedRoute.geometry,
      selectedRoute.checkpoints,
      selectedRoute.distance_miles
    );
  }, [selectedRoute]);

  // Fallback map center (defaults to Midwest/Southeast corridor or first point)
  const defaultCenter: [number, number] = useMemo(() => {
    if (origin && origin.lat && origin.lon) {
      return [origin.lat, origin.lon];
    }
    if (routes[0]?.geometry?.[0]) {
      return routes[0].geometry[0];
    }
    return [37.7749, -86.4194]; // Kentucky/Midwest center
  }, [origin, routes]);

  return (
    <div className="relative w-full h-full min-h-[380px] bg-slate-100 overflow-hidden">
      <MapContainer
        center={defaultCenter}
        zoom={6}
        preferCanvas={true}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={18}
        />

        {/* Weather Heatmap Layer: rendered in 'heatmapPane' (zIndex 350), strictly below route overlays */}
        <WeatherHeatmapLayer
          heatmapData={heatmapData}
          sliderHour={sliderHour}
          showHeatmap={showHeatmap}
        />

        <BoundsFitter routes={routes} />
        <MapInvalidator />

        {/* 1. Unselected Routes: Thin clickable grey lines */}
        {unselectedRoutes.map((rt) => {
          const letter = getRouteLetter(rt.rank);
          return (
            <Polyline
              key={rt.id}
              positions={rt.geometry}
              pathOptions={{
                color: '#94a3b8',
                weight: 4,
                opacity: 0.65,
                dashArray: '6, 6',
                lineCap: 'round',
                lineJoin: 'round',
              }}
              eventHandlers={{
                click: () => onSelectRoute(rt.id),
              }}
            >
              <Popup>
                <div className="p-2 text-xs">
                  <div className="font-semibold text-slate-900">
                    Route {letter} (Rank #{rt.rank})
                  </div>
                  <div className="text-slate-500 text-[11px] mt-0.5 font-mono">
                    {Math.round(rt.distance_miles)} mi · {Math.round(rt.duration_hours)} h
                  </div>
                  <button
                    onClick={() => onSelectRoute(rt.id)}
                    className="mt-2 w-full py-1 px-2 bg-blue-600 text-white rounded text-[11px] font-medium hover:bg-blue-700 cursor-pointer"
                  >
                    Select this route
                  </button>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* 2. Selected Route: Thick Polyline COLOURED BY RISK PER SEGMENT */}
        {coloredSegments.map((segment, idx) => (
          <Polyline
            key={`seg-${selectedRoute?.id}-${idx}`}
            positions={segment.points}
            pathOptions={{
              color: RISK_COLORS[segment.risk],
              weight: 7,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}

        {/* 3. Selected Route Checkpoints as CircleMarkers coloured by risk */}
        {selectedRoute?.checkpoints.map((cp, idx) => {
          const badgeStyle = getRiskBadgeStyle(cp.risk);
          return (
            <CircleMarker
              key={`cp-${selectedRoute.id}-${idx}-${cp.mile}`}
              center={[cp.lat, cp.lon]}
              radius={6.5}
              pathOptions={{
                fillColor: RISK_COLORS[cp.risk],
                fillOpacity: 1,
                color: '#ffffff',
                weight: 2,
              }}
            >
              <Popup className="checkpoint-popup">
                <div className="p-3 max-w-[240px] text-xs">
                  {/* Popup Header */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900 font-mono text-xs">
                      Mile {cp.mile}
                    </span>
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border"
                      style={{
                        backgroundColor: badgeStyle.background,
                        color: badgeStyle.color,
                        borderColor: badgeStyle.border,
                      }}
                    >
                      {RISK_LABELS[cp.risk]}
                    </span>
                  </div>

                  {/* ETA & Driver info */}
                  <div className="py-2 space-y-1.5 text-slate-600">
                    <div className="text-[11px] flex items-center justify-between">
                      <span className="text-slate-400">Local ETA:</span>
                      <span className="font-semibold text-slate-800 font-mono">
                        {formatLocalEta(cp.eta)}
                      </span>
                    </div>

                    <div className="text-[11px] flex items-center justify-between">
                      <span className="text-slate-400">Risk Driver:</span>
                      <span className="font-medium text-slate-800">
                        {getDriverLabel(cp.driver)}
                      </span>
                    </div>

                    {/* Load Rule Note */}
                    {cp.load_rule_applied && (
                      <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-900 flex items-center gap-1 font-medium">
                        <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                        <span>Raised by load rule</span>
                      </div>
                    )}
                  </div>

                  {/* Environmental Observations */}
                  <div className="grid grid-cols-3 gap-1 pt-2 border-t border-slate-100 text-[10px] text-center font-mono">
                    <div className="p-1 rounded bg-slate-50">
                      <Wind className="w-3 h-3 text-slate-500 mx-auto mb-0.5" />
                      <div className="text-slate-400">Wind</div>
                      <div className="font-semibold text-slate-900">{cp.wind_mph} mph</div>
                    </div>
                    <div className="p-1 rounded bg-slate-50">
                      <CloudRain className="w-3 h-3 text-blue-500 mx-auto mb-0.5" />
                      <div className="text-slate-400">Rain</div>
                      <div className="font-semibold text-slate-900">{cp.rain_in_hr} in/h</div>
                    </div>
                    <div className="p-1 rounded bg-slate-50">
                      <Snowflake className="w-3 h-3 text-cyan-500 mx-auto mb-0.5" />
                      <div className="text-slate-400">Snow</div>
                      <div className="font-semibold text-slate-900">{cp.snow_in_hr} in/h</div>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* 4. Origin & Destination Markers */}
        {origin && origin.lat && origin.lon && (
          <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
            <Popup>
              <div className="p-2 text-xs">
                <div className="font-semibold text-slate-900">Origin Point</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{origin.query}</div>
              </div>
            </Popup>
          </Marker>
        )}

        {destination && destination.lat && destination.lon && (
          <Marker position={[destination.lat, destination.lon]} icon={destinationIcon}>
            <Popup>
              <div className="p-2 text-xs">
                <div className="font-semibold text-slate-900">Destination Point</div>
                <div className="text-slate-500 text-[11px] mt-0.5">{destination.query}</div>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* Map Legend: Risk Colours and Labels (positioned top-right to leave bottom clear for time slider) */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 bg-white/95 backdrop-blur-xs border border-slate-200/80 rounded-xl shadow-lg p-2.5 sm:p-3 max-w-[210px]">
        <div className="text-[11px] font-semibold text-slate-800 tracking-tight mb-1.5 flex items-center justify-between">
          <span>Weather Risk Key</span>
          <Info className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <div className="space-y-1 text-xs">
          {RISK_ORDER.map((risk) => (
            <div key={risk} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                  style={{ backgroundColor: RISK_COLORS[risk] }}
                  aria-hidden="true"
                />
                <span className="text-slate-700 font-medium text-[11px]">
                  {RISK_LABELS[risk]}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                {risk === 'no_travel' ? 'Hazardous' : risk === 'severe' ? 'Major Alert' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 0-48 Hour Weather Forecast Time Slider Bar */}
      <div className="absolute bottom-3 left-3 right-3 sm:left-4 sm:right-4 z-10">
        <TimeSliderBar
          startTimeIso={heatmapData?.start_time || departureTimeIso || ''}
          hours={heatmapData?.hours ?? 48}
          sliderHour={sliderHour}
          onHourChange={onHourChange}
          isPlaying={isPlaying}
          onTogglePlay={onTogglePlay}
          showHeatmap={showHeatmap}
          onToggleHeatmap={onToggleHeatmap}
          isLoading={isHeatmapLoading}
          error={heatmapError}
        />
      </div>
    </div>
  );
};
