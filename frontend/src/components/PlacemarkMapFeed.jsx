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
  url.searchParams.set('temperature_unit', 'celsius');
  url.searchParams.set('wind_speed_unit', 'kmh');
  url.searchParams.set('forecast_days', '1');

  const response = await fetch(url.toString(), { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const data = await response.json();
  const current = data?.current;
  const normalized = current ? {
    temperature: Number.isFinite(current.temperature_2m) ? current.temperature_2m : null,
    weatherCode: Number.isFinite(current.weather_code) ? current.weather_code : 0,
    windSpeed: Number.isFinite(current.wind_speed_10m) ? current.wind_speed_10m : null
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
    <circle r="22" fill="rgba(255,69,0,0.22)" />
    <path d="M -5 -12 L 11 -7 L -5 -2 Z" fill="#FF4500" />
    <path d="M -7 -14 L -7 14" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
  </g>
);

const FinishMarker = ({ x, y }) => (
  <g transform={`translate(${x}, ${y})`}>
    <circle r="22" fill="rgba(255,255,255,0.12)" />
    <path d="M -8 -14 L -8 14" stroke="#FFF" strokeWidth="3" strokeLinecap="round" />
    <path
      d="M -8 -13 L 12 -10 L 12 10 L -8 13 Z"
      fill="#FFF"
      opacity="0.95"
    />
    <path d="M -2 -12 H 4 V -6 H -2 Z M 4 -6 H 10 V 0 H 4 Z M -2 0 H 4 V 6 H -2 Z M 4 6 H 10 V 12 H 4 Z" fill="#0A0A0A" />
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

const getMarkerStyle = (freshness, color) => {
  if (freshness === 'stale') {
    return {
      borderColor: '#71717A',
      fillColor: 'rgba(39,39,42,0.92)',
      textColor: '#D4D4D8',
      opacity: 0.72,
      filter: 'grayscale(1)'
    };
  }

  if (freshness === 'aging') {
    return {
      borderColor: color,
      fillColor: 'rgba(9,9,11,0.9)',
      textColor: '#FFFFFF',
      opacity: 0.88,
      filter: 'saturate(0.65)'
    };
  }

  return {
    borderColor: color,
    fillColor: 'rgba(9,9,11,0.95)',
    textColor: '#FFFFFF',
    opacity: 1,
    filter: 'none'
  };
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

const PilotPositionMarker = ({ marker, now }) => {
  const freshness = getMarkerFreshness(marker.lastUpdatedAt, now);
  const style = getMarkerStyle(freshness, marker.color);
  const labelLength = String(marker.label || '').trim().length;
  const fontSize = labelLength <= 2 ? 22 : 18;

  return (
    <g
      transform={`translate(${marker.x}, ${marker.y})`}
      opacity={style.opacity}
      style={{ filter: style.filter }}
    >
      <circle
        r="24"
        fill={style.fillColor}
        stroke={style.borderColor}
        strokeWidth="5"
      />
      <text
        x="0"
        y="7"
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight="700"
        fill={style.textColor}
        style={{ fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.02em' }}
      >
        {marker.label}
      </text>
    </g>
  );
};

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

export function PlacemarkMapFeed({ placemark, pilotMarkers = [], className = '' }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [markerNow, setMarkerNow] = useState(() => Date.now());
  const dragStateRef = useRef(null);
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
        dragStateRef.current = {
          startClientX: event.clientX,
          startClientY: event.clientY,
          startPanX: pan.x,
          startPanY: pan.y
        };
      }}
      onMouseMove={(event) => {
        if (!dragStateRef.current) {
          return;
        }

        const deltaX = event.clientX - dragStateRef.current.startClientX;
        const deltaY = event.clientY - dragStateRef.current.startClientY;
        setPan({
          x: dragStateRef.current.startPanX + deltaX,
          y: dragStateRef.current.startPanY + deltaY
        });
      }}
      onMouseUp={() => {
        dragStateRef.current = null;
      }}
      onMouseLeave={() => {
        dragStateRef.current = null;
      }}
      style={{ cursor: dragStateRef.current ? 'grabbing' : 'grab' }}
    >
      <div className="absolute inset-0 opacity-70" style={{
        backgroundImage: 'radial-gradient(circle at top left, rgba(255,69,0,0.18), transparent 35%), radial-gradient(circle at bottom right, rgba(234,179,8,0.14), transparent 30%)'
      }} />
      <svg
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
                strokeWidth="12"
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
              strokeWidth="12"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
        {firstPoint && <StartMarker x={firstPoint.x} y={firstPoint.y} />}
        {lastPoint && <FinishMarker x={lastPoint.x} y={lastPoint.y} />}
        {projectedPilotMarkers.map((marker) => (
          <PilotPositionMarker key={marker.id} marker={marker} now={markerNow} />
        ))}
      </svg>
    </div>
  );
}
