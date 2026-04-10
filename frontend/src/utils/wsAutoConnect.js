const MANUAL_DISCONNECT_SUPPRESSION_MS = 15 * 1000;
let manualDisconnectMarker = null;

export const shouldSuppressManualWsReconnect = (channelKey) => {
  const normalizedChannelKey = String(channelKey || '').trim();
  if (!normalizedChannelKey) {
    return false;
  }

  if (!manualDisconnectMarker || manualDisconnectMarker.channelKey !== normalizedChannelKey || !manualDisconnectMarker.timestamp) {
    return false;
  }

  return (Date.now() - manualDisconnectMarker.timestamp) < MANUAL_DISCONNECT_SUPPRESSION_MS;
};

export const markManualWsDisconnect = (channelKey) => {
  const normalizedChannelKey = String(channelKey || '').trim();
  if (!normalizedChannelKey) {
    return;
  }

  manualDisconnectMarker = {
    channelKey: normalizedChannelKey,
    timestamp: Date.now()
  };
};

export const clearManualWsDisconnect = (channelKey) => {
  const normalizedChannelKey = String(channelKey || '').trim();
  if (!manualDisconnectMarker) {
    return;
  }

  if (normalizedChannelKey && manualDisconnectMarker.channelKey !== normalizedChannelKey) {
    return;
  }

  manualDisconnectMarker = null;
};
