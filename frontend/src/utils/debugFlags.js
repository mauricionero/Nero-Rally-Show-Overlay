export const DEBUG_FLAGS_STORAGE_KEY = 'rally_debug_flags';

export const DEFAULT_DEBUG_FLAGS = {
  sync: false,
  transport: false,
  telemetry: false,
  connection: false,
  outbound: false,
  heartbeat: false
};

const normalizeDebugFlags = (value = {}) => ({
  sync: value?.sync === true,
  transport: value?.transport === true,
  telemetry: value?.telemetry === true,
  connection: value?.connection === true,
  outbound: value?.outbound === true,
  heartbeat: value?.heartbeat === true
});

export const applyDebugFlagsToWindow = (value = {}) => {
  const nextFlags = normalizeDebugFlags(value);

  if (typeof window !== 'undefined') {
    window.__RALLY_DEBUG_FLAGS__ = nextFlags;
    window.__RALLY_SYNC_DEBUG__ = nextFlags.sync;
    window.__RALLY_TRANSPORT_DEBUG__ = nextFlags.transport;
    window.__RALLY_TELEMETRY_DEBUG__ = nextFlags.telemetry;
    window.__RALLY_CONNECTION_DEBUG__ = nextFlags.connection;
    window.__RALLY_OUTBOUND_DEBUG__ = nextFlags.outbound;
    window.__RALLY_HEARTBEAT_DEBUG__ = nextFlags.heartbeat;
  }

  return nextFlags;
};

export const loadDebugFlags = () => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_DEBUG_FLAGS };
  }

  if (window.__RALLY_DEBUG_FLAGS__) {
    return normalizeDebugFlags(window.__RALLY_DEBUG_FLAGS__);
  }

  try {
    const raw = window.localStorage.getItem(DEBUG_FLAGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : DEFAULT_DEBUG_FLAGS;
    return applyDebugFlagsToWindow(parsed);
  } catch (error) {
    return applyDebugFlagsToWindow(DEFAULT_DEBUG_FLAGS);
  }
};

export const saveDebugFlags = (value = {}) => {
  const nextFlags = applyDebugFlagsToWindow(value);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(DEBUG_FLAGS_STORAGE_KEY, JSON.stringify(nextFlags));
    } catch (error) {
      // Ignore debug flag persistence failures.
    }
  }

  return nextFlags;
};

export const getDebugFlags = () => loadDebugFlags();

export const isSyncDebugEnabled = () => getDebugFlags().sync === true;

export const isTransportDebugEnabled = () => getDebugFlags().transport === true;

export const isTelemetryDebugEnabled = () => getDebugFlags().telemetry === true;

export const isConnectionDebugEnabled = () => getDebugFlags().connection === true;

export const isOutboundDebugEnabled = () => getDebugFlags().outbound === true;

export const isHeartbeatDebugEnabled = () => getDebugFlags().heartbeat === true;
