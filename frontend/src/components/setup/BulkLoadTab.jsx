import React, { useMemo, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Checkbox } from '../ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Upload, AlertTriangle, Users, Flag } from 'lucide-react';
import { toast } from 'sonner';
import {
  LAP_RACE_STAGE_TYPE,
  LIAISON_STAGE_TYPE,
  SERVICE_PARK_STAGE_TYPE,
  SS_STAGE_TYPE,
  SUPER_PRIME_STAGE_TYPE
} from '../../utils/stageTypes.js';

const PILOT_HEADERS = ['name', 'team', 'car', 'carNumber', 'category', 'startOrder', 'timeOffsetMinutes', 'picture', 'streamUrl'];
const STAGE_HEADERS = ['name', 'type', 'ssNumber', 'date', 'startTime', 'endTime', 'distance', 'numberOfLaps'];

const PILOT_EXAMPLE = `name,team,car,carNumber,category,startOrder,timeOffsetMinutes,picture,streamUrl
Ulysses Bertholdo / Mario Marini,Toyota Gazoo Racing,GR Yaris Rally1,42,WRC,1,0,https://example.com/pilot.png,https://vdo.ninja/example`;

const STAGE_EXAMPLE = `name,type,ssNumber,date,startTime,endTime,distance,numberOfLaps
Super Prime,sss,7,2026-03-17,15:31,,3.2,
Service A,service park,,2026-03-17,16:00,16:45,,
Circuit Race,lap race,,2026-03-18,10:00,,5.1,8`;

const normalizeRecordName = (value) => value.trim();
const normalizeLookupKey = (value) => value.trim().toLowerCase();

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

export default function BulkLoadTab() {
  const { t } = useTranslation();
  const { pilots, stages, categories, addPilot, updatePilot, addStage } = useRally();
  const [pilotCsv, setPilotCsv] = useState('');
  const [stageCsv, setStageCsv] = useState('');
  const [updateExistingPilots, setUpdateExistingPilots] = useState(false);
  const [pilotResult, setPilotResult] = useState(createEmptyResult());
  const [stageResult, setStageResult] = useState(createEmptyResult());

  const categoryMap = useMemo(() => (
    Object.fromEntries(categories.map((category) => [normalizeLookupKey(category.name), category.id]))
  ), [categories]);

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
    const importedNames = new Set();
    const errors = [];
    let importedCount = 0;
    let updatedCount = 0;

    parsed.rows.forEach(({ rowNumber, values }) => {
      const name = (values.name || '').trim();
      const nameKey = normalizeRecordName(name);
      const existingPilot = existingPilotsByName.get(nameKey);

      if (!name) {
        errors.push({ rowNumber, name: values.name || '-', message: t('bulkLoad.errors.nameRequired') });
        return;
      }

      if (importedNames.has(nameKey)) {
        errors.push({ rowNumber, name, message: t('bulkLoad.errors.duplicateInImport') });
        return;
      }

      if (values.category && !categoryMap[normalizeLookupKey(values.category)]) {
        errors.push({ rowNumber, name, message: t('bulkLoad.errors.categoryNotFound') });
        return;
      }

      const nextPilotData = {
        name,
        team: (values.team || '').trim(),
        car: (values.car || '').trim(),
        carNumber: (values.carNumber || '').trim(),
        categoryId: values.category ? categoryMap[normalizeLookupKey(values.category)] : null,
        startOrder: parseInt(values.startOrder, 10) || 999,
        timeOffsetMinutes: parseInt(values.timeOffsetMinutes, 10) || 0,
        picture: (values.picture || '').trim(),
        streamUrl: (values.streamUrl || '').trim()
      };

      if (existingPilot) {
        if (!updateExistingPilots) {
          errors.push({ rowNumber, name, message: t('bulkLoad.errors.duplicateName') });
          return;
        }

        updatePilot(existingPilot.id, nextPilotData);
        updatedCount += 1;
      } else {
        addPilot(nextPilotData);
        importedCount += 1;
      }

      importedNames.add(nameKey);
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
        numberOfLaps: parseInt(values.numberOfLaps, 10) || 5
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
    </div>
  );
}
