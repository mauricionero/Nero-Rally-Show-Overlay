export const PILOT_G_FORCE_FIELD_KEYS = [
  'gForce',
  'gforce',
  'gForceTotal',
  'totalG',
  'accelerationG',
  'longitudinalG',
  'longitudinalForce',
  'accelerationX',
  'lateralG',
  'lateralForce',
  'accelerationY',
  'verticalG',
  'verticalForce',
  'accelerationZ'
];

export const PILOT_TELEMETRY_FIELD_KEYS = [
  'latlongTimestamp',
  'lastLatLongUpdatedAt',
  'lastTelemetryAt',
  'source',
  'speed',
  'heading',
  'gpsPrecision',
  'connectionStrength',
  'connectionType',
  'gForce',
  'rpmPercentage',
  'rpmReal',
  'gear',
  'distance',
  'distanceDrivenLap',
  'distanceDrivenOverall',
  'longitudinalG',
  'lateralG',
  'posX',
  'posY',
  'posZ'
];

export const toFiniteTelemetryNumber = (value) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

export const normalizePilotTelemetryTimestamp = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue;
  }

  const parsedValue = Date.parse(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export const getPilotTelemetryLatestTimestamp = (telemetry = {}) => {
  const candidates = [
    telemetry.lastTelemetryAt,
    telemetry.lastLatLongUpdatedAt,
    telemetry.latlongTimestamp
  ]
    .map(normalizePilotTelemetryTimestamp)
    .filter((value) => value !== null);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
};

export const isPilotTelemetryFresh = (telemetry = {}, now = Date.now(), maxAgeMs = 10000) => {
  const latestTimestamp = getPilotTelemetryLatestTimestamp(telemetry);
  if (latestTimestamp === null) {
    return false;
  }

  const nowTimestamp = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowTimestamp)) {
    return false;
  }

  return (nowTimestamp - latestTimestamp) < maxAgeMs;
};

export const getPilotTelemetryGForce = (telemetry = {}) => {
  const directCandidates = [
    telemetry.gForce,
    telemetry.gforce,
    telemetry.gForceTotal,
    telemetry.totalG,
    telemetry.accelerationG
  ];

  for (const candidate of directCandidates) {
    const numericValue = toFiniteTelemetryNumber(candidate);
    if (numericValue !== null) {
      return numericValue;
    }
  }

  const longitudinal = toFiniteTelemetryNumber(
    telemetry.longitudinalG
    ?? telemetry.longitudinalForce
    ?? telemetry.accelerationX
  );
  const lateral = toFiniteTelemetryNumber(
    telemetry.lateralG
    ?? telemetry.lateralForce
    ?? telemetry.accelerationY
  );
  const vertical = toFiniteTelemetryNumber(
    telemetry.verticalG
    ?? telemetry.verticalForce
    ?? telemetry.accelerationZ
  );

  if (longitudinal === null && lateral === null && vertical === null) {
    return null;
  }

  const x = longitudinal || 0;
  const y = lateral || 0;
  const z = vertical || 0;
  return Math.sqrt((x * x) + (y * y) + (z * z));
};

export const getPilotTelemetryGForceColor = (gForceValue, baseColor = '#FFFFFF') => {
  const gForce = typeof gForceValue === 'object'
    ? getPilotTelemetryGForce(gForceValue)
    : toFiniteTelemetryNumber(gForceValue);

  if (gForce === null || gForce < 1) {
    return baseColor;
  }

  if (gForce <= 3) {
    return '#FACC15';
  }

  if (gForce <= 4.5) {
    return '#FB923C';
  }

  return '#EF4444';
};

export const assignPilotTelemetryGForceFields = (target = {}, telemetry = {}) => {
  PILOT_G_FORCE_FIELD_KEYS.forEach((fieldKey) => {
    if (telemetry[fieldKey] !== undefined) {
      target[fieldKey] = telemetry[fieldKey];
    }
  });

  return target;
};

export const assignPilotTelemetryFields = (target = {}, telemetry = {}) => {
  PILOT_TELEMETRY_FIELD_KEYS.forEach((fieldKey) => {
    if (telemetry[fieldKey] !== undefined) {
      target[fieldKey] = telemetry[fieldKey];
    }
  });

  return target;
};
