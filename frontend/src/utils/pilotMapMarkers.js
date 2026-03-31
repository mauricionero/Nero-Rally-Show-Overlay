import { getPilotTelemetryForId } from './pilotIdentity.js';

export const parseLatLongString = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return null;
  }

  const lat = Number(match[1]);
  const lng = Number(match[2]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null;
  }

  return { lat, lng };
};

export const normalizeLatLongString = (value) => {
  const parsed = parseLatLongString(value);
  if (!parsed) {
    return String(value || '').trim();
  }

  return `${parsed.lat.toFixed(6)}, ${parsed.lng.toFixed(6)}`;
};

export const getPilotMarkerLabel = (pilot) => {
  const carNumber = String(pilot?.carNumber || '').trim();
  if (carNumber) {
    return carNumber;
  }

  const baseName = String(pilot?.name || '').split('/')[0]?.trim() || '';
  const words = baseName.split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('');

  return initials || '??';
};

const toFiniteNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const buildPilotMapMarkers = (pilots = [], categories = [], pilotTelemetryByPilotId = {}) => {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const getTelemetryForPilot = typeof pilotTelemetryByPilotId === 'function'
    ? pilotTelemetryByPilotId
    : (pilotId) => getPilotTelemetryForId(pilotTelemetryByPilotId, pilotId);

  return pilots
    .map((pilot) => {
      const telemetry = getTelemetryForPilot(pilot.id);
      const coordinates = parseLatLongString(telemetry.latLong || pilot.latLong);
      if (!coordinates) {
        return null;
      }

      const category = categoryById.get(pilot.categoryId) || null;

      return {
        id: pilot.id,
        pilotId: pilot.id,
        name: pilot.name,
        carNumber: String(pilot?.carNumber || '').trim(),
        label: getPilotMarkerLabel(pilot),
        lat: coordinates.lat,
        lng: coordinates.lng,
        color: category?.color || '#FF4500',
        speed: toFiniteNumber(telemetry.speed),
        heading: toFiniteNumber(telemetry.heading),
        lastUpdatedAt: Number(
          telemetry.lastLatLongUpdatedAt
          || telemetry.latlongTimestamp
          || telemetry.lastTelemetryAt
          || pilot.lastLatLongUpdatedAt
          || 0
        ) || 0
      };
    })
    .filter(Boolean);
};
