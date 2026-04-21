import React, { useEffect, useMemo, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useRallyConfig } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../ui/dialog';
import { StreamThumbnail } from '../StreamThumbnail.jsx';
import { CategoryBar } from '../CategoryBadge.jsx';
import { toast } from 'sonner';
import { Trash2, Plus, Edit, Download, MapPin, Clock3, Gauge, Navigation2, ExternalLink, ChevronDown, Sparkles } from 'lucide-react';
import { sortCategoriesByDisplayOrder, sortPilotsByDisplayOrder } from '../../utils/displayOrder.js';
import { normalizePilotId } from '../../utils/pilotIdentity.js';
import { getWebSocketPilotTelemetryUrl } from '../../utils/overlayUrls.js';
import { compareStagesBySchedule } from '../../utils/stageSchedule.js';
import { getStageTitle } from '../../utils/stageTypes.js';
import DebugIdText from './DebugIdText.jsx';

const escapeCsvValue = (value) => {
  const stringValue = String(value ?? '');
  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const normalizeOptionalNumberInput = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }

  const numericValue = Number(trimmed);
  return Number.isFinite(numericValue) ? numericValue : '';
};

const normalizeOptionalTextInput = (value) => String(value ?? '').trim();

const TELEMETRY_PLACEHOLDERS = {
  latLong: '-23.550520, -46.633308',
  speed: '85.5',
  heading: '180',
  gpsPrecision: '5.0',
  gForce: '2.4',
  rpmPercentage: '88.3',
  rpmReal: '7421.5',
  gear: '4',
  distance: '1823.412'
};

const TELEMETRY_FORM_FIELD_KEYS = [
  'latLong',
  'latlongTimestamp',
  'lastLatLongUpdatedAt',
  'lastTelemetryAt',
  'speed',
  'heading',
  'gpsPrecision',
  'gForce',
  'rpmPercentage',
  'rpmReal',
  'gear',
  'distance',
  'distanceDrivenLap',
  'distanceDrivenOverall',
  'trackLengthTotal',
  'runTime',
  'lapTime',
  'arrivalTime',
  'maxGears',
  'maxRpm',
  'idleRpm'
];

const buildTelemetryPayload = (editingPilot) => {
  const payload = {
    source: 'setup-relay',
    lastTelemetryAt: Date.now()
  };

  const assignIfPresent = (key, value) => {
    if (value !== '' && value !== null && value !== undefined) {
      payload[key] = value;
    }
  };

  assignIfPresent('latLong', normalizeOptionalTextInput(editingPilot.latLong));
  assignIfPresent('latlongTimestamp', normalizeOptionalNumberInput(editingPilot.latlongTimestamp ?? editingPilot.lastLatLongUpdatedAt ?? ''));
  assignIfPresent('lastLatLongUpdatedAt', normalizeOptionalNumberInput(editingPilot.latlongTimestamp ?? editingPilot.lastLatLongUpdatedAt ?? ''));
  assignIfPresent('speed', normalizeOptionalNumberInput(editingPilot.speed));
  assignIfPresent('heading', normalizeOptionalNumberInput(editingPilot.heading));
  assignIfPresent('gpsPrecision', normalizeOptionalNumberInput(editingPilot.gpsPrecision));
  assignIfPresent('gForce', normalizeOptionalNumberInput(editingPilot.gForce));
  assignIfPresent('rpmPercentage', normalizeOptionalNumberInput(editingPilot.rpmPercentage));
  assignIfPresent('rpmReal', normalizeOptionalNumberInput(editingPilot.rpmReal));
  assignIfPresent('gear', normalizeOptionalNumberInput(editingPilot.gear));
  assignIfPresent('distance', normalizeOptionalNumberInput(editingPilot.distance));

  return payload;
};

export default function PilotsTab({ hideStreams = false, wsChannelKey = '' }) {
  const { t } = useTranslation();
  const { displayIdsInSetup } = useRally();
  const {
    pilots,
    stages,
    categories,
    addPilot,
    updatePilot,
    setPilotCurrentStage,
    setPilotTelemetry,
    getPilotTelemetry,
    getPersistedPilotTelemetry,
    deletePilot,
    togglePilotActive
  } = useRallyConfig();

  const [newPilot, setNewPilot] = useState({
    name: '',
    team: '',
    car: '',
    carNumber: '',
    currentStageId: '',
    picture: '',
    streamUrl: '',
    categoryId: null,
    startOrder: '',
    timeOffsetMinutes: '',
    isActive: true
  });
  const [editingPilot, setEditingPilot] = useState(null);
  const [pilotDialogOpen, setPilotDialogOpen] = useState(false);
  const [selectedExportColumns, setSelectedExportColumns] = useState([]);

  useEffect(() => {
    if (!pilotDialogOpen || !editingPilot?.id) {
      return;
    }

    const editingPilotId = normalizePilotId(editingPilot.id);
    const livePilot = pilots.find((pilot) => normalizePilotId(pilot.id) === editingPilotId);
    if (!livePilot) {
      return;
    }
    const liveTelemetry = getPersistedPilotTelemetry(livePilot.id);

    setEditingPilot((prev) => {
      if (!prev || prev.id !== livePilot.id) {
        return prev;
      }

      return {
        ...prev,
        latLong: liveTelemetry.latLong ?? livePilot.latLong ?? prev.latLong ?? '',
        latlongTimestamp: liveTelemetry.latlongTimestamp ?? liveTelemetry.lastLatLongUpdatedAt ?? prev.latlongTimestamp ?? prev.lastLatLongUpdatedAt ?? '',
        lastLatLongUpdatedAt: liveTelemetry.lastLatLongUpdatedAt ?? prev.lastLatLongUpdatedAt ?? '',
        speed: liveTelemetry.speed ?? prev.speed ?? '',
        heading: liveTelemetry.heading ?? prev.heading ?? '',
        gpsPrecision: liveTelemetry.gpsPrecision ?? prev.gpsPrecision ?? '',
        gForce: liveTelemetry.gForce ?? prev.gForce ?? '',
        rpmPercentage: liveTelemetry.rpmPercentage ?? prev.rpmPercentage ?? '',
        rpmReal: liveTelemetry.rpmReal ?? prev.rpmReal ?? '',
        gear: liveTelemetry.gear ?? prev.gear ?? '',
        distance: liveTelemetry.distance ?? prev.distance ?? '',
        lastTelemetryAt: liveTelemetry.lastTelemetryAt ?? prev.lastTelemetryAt ?? ''
      };
    });
  }, [editingPilot?.id, pilotDialogOpen, getPersistedPilotTelemetry, pilots]);

  const handleAddPilot = () => {
    if (!newPilot.name.trim()) {
      toast.error(t('pilots.pilotName') + ' is required');
      return;
    }
    const pilotData = {
      ...newPilot,
      startOrder: parseInt(newPilot.startOrder) || 999,
      timeOffsetMinutes: parseInt(newPilot.timeOffsetMinutes) || 0
    };
    addPilot(pilotData);
    setNewPilot({
      name: '',
      team: '',
      car: '',
      carNumber: '',
      currentStageId: '',
      picture: '',
      streamUrl: '',
      categoryId: null,
      startOrder: '',
      timeOffsetMinutes: '',
      isActive: true
    });
    toast.success('Pilot added successfully');
  };

  const handleOpenPilotTelemetryPage = (pilotId) => {
    const url = getWebSocketPilotTelemetryUrl(wsChannelKey, pilotId);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const applyTelemetryPlaceholder = (fieldKey) => {
    const placeholder = TELEMETRY_PLACEHOLDERS[fieldKey];

    if (placeholder === undefined) {
      return;
    }

    setEditingPilot((prev) => (
      prev ? { ...prev, [fieldKey]: placeholder } : prev
    ));
  };

  const handleUpdatePilot = () => {
    if (!editingPilot.name.trim()) {
      toast.error(t('pilots.pilotName') + ' is required');
      return;
    }
    const pilotData = {
      ...editingPilot,
      startOrder: parseInt(editingPilot.startOrder) || 999,
      timeOffsetMinutes: parseInt(editingPilot.timeOffsetMinutes) || 0
    };
    TELEMETRY_FORM_FIELD_KEYS.forEach((fieldKey) => {
      delete pilotData[fieldKey];
    });
    updatePilot(editingPilot.id, pilotData);
    setPilotTelemetry(editingPilot.id, buildTelemetryPayload(editingPilot));
    setEditingPilot(null);
    setPilotDialogOpen(false);
    toast.success('Pilot updated successfully');
  };

  const handleSendTelemetryOnly = () => {
    if (!editingPilot?.id) {
      return;
    }

    setPilotTelemetry(editingPilot.id, buildTelemetryPayload(editingPilot));
    toast.success('Telemetry sent');
  };

  const sortedCategories = sortCategoriesByDisplayOrder(categories);
  const sortedPilots = sortPilotsByDisplayOrder(pilots, categories);
  const sortedStages = useMemo(() => [...stages].sort(compareStagesBySchedule), [stages]);
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const exportColumns = useMemo(() => ([
    { id: 'name', label: t('pilots.pilotName'), getValue: (pilot) => pilot.name || '' },
    { id: 'team', label: t('pilots.team'), getValue: (pilot) => pilot.team || '' },
    { id: 'car', label: t('pilots.car'), getValue: (pilot) => pilot.car || '' },
    { id: 'carNumber', label: t('pilots.carNumber'), getValue: (pilot) => pilot.carNumber || '' },
    { id: 'latLong', label: t('pilots.latLong'), getValue: (pilot) => (getPilotTelemetry(pilot.id)?.latLong || pilot.latLong || '') },
    { id: 'lastLatLongUpdatedAt', label: t('pilots.lastLatLongUpdatedAt'), getValue: (pilot) => (getPilotTelemetry(pilot.id)?.lastLatLongUpdatedAt || getPilotTelemetry(pilot.id)?.latlongTimestamp || pilot.lastLatLongUpdatedAt || '') },
    { id: 'category', label: t('pilots.category'), getValue: (pilot) => categoryById.get(pilot.categoryId)?.name || '' },
    { id: 'startOrder', label: t('pilots.startOrder'), getValue: (pilot) => pilot.startOrder ?? '' },
    { id: 'timeOffsetMinutes', label: t('pilots.timeOffsetMinutes'), getValue: (pilot) => pilot.timeOffsetMinutes ?? '' },
    { id: 'currentStageId', label: t('pilots.currentStage'), getValue: (pilot) => pilot.currentStageId || '' },
    { id: 'picture', label: t('pilots.pictureUrl'), getValue: (pilot) => pilot.picture || '' },
    { id: 'streamUrl', label: t('pilots.streamUrl'), getValue: (pilot) => pilot.streamUrl || '' },
    { id: 'isActive', label: t('pilots.activeStatus'), getValue: (pilot) => (pilot.isActive ? t('status.active') : t('status.inactive')) }
  ]), [categoryById, getPilotTelemetry, t]);

  const toggleExportColumn = (columnId) => {
    setSelectedExportColumns((prev) => (
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    ));
  };

  const handleExportPilots = () => {
    if (selectedExportColumns.length === 0) {
      toast.error(t('pilots.exportSelectColumns'));
      return;
    }

    const chosenColumns = exportColumns.filter((column) => selectedExportColumns.includes(column.id));
    const isSingleColumn = chosenColumns.length === 1;
    const content = isSingleColumn
      ? sortedPilots.map((pilot) => chosenColumns[0].getValue(pilot)).join('\n')
      : [
          chosenColumns.map((column) => escapeCsvValue(column.label)).join(','),
          ...sortedPilots.map((pilot) => chosenColumns.map((column) => escapeCsvValue(column.getValue(pilot))).join(','))
        ].join('\n');

    const extension = isSingleColumn ? 'txt' : 'csv';
    const blob = new Blob([content], { type: isSingleColumn ? 'text/plain;charset=utf-8' : 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `rally-pilots-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(t('pilots.exportSuccess'));
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('pilots.addNewPilot')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="pilot-name" className="text-white">{t('pilots.pilotName')} *</Label>
                <Input
                  id="pilot-name"
                  value={newPilot.name}
                  onChange={(e) => setNewPilot({ ...newPilot, name: e.target.value })}
                  placeholder={t('pilots.placeholder.name')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-name"
                />
              </div>
              <div>
                <Label htmlFor="pilot-team" className="text-white">{t('pilots.team')}</Label>
                <Input
                  id="pilot-team"
                  value={newPilot.team}
                  onChange={(e) => setNewPilot({ ...newPilot, team: e.target.value })}
                  placeholder={t('pilots.placeholder.team')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-team"
                />
              </div>
              <div>
                <Label htmlFor="pilot-car" className="text-white">{t('pilots.car')}</Label>
                <Input
                  id="pilot-car"
                  value={newPilot.car}
                  onChange={(e) => setNewPilot({ ...newPilot, car: e.target.value })}
                  placeholder={t('pilots.placeholder.car')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-car"
                />
              </div>
              <div>
                <Label htmlFor="pilot-category" className="text-white">{t('pilots.category')}</Label>
                <Select value={newPilot.categoryId || 'none'} onValueChange={(val) => setNewPilot({ ...newPilot, categoryId: val === 'none' ? null : val })}>
                  <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white" id="pilot-category">
                    <SelectValue placeholder={t('common.select')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('common.none')}</SelectItem>
                    {sortedCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
              <div>
                <Label htmlFor="pilot-car-number" className="text-white">{t('pilots.carNumber')}</Label>
                <Input
                  id="pilot-car-number"
                  value={newPilot.carNumber}
                  onChange={(e) => setNewPilot({ ...newPilot, carNumber: e.target.value })}
                  placeholder={t('pilots.placeholder.carNumber')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-car-number"
                />
              </div>
              <div>
                <Label htmlFor="pilot-order" className="text-white">{t('pilots.startOrder')}</Label>
                <Input
                  id="pilot-order"
                  type="number"
                  value={newPilot.startOrder}
                  onChange={(e) => setNewPilot({ ...newPilot, startOrder: e.target.value })}
                  placeholder={t('pilots.placeholder.startOrder')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-order"
                />
              </div>
              <div>
                <Label htmlFor="pilot-offset" className="text-white">{t('pilots.timeOffsetMinutes')}</Label>
                <Input
                  id="pilot-offset"
                  type="number"
                  value={newPilot.timeOffsetMinutes}
                  onChange={(e) => setNewPilot({ ...newPilot, timeOffsetMinutes: e.target.value })}
                  placeholder={t('pilots.placeholder.timeOffsetMinutes')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-offset"
                />
              </div>
              <div>
                <Label htmlFor="pilot-picture" className="text-white">{t('pilots.pictureUrl')}</Label>
                <Input
                  id="pilot-picture"
                  value={newPilot.picture}
                  onChange={(e) => setNewPilot({ ...newPilot, picture: e.target.value })}
                  placeholder={t('pilots.placeholder.pictureUrl')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-picture"
                />
              </div>
              <div>
                <Label htmlFor="pilot-stream" className="text-white">{t('pilots.streamUrl')}</Label>
                <Input
                  id="pilot-stream"
                  value={newPilot.streamUrl}
                  onChange={(e) => setNewPilot({ ...newPilot, streamUrl: e.target.value })}
                  placeholder={t('pilots.placeholder.streamUrl')}
                  className="bg-[#09090B] border-zinc-700 text-white"
                  data-testid="input-pilot-stream"
                />
              </div>
              <div className="flex items-end">
                <div className="flex items-center gap-2 rounded border border-zinc-700 bg-[#09090B] px-3 py-2 w-full h-[42px]">
                  <Switch
                    checked={newPilot.isActive}
                    onCheckedChange={(checked) => setNewPilot({ ...newPilot, isActive: Boolean(checked) })}
                    className="data-[state=checked]:bg-[#22C55E]"
                    data-testid="switch-new-pilot-active"
                  />
                  <span className="text-sm text-white">{newPilot.isActive ? t('status.active') : t('status.inactive')}</span>
                </div>
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAddPilot}
                  className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
                  data-testid="button-add-pilot"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('pilots.addPilot')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedPilots.map((pilot) => (
          <Card key={pilot.id} className="bg-[#18181B] border-zinc-800 relative" data-testid={`pilot-card-${pilot.id}`}>
            <CategoryBar categoryId={pilot.categoryId} />
            <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                <StreamThumbnail
                  streamUrl={pilot.streamUrl}
                  name={pilot.name}
                  showAlways={true}
                  hideStreams={hideStreams}
                  className="w-20 h-20 rounded flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm">#{pilot.startOrder || '?'}</span>
                    <span className="text-zinc-400 text-xs">+{pilot.timeOffsetMinutes || 0}m</span>
                    {pilot.carNumber && (
                      <span className="bg-[#FF4500] text-white text-xs font-bold px-1.5 py-0.5 rounded">
                        {pilot.carNumber}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <h3 className="min-w-0 flex-1 font-bold text-lg uppercase truncate text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        {pilot.name}
                      </h3>
                      {displayIdsInSetup && <DebugIdText id={pilot.id} />}
                    </div>
                  </div>
                  {pilot.streamUrl && (
                    <p className="text-xs text-zinc-500 truncate font-mono mt-1">{pilot.streamUrl}</p>
                  )}
                  {(pilot.team || pilot.car) && (
                    <div className="mt-2 space-y-1">
                      {pilot.team && (
                        <p className="text-xs text-zinc-400 truncate">
                          <span className="text-zinc-500">{t('pilots.team')}:</span> {pilot.team}
                        </p>
                      )}
                      {pilot.car && (
                        <p className="text-xs text-zinc-400 truncate">
                          <span className="text-zinc-500">{t('pilots.car')}:</span> {pilot.car}
                        </p>
                      )}
                    </div>
                  )}
                  {(() => {
                    const telemetry = getPersistedPilotTelemetry(pilot.id);
                    const displayLatLong = telemetry.latLong || pilot.latLong || '';
                    const displayLatLongTimestamp = telemetry.latlongTimestamp ?? telemetry.lastLatLongUpdatedAt ?? pilot.latlongTimestamp ?? pilot.lastLatLongUpdatedAt ?? '';
                    return displayLatLong ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-zinc-400 truncate">
                        <span className="text-zinc-500">{t('pilots.latLong')}:</span> {displayLatLong}
                      </p>
                      {displayLatLongTimestamp && (
                        <p className="text-xs text-zinc-500 truncate">
                          <span>{t('pilots.lastLatLongUpdatedAt')}:</span> {new Date(displayLatLongTimestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                    ) : null;
                  })()}
                  {getPersistedPilotTelemetry(pilot.id)?.lastTelemetryAt && (
                    <p className="mt-1 text-[10px] text-zinc-500 truncate font-mono">
                      <span className="text-zinc-600">{t('pilots.telemetry')}:</span> {new Date(getPersistedPilotTelemetry(pilot.id).lastTelemetryAt).toLocaleTimeString()}
                    </p>
                  )}
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        {t('pilots.currentStage')}
                      </Label>
                      <Select
                        value={pilot.currentStageId || 'none'}
                        onValueChange={(value) => setPilotCurrentStage(pilot.id, value === 'none' ? '' : value)}
                      >
                        <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white h-9 text-sm">
                          <SelectValue placeholder={t('common.none')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('common.none')}</SelectItem>
                          {sortedStages.map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {getStageTitle(stage)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={pilot.isActive}
                        onCheckedChange={() => togglePilotActive(pilot.id)}
                        className="data-[state=checked]:bg-[#22C55E]"
                        data-testid={`switch-pilot-active-${pilot.id}`}
                      />
                      <span className="text-sm text-white">{pilot.isActive ? t('status.active') : t('status.inactive')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenPilotTelemetryPage(pilot.id)}
                    disabled={!wsChannelKey}
                    className="text-[#FACC15] hover:text-yellow-300 hover:bg-yellow-500/10 disabled:opacity-40"
                    title="Open pilot telemetry page"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Dialog open={pilotDialogOpen && editingPilot?.id === pilot.id} onOpenChange={(open) => {
                    setPilotDialogOpen(open);
                    if (!open) setEditingPilot(null);
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingPilot({ ...pilot })}
                        className="text-blue-500 hover:text-blue-400 hover:bg-blue-500/10"
                        data-testid={`button-edit-pilot-${pilot.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-[#18181B] border-zinc-800 text-white max-w-5xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle className="text-white">{t('common.edit')} {t('tabs.pilots')}</DialogTitle>
                      </DialogHeader>
                      {editingPilot && (
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <Label className="text-white">{t('pilots.pilotName')} *</Label>
                              <Input
                                value={editingPilot.name}
                                onChange={(e) => setEditingPilot({ ...editingPilot, name: e.target.value })}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.team')}</Label>
                              <Input
                                value={editingPilot.team || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, team: e.target.value })}
                                placeholder={t('pilots.placeholder.team')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.car')}</Label>
                              <Input
                                value={editingPilot.car || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, car: e.target.value })}
                                placeholder={t('pilots.placeholder.car')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.carNumber')}</Label>
                              <Input
                                value={editingPilot.carNumber || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, carNumber: e.target.value })}
                                placeholder={t('pilots.placeholder.carNumber')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.startOrder')}</Label>
                              <Input
                                type="number"
                                value={editingPilot.startOrder || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, startOrder: e.target.value })}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.timeOffsetMinutes')}</Label>
                              <Input
                                type="number"
                                value={editingPilot.timeOffsetMinutes ?? ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, timeOffsetMinutes: e.target.value })}
                                placeholder={t('pilots.placeholder.timeOffsetMinutes')}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <Label className="text-white">{t('pilots.category')}</Label>
                              <Select value={editingPilot.categoryId || 'none'} onValueChange={(val) => setEditingPilot({ ...editingPilot, categoryId: val === 'none' ? null : val })}>
                                <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                                  <SelectValue placeholder={t('common.select')} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t('common.none')}</SelectItem>
                                  {sortedCategories.map((cat) => (
                                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.pictureUrl')}</Label>
                              <Input
                                value={editingPilot.picture || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, picture: e.target.value })}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                            <div>
                              <Label className="text-white">{t('pilots.streamUrl')}</Label>
                              <Input
                                value={editingPilot.streamUrl || ''}
                                onChange={(e) => setEditingPilot({ ...editingPilot, streamUrl: e.target.value })}
                                className="bg-[#09090B] border-zinc-700 text-white"
                              />
                            </div>
                          </div>

                          <Card className="bg-[#09090B] border-zinc-700 h-fit">
                            <CardHeader className="pb-3">
                              <CardTitle className="flex items-center gap-2 uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                                <MapPin className="w-4 h-4 text-[#FF4500]" />
                                {t('pilots.telemetry')}
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-[10px] font-mono text-zinc-500">
                                {t('pilots.pilotId')}: {editingPilot.id}
                              </div>
                              {editingPilot.lastTelemetryAt && (
                                <div className="rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-[10px] font-mono text-zinc-500">
                                  <span className="text-zinc-600">{t('pilots.telemetry')}:</span> {new Date(editingPilot.lastTelemetryAt).toLocaleTimeString()}
                                </div>
                              )}
                              <div>
                                <Label className="flex items-center justify-between gap-2 text-white">
                                  <span>{t('pilots.latLong')}</span>
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                    onClick={() => applyTelemetryPlaceholder('latLong')}
                                    title={t('common.apply')}
                                    aria-label={`${t('common.apply')} ${t('pilots.latLong')}`}
                                  >
                                    <Sparkles className="h-3 w-3" />
                                  </button>
                                </Label>
                                <Input
                                  value={editingPilot.latLong || ''}
                                  onChange={(e) => setEditingPilot({ ...editingPilot, latLong: e.target.value })}
                                  placeholder={t('pilots.placeholder.latLong')}
                                  className="bg-[#18181B] border-zinc-700 text-white"
                                />
                              </div>

                              <div>
                                <Label className="text-white">{t('pilots.latLongTimestamp')}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="number"
                                    value={editingPilot.latlongTimestamp ?? editingPilot.lastLatLongUpdatedAt ?? ''}
                                    onChange={(e) => setEditingPilot({
                                      ...editingPilot,
                                      latlongTimestamp: e.target.value,
                                      lastLatLongUpdatedAt: e.target.value
                                    })}
                                    placeholder="1715678901234"
                                    className="bg-[#18181B] border-zinc-700 text-white"
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
                                    onClick={() => setEditingPilot({
                                      ...editingPilot,
                                      latlongTimestamp: Date.now(),
                                      lastLatLongUpdatedAt: Date.now()
                                    })}
                                  >
                                    <Clock3 className="w-4 h-4 mr-1" />
                                    {t('pilots.now')}
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <Label className="flex items-center justify-between gap-2 text-white">
                                    <span className="flex items-center gap-1">
                                      <Gauge className="w-3 h-3 text-[#FF4500]" />
                                      {t('pilots.speed')}
                                    </span>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                      onClick={() => applyTelemetryPlaceholder('speed')}
                                      title={t('common.apply')}
                                      aria-label={`${t('common.apply')} ${t('pilots.speed')}`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                    </button>
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={editingPilot.speed ?? ''}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, speed: e.target.value })}
                                    placeholder="85.5"
                                    className="bg-[#18181B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="flex items-center justify-between gap-2 text-white">
                                    <span className="flex items-center gap-1">
                                      <Navigation2 className="w-3 h-3 text-[#FF4500]" />
                                      {t('pilots.heading')}
                                    </span>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                      onClick={() => applyTelemetryPlaceholder('heading')}
                                      title={t('common.apply')}
                                      aria-label={`${t('common.apply')} ${t('pilots.heading')}`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                    </button>
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={editingPilot.heading ?? ''}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, heading: e.target.value })}
                                    placeholder="180"
                                    className="bg-[#18181B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="flex items-center justify-between gap-2 text-white">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-[#FF4500]" />
                                      {t('pilots.gpsPrecision')}
                                    </span>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                      onClick={() => applyTelemetryPlaceholder('gpsPrecision')}
                                      title={t('common.apply')}
                                      aria-label={`${t('common.apply')} ${t('pilots.gpsPrecision')}`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                    </button>
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={editingPilot.gpsPrecision ?? ''}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, gpsPrecision: e.target.value })}
                                    placeholder="5.0"
                                    className="bg-[#18181B] border-zinc-700 text-white"
                                  />
                                </div>
                                <div>
                                  <Label className="flex items-center justify-between gap-2 text-white">
                                    <span className="flex items-center gap-1">
                                      <Gauge className="w-3 h-3 text-[#FF4500]" />
                                      {t('pilots.gForce')}
                                    </span>
                                    <button
                                      type="button"
                                      className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                      onClick={() => applyTelemetryPlaceholder('gForce')}
                                      title={t('common.apply')}
                                      aria-label={`${t('common.apply')} ${t('pilots.gForce')}`}
                                    >
                                      <Sparkles className="h-3 w-3" />
                                    </button>
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.1"
                                    value={editingPilot.gForce ?? ''}
                                    onChange={(e) => setEditingPilot({ ...editingPilot, gForce: e.target.value })}
                                    placeholder="2.4"
                                    className="bg-[#18181B] border-zinc-700 text-white"
                                  />
                                </div>
                              </div>

                              <Collapsible>
                                <div className="rounded-lg border border-zinc-800 bg-black/25">
                                  <CollapsibleTrigger asChild>
                                    <button
                                      type="button"
                                      className="group flex w-full items-center justify-between px-3 py-2 text-left"
                                    >
                                      <div>
                                        <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                                          {t('pilots.advancedTelemetry')}
                                        </div>
                                      <div className="text-xs text-zinc-500">
                                        {t('pilots.advancedTelemetryDescription')}
                                      </div>
                                      </div>
                                      <ChevronDown className="h-4 w-4 text-zinc-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                                    </button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent className="px-3 pb-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                      <div>
                                        <Label className="flex items-center justify-between gap-2 text-white">
                                          <span>{t('pilots.rpmReal')}</span>
                                          <button
                                            type="button"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                            onClick={() => applyTelemetryPlaceholder('rpmReal')}
                                            title={t('common.apply')}
                                            aria-label={`${t('common.apply')} ${t('pilots.rpmReal')}`}
                                          >
                                            <Sparkles className="h-3 w-3" />
                                          </button>
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          value={editingPilot.rpmReal ?? ''}
                                          onChange={(e) => setEditingPilot({ ...editingPilot, rpmReal: e.target.value })}
                                          placeholder="7421.5"
                                          className="bg-[#18181B] border-zinc-700 text-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="flex items-center justify-between gap-2 text-white">
                                          <span>{t('pilots.rpmPercentage')}</span>
                                          <button
                                            type="button"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                            onClick={() => applyTelemetryPlaceholder('rpmPercentage')}
                                            title={t('common.apply')}
                                            aria-label={`${t('common.apply')} ${t('pilots.rpmPercentage')}`}
                                          >
                                            <Sparkles className="h-3 w-3" />
                                          </button>
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          value={editingPilot.rpmPercentage ?? ''}
                                          onChange={(e) => setEditingPilot({ ...editingPilot, rpmPercentage: e.target.value })}
                                          placeholder="88.3"
                                          className="bg-[#18181B] border-zinc-700 text-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="flex items-center justify-between gap-2 text-white">
                                          <span>{t('pilots.gear')}</span>
                                          <button
                                            type="button"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                            onClick={() => applyTelemetryPlaceholder('gear')}
                                            title={t('common.apply')}
                                            aria-label={`${t('common.apply')} ${t('pilots.gear')}`}
                                          >
                                            <Sparkles className="h-3 w-3" />
                                          </button>
                                        </Label>
                                        <Input
                                          type="number"
                                          step="1"
                                          value={editingPilot.gear ?? ''}
                                          onChange={(e) => setEditingPilot({ ...editingPilot, gear: e.target.value })}
                                          placeholder="4"
                                          className="bg-[#18181B] border-zinc-700 text-white"
                                        />
                                      </div>
                                      <div>
                                        <Label className="flex items-center justify-between gap-2 text-white">
                                          <span>{t('pilots.distance')}</span>
                                          <button
                                            type="button"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-700 bg-black/30 text-zinc-400 transition-colors hover:border-zinc-500 hover:bg-zinc-800 hover:text-white"
                                            onClick={() => applyTelemetryPlaceholder('distance')}
                                            title={t('common.apply')}
                                            aria-label={`${t('common.apply')} ${t('pilots.distance')}`}
                                          >
                                            <Sparkles className="h-3 w-3" />
                                          </button>
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.001"
                                          value={editingPilot.distance ?? ''}
                                          onChange={(e) => setEditingPilot({ ...editingPilot, distance: e.target.value })}
                                          placeholder="1823.412"
                                          className="bg-[#18181B] border-zinc-700 text-white"
                                        />
                                      </div>
                                    </div>
                                  </CollapsibleContent>
                                </div>
                              </Collapsible>

                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800"
                                  onClick={handleSendTelemetryOnly}
                                >
                                  {t('common.send')}
                                </Button>
                              </div>

                              <div className="rounded-lg border border-zinc-800 bg-black/30 p-3 text-xs text-zinc-400">
                                {t('pilots.telemetryHint')}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                      <DialogFooter>
                        <Button onClick={handleUpdatePilot} className="bg-[#FF4500] hover:bg-[#FF4500]/90">
                          {t('common.save')}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(t('common.delete') + '?')) {
                        deletePilot(pilot.id);
                        toast.success('Pilot deleted');
                      }
                    }}
                    className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
                    data-testid={`button-delete-pilot-${pilot.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {sortedPilots.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {t('pilots.noPilots')}
        </div>
      )}

      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {t('pilots.exportTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-zinc-400">{t('pilots.exportDescription')}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {exportColumns.map((column) => (
              <label key={column.id} className="flex items-start gap-3 rounded border border-zinc-700 bg-[#09090B] p-3 cursor-pointer">
                <Checkbox
                  checked={selectedExportColumns.includes(column.id)}
                  onCheckedChange={() => toggleExportColumn(column.id)}
                />
                <span className="text-sm text-white">{column.label}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-zinc-500">
              {t('pilots.exportHint')}
            </p>
            <Button
              onClick={handleExportPilots}
              className="bg-[#FF4500] hover:bg-[#FF4500]/90"
              data-testid="button-export-pilots"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('pilots.exportButton')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
