const getBasePath = () => process.env.PUBLIC_URL || '';

export const resolvePublicAssetUrl = (assetUrl = '') => {
  const trimmed = String(assetUrl || '').trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (trimmed.startsWith('/')) {
    return `${getBasePath()}${trimmed}`;
  }

  return trimmed;
};

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

export const normalizeVdoStreamKey = (pilotId = '') => (
  String(pilotId || '')
    .trim()
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
);

export const getPilotVdoPushUrl = (pilotId = '') => {
  const streamKey = normalizeVdoStreamKey(pilotId);
  if (!streamKey) {
    return '';
  }

  const url = new URL('https://vdo.ninja/');
  url.searchParams.set('push', streamKey);
  url.searchParams.set('webcam', '1');
  url.searchParams.set('autostart', '1');
  url.searchParams.set('transparent', '1');
  return url.toString();
};

export const getPilotVdoViewUrl = (pilotId = '') => {
  const streamKey = normalizeVdoStreamKey(pilotId);
  if (!streamKey) {
    return '';
  }

  const url = new URL('https://vdo.ninja/');
  url.searchParams.set('view', streamKey);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('cleanoutput', '1');
  url.searchParams.set('cleanviewer', '1');
  url.searchParams.set('cover', '2');
  url.searchParams.set('nomouseevents', '1');
  url.searchParams.set('nocursor', '1');
  return url.toString();
};
