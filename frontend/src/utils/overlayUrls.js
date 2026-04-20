const getBasePath = () => process.env.PUBLIC_URL || '';

export const getLocalOverlayUrl = () => {
  return `${window.location.origin}${getBasePath()}/overlay`;
};

export const getWebSocketOverlayUrl = (channelKey) => {
  return `${getLocalOverlayUrl()}?ws=${encodeURIComponent(channelKey)}`;
};

export const getLocalTimesUrl = () => {
  return `${window.location.origin}${getBasePath()}/times`;
};

export const getWebSocketTimesUrl = (channelKey) => {
  return `${getLocalTimesUrl()}?ws=${encodeURIComponent(channelKey)}`;
};

export const getLocalPilotTelemetryUrl = () => {
  return `${window.location.origin}${getBasePath()}/pilot-telemetry`;
};

export const getWebSocketPilotTelemetryUrl = (channelKey, pilotId = '') => {
  const url = new URL(getLocalPilotTelemetryUrl());

  if (channelKey) {
    url.searchParams.set('ws', channelKey);
  }

  if (pilotId) {
    url.searchParams.set('pilotId', pilotId);
  }

  return url.toString();
};
