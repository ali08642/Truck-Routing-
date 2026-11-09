import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { HeatmapResponse } from '../types';
import { RISK_COLORS, RISK_LABELS, getRiskBadgeStyle, getRiskFromCode } from '../utils/risk';
import { formatSliderTime } from '../utils/format';

interface WeatherHeatmapLayerProps {
  heatmapData: HeatmapResponse | null;
  sliderHour: number;
  showHeatmap: boolean;
}

function getCellTooltipHtml(
  cellIndex: number,
  hour: number,
  data: HeatmapResponse
): string {
  const riskCode = data.risk[hour]?.[cellIndex] ?? 0;
  const riskType = getRiskFromCode(riskCode);
  const riskLabel = RISK_LABELS[riskType];
  const badgeStyle = getRiskBadgeStyle(riskType);
  const wind = data.wind_mph[hour]?.[cellIndex] ?? 0;
  const rain = data.rain_in_hr[hour]?.[cellIndex] ?? 0;
  const snow = data.snow_in_hr[hour]?.[cellIndex] ?? 0;
  const timeLabel = formatSliderTime(data.start_time, hour);

  return `
    <div style="font-family: inherit; font-size: 11px; padding: 4px 6px; min-width: 140px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:8px;">
        <span style="font-weight:600; color:#0f172a;">${timeLabel}</span>
        <span style="background:${badgeStyle.background}; color:${badgeStyle.color}; border:1px solid ${badgeStyle.border}; font-size:10px; font-weight:700; padding:1px 4px; border-radius:3px; text-transform:uppercase;">
          ${riskLabel}
        </span>
      </div>
      <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 4px; text-align: center; font-size: 10px; border-top: 1px solid #e2e8f0; padding-top: 4px;">
        <div><span style="color:#64748b; display:block;">Wind</span><strong style="color:#0f172a;">${wind} mph</strong></div>
        <div><span style="color:#64748b; display:block;">Rain</span><strong style="color:#0f172a;">${rain} in/h</strong></div>
        <div><span style="color:#64748b; display:block;">Snow</span><strong style="color:#0f172a;">${snow} in/h</strong></div>
      </div>
    </div>
  `;
}

export const WeatherHeatmapLayer: React.FC<WeatherHeatmapLayerProps> = ({
  heatmapData,
  sliderHour,
  showHeatmap,
}) => {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const rectanglesRef = useRef<L.Rectangle[]>([]);
  const rafIdRef = useRef<number | null>(null);

  // Keep references to current hour and data so tooltips always pull latest values
  const currentHourRef = useRef<number>(sliderHour);
  const heatmapDataRef = useRef<HeatmapResponse | null>(heatmapData);

  useEffect(() => {
    currentHourRef.current = sliderHour;
  }, [sliderHour]);

  useEffect(() => {
    heatmapDataRef.current = heatmapData;
  }, [heatmapData]);

  // Ensure custom pane with zIndex 350 exists strictly BELOW route overlays (zIndex 400)
  useEffect(() => {
    if (!map.getPane('heatmapPane')) {
      const pane = map.createPane('heatmapPane');
      pane.style.zIndex = '350';
      pane.style.pointerEvents = 'auto';
    }
  }, [map]);

  // 1. CREATE RECTANGLES ONCE when heatmapData changes
  useEffect(() => {
    if (!heatmapData || !heatmapData.cells || heatmapData.cells.length === 0) {
      if (layerGroupRef.current) {
        map.removeLayer(layerGroupRef.current);
        layerGroupRef.current = null;
      }
      rectanglesRef.current = [];
      return;
    }

    // Clean up previous layers
    if (layerGroupRef.current) {
      map.removeLayer(layerGroupRef.current);
    }

    const group = L.layerGroup([], { pane: 'heatmapPane' });
    const canvasRenderer = L.canvas({ pane: 'heatmapPane' });
    const rects: L.Rectangle[] = [];

    const halfLat = heatmapData.cell_size.lat / 2;
    const halfLon = heatmapData.cell_size.lon / 2;
    const initialHour = currentHourRef.current;

    for (let i = 0; i < heatmapData.cells.length; i++) {
      const [cLat, cLon] = heatmapData.cells[i];
      const bounds: L.LatLngBoundsExpression = [
        [cLat - halfLat, cLon - halfLon],
        [cLat + halfLat, cLon + halfLon],
      ];

      const riskCode = heatmapData.risk[initialHour]?.[i] ?? 0;
      const riskType = getRiskFromCode(riskCode);
      const fillColor = RISK_COLORS[riskType];
      const fillOpacity = showHeatmap ? (riskCode === 0 ? 0.10 : 0.45) : 0;

      const rect = L.rectangle(bounds, {
        pane: 'heatmapPane',
        renderer: canvasRenderer,
        stroke: false,
        fillColor,
        fillOpacity,
        interactive: true,
      });

      // Hovering a cell displays contextual weather and risk metrics at the active hour
      rect.bindTooltip(
        () => {
          if (!heatmapDataRef.current) return '';
          return getCellTooltipHtml(i, currentHourRef.current, heatmapDataRef.current);
        },
        {
          sticky: true,
          direction: 'auto',
          opacity: 0.98,
          className: 'leaflet-popup-content-wrapper',
        }
      );

      rects.push(rect);
      group.addLayer(rect);
    }

    group.addTo(map);
    layerGroupRef.current = group;
    rectanglesRef.current = rects;

    return () => {
      if (group) {
        map.removeLayer(group);
      }
      rectanglesRef.current = [];
      layerGroupRef.current = null;
    };
  }, [map, heatmapData]);

  // 2. ON SLIDER CHANGE: Only call setStyle for the current frame, throttled with requestAnimationFrame
  useEffect(() => {
    if (!heatmapData || rectanglesRef.current.length === 0) return;

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }

    rafIdRef.current = requestAnimationFrame(() => {
      const rects = rectanglesRef.current;
      const data = heatmapDataRef.current;
      if (!rects || !data) return;

      const currentHour = currentHourRef.current;

      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        if (!showHeatmap) {
          rect.setStyle({ fillOpacity: 0 });
        } else {
          const riskCode = data.risk[currentHour]?.[i] ?? 0;
          const riskType = getRiskFromCode(riskCode);
          const fillColor = RISK_COLORS[riskType];
          const fillOpacity = riskCode === 0 ? 0.10 : 0.45;

          rect.setStyle({
            fillColor,
            fillOpacity,
          });
        }

        // Live update tooltip if currently hovered
        if (rect.isTooltipOpen && rect.isTooltipOpen()) {
          rect.setTooltipContent(getCellTooltipHtml(i, currentHour, data));
        }
      }
    });

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [sliderHour, showHeatmap, heatmapData]);

  return null;
};
