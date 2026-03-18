const getBasePath = () => process.env.PUBLIC_URL || '';

export const getLocalOverlayUrl = () => {
  return `${window.location.origin}${getBasePath()}/overlay`;
};

export const getWebSocketOverlayUrl = (channelKey) => {
  return `${getLocalOverlayUrl()}?ws=${encodeURIComponent(channelKey)}`;
};
