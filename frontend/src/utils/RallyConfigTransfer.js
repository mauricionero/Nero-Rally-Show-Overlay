import {
  applyRallyConfigImportPayload,
  buildRallyConfigExportPayload
} from './rallyConfigTransferHelpers.js';

export class RallyConfigTransfer {
  constructor({
    loadFromStorage,
    loadSplitStageTimingMapFromStorage,
    getPilotTelemetrySnapshot,
    normalizePilotArrayPayload,
    normalizeRaceTypes,
    applyPilotTelemetryState,
    setters = {}
  } = {}) {
    this.loadFromStorage = loadFromStorage;
    this.loadSplitStageTimingMapFromStorage = loadSplitStageTimingMapFromStorage;
    this.getPilotTelemetrySnapshot = getPilotTelemetrySnapshot;
    this.normalizePilotArrayPayload = normalizePilotArrayPayload;
    this.normalizeRaceTypes = normalizeRaceTypes;
    this.applyPilotTelemetryState = applyPilotTelemetryState;
    this.setters = setters;
  }

  exportData({ dataVersion } = {}) {
    const payload = buildRallyConfigExportPayload({
      loadFromStorage: this.loadFromStorage,
      loadSplitStageTimingMapFromStorage: this.loadSplitStageTimingMapFromStorage,
      getPilotTelemetrySnapshot: this.getPilotTelemetrySnapshot,
      dataVersion,
      normalizeRaceTypes: this.normalizeRaceTypes
    });

    return JSON.stringify(payload, null, 2);
  }

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      return applyRallyConfigImportPayload(data, {
        ...this.setters,
        applyPilotTelemetryState: this.applyPilotTelemetryState,
        normalizePilotArrayPayload: this.normalizePilotArrayPayload,
        normalizeRaceTypes: this.normalizeRaceTypes
      });
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }
}
