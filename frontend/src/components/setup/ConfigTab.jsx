import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRallyConfig } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { toast } from 'sonner';
import { Upload, Download, Image, Trash2, Timer } from 'lucide-react';
import { LanguageSelector } from '../LanguageSelector.jsx';
import { getResolvedBrandingLogoUrl } from '../../utils/branding.js';
import { resolvePublicAssetUrl } from '../../utils/overlayUrls.js';
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
    logoUrl,
    setLogoUrl,
    transitionImageUrl,
    setTransitionImageUrl,
    exportData,
    importData,
    clearAllData,
  } = useRallyConfig();

  const fileInputRef = useRef(null);
  const [logoUrlDraft, setLogoUrlDraft] = useState(logoUrl || '');
  const [transitionImageUrlDraft, setTransitionImageUrlDraft] = useState(transitionImageUrl || '');
  const [timeDecimalsDraft, setTimeDecimalsDraft] = useState(String(timeDecimals ?? 0));

  useEffect(() => {
    setLogoUrlDraft(logoUrl || '');
  }, [logoUrl]);

  useEffect(() => {
    setTransitionImageUrlDraft(transitionImageUrl || '');
  }, [transitionImageUrl]);

  useEffect(() => {
    setTimeDecimalsDraft(String(timeDecimals ?? 0));
  }, [timeDecimals]);

  const countedStages = useMemo(() => (
    stages.filter((stage) => isSpecialStageType(stage.type) || isLapRaceStageType(stage.type))
  ), [stages]);
  const streamSourceCount = useMemo(() => (
    pilots.filter((pilot) => pilot.streamUrl).length
    + cameras.filter((camera) => camera.streamUrl).length
  ), [cameras, pilots]);
  const resolvedLogoUrl = useMemo(() => getResolvedBrandingLogoUrl(logoUrl), [logoUrl]);
  const resolvedTransitionImageUrl = useMemo(() => (
    resolvePublicAssetUrl(
      (typeof transitionImageUrl === 'string' && transitionImageUrl.trim()) || '/transition-default.png'
    )
  ), [transitionImageUrl]);

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

  const commitLogoUrl = () => {
    const nextValue = String(logoUrlDraft || '');
    if (nextValue !== String(logoUrl || '')) {
      setLogoUrl(nextValue);
    }
  };

  const commitTransitionImageUrl = () => {
    const nextValue = String(transitionImageUrlDraft || '');
    if (nextValue !== String(transitionImageUrl || '')) {
      setTransitionImageUrl(nextValue);
    }
  };

  const commitTimeDecimals = () => {
    const nextValue = Number(timeDecimalsDraft);
    setTimeDecimals(Number.isFinite(nextValue) ? Math.min(3, Math.max(0, Math.trunc(nextValue))) : 0);
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
                    value={logoUrlDraft}
                    onChange={(e) => setLogoUrlDraft(e.target.value)}
                    onBlur={commitLogoUrl}
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
                    value={transitionImageUrlDraft}
                    onChange={(e) => setTransitionImageUrlDraft(e.target.value)}
                    onBlur={commitTransitionImageUrl}
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
                value={timeDecimalsDraft}
                onChange={(e) => setTimeDecimalsDraft(e.target.value)}
                onBlur={commitTimeDecimals}
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
