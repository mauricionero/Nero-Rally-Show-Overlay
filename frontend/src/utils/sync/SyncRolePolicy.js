/**
 * SyncRolePolicy centralizes role-based sync rules.
 *
 * Responsibilities:
 * - normalize role aliases coming from URLs, apps, and messages
 * - define which snapshot sections belong to each role profile
 * - define which timing sections a role may edit directly
 * - define which inbound domains a recipient accepts from each source role
 *
 * Keep transport details out of this file. It should only answer policy
 * questions such as "who can send/receive this?" or "which snapshot profile
 * should this role use?".
 */

export const SYNC_ROLES = {
  CLIENT: 'client',
  SETUP: 'setup',
  TIMES: 'times',
  OVERLAY: 'overlay',
  MOBILE: 'mobile'
};

export const SETUP_BASE_SECTION_KEYS = [
  'meta',
  'pilots',
  'categories',
  'stages',
  'mapPlacemarks',
  'cameras',
  'externalMedia',
  'streamConfigs'
];

export const TIMING_SECTION_KEYS = [
  'times',
  'arrivalTimes',
  'startTimes',
  'realStartTimes',
  'lapTimes',
  'positions',
  'stagePilots',
  'retiredStages',
  'stageAlerts',
  'stageSos'
];

export const SNAPSHOT_CORE_SECTION_KEYS = ['meta', 'pilots', 'categories', 'stages'];

export const TIMES_ROLE_TIMING_SECTION_KEYS = [
  'stages',
  'times',
  'arrivalTimes',
  'startTimes',
  'realStartTimes',
  'lapTimes',
  'stageSos'
];

export const MOBILE_TIMING_SNAPSHOT_SECTION_KEYS = [
  ...SNAPSHOT_CORE_SECTION_KEYS,
  'times',
  'arrivalTimes',
  'startTimes',
  'realStartTimes',
  'lapTimes',
  'positions',
  'stagePilots',
  'retiredStages',
  'stageAlerts',
  'stageSos'
];

export const ALL_SNAPSHOT_SECTION_KEYS = [
  ...SNAPSHOT_CORE_SECTION_KEYS,
  ...TIMING_SECTION_KEYS,
  'mapPlacemarks',
  'cameras',
  'externalMedia',
  'streamConfigs'
];

export const TIMES_ROLE_TIMING_SECTION_SET = new Set(TIMES_ROLE_TIMING_SECTION_KEYS);
export const SNAPSHOT_SECTION_SET = new Set(ALL_SNAPSHOT_SECTION_KEYS);
export const SETUP_BASE_SECTION_SET = new Set(SETUP_BASE_SECTION_KEYS);
export const TIMING_SECTION_SET = new Set(TIMING_SECTION_KEYS);
const TELEMETRY_DOMAINS = new Set(['pilotTelemetry']);

export const normalizeSyncRole = (value) => {
  const rawRole = String(value || '').trim().toLowerCase();
  const compactRole = rawRole.replace(/[^a-z0-9]/g, '');

  if (!rawRole) {
    return SYNC_ROLES.CLIENT;
  }

  if (rawRole === SYNC_ROLES.SETUP || compactRole === SYNC_ROLES.SETUP) {
    return SYNC_ROLES.SETUP;
  }

  if (rawRole === SYNC_ROLES.TIMES || compactRole === SYNC_ROLES.TIMES) {
    return SYNC_ROLES.TIMES;
  }

  if (rawRole === SYNC_ROLES.OVERLAY || compactRole === SYNC_ROLES.OVERLAY) {
    return SYNC_ROLES.OVERLAY;
  }

  if (
    rawRole === SYNC_ROLES.MOBILE
    || rawRole === 'android-app'
    || compactRole.includes('mobile')
    || compactRole.includes('android')
  ) {
    return SYNC_ROLES.MOBILE;
  }

  if (Object.values(SYNC_ROLES).includes(rawRole)) {
    return rawRole;
  }

  return SYNC_ROLES.CLIENT;
};

export const sanitizeSnapshotSections = (sections = [], fallbackSections = null) => {
  const requestedSections = Array.isArray(sections) ? sections : [sections];
  const normalizedSections = Array.from(new Set(
    requestedSections
      .map((section) => String(section || '').trim())
      .filter((section) => SNAPSHOT_SECTION_SET.has(section))
  ));

  if (normalizedSections.length > 0) {
    return normalizedSections;
  }

  return Array.isArray(fallbackSections) && fallbackSections.length > 0
    ? [...fallbackSections]
    : null;
};

export const getDefaultSnapshotSectionsForRole = (role = '') => {
  const normalizedRole = normalizeSyncRole(role);

  if (normalizedRole === SYNC_ROLES.TIMES || normalizedRole === SYNC_ROLES.MOBILE) {
    return [...MOBILE_TIMING_SNAPSHOT_SECTION_KEYS];
  }

  return null;
};

export const roleRequiresSnapshotBootstrap = (role = '') => (
  normalizeSyncRole(role) !== SYNC_ROLES.SETUP
);

export const getWritableTimingSectionsForRole = (role = '') => {
  const normalizedRole = normalizeSyncRole(role);
  if (normalizedRole === SYNC_ROLES.TIMES) {
    return [...TIMES_ROLE_TIMING_SECTION_KEYS];
  }
  return [...TIMING_SECTION_KEYS];
};

export const canRoleWriteTimingSection = (role = '', section = '') => {
  const normalizedSection = String(section || '').trim();
  return getWritableTimingSectionsForRole(role).includes(normalizedSection);
};

export const getAllowedPublishSectionsForRole = (role = '') => {
  const normalizedRole = normalizeSyncRole(role);
  if (normalizedRole === SYNC_ROLES.TIMES) {
    return [...TIMES_ROLE_TIMING_SECTION_KEYS];
  }
  return null;
};

export const canReceiveDomainForRoles = (recipientRole, sourceRole, domain) => {
  const recipient = normalizeSyncRole(recipientRole);
  const source = normalizeSyncRole(sourceRole);
  const normalizedDomain = String(domain || '').trim();

  if (!normalizedDomain) {
    return false;
  }

  if (source === SYNC_ROLES.SETUP) {
    return true;
  }

  if (source === SYNC_ROLES.TIMES) {
    return TIMING_SECTION_SET.has(normalizedDomain) || normalizedDomain === 'stages';
  }

  if (source === SYNC_ROLES.MOBILE) {
    if (recipient === SYNC_ROLES.SETUP) {
      return TELEMETRY_DOMAINS.has(normalizedDomain) || normalizedDomain === 'stageSos';
    }

    if (recipient === SYNC_ROLES.TIMES) {
      return normalizedDomain === 'stageSos';
    }

    if (recipient === SYNC_ROLES.OVERLAY) {
      return TELEMETRY_DOMAINS.has(normalizedDomain);
    }
  }

  return false;
};

export const filterChangesForRoleRecipient = (recipientRole, sourceRole, changes = {}) => {
  const accepted = {};

  Object.keys(changes || {}).forEach((domain) => {
    if (canReceiveDomainForRoles(recipientRole, sourceRole, domain)) {
      accepted[domain] = changes[domain];
    }
  });

  return accepted;
};
