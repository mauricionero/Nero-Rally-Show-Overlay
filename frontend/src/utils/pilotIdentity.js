export const normalizePilotId = (value) => String(value ?? '').trim();

export const getPilotTelemetryForId = (telemetryByPilotId = {}, pilotId) => {
  const normalizedPilotId = normalizePilotId(pilotId);
  if (!normalizedPilotId) {
    return {};
  }

  return telemetryByPilotId?.[normalizedPilotId] || telemetryByPilotId?.[pilotId] || {};
};
