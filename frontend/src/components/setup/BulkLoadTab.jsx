import React, { useEffect, useMemo, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Upload, AlertTriangle, Users, Flag, Timer, Map, Copy, ExternalLink, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  LAP_RACE_STAGE_TYPE,
  LIAISON_STAGE_TYPE,
  SERVICE_PARK_STAGE_TYPE,
  SS_STAGE_TYPE,
  SUPER_PRIME_STAGE_TYPE,
  getStageTitle,
  isManualStartStageType
} from '../../utils/stageTypes.js';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import { getPilotScheduledStartTime } from '../../utils/pilotSchedule.js';
import { arrivalTimeToTotal, normalizeTimingInput, totalTimeToArrival } from '../../utils/timeConversion.js';
import { parseKmlPlacemarks } from '../../utils/kmlImport.js';

const PILOT_HEADERS = ['name', 'team', 'car', 'carNumber', 'category', 'startOrder', 'timeOffsetMinutes', 'latLong', 'picture', 'streamUrl'];
const STAGE_HEADERS = ['name', 'type', 'ssNumber', 'date', 'startTime', 'endTime', 'distance', 'numberOfLaps'];
const TIME_HEADERS = ['number', 'pilot', 'totalTime', 'arrivalTime', 'startTime'];

const PILOT_EXAMPLE = `name,team,car,carNumber,category,startOrder,timeOffsetMinutes,latLong,picture,streamUrl
Ulysses Bertholdo / Mario Marini,Toyota Gazoo Racing,GR Yaris Rally1,42,WRC,1,0,"-23.550520, -46.633308",https://example.com/pilot.png,https://vdo.ninja/example`;

const STAGE_EXAMPLE = `name,type,ssNumber,date,startTime,endTime,distance,numberOfLaps
Super Prime,sss,7,2026-03-17,15:31,,3.2,2
Service A,service park,,2026-03-17,16:00,16:45,,
Circuit Race,lap race,,2026-03-18,10:00,,5.1,8`;

const TIME_EXAMPLE = `number,pilot,totalTime,arrivalTime,startTime
42,Ulysses Bertholdo / Mario Marini,12:34.567,10:42:15.123,10:29
7,,13:02.341,,`;

const normalizeRecordName = (value) => value.trim();
const normalizeLookupKey = (value) => value.trim().toLowerCase();
const normalizeNumberKey = (value) => String(value ?? '').trim().toLowerCase();

const normalizeDate = (value) => {
  if (!value) return '';

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
  }

  return trimmed;
};

const parseClockTimeToMinutes = (value) => {
  if (!value) {
    return null;
  }

  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/);
  if (!match) {
    return null;
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
};

const parseCsvLine = (line, delimiter) => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
};

const parseCsvText = (text) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return { rows: [], error: null };
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], error: null };
  }

  const firstLine = lines[0];
  const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
  const headers = parseCsvLine(firstLine, delimiter);

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line, delimiter);
    const row = {};

    headers.forEach((header, headerIndex) => {
      row[header.trim()] = values[headerIndex] ?? '';
    });

    return {
      rowNumber: index + 2,
      raw: line,
      values: row
    };
  });

  return { rows, error: null, headers };
};

const normalizeStageType = (value) => {
  const normalized = value.trim().toLowerCase();

  if (['ss', 'special stage', 'special'].includes(normalized)) {
    return SS_STAGE_TYPE;
  }
  if (['sss', 'super prime', 'super special stage', 'super special'].includes(normalized)) {
    return SUPER_PRIME_STAGE_TYPE;
  }
  if (['lap race', 'lap', 'race'].includes(normalized)) {
    return LAP_RACE_STAGE_TYPE;
  }
  if (['liaison', 'liason'].includes(normalized)) {
    return LIAISON_STAGE_TYPE;
  }
  if (['service park', 'service'].includes(normalized)) {
    return SERVICE_PARK_STAGE_TYPE;
  }

  return null;
};

const createEmptyResult = () => ({
  importedCount: 0,
  updatedCount: 0,
  errors: [],
  summary: ''
});

const convertGoogleMyMapsToViewerUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed);
    const mid = url.searchParams.get('mid');

    if (!mid) {
      return '';
    }

    return `https://www.google.com/maps/d/viewer?mid=${encodeURIComponent(mid)}`;
  } catch (error) {
    return '';
  }
};

export default function BulkLoadTab() {
  const { t } = useTranslation();
  const {
    pilots,
    stages,
    categories,
    currentStageId,
    startTimes,
    timeDecimals,
    mapPlacemarks,
    addPilot,
    updatePilot,
    addStage,
    bulkImportTimingEntries,
    importMapPlacemarks,
    removeMapPlacemark,
    clearMapPlacemarks
  } = useRally();
  const [pilotCsv, setPilotCsv] = useState('');
  const [stageCsv, setStageCsv] = useState('');
  const [timeCsv, setTimeCsv] = useState('');
  const [updateExistingPilots, setUpdateExistingPilots] = useState(false);
  const [preserveEmptyPilotFields, setPreserveEmptyPilotFields] = useState(false);
  const [inferPilotOffsetsFromStartTime, setInferPilotOffsetsFromStartTime] = useState(false);
  const [selectedTimesStageId, setSelectedTimesStageId] = useState('');
  const [pilotResult, setPilotResult] = useState(createEmptyResult());
  const [stageResult, setStageResult] = useState(createEmptyResult());
  const [timeResult, setTimeResult] = useState(createEmptyResult());
  const [mapResult, setMapResult] = useState(createEmptyResult());
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [importKmlAsOneMap, setImportKmlAsOneMap] = useState(false);

  const categoryMap = useMemo(() => (
    Object.fromEntries(categories.map((category) => [normalizeLookupKey(category.name), category.id]))
  ), [categories]);
  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  const googleMapsViewerUrl = useMemo(() => convertGoogleMyMapsToViewerUrl(googleMapsUrl), [googleMapsUrl]);

  useEffect(() => {
    setSelectedTimesStageId((prev) => {
      if (prev && stages.some((stage) => stage.id === prev)) {
        return prev;
      }
      if (currentStageId && stages.some((stage) => stage.id === currentStageId)) {
        return currentStageId;
      }
      return stages[0]?.id || '';
    });
  }, [currentStageId, stages]);

  const handleImportPilots = () => {
    const parsed = parseCsvText(pilotCsv);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error(t('bulkLoad.noRows'));
      return;
    }

    const existingPilotsByName = new Map(pilots.map((pilot) => [normalizeRecordName(pilot.name), pilot]));
    const existingPilotsByCarNumber = new Map();
    pilots.forEach((pilot) => {
      const carNumberKey = normalizeNumberKey(pilot.carNumber);
      if (!carNumberKey) {
        return;
      }

      const existing = existingPilotsByCarNumber.get(carNumberKey) || [];
      existingPilotsByCarNumber.set(carNumberKey, [...existing, pilot]);
    });
    const importedPilotKeys = new Set();
    const errors = [];
    let importedCount = 0;
    let updatedCount = 0;

    parsed.rows.forEach(({ rowNumber, values }) => {
      const name = (values.name || '').trim();
      const nameKey = normalizeRecordName(name);
      const carNumber = (values.carNumber || '').trim();
      const carNumberKey = normalizeNumberKey(carNumber);
      const pilotsMatchingCarNumber = carNumberKey ? (existingPilotsByCarNumber.get(carNumberKey) || []) : [];
      const existingPilotByName = nameKey ? existingPilotsByName.get(nameKey) : null;
      const existingPilotByCarNumber = pilotsMatchingCarNumber[0] || null;
      const rowIdentifier = name || carNumber || '-';
      const importIdentityKey = carNumberKey ? `car:${carNumberKey}` : nameKey;

      if (carNumberKey && pilotsMatchingCarNumber.length > 1) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.ambiguousNumber') });
        return;
      }

      if (existingPilotByName && existingPilotByCarNumber && existingPilotByName.id !== existingPilotByCarNumber.id) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.identifierMismatch') });
        return;
      }

      const existingPilot = existingPilotByCarNumber || existingPilotByName;

      if (!name && !(updateExistingPilots && existingPilot)) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.nameRequired') });
        return;
      }

      if (!importIdentityKey) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.nameRequired') });
        return;
      }

      if (importedPilotKeys.has(importIdentityKey)) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.duplicateInImport') });
        return;
      }

      if (values.category && !categoryMap[normalizeLookupKey(values.category)]) {
        errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.categoryNotFound') });
        return;
      }

      const nextPilotData = {
        name: name || existingPilot?.name || '',
        team: (values.team || '').trim(),
        car: (values.car || '').trim(),
        carNumber,
        categoryId: values.category ? categoryMap[normalizeLookupKey(values.category)] : null,
        startOrder: parseInt(values.startOrder, 10) || 999,
        timeOffsetMinutes: parseInt(values.timeOffsetMinutes, 10) || 0,
        latLong: (values.latLong || '').trim(),
        picture: (values.picture || '').trim(),
        streamUrl: (values.streamUrl || '').trim()
      };

      if (existingPilot) {
        if (!updateExistingPilots) {
          errors.push({ rowNumber, name: rowIdentifier, message: t('bulkLoad.errors.duplicateName') });
          return;
        }

        const mergedPilotData = preserveEmptyPilotFields
          ? {
              ...nextPilotData,
              team: nextPilotData.team || existingPilot.team || '',
              car: nextPilotData.car || existingPilot.car || '',
              carNumber: nextPilotData.carNumber || existingPilot.carNumber || '',
              categoryId: values.category ? nextPilotData.categoryId : (existingPilot.categoryId ?? null),
              startOrder: String(values.startOrder || '').trim() ? nextPilotData.startOrder : (existingPilot.startOrder ?? 999),
              timeOffsetMinutes: String(values.timeOffsetMinutes || '').trim() ? nextPilotData.timeOffsetMinutes : (existingPilot.timeOffsetMinutes ?? 0),
              latLong: nextPilotData.latLong || existingPilot.latLong || '',
              picture: nextPilotData.picture || existingPilot.picture || '',
              streamUrl: nextPilotData.streamUrl || existingPilot.streamUrl || ''
            }
          : nextPilotData;

        updatePilot(existingPilot.id, mergedPilotData);
        updatedCount += 1;
      } else {
        addPilot(nextPilotData);
        importedCount += 1;
      }

      importedPilotKeys.add(importIdentityKey);
    });

    const summary = t('bulkLoad.importSummaryPilots', { created: importedCount, updated: updatedCount, failed: errors.length });
    setPilotResult({ importedCount, updatedCount, errors, summary });
    if (importedCount > 0 || updatedCount > 0) {
      toast.success(summary);
    } else {
      toast.error(summary);
    }
  };

  const handleImportStages = () => {
    const parsed = parseCsvText(stageCsv);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error(t('bulkLoad.noRows'));
      return;
    }

    const existingNames = new Set(stages.map((stage) => normalizeRecordName(stage.name)));
    const importedNames = new Set();
    const errors = [];
    let importedCount = 0;

    parsed.rows.forEach(({ rowNumber, values }) => {
      const name = (values.name || '').trim();
      const nameKey = normalizeRecordName(name);
      const stageType = normalizeStageType(values.type || '');

      if (!name) {
        errors.push({ rowNumber, name: values.name || '-', message: t('bulkLoad.errors.nameRequired') });
        return;
      }

      if (existingNames.has(nameKey) || importedNames.has(nameKey)) {
        errors.push({ rowNumber, name, message: t('bulkLoad.errors.duplicateName') });
        return;
      }

      if (!stageType) {
        errors.push({ rowNumber, name, message: t('bulkLoad.errors.invalidStageType') });
        return;
      }

      addStage({
        name,
        type: stageType,
        ssNumber: (values.ssNumber || '').trim(),
        date: normalizeDate(values.date || ''),
        startTime: (values.startTime || '').trim(),
        endTime: (values.endTime || '').trim(),
        distance: (values.distance || '').trim(),
        numberOfLaps: parseInt(values.numberOfLaps, 10) || (stageType === SUPER_PRIME_STAGE_TYPE ? 2 : 5)
      });

      importedNames.add(nameKey);
      importedCount += 1;
    });

    const summary = t('bulkLoad.importSummary', { imported: importedCount, failed: errors.length });
    setStageResult({ importedCount, errors, summary });
    if (importedCount > 0) {
      toast.success(summary);
    } else {
      toast.error(summary);
    }
  };

  const handleImportTimes = () => {
    const parsed = parseCsvText(timeCsv);
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    if (!selectedTimesStageId) {
      toast.error(t('bulkLoad.selectStageFirst'));
      return;
    }
    if (parsed.rows.length === 0) {
      toast.error(t('bulkLoad.noRows'));
      return;
    }

    const stage = stages.find((item) => item.id === selectedTimesStageId);
    const pilotMap = new Map(pilots.map((pilot) => [normalizeLookupKey(pilot.name), pilot]));
    const pilotNumberMap = new Map();

    pilots.forEach((pilot) => {
      const carNumberKey = normalizeNumberKey(pilot.carNumber);
      if (!carNumberKey) {
        return;
      }

      const existing = pilotNumberMap.get(carNumberKey) || [];
      if (!existing.some((entry) => entry.id === pilot.id)) {
        pilotNumberMap.set(carNumberKey, [...existing, pilot]);
      }
    });

    const importedPilots = new Set();
    const entries = [];
    const errors = [];

    parsed.rows.forEach(({ rowNumber, values }) => {
      const number = (values.number || values.carNumber || '').trim();
      const pilotName = (values.pilot || values.name || '').trim();
      const numberKey = normalizeNumberKey(number);
      const pilotKey = normalizeLookupKey(pilotName);
      const totalTime = normalizeTimingInput(values.totalTime || '');
      const arrivalTime = normalizeTimingInput(values.arrivalTime || '');
      const startTime = (values.startTime || '').trim();

      if (!number && !pilotName) {
        errors.push({ rowNumber, name: '-', message: t('bulkLoad.errors.pilotOrNumberRequired') });
        return;
      }

      const numberMatches = numberKey ? (pilotNumberMap.get(numberKey) || []) : [];
      if (numberKey && numberMatches.length > 1) {
        errors.push({ rowNumber, name: number || pilotName || '-', message: t('bulkLoad.errors.ambiguousNumber') });
        return;
      }

      const matchedByNumber = numberMatches[0] || null;
      const matchedByName = pilotName ? pilotMap.get(pilotKey) : null;
      const pilot = matchedByNumber || matchedByName || null;

      if (matchedByNumber && matchedByName && matchedByNumber.id !== matchedByName.id) {
        errors.push({ rowNumber, name: `${number} / ${pilotName}`, message: t('bulkLoad.errors.identifierMismatch') });
        return;
      }

      if (!pilot) {
        errors.push({ rowNumber, name: number || pilotName || '-', message: t('bulkLoad.errors.pilotNotFound') });
        return;
      }

      if (importedPilots.has(pilot.id)) {
        errors.push({ rowNumber, name: number || pilotName || pilot.name, message: t('bulkLoad.errors.duplicateInImport') });
        return;
      }

      if (!totalTime && !arrivalTime && !startTime) {
        errors.push({ rowNumber, name: number || pilotName || pilot.name, message: t('bulkLoad.errors.timingValueRequired') });
        return;
      }

      const knownStartTime = startTime
        || startTimes[pilot.id]?.[selectedTimesStageId]
        || (stage ? getPilotScheduledStartTime(stage, pilot) : '');
      const resolvedArrivalTime = arrivalTime || (totalTime && knownStartTime ? totalTimeToArrival(totalTime, knownStartTime, timeDecimals) : '');
      const resolvedTotalTime = totalTime || (arrivalTime && knownStartTime ? arrivalTimeToTotal(arrivalTime, knownStartTime, timeDecimals) : '');

      entries.push({
        pilotId: pilot.id,
        stageId: selectedTimesStageId,
        totalTime: resolvedTotalTime || undefined,
        arrivalTime: resolvedArrivalTime || undefined,
        startTime: startTime || undefined
      });

      if (
        inferPilotOffsetsFromStartTime
        && startTime
        && stage?.startTime
        && !isManualStartStageType(stage.type)
        && stage.type !== LAP_RACE_STAGE_TYPE
      ) {
        const stageStartMinutes = parseClockTimeToMinutes(stage.startTime);
        const pilotStartMinutes = parseClockTimeToMinutes(startTime);

        if (stageStartMinutes !== null && pilotStartMinutes !== null) {
          updatePilot(pilot.id, {
            timeOffsetMinutes: pilotStartMinutes - stageStartMinutes
          });
        }
      }

      importedPilots.add(pilot.id);
    });

    if (entries.length > 0) {
      bulkImportTimingEntries(entries);
    }

    const summary = t('bulkLoad.importSummaryTimes', { updated: entries.length, failed: errors.length });
    setTimeResult({ importedCount: 0, updatedCount: entries.length, errors, summary });
    if (entries.length > 0) {
      toast.success(`${stage ? `${getStageTitle(stage)}: ` : ''}${summary}`);
    } else {
      toast.error(summary);
    }
  };

  const handleImportKmlFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseKmlPlacemarks(text, {
        importAllAsOneMap: importKmlAsOneMap,
        fileName: file.name
      });

      if (parsed.error) {
        const message = t('bulkLoad.errors.invalidKml');
        setMapResult({
          importedCount: 0,
          updatedCount: 0,
          errors: [{ rowNumber: 1, name: file.name, message }],
          summary: t('bulkLoad.noImportYet')
        });
        toast.error(message);
        event.target.value = '';
        return;
      }

      if (parsed.placemarks.length === 0) {
        const message = t('bulkLoad.errors.noPlacemarks');
        setMapResult({
          importedCount: 0,
          updatedCount: 0,
          errors: [{ rowNumber: 1, name: file.name, message }],
          summary: t('bulkLoad.noImportYet')
        });
        toast.error(message);
        event.target.value = '';
        return;
      }

      importMapPlacemarks(parsed.placemarks);
      const summary = t('bulkLoad.importSummaryMaps', { imported: parsed.placemarks.length });
      setMapResult({
        importedCount: parsed.placemarks.length,
        updatedCount: 0,
        errors: [],
        summary
      });
      toast.success(summary);
    } catch (error) {
      const message = t('bulkLoad.errors.invalidKml');
      setMapResult({
        importedCount: 0,
        updatedCount: 0,
        errors: [{ rowNumber: 1, name: file.name, message }],
        summary: t('bulkLoad.noImportYet')
      });
      toast.error(message);
    }

    event.target.value = '';
  };

  const handleCopyGoogleMapsViewerUrl = async () => {
    if (!googleMapsViewerUrl) {
      toast.error(t('bulkLoad.invalidGoogleMapsUrl'));
      return;
    }

    try {
      await navigator.clipboard.writeText(googleMapsViewerUrl);
      toast.success(t('bulkLoad.googleMapsViewerCopied'));
    } catch (error) {
      toast.error(t('bulkLoad.googleMapsViewerCopyFailed'));
    }
  };

  const renderErrors = (errors) => {
    if (errors.length === 0) {
      return (
        <p className="text-sm text-zinc-500">{t('bulkLoad.noErrors')}</p>
      );
    }

    return (
      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {errors.map((error, index) => (
          <div key={`${error.rowNumber}-${index}`} className="bg-[#09090B] border border-red-500/20 rounded p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {t('bulkLoad.rowLabel', { row: error.rowNumber })}: {error.name}
                </p>
                <p className="text-red-400 text-xs mt-1">{error.message}</p>
              </div>
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="bg-[#18181B] border-zinc-800">
          <CardHeader>
            <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <Users className="w-5 h-5" />
              {t('bulkLoad.pilotsTitle')}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {t('bulkLoad.pilotsDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.expectedHeaders')}</p>
              <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto">
                {PILOT_HEADERS.join(', ')}
              </code>
            </div>

            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.example')}</p>
              <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                {PILOT_EXAMPLE}
              </code>
            </div>

            <Textarea
              value={pilotCsv}
              onChange={(event) => setPilotCsv(event.target.value)}
              className="min-h-[220px] bg-[#09090B] border-zinc-700 text-white font-mono text-xs"
              placeholder={PILOT_EXAMPLE}
              data-testid="textarea-bulk-pilots"
            />

            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={updateExistingPilots}
                onCheckedChange={(checked) => setUpdateExistingPilots(checked === true)}
              />
              <div>
                <p className="text-sm text-white">{t('bulkLoad.updateExistingPilots')}</p>
                <p className="text-xs text-zinc-500">{t('bulkLoad.updateExistingPilotsDesc')}</p>
              </div>
            </label>

            <label className={`flex items-start gap-3 cursor-pointer ${updateExistingPilots ? '' : 'opacity-50'}`}>
              <Checkbox
                checked={preserveEmptyPilotFields}
                onCheckedChange={(checked) => setPreserveEmptyPilotFields(checked === true)}
                disabled={!updateExistingPilots}
              />
              <div>
                <p className="text-sm text-white">{t('bulkLoad.preserveEmptyPilotFields')}</p>
                <p className="text-xs text-zinc-500">{t('bulkLoad.preserveEmptyPilotFieldsDesc')}</p>
              </div>
            </label>

            <Button onClick={handleImportPilots} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
              <Upload className="w-4 h-4 mr-2" />
              {t('bulkLoad.importPilots')}
            </Button>

            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">{pilotResult.summary || t('bulkLoad.noImportYet')}</Badge>
            </div>

            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.rejectedRows')}</p>
              {renderErrors(pilotResult.errors)}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#18181B] border-zinc-800">
          <CardHeader>
            <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
              <Flag className="w-5 h-5" />
              {t('bulkLoad.stagesTitle')}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {t('bulkLoad.stagesDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.expectedHeaders')}</p>
              <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto">
                {STAGE_HEADERS.join(', ')}
              </code>
            </div>

            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.example')}</p>
              <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
                {STAGE_EXAMPLE}
              </code>
            </div>

            <Textarea
              value={stageCsv}
              onChange={(event) => setStageCsv(event.target.value)}
              className="min-h-[220px] bg-[#09090B] border-zinc-700 text-white font-mono text-xs"
              placeholder={STAGE_EXAMPLE}
              data-testid="textarea-bulk-stages"
            />

            <Button onClick={handleImportStages} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
              <Upload className="w-4 h-4 mr-2" />
              {t('bulkLoad.importStages')}
            </Button>

            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className="border-zinc-700 text-zinc-300">{stageResult.summary || t('bulkLoad.noImportYet')}</Badge>
            </div>

            <div>
              <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.rejectedRows')}</p>
              {renderErrors(stageResult.errors)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Timer className="w-5 h-5" />
            {t('bulkLoad.timesTitle')}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {t('bulkLoad.timesDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.selectStage')}</p>
            <Select value={selectedTimesStageId} onValueChange={setSelectedTimesStageId}>
              <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                <SelectValue placeholder={t('bulkLoad.selectStagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {sortedStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {getStageTitle(stage)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-zinc-500">{t('bulkLoad.timesHint')}</p>
          </div>

          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.expectedHeaders')}</p>
            <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto">
              {TIME_HEADERS.join(', ')}
            </code>
          </div>

          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.example')}</p>
            <code className="block bg-[#09090B] border border-zinc-700 rounded p-3 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
              {TIME_EXAMPLE}
            </code>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={inferPilotOffsetsFromStartTime}
              onCheckedChange={(checked) => setInferPilotOffsetsFromStartTime(checked === true)}
            />
            <div>
              <p className="text-sm text-white">{t('bulkLoad.inferPilotOffsetsFromStartTime')}</p>
              <p className="text-xs text-zinc-500">{t('bulkLoad.inferPilotOffsetsFromStartTimeDesc')}</p>
            </div>
          </label>

          <Textarea
            value={timeCsv}
            onChange={(event) => setTimeCsv(event.target.value)}
            className="min-h-[220px] bg-[#09090B] border-zinc-700 text-white font-mono text-xs"
            placeholder={TIME_EXAMPLE}
            data-testid="textarea-bulk-times"
          />

          <Button onClick={handleImportTimes} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
            <Upload className="w-4 h-4 mr-2" />
            {t('bulkLoad.importTimes')}
          </Button>

          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">{timeResult.summary || t('bulkLoad.noImportYet')}</Badge>
          </div>

          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.rejectedRows')}</p>
            {renderErrors(timeResult.errors)}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Map className="w-5 h-5" />
            {t('bulkLoad.mapsTitle')}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {t('bulkLoad.mapsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-[#111111] p-4">
            <div>
              <p className="text-sm font-medium text-white">{t('bulkLoad.googleMapsTitle')}</p>
              <p className="text-xs text-zinc-500 mt-1">{t('bulkLoad.googleMapsDescription')}</p>
            </div>

            <div className="space-y-2">
              <Input
                value={googleMapsUrl}
                onChange={(event) => setGoogleMapsUrl(event.target.value)}
                className="bg-[#09090B] border-zinc-700 text-white"
                placeholder={t('bulkLoad.googleMapsPlaceholder')}
                data-testid="input-google-maps-url"
              />
              <Input
                value={googleMapsViewerUrl}
                readOnly
                className="bg-[#09090B] border-zinc-800 text-zinc-300"
                placeholder={t('bulkLoad.googleMapsViewerPlaceholder')}
                data-testid="input-google-maps-viewer-url"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 text-white"
                onClick={handleCopyGoogleMapsViewerUrl}
                disabled={!googleMapsViewerUrl}
              >
                <Copy className="w-4 h-4 mr-2" />
                {t('bulkLoad.copyViewerUrl')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-zinc-700 text-white"
                onClick={() => window.open(googleMapsViewerUrl, '_blank', 'noopener,noreferrer')}
                disabled={!googleMapsViewerUrl}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                {t('bulkLoad.openViewerUrl')}
              </Button>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={importKmlAsOneMap}
              onCheckedChange={(checked) => setImportKmlAsOneMap(checked === true)}
            />
            <div>
              <p className="text-sm text-white">{t('bulkLoad.importAllAsOneMap')}</p>
              <p className="text-xs text-zinc-500">{t('bulkLoad.importAllAsOneMapDesc')}</p>
            </div>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer">
              <input
                type="file"
                accept=".kml,.xml"
                className="hidden"
                onChange={handleImportKmlFile}
                data-testid="input-kml-file"
              />
              <span className="inline-flex items-center rounded-md bg-[#FF4500] px-4 py-2 text-sm font-medium text-white hover:bg-[#FF4500]/90">
                <Upload className="w-4 h-4 mr-2" />
                {t('bulkLoad.importKml')}
              </span>
            </label>

            <Button
              variant="outline"
              className="border-zinc-700 text-white"
              onClick={() => {
                clearMapPlacemarks();
                setMapResult(createEmptyResult());
              }}
              disabled={mapPlacemarks.length === 0}
            >
              {t('bulkLoad.clearMaps')}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="border-zinc-700 text-zinc-300">
              {mapResult.summary || t('bulkLoad.mapsStored', { count: mapPlacemarks.length })}
            </Badge>
          </div>

          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.storedPlacemarks')}</p>
            {mapPlacemarks.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('bulkLoad.noMapsYet')}</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {mapPlacemarks.map((placemark) => (
                  <div key={placemark.id} className="bg-[#09090B] border border-zinc-700 rounded p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{placemark.name}</p>
                        <p className="text-zinc-500 text-xs mt-1 uppercase">
                          {placemark.geometryType} • {placemark.coordinateGroups.reduce((total, group) => total + group.length, 0)} pts
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Map className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-400"
                          onClick={() => removeMapPlacemark(placemark.id)}
                          title={t('bulkLoad.deletePlacemark')}
                          aria-label={t('bulkLoad.deletePlacemark')}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs uppercase text-zinc-500 mb-2">{t('bulkLoad.rejectedRows')}</p>
            {renderErrors(mapResult.errors)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
