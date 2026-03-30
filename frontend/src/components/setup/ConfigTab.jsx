import React, { useMemo, useRef, useState } from 'react';
import { useRallyConfig } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';
import { toast } from 'sonner';
import { Upload, Download, Image, Globe, Trash2, Palette, Timer } from 'lucide-react';
import { LanguageSelector } from '../LanguageSelector.jsx';
import { EXTERNAL_MEDIA_ICON_OPTIONS, getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import { isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';

export default function ConfigTab() {
  const { t } = useTranslation();
  const {
    pilots,
    categories,
    stages,
    cameras,
    timeDecimals,
    setTimeDecimals,
    chromaKey,
    setChromaKey,
    logoUrl,
    setLogoUrl,
    transitionImageUrl,
    setTransitionImageUrl,
    externalMedia,
    addExternalMedia,
    updateExternalMedia,
    deleteExternalMedia,
    exportData,
    importData,
    clearAllData,
  } = useRallyConfig();

  const fileInputRef = useRef(null);
  const [customChroma, setCustomChroma] = useState('#000000');

  const [newMedia, setNewMedia] = useState({ name: '', url: '', icon: 'Map' });
  const CHROMA_PRESETS = useMemo(() => ([
    { name: t('config.black'), value: '#000000', label: 'K' },
    { name: t('config.greenScreen'), value: '#00B140', label: 'G' },
    { name: t('config.blueScreen'), value: '#0047BB', label: 'B' }
  ]), [t]);
  const countedStages = useMemo(() => (
    stages.filter((stage) => isSpecialStageType(stage.type) || isLapRaceStageType(stage.type))
  ), [stages]);
  const streamSourceCount = useMemo(() => (
    pilots.filter((pilot) => pilot.streamUrl).length
    + cameras.filter((camera) => camera.streamUrl).length
  ), [cameras, pilots]);
  const mediaOptionByValue = useMemo(() => (
    new Map(EXTERNAL_MEDIA_ICON_OPTIONS.map((option) => [option.value, option]))
  ), []);
  const resolvedLogoUrl = useMemo(() => getResolvedBrandingLogoUrl(logoUrl), [logoUrl]);
  const resolvedTransitionImageUrl = useMemo(() => (
    (typeof transitionImageUrl === 'string' && transitionImageUrl.trim()) || '/transition-default.png'
  ), [transitionImageUrl]);

  const renderMediaIconValue = (iconValue) => {
    const option = mediaOptionByValue.get(iconValue) || EXTERNAL_MEDIA_ICON_OPTIONS[0];
    const Icon = getExternalMediaIconComponent(option.value);

    return (
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#FF4500]" />
        <span>{option.label}</span>
      </div>
    );
  };

  const handleAddMedia = () => {
    if (!newMedia.name.trim() || !newMedia.url.trim()) {
      toast.error(t('config.mediaName') + ' & ' + t('config.mediaUrl') + ' are required');
      return;
    }
    addExternalMedia(newMedia);
    setNewMedia({ name: '', url: '', icon: 'Map' });
    toast.success('Media added successfully');
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rally-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Configuration exported');
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const success = importData(e.target.result);
      if (success) {
        toast.success('Configuration imported successfully');
      } else {
        toast.error('Failed to import configuration');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      {/* Branding */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Image className="w-5 h-5" />
            {t('config.branding')}
          </CardTitle>
          <CardDescription className="text-zinc-400">Customize your channel branding for the overlay</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">{t('config.logoUrl')}</Label>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="flex h-16 w-full items-center justify-center rounded border border-zinc-700 bg-[#09090B] px-3 lg:w-48 lg:shrink-0">
                  <img
                    src={resolvedLogoUrl}
                    alt="Logo preview"
                    className="max-h-12 max-w-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    value={logoUrl || ''}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder={t('config.logoUrlPlaceholder')}
                    className="bg-[#09090B] border-zinc-700 text-white font-mono text-sm"
                    data-testid="input-logo-url"
                  />
                  <p className="text-xs text-zinc-500">
                    Your logo will appear on all overlay scenes. Recommended: PNG with transparent background.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-white">{t('config.transitionImage')}</Label>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                <div className="flex h-16 w-full items-center justify-center rounded border border-zinc-700 bg-[#09090B] px-3 lg:w-48 lg:shrink-0">
                  <img
                    src={resolvedTransitionImageUrl}
                    alt="Transition preview"
                    className="max-h-12 max-w-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div className="flex-1 space-y-2">
                  <Input
                    value={transitionImageUrl || ''}
                    onChange={(e) => setTransitionImageUrl(e.target.value)}
                    placeholder={t('config.transitionImagePlaceholder')}
                    className="bg-[#09090B] border-zinc-700 text-white font-mono text-sm"
                    data-testid="input-transition-image-url"
                  />
                  <p className="text-xs text-zinc-500">
                    Used as the background image for overlay scene transitions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configurations */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Timer className="w-5 h-5" />
            {t('config.configurations')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.configurationsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 max-w-[220px]">
              <Label className="text-white">{t('config.timeDisplay')}</Label>
              <Input
                type="number"
                min="0"
                max="3"
                step="1"
                value={timeDecimals}
                onChange={(e) => {
                  const numericValue = Number(e.target.value);
                  setTimeDecimals(Math.min(3, Math.max(0, Number.isFinite(numericValue) ? Math.trunc(numericValue) : 0)));
                }}
                className="bg-[#09090B] border-zinc-700 text-white"
                data-testid="input-time-decimals"
              />
              <p className="text-xs text-zinc-500">{t('config.timeDecimalsHelp')}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-white">{t('config.language')}</Label>
              <LanguageSelector showLabel={false} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* External Media list (replaces Google Maps section) */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Globe className="w-5 h-5" />
            {t('config.externalMedia')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.externalMediaDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {externalMedia.map((m) => (
              <div key={m.id} className="flex items-center gap-2">
                <Input
                  value={m.name}
                  onChange={(e) => updateExternalMedia(m.id, { ...m, name: e.target.value })}
                  placeholder={t('config.mediaName')}
                  className="bg-[#09090B] border-zinc-700 text-white text-sm"
                />
                <Input
                  value={m.url}
                  onChange={(e) => updateExternalMedia(m.id, { ...m, url: e.target.value })}
                  placeholder={t('config.mediaUrl')}
                  className="bg-[#09090B] border-zinc-700 text-white text-sm font-mono"
                />
                <Select
                  value={m.icon || 'Map'}
                  onValueChange={(value) => updateExternalMedia(m.id, { ...m, icon: value })}
                >
                  <SelectTrigger className="w-[140px] shrink-0 bg-[#09090B] border-zinc-700 text-white text-sm">
                    {renderMediaIconValue(m.icon || 'Map')}
                  </SelectTrigger>
                  <SelectContent>
                    {EXTERNAL_MEDIA_ICON_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {renderMediaIconValue(option.value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteExternalMedia(m.id)}
                  className="h-7 w-7 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}

            <div className="flex items-center gap-2">
              <Input
                value={newMedia.name}
                onChange={(e) => setNewMedia({ ...newMedia, name: e.target.value })}
                placeholder={t('config.mediaName')}
                className="bg-[#09090B] border-zinc-700 text-white text-sm"
              />
              <Input
                value={newMedia.url}
                onChange={(e) => setNewMedia({ ...newMedia, url: e.target.value })}
                placeholder={t('config.mediaUrl')}
                className="bg-[#09090B] border-zinc-700 text-white text-sm font-mono"
              />
              <Select
                value={newMedia.icon}
                onValueChange={(value) => setNewMedia({ ...newMedia, icon: value })}
              >
                <SelectTrigger className="w-[140px] shrink-0 bg-[#09090B] border-zinc-700 text-white text-sm">
                  {renderMediaIconValue(newMedia.icon)}
                </SelectTrigger>
                <SelectContent>
                  {EXTERNAL_MEDIA_ICON_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {renderMediaIconValue(option.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddMedia}
                className="bg-[#FF4500] hover:bg-[#FF4500]/90"
                data-testid="button-add-media"
              >
                {t('config.addMedia')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('config.dataManagement')}</CardTitle>
          <CardDescription className="text-zinc-400">Export or import your configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={handleExport}
              variant="outline"
              className="flex-1 border-zinc-700 text-white"
              data-testid="button-export-config"
            >
              <Download className="w-4 h-4 mr-2" />
              {t('config.exportJson')}
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              variant="outline"
              className="flex-1 border-zinc-700 text-white"
              data-testid="button-import-config"
            >
              <Upload className="w-4 h-4 mr-2" />
              {t('config.importJson')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </div>
          <div className="pt-4 border-t border-zinc-700">
            <Button
              onClick={() => {
                if (window.confirm(t('config.clearDataConfirm'))) {
                  clearAllData();
                  toast.success('All data cleared');
                }
              }}
              variant="destructive"
              className="w-full"
              data-testid="button-clear-all"
            >
              {t('config.clearAllData')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chroma Key */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Palette className="w-5 h-5" />
            {t('config.backgroundChromaKey')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.selectBackground')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {CHROMA_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setChromaKey(preset.value)}
                className={`px-4 py-2 rounded border-2 transition-all hover:scale-105 ${
                  chromaKey === preset.value ? 'border-[#FF4500]' : 'border-zinc-700'
                }`}
                style={{ backgroundColor: preset.value }}
                data-testid={`chroma-${preset.label.toLowerCase()}-button`}
              >
                <span className="text-white font-bold" style={{ textShadow: '0 0 4px rgba(0,0,0,0.8)' }}>
                  {preset.name}
                </span>
              </button>
            ))}
            <div className="flex gap-2 items-center">
              <Input
                type="color"
                value={customChroma}
                onChange={(e) => setCustomChroma(e.target.value)}
                className="w-16 h-10 cursor-pointer"
                data-testid="custom-chroma-picker"
              />
              <Button
                onClick={() => setChromaKey(customChroma)}
                variant="outline"
                className="border-zinc-700 text-white"
                data-testid="apply-custom-chroma-button"
              >
                {t('config.applyCustom')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Summary */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('config.currentSummary')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{pilots.length}</div>
              <div className="text-sm text-zinc-400">{t('config.pilotsCount')}</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{categories.length}</div>
              <div className="text-sm text-zinc-400">{t('config.categoriesCount')}</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#FF4500]">{countedStages.length}</div>
              <div className="text-sm text-zinc-400">{t('config.stagesCount')}</div>
            </div>
            <div className="bg-[#09090B] p-4 rounded">
              <div className="text-3xl font-bold text-[#22C55E]">{streamSourceCount}</div>
              <div className="text-sm text-zinc-400">{t('config.liveSourcesCount')}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
