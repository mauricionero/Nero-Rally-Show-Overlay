import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind
} from 'lucide-react';
import { getLedLoadColor } from '../utils/ledLoadColors.js';

const WEATHER_REFRESH_MS = 5 * 60 * 1000;
const POSITION_STATUS_REFRESH_MS = 30 * 1000;
const MAP_VIEWPORT_MARGIN_RATIO = 0.32;
const weatherCache = new Map();

const buildProjectionBounds = (coordinateGroups = []) => {
  const points = coordinateGroups.flat().filter((point) => (
    Number.isFinite(point?.lat) && Number.isFinite(point?.lng)
  ));

  if (points.length === 0) {
    return null;
  }

  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));

  const rawLatSpan = Math.max(maxLat - minLat, 0.000001);
  const rawLngSpan = Math.max(maxLng - minLng, 0.000001);
  const latMargin = rawLatSpan * MAP_VIEWPORT_MARGIN_RATIO;
  const lngMargin = rawLngSpan * MAP_VIEWPORT_MARGIN_RATIO;
  const expandedMinLat = minLat - latMargin;
  const expandedMaxLat = maxLat + latMargin;
  const expandedMinLng = minLng - lngMargin;
  const expandedMaxLng = maxLng + lngMargin;
  const latSpan = Math.max(expandedMaxLat - expandedMinLat, 0.000001);
  const lngSpan = Math.max(expandedMaxLng - expandedMinLng, 0.000001);
  const padding = 110;
  const width = 1000 - (padding * 2);
  const height = 1000 - (padding * 2);

  return {
    minLat: expandedMinLat,
    maxLat: expandedMaxLat,
    minLng: expandedMinLng,
    maxLng: expandedMaxLng,
    latSpan,
    lngSpan,
    padding,
    width,
    height
  };
};

const normalizeCoordinateGroups = (coordinateGroups = [], bounds = null) => {
  if (!bounds) {
    return { groups: [], geometryType: null, bounds: null };
  }

  const groups = coordinateGroups.map((group) => group
    .filter((point) => Number.isFinite(point?.lat) && Number.isFinite(point?.lng))
    .map((point) => {
      const x = bounds.padding + (((point.lng - bounds.minLng) / bounds.lngSpan) * bounds.width);
      const y = bounds.padding + (((bounds.maxLat - point.lat) / bounds.latSpan) * bounds.height);
      return {
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2))
      };
    })
    .filter(Boolean)
  ).filter((group) => group.length > 0);

  return {
    groups,
    bounds
  };
};

const clampZoom = (value) => Math.min(6, Math.max(0.75, value));

const getWeatherIconComponent = (weatherCode = 0) => {
  if (weatherCode === 0) return Sun;
  if ([1, 2].includes(weatherCode)) return CloudSun;
  if (weatherCode === 3) return Cloud;
  if ([45, 48].includes(weatherCode)) return CloudFog;
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return CloudDrizzle;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(weatherCode)) return CloudRain;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return CloudSnow;
  if ([95, 96, 99].includes(weatherCode)) return CloudLightning;
  return Cloud;
};

const getWeatherCacheKey = (lat, lng) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

const normalizeWeatherPoint = ({ temperature, weatherCode, windSpeed }) => ({
  temperature: Number.isFinite(temperature) ? temperature : null,
  weatherCode: Number.isFinite(weatherCode) ? weatherCode : 0,
  windSpeed: Number.isFinite(windSpeed) ? windSpeed : null
});

const fetchWeatherSnapshot = async (lat, lng) => {
  const cacheKey = getWeatherCacheKey(lat, lng);
  const cached = weatherCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,wind_speed_10m');
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('forecast_days', '1');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const data = await response.json();
  const current = data?.current;
  const hourly = data?.hourly;
  const hourlyTimes = Array.isArray(hourly?.time) ? hourly.time : [];
  const currentTimeMs = current?.time ? Date.parse(current.time) : Date.now();
  const nextHourIndex = hourlyTimes.findIndex((timeValue) => Date.parse(timeValue) > currentTimeMs);
  const nextHour = nextHourIndex >= 0 ? normalizeWeatherPoint({
    temperature: hourly?.temperature_2m?.[nextHourIndex],
    weatherCode: hourly?.weather_code?.[nextHourIndex],
    windSpeed: hourly?.wind_speed_10m?.[nextHourIndex]
  }) : null;
  const normalized = current ? {
    ...normalizeWeatherPoint({
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      windSpeed: current.wind_speed_10m
    }),
    nextHour
  } : null;

  if (normalized) {
    weatherCache.set(cacheKey, {
      data: normalized,
      expiresAt: Date.now() + WEATHER_REFRESH_MS
    });
  }

  return normalized;
};

const StartMarker = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    <path d="M 0 -26 H 16 V -12 H 0 Z" fill="#ffcc00" />
    <path d="M 0 0 L 0 -26" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
  </g>
);

const FinishMarker = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    <path d="M 0 -26 H 16 V -12 H 0 Z" fill="#ffffff" />
    <path d="M 9 -25 H 15 V -19 H 9 Z" fill="#0A0A0A" />
    <path d="M 2 -19 H 8 V -13 H 2 Z" fill="#0A0A0A" />
    <path d="M 0 0 L 0 -26" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
  </g>
);

const getMarkerFreshness = (lastUpdatedAt, now) => {
  if (!lastUpdatedAt) {
    return 'stale';
  }

  const ageMs = Math.max(0, now - lastUpdatedAt);

  if (ageMs >= 2 * 60 * 1000) {
    return 'stale';
  }

  if (ageMs >= 60 * 1000) {
    return 'aging';
  }

  return 'fresh';
};

const getMarkerAgeLevel = (lastUpdatedAt, now) => {
  if (!lastUpdatedAt) {
    return 10;
  }

  const ageMs = Math.max(0, now - lastUpdatedAt);

  if (ageMs >= 2 * 60 * 1000) {
    return 10;
  }

  const ratio = ageMs / (2 * 60 * 1000);
  return Math.max(0, Math.min(10, Math.round(ratio * 10)));
};

const getMarkerStyle = (freshness, color, lastUpdatedAt, now) => {
  if (freshness === 'stale') {
    return {
      borderColor: '#71717A',
      fillColor: 'rgba(39,39,42,0.92)',
      textColor: '#D4D4D8',
      opacity: 0.72,
      filter: 'grayscale(1)'
    };
  }

  const ageLevel = getMarkerAgeLevel(lastUpdatedAt, now);
  const freshnessColor = getLedLoadColor(ageLevel) || color;

  if (freshness === 'aging') {
    return {
      borderColor: freshnessColor,
      fillColor: hexToRgba(freshnessColor, 0.9),
      textColor: '#FFFFFF',
      opacity: 0.88,
      filter: 'saturate(0.65)'
    };
  }

  return {
    borderColor: freshnessColor,
    fillColor: hexToRgba(freshnessColor, 0.95),
    textColor: '#FFFFFF',
    opacity: 1,
    filter: 'none'
  };
};

const hexToRgba = (hexColor, alpha = 1) => {
  const normalized = String(hexColor || '').replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(255, 255, 255, ${alpha})`;
  }

  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const getMarkerPopoverScale = (zoom) => clampValue(1 / zoom, 0.7, 1.35);

const getMarkerPopoverLayout = (marker, scale = 1) => {
  const width = Math.round(312 * scale);
  const height = Math.round(176 * scale);
  const offsetX = Math.round(48 * scale);
  const offsetY = Math.round(40 * scale);
  const prefersRight = marker.x < 700;
  const rawX = prefersRight ? marker.x + offsetX : marker.x - width - offsetX;
  const rawY = marker.y - (height / 2);
  const x = clampValue(rawX, 20, 1000 - width - 20);
  const y = clampValue(rawY, 20, 1000 - height - 20);

  return {
    x,
    y,
    width,
    height,
    side: prefersRight && x === rawX ? 'right' : 'left'
  };
};

const resizeMarkerPopoverLayoutFromCenter = (layout, scale = 1) => {
  if (!layout) {
    return null;
  }

  const width = Math.round(312 * scale);
  const height = Math.round(176 * scale);
  const centerX = layout.x + (layout.width / 2);
  const centerY = layout.y + (layout.height / 2);

  return {
    ...layout,
    x: clampValue(centerX - (width / 2), 20, 1000 - width - 20),
    y: clampValue(centerY - (height / 2), 20, 1000 - height - 20),
    width,
    height
  };
};

const MapMarkerPopoverShell = ({
  marker,
  layoutOverride = null,
  anchorMarker = null,
  locked = false,
  dragging = false,
  scale = 1,
  onDragStart = null,
  children
}) => {
  if (!marker) {
    return null;
  }

  const layout = layoutOverride || getMarkerPopoverLayout(marker, scale);
  const anchor = anchorMarker || marker;
  const anchorX = anchor.x - layout.x;
  const anchorY = anchor.y - layout.y;

  return (
    <g
      transform={`translate(${layout.x}, ${layout.y})`}
      style={{ cursor: locked ? (dragging ? 'grabbing' : 'grab') : 'default', pointerEvents: 'all' }}
      onMouseDown={(event) => {
        event.stopPropagation();
        onDragStart?.(event, layout);
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {locked ? (
        <line
          x1={layout.width / 2}
          y1={layout.height / 2}
          x2={anchorX}
          y2={anchorY}
          stroke="#FFF"
          strokeWidth="3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d={layout.side === 'right'
            ? 'M 26 94 L 0 106 L 26 118'
            : `M ${layout.width - 26} 94 L ${layout.width} 106 L ${layout.width - 26} 118`}
          fill="rgba(9,9,11,0.92)"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="2"
        />
      )}
      <rect
        x="0"
        y="0"
        width={layout.width}
        height={layout.height}
        rx="24"
        fill="rgba(7,7,9,0.94)"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth="2.5"
      />
      {typeof children === 'function' ? children({ layout, scale }) : children}
    </g>
  );
};

const getProjectedPoint = (lat, lng, bounds) => {
  const rawX = bounds.padding + (((lng - bounds.minLng) / bounds.lngSpan) * bounds.width);
  const rawY = bounds.padding + (((bounds.maxLat - lat) / bounds.latSpan) * bounds.height);
  const x = Math.min(1000 - bounds.padding, Math.max(bounds.padding, rawX));
  const y = Math.min(1000 - bounds.padding, Math.max(bounds.padding, rawY));
  const overflow = Math.abs(rawX - x) + Math.abs(rawY - y);

  return {
    rawX,
    rawY,
    x,
    y,
    overflow
  };
};

const projectMarkerToBounds = (marker, bounds) => {
  if (!bounds) {
    return null;
  }

  const projected = getProjectedPoint(marker.lat, marker.lng, bounds);
  const swappedProjected = (
    Number.isFinite(marker.lng) &&
    Number.isFinite(marker.lat) &&
    Math.abs(marker.lng) <= 90 &&
    Math.abs(marker.lat) <= 180
  )
    ? getProjectedPoint(marker.lng, marker.lat, bounds)
    : null;
  const bestProjection = swappedProjected && swappedProjected.overflow < projected.overflow
    ? swappedProjected
    : projected;

  return {
    ...marker,
    x: Number(bestProjection.x.toFixed(2)),
    y: Number(bestProjection.y.toFixed(2))
  };
};

const spreadProjectedMarkers = (markers = []) => {
  const markersBySlot = new Map();

  markers.forEach((marker) => {
    const slotKey = `${Math.round(marker.x / 18)}:${Math.round(marker.y / 18)}`;
    const existing = markersBySlot.get(slotKey) || [];
    markersBySlot.set(slotKey, [...existing, marker]);
  });

  const spreadMarkers = [];

  markersBySlot.forEach((slotMarkers) => {
    if (slotMarkers.length === 1) {
      spreadMarkers.push(slotMarkers[0]);
      return;
    }

    const radius = 22;
    const stableSlotMarkers = [...slotMarkers].sort((left, right) => (
      String(left.id).localeCompare(String(right.id))
    ));

    stableSlotMarkers.forEach((marker, index) => {
      const angle = ((Math.PI * 2) / stableSlotMarkers.length) * index;
      spreadMarkers.push({
        ...marker,
        x: Number((marker.x + (Math.cos(angle) * radius)).toFixed(2)),
        y: Number((marker.y + (Math.sin(angle) * radius)).toFixed(2))
      });
    });
  });

  return spreadMarkers.sort((left, right) => {
    const leftUpdatedAt = Number(left.lastUpdatedAt || 0);
    const rightUpdatedAt = Number(right.lastUpdatedAt || 0);

    if (leftUpdatedAt !== rightUpdatedAt) {
      return leftUpdatedAt - rightUpdatedAt;
    }

    return String(left.id).localeCompare(String(right.id));
  });
};

const getGpsPrecisionRadius = (marker, bounds) => {
  const precisionMeters = Number(marker?.gpsPrecision);
  if (!Number.isFinite(precisionMeters) || precisionMeters <= 0 || !bounds) {
    return 0;
  }

  const cappedPrecisionMeters = Math.min(precisionMeters, 50);

  const latRadians = (Number(marker.lat) || 0) * (Math.PI / 180);
  const metersPerDegreeLat = 111_320;
  const metersPerDegreeLng = 111_320 * Math.cos(latRadians);
  const metersPerSvgX = metersPerDegreeLng / (bounds.width / Math.max(bounds.lngSpan, 0.000001));
  const metersPerSvgY = metersPerDegreeLat / (bounds.height / Math.max(bounds.latSpan, 0.000001));
  const metersPerSvgUnit = (metersPerSvgX + metersPerSvgY) / 2;

  if (!Number.isFinite(metersPerSvgUnit) || metersPerSvgUnit <= 0) {
    return 0;
  }

  return Math.max(0, cappedPrecisionMeters / metersPerSvgUnit);
};

const PilotPositionMarker = ({ marker, bounds, now, onHover, onBlur, onClick, hidden = false }) => {
  const freshness = getMarkerFreshness(marker.lastUpdatedAt, now);
  const style = getMarkerStyle(freshness, marker.color, marker.lastUpdatedAt, now);
  const auraRadius = getGpsPrecisionRadius(marker, bounds);
  const auraVisible = auraRadius > 0;
  const badgeRadius = 18;
  const poleLength = 28;
  const displayCarNumber = String(marker.carNumber || '').trim();
  const displayInitials = String(marker.initials || '').trim();
  const displayPicture = String(marker.picture || '').trim();
  const showImage = !displayCarNumber && Boolean(displayPicture);
  const showInitials = !displayCarNumber && !displayPicture;
  const clipId = `pilot-marker-avatar-${String(marker.id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <g
      transform={`translate(${marker.x}, ${marker.y})`}
      opacity={style.opacity}
      style={{ filter: style.filter, cursor: 'pointer' }}
      onMouseEnter={() => onHover?.(marker)}
      onMouseLeave={() => onBlur?.()}
      onFocus={() => onHover?.(marker)}
      onBlurCapture={() => onBlur?.()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(marker);
      }}
      tabIndex={0}
      role="button"
      aria-label={`Pilot ${marker.carNumber || marker.label || ''}`.trim()}
      >
      {!hidden && auraVisible && (
        <circle
          r={Math.min(auraRadius, 12)}
          fill="rgba(59,130,246,0.16)"
          stroke="rgba(30,58,138,0.92)"
          strokeWidth="2.5"
        />
      )}
      {!hidden && (
        <>
          <path d={`M 0 0 L 0 -${poleLength}`} stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
          <g transform={`translate(0, -${poleLength + badgeRadius})`}>
            {showImage && (
              <defs>
                <clipPath id={clipId} clipPathUnits="objectBoundingBox">
                  <circle cx="0.5" cy="0.5" r="0.5" />
                </clipPath>
              </defs>
            )}
            <circle
              r={badgeRadius}
              fill="rgba(7,7,9,0.98)"
              stroke={style.borderColor}
              strokeWidth="3"
            />
            {showImage && (
              <image
                href={displayPicture}
                x={-badgeRadius + 2}
                y={-badgeRadius + 2}
                width={(badgeRadius - 2) * 2}
                height={(badgeRadius - 2) * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#${clipId})`}
              />
            )}
            {displayCarNumber && (
              <text
                x="0"
                y="8"
                textAnchor="middle"
                fontSize={displayCarNumber.length <= 2 ? 22 : 18}
                fontWeight="800"
                fill={style.textColor}
                style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.02em' }}
              >
                {displayCarNumber}
              </text>
            )}
            {showInitials && (
              <text
                x="0"
                y="6"
                textAnchor="middle"
                fontSize={displayInitials.length <= 2 ? 16 : 14}
                fontWeight="800"
                fill={style.textColor}
                style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.04em' }}
              >
                {displayInitials}
              </text>
            )}
          </g>
        </>
      )}
    </g>
  );
};

const PilotMarkerPopoverContent = ({ marker, layout, scale = 1 }) => {
  if (!marker) {
    return null;
  }

  const displayCarNumber = String(marker.carNumber || marker.label || '??').trim();
  const displaySpeed = Number.isFinite(marker.speed) ? Math.round(marker.speed) : null;
  const heading = Number.isFinite(marker.heading) ? marker.heading : null;
  const badgeFill = displayCarNumber ? '#FACC15' : '#52525B';
  const badgeTextFill = '#0A0A0B';
  const speedFill = displaySpeed !== null ? '#FFFFFF' : '#71717A';
  const needleColor = displaySpeed !== null || heading !== null ? '#EF4444' : '#71717A';
  const needleShadow = 'rgba(0,0,0,0.82)';
  const hasTelemetry = displaySpeed !== null || heading !== null;
  const badgeRadius = 34;
  const badgeFontSize = 32;
  const contentScale = scale;

  return (
    <g transform={`scale(${contentScale})`}>
      <g transform={`translate(${badgeRadius - 10} ${badgeRadius - 10})`}>
        <circle
          cx="0"
          cy="0"
          r={badgeRadius}
          fill={badgeFill}
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="2"
        />
        <text
          x="0"
          y="10"
          textAnchor="middle"
          fontSize={badgeFontSize}
          fontWeight="800"
          fill={badgeTextFill}
          style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.03em' }}
        >
          {displayCarNumber}
        </text>
      </g>

      <g transform={`translate(${(layout.width / contentScale) / 2} ${((layout.height / contentScale) / 2) + 2})`}>
        <circle r="68" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.16)" strokeWidth="2.5" />
        <circle r="50" fill="rgba(255,255,255,0.015)" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
        <g stroke={needleColor} strokeLinecap="round" opacity={hasTelemetry ? 0.8 : 0.42}>
          <line x1="0" y1="-60" x2="0" y2="-46" strokeWidth="3" />
          <line x1="60" y1="0" x2="46" y2="0" strokeWidth="3" />
          <line x1="0" y1="60" x2="0" y2="46" strokeWidth="3" />
          <line x1="-60" y1="0" x2="-46" y2="0" strokeWidth="3" />
          <line x1="42" y1="-42" x2="31" y2="-31" strokeWidth="2" />
          <line x1="42" y1="42" x2="31" y2="31" strokeWidth="2" />
          <line x1="-42" y1="42" x2="-31" y2="31" strokeWidth="2" />
          <line x1="-42" y1="-42" x2="-31" y2="-31" strokeWidth="2" />
        </g>
        <text x="0" y="-76" textAnchor="middle" fontSize="11" fontWeight="800" fill={needleColor} opacity={hasTelemetry ? 0.88 : 0.38} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em' }}>N</text>
        <text x="0" y="88" textAnchor="middle" fontSize="11" fontWeight="800" fill={needleColor} opacity={hasTelemetry ? 0.58 : 0.3} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em' }}>S</text>
        <text x="-84" y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill={needleColor} opacity={hasTelemetry ? 0.58 : 0.3} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em' }}>W</text>
        <text x="84" y="4" textAnchor="middle" fontSize="11" fontWeight="800" fill={needleColor} opacity={hasTelemetry ? 0.58 : 0.3} style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em' }}>E</text>
        <g transform={`rotate(${heading ?? 0})`}>
          <path
            d="M 0 0 L 9 -10 L 6 -10 L 6 -38 L 4 -58 L 2 -76 L 0 -94 L -2 -76 L -4 -58 L -6 -38 L -6 -10 L -9 -10 Z"
            fill={needleColor}
            opacity={hasTelemetry ? 0.95 : 0.45}
          />
        </g>
        <circle r="8" fill="rgba(7,7,9,0.98)" stroke={needleColor} strokeWidth="2" opacity={hasTelemetry ? 0.95 : 0.5} />
        {displaySpeed !== null && (
          <>
            <text
              x="0"
              y="20"
            textAnchor="middle"
              fontSize="60"
              fontWeight="800"
              fill={speedFill}
              stroke={needleShadow}
              strokeWidth="2"
              paintOrder="stroke"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.02em' }}
            >
              {displaySpeed}
            </text>
          </>
        )}
        {displaySpeed === null && (
          <text
            x="0"
            y="18"
            textAnchor="middle"
            fontSize="28"
            fontWeight="700"
            fill="#71717A"
            style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.04em' }}
            >
            --
          </text>
        )}
      </g>
    </g>
  );
};

const PilotMarkerPopover = ({
  marker,
  anchorMarker = null,
  layoutOverride = null,
  locked = false,
  dragging = false,
  scale = 1,
  onDragStart = null
}) => (
  <MapMarkerPopoverShell
    marker={marker}
    anchorMarker={anchorMarker}
    layoutOverride={layoutOverride}
    locked={locked}
    dragging={dragging}
    scale={scale}
    onDragStart={onDragStart}
  >
    {({ layout, scale: popoverScale }) => (
      <PilotMarkerPopoverContent marker={marker} layout={layout} scale={popoverScale} />
    )}
  </MapMarkerPopoverShell>
);

export const usePlacemarkWeather = (placemark) => {
  const [weather, setWeather] = useState(null);
  const firstGeoPoint = placemark?.coordinateGroups?.[0]?.[0] || null;

  useEffect(() => {
    if (!Number.isFinite(firstGeoPoint?.lat) || !Number.isFinite(firstGeoPoint?.lng)) {
      setWeather(null);
      return undefined;
    }

    let cancelled = false;

    const loadWeather = async () => {
      try {
        const nextWeather = await fetchWeatherSnapshot(firstGeoPoint.lat, firstGeoPoint.lng);
        if (!cancelled) {
          setWeather(nextWeather);
        }
      } catch (error) {
        if (!cancelled) {
          setWeather(null);
        }
      }
    };

    loadWeather();
    const interval = window.setInterval(loadWeather, WEATHER_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [firstGeoPoint?.lat, firstGeoPoint?.lng]);

  return weather;
};

export function MapWeatherBadges({ placemark, className = '' }) {
  const weather = usePlacemarkWeather(placemark);
  const WeatherIcon = getWeatherIconComponent(weather?.weatherCode);

  if (!weather) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Number.isFinite(weather.temperature) && (
        <div className="rounded bg-black/75 px-3 py-2 text-sm font-bold text-white flex items-center gap-2">
          <WeatherIcon className="w-4 h-4 text-[#FACC15]" />
          <span>{Math.round(weather.temperature)}°C</span>
        </div>
      )}
      {Number.isFinite(weather.windSpeed) && (
        <div className="rounded bg-black/75 px-3 py-2 text-sm font-bold text-white flex items-center gap-2">
          <Wind className="w-4 h-4 text-zinc-300" />
          <span>{Math.round(weather.windSpeed)} km/h</span>
        </div>
      )}
    </div>
  );
}

const WeatherReadingRow = ({
  label,
  reading,
  className = '',
  compact = false
}) => {
  if (!reading) {
    return null;
  }

  const WeatherIcon = getWeatherIconComponent(reading.weatherCode);

  return (
    <div className={`grid grid-cols-[3.2rem_minmax(0,1fr)] items-center gap-x-2 ${className}`.trim()}>
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
        {label}
      </span>
      <div className="flex items-center justify-end gap-1.5 rounded bg-black/75 px-2.5 py-1.5 text-white">
        <WeatherIcon className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} text-[#FACC15]`} />
        {Number.isFinite(reading.temperature) && (
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-bold`}>
            {Math.round(reading.temperature)}°C
          </span>
        )}
        {Number.isFinite(reading.windSpeed) && (
          <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-bold text-zinc-300`}>
            <Wind className="mr-1 inline h-3.5 w-3.5 text-zinc-400" />
            {Math.round(reading.windSpeed)}
          </span>
        )}
      </div>
    </div>
  );
};

export function PlacemarkWeatherNowNext({
  placemark,
  nowLabel = 'Now',
  nextHourLabel = 'In 1h',
  title = 'Weather',
  className = '',
  layout = 'stacked',
  compact = false,
  frame = 'card'
}) {
  const weather = usePlacemarkWeather(placemark);
  const WeatherIcon = getWeatherIconComponent(weather?.weatherCode);

  if (!weather) {
    return null;
  }

  const sharedRows = (
    <>
      <WeatherReadingRow
        label={nowLabel}
        reading={weather}
        compact={compact}
      />
      {weather.nextHour && (
        <WeatherReadingRow
          label={nextHourLabel}
          reading={weather.nextHour}
          compact={compact}
        />
      )}
    </>
  );

  if (layout === 'split') {
    if (frame === 'bare') {
      return (
        <div className={`flex items-start gap-3 ${className}`.trim()}>
          <div className="flex flex-none items-center gap-2 text-zinc-300">
            <WeatherIcon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-[#FACC15]`} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
              {title}
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            {sharedRows}
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-start gap-3 rounded border border-white/10 bg-black/35 px-2.5 py-2 ${className}`.trim()}>
        <div className="flex flex-none items-center gap-2 text-zinc-300">
          <WeatherIcon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-[#FACC15]`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            {title}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {sharedRows}
        </div>
      </div>
    );
  }

  if (layout === 'inline') {
    if (frame === 'bare') {
      return (
        <div className={`flex items-center gap-3 ${className}`.trim()}>
          {sharedRows}
        </div>
      );
    }

    return (
      <div className={`flex items-center gap-3 rounded border border-white/12 bg-black/85 px-3 py-2 backdrop-blur-sm ${className}`.trim()}>
        {sharedRows}
      </div>
    );
  }

  if (frame === 'bare') {
    return (
      <div className={className}>
        {sharedRows}
      </div>
    );
  }

  return (
    <div className={`rounded border border-white/10 bg-black/35 px-2.5 py-2 ${className}`.trim()}>
      <div className="space-y-2">
        {sharedRows}
      </div>
    </div>
  );
}

export function PlacemarkMapFeed({ placemark, pilotMarkers = [], className = '' }) {
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [markerNow, setMarkerNow] = useState(() => Date.now());
  const [hoveredMarkerId, setHoveredMarkerId] = useState(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState(null);
  const [selectedPopoverLayout, setSelectedPopoverLayout] = useState(null);
  const [isDraggingPopover, setIsDraggingPopover] = useState(false);
  const dragStateRef = useRef(null);
  const popoverDragRef = useRef(null);
  const selectedPopoverLayoutRef = useRef(null);
  const popoverCloseBlockedRef = useRef(false);
  const popoverScale = useMemo(() => getMarkerPopoverScale(zoom), [zoom]);
  const projectionBounds = useMemo(
    () => buildProjectionBounds(placemark?.coordinateGroups || []),
    [placemark]
  );
  const normalized = useMemo(
    () => normalizeCoordinateGroups(placemark?.coordinateGroups || [], projectionBounds),
    [placemark, projectionBounds]
  );
  const projectedPilotMarkers = useMemo(
    () => {
      const sortedMarkers = pilotMarkers
        .map((marker) => projectMarkerToBounds(marker, normalized.bounds))
        .filter(Boolean);

      return spreadProjectedMarkers(sortedMarkers);
    },
    [normalized.bounds, pilotMarkers]
  );
  const hoveredMarker = useMemo(
    () => projectedPilotMarkers.find((marker) => marker.id === hoveredMarkerId) || null,
    [hoveredMarkerId, projectedPilotMarkers]
  );
  const selectedMarker = useMemo(
    () => projectedPilotMarkers.find((marker) => marker.id === selectedMarkerId) || null,
    [projectedPilotMarkers, selectedMarkerId]
  );
  const activeMarker = hoveredMarker || selectedMarker;

  const handlePopoverDragStart = (event) => {
    if (!selectedMarker) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsDraggingPopover(true);
    popoverCloseBlockedRef.current = false;
    const fallbackLayout = selectedPopoverLayoutRef.current || getMarkerPopoverLayout(selectedMarker, popoverScale);
    popoverDragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLayoutX: fallbackLayout.x,
      startLayoutY: fallbackLayout.y,
      width: fallbackLayout.width,
      height: fallbackLayout.height,
      side: fallbackLayout.side,
      moved: false
    };
  };

  useEffect(() => {
    selectedPopoverLayoutRef.current = selectedPopoverLayout;
  }, [selectedPopoverLayout]);

  useEffect(() => {
    if (!selectedMarkerId) {
      setSelectedPopoverLayout(null);
      selectedPopoverLayoutRef.current = null;
      popoverDragRef.current = null;
      setIsDraggingPopover(false);
      popoverCloseBlockedRef.current = false;
      return;
    }

    const nextLayout = selectedPopoverLayoutRef.current
      ? resizeMarkerPopoverLayoutFromCenter(selectedPopoverLayoutRef.current, popoverScale)
      : getMarkerPopoverLayout(selectedMarker, popoverScale);

    setSelectedPopoverLayout(nextLayout);
  }, [popoverScale, selectedMarker, selectedMarkerId]);

  useEffect(() => {
    if (!isDraggingPopover || !popoverDragRef.current) {
      return undefined;
    }

    const handleWindowMouseMove = (event) => {
      if (!popoverDragRef.current) {
        return;
      }

      const deltaX = event.clientX - popoverDragRef.current.startClientX;
      const deltaY = event.clientY - popoverDragRef.current.startClientY;
      const moved = Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2;

      if (moved) {
        popoverDragRef.current.moved = true;
        popoverCloseBlockedRef.current = true;
      }

      const svgRect = svgRef.current?.getBoundingClientRect();
      const renderedMapSize = svgRect ? Math.min(svgRect.width, svgRect.height) : 0;
      const unitsPerPixelX = renderedMapSize ? (1000 / renderedMapSize) : (1 / zoom);
      const unitsPerPixelY = renderedMapSize ? (1000 / renderedMapSize) : (1 / zoom);
      const nextX = popoverDragRef.current.startLayoutX + (deltaX * unitsPerPixelX);
      const nextY = popoverDragRef.current.startLayoutY + (deltaY * unitsPerPixelY);

      setSelectedPopoverLayout({
        x: nextX,
        y: nextY,
        width: popoverDragRef.current.width,
        height: popoverDragRef.current.height,
        side: popoverDragRef.current.side
      });
    };

    const handleWindowMouseUp = () => {
      popoverDragRef.current = null;
      setIsDraggingPopover(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDraggingPopover, zoom]);

  useEffect(() => {
    if (projectedPilotMarkers.length === 0) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setMarkerNow(Date.now());
    }, POSITION_STATUS_REFRESH_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [projectedPilotMarkers.length]);

  if (!placemark || normalized.groups.length === 0) {
    return (
      <div className={`w-full h-full bg-[#05070B] flex items-center justify-center ${className}`}>
        <span className="text-zinc-500 text-sm uppercase">Map Unavailable</span>
      </div>
    );
  }

  const isPolygon = placemark.geometryType === 'polygon';
  const isPoint = placemark.geometryType === 'point';
  const firstPoint = normalized.groups[0]?.[0] || null;
  const lastGroup = normalized.groups[normalized.groups.length - 1] || null;
  const lastPoint = lastGroup?.[lastGroup.length - 1] || null;

  return (
    <div
      className={`relative overflow-hidden bg-[#05070B] ${className}`}
      onWheel={(event) => {
        event.preventDefault();
        const zoomDelta = event.deltaY < 0 ? 0.15 : -0.15;
        setZoom((prev) => clampZoom(prev + zoomDelta));
      }}
      onMouseDown={(event) => {
        if (popoverDragRef.current) {
          return;
        }

        dragStateRef.current = {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
          moved: false
        };
      }}
      onMouseMove={(event) => {
        if (!dragStateRef.current) {
          return;
        }

        const deltaX = event.clientX - dragStateRef.current.startClientX;
        const deltaY = event.clientY - dragStateRef.current.startClientY;
        const moved = Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4;
        if (moved) {
          dragStateRef.current.moved = true;
        }
        setPan({
          x: dragStateRef.current.startPanX + deltaX,
          y: dragStateRef.current.startPanY + deltaY
        });
      }}
      onMouseUp={() => {
        if (dragStateRef.current) {
          dragStateRef.current.released = true;
        }
      }}
      onMouseLeave={() => {
        dragStateRef.current = null;
        popoverDragRef.current = null;
        setIsDraggingPopover(false);
      }}
      onClick={() => {
        const wasPopoverDragging = Boolean(popoverCloseBlockedRef.current);
        const wasDragging = Boolean(dragStateRef.current?.moved);

        if (!selectedMarkerId && !wasDragging && !wasPopoverDragging) {
          setHoveredMarkerId(null);
        } else if (!wasDragging && !wasPopoverDragging) {
          setSelectedMarkerId(null);
        }

        dragStateRef.current = null;
        popoverDragRef.current = null;
        setIsDraggingPopover(false);
        popoverCloseBlockedRef.current = false;
      }}
      style={{ cursor: dragStateRef.current || isDraggingPopover ? 'grabbing' : 'grab' }}
    >
      <div className="absolute inset-0 opacity-70" style={{
        backgroundImage: 'radial-gradient(circle at top left, rgba(255,69,0,0.18), transparent 35%), radial-gradient(circle at bottom right, rgba(234,179,8,0.14), transparent 30%)'
      }} />
      <svg
        ref={svgRef}
        viewBox="0 0 1000 1000"
        className="absolute inset-0 w-full h-full transition-transform duration-150 ease-out"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '50% 50%' }}
      >
        <defs>
          <pattern id="map-grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="1000" height="1000" fill="url(#map-grid)" />
        {normalized.groups.map((group, index) => {
          const points = group.map((point) => `${point.x},${point.y}`).join(' ');

          if (isPoint) {
            return group.map((point, pointIndex) => {
              return (
                <g key={`${index}-${pointIndex}`}>
                  <circle cx={point.x} cy={point.y} r="20" fill="rgba(255,69,0,0.2)" />
                  <circle cx={point.x} cy={point.y} r="8" fill="#FF4500" />
                </g>
              );
            });
          }

          if (isPolygon) {
          return (
            <polygon
              key={index}
              points={points}
              fill="rgba(255,69,0,0.14)"
              stroke="#FF4500"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          );
        }

          return (
            <polyline
              key={index}
              points={points}
              fill="none"
              stroke="#FF4500"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {firstPoint && <StartMarker x={firstPoint.x} y={firstPoint.y} />}
        {lastPoint && <FinishMarker x={lastPoint.x} y={lastPoint.y} />}
        {projectedPilotMarkers.map((marker) => (
          <PilotPositionMarker
            key={marker.id}
            marker={marker}
            bounds={normalized.bounds}
            now={markerNow}
            hidden={selectedMarkerId === marker.id}
            onHover={(nextMarker) => {
              if (!selectedMarkerId) {
                setHoveredMarkerId(nextMarker.id);
              }
            }}
            onBlur={() => {
              if (!selectedMarkerId) {
                setHoveredMarkerId((current) => (current === marker.id ? null : current));
              }
            }}
            onClick={(nextMarker) => {
              setSelectedMarkerId((current) => (current === nextMarker.id ? null : nextMarker.id));
              setHoveredMarkerId(null);
              setSelectedPopoverLayout(null);
            }}
          />
        ))}
        {activeMarker && (
          <PilotMarkerPopover
            marker={activeMarker}
            anchorMarker={selectedMarker || activeMarker}
            layoutOverride={selectedMarker ? selectedPopoverLayout : null}
            locked={Boolean(selectedMarker)}
            dragging={isDraggingPopover}
            scale={popoverScale}
            onDragStart={handlePopoverDragStart}
          />
        )}
      </svg>
    </div>
  );
}
