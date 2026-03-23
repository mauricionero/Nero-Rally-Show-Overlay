import React, { useRef, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger } from '../ui/select';
import { toast } from 'sonner';
import { Upload, Download, Wifi, WifiOff, Copy, Check, Image, Globe, Trash2, Palette } from 'lucide-react';
import { LanguageSelector } from '../LanguageSelector.jsx';
import { EXTERNAL_MEDIA_ICON_OPTIONS, getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { getWebSocketOverlayUrl } from '../../utils/overlayUrls.js';
import { isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';

export default function ConfigTab() {
  const { t } = useTranslation();
  const {
    pilots,
    categories,
    stages,
    cameras,
    chromaKey,
    setChromaKey,
    logoUrl,
    setLogoUrl,
    externalMedia,
    addExternalMedia,
    updateExternalMedia,
    deleteExternalMedia,
    exportData,
    importData,
    clearAllData,
    // WebSocket
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    lastTimesSyncAt,
    connectWebSocket,
    disconnectWebSocket,
    generateNewChannelKey
  } = useRally();

  const fileInputRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [customChroma, setCustomChroma] = useState('#000000');

  const [newMedia, setNewMedia] = useState({ name: '', url: '', icon: 'Map' });
  const CHROMA_PRESETS = [
    { name: t('config.black'), value: '#000000', label: 'K' },
    { name: t('config.greenScreen'), value: '#00B140', label: 'G' },
    { name: t('config.blueScreen'), value: '#0047BB', label: 'B' }
  ];
  const countedStages = stages.filter((stage) => isSpecialStageType(stage.type) || isLapRaceStageType(stage.type));
  const streamSourceCount = pilots.filter((pilot) => pilot.streamUrl).length + cameras.filter((camera) => camera.streamUrl).length;

  const renderMediaIconValue = (iconValue) => {
    const option = EXTERNAL_MEDIA_ICON_OPTIONS.find((item) => item.value === iconValue) || EXTERNAL_MEDIA_ICON_OPTIONS[0];
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

  const handleGenerateKey = () => {
    const key = generateNewChannelKey();
    setNewKey(key);
    toast.success('New channel key generated');
  };

  const handleConnect = async () => {
    if (!newKey.trim()) {
      toast.error('Please generate or enter a channel key');
      return;
    }
    const success = await connectWebSocket(newKey, { role: 'setup' });
    if (success) {
      toast.success('Connected to WebSocket channel');
    } else {
      toast.error('Failed to connect: ' + (wsError || 'Unknown error'));
    }
  };

  const handleCopyKey = () => {
    const keyToCopy = wsChannelKey || newKey;
    if (keyToCopy) {
      navigator.clipboard.writeText(keyToCopy);
      setCopied(true);
      toast.success('Channel key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyOverlayUrl = () => {
    const key = wsChannelKey || newKey;
    const url = getWebSocketOverlayUrl(key);
    navigator.clipboard.writeText(url);
    toast.success('Overlay URL with key copied!');
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
            {logoUrl && (
              <div className="flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700">
                <span className="text-xs text-zinc-400">Preview:</span>
                <img 
                  src={logoUrl} 
                  alt="Logo preview" 
                  className="h-10 max-w-[150px] object-contain"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Language Selection */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Globe className="w-5 h-5" />
            {t('config.language')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.selectLanguage')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageSelector showLabel={false} />
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

      {/* WebSocket Live Sync */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {wsConnectionStatus === 'connected' ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-zinc-500" />}
            {t('config.liveSync')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.liveSyncDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${
              wsConnectionStatus === 'connected' ? 'bg-green-500' :
              wsConnectionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
              wsConnectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
            }`} />
            <span className="text-white capitalize">
              {wsConnectionStatus === 'connected' ? t('config.connected') :
               wsConnectionStatus === 'connecting' ? t('config.connecting') :
               wsConnectionStatus === 'error' ? t('config.error') : t('config.disconnected')}
            </span>
            {wsError && <span className="text-red-400 text-sm">({wsError})</span>}
          </div>

          {wsConnectionStatus === 'connected' ? (
            <div className="space-y-3">
              <div className="bg-[#09090B] p-3 rounded border border-zinc-700">
                <Label className="text-xs text-zinc-400 block mb-1">{t('config.yourChannelKey')}</Label>
                <div className="flex items-center gap-2">
                  <code className="text-[#FACC15] font-mono flex-1 truncate">{wsChannelKey}</code>
                  <Button variant="ghost" size="icon" onClick={handleCopyKey} className="h-8 w-8">
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-zinc-400" />}
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleCopyOverlayUrl}
                variant="outline"
                className="w-full border-zinc-700 text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Overlay URL with Key
              </Button>
              <div className="text-xs text-zinc-400">
                Last times sync: {lastTimesSyncAt ? new Date(lastTimesSyncAt).toLocaleTimeString() : '--'}
              </div>
              <Button
                onClick={disconnectWebSocket}
                variant="destructive"
                className="w-full"
              >
                {t('header.disconnect')}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder={t('config.channelKeyPlaceholder')}
                  className="bg-[#09090B] border-zinc-700 text-white font-mono"
                />
                <Button onClick={handleGenerateKey} variant="outline" className="border-zinc-700 text-white shrink-0">
                  {t('config.generateKey')}
                </Button>
              </div>
              <Button
                onClick={handleConnect}
                disabled={!newKey.trim() || wsConnectionStatus === 'connecting'}
                className="w-full bg-[#FF4500] hover:bg-[#FF4500]/90"
              >
                {wsConnectionStatus === 'connecting' ? t('config.connecting') : t('header.connect')}
              </Button>
            </div>
          )}
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

      {/* Keyboard Shortcuts */}
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>{t('config.keyboardShortcuts')}</CardTitle>
          <CardDescription className="text-zinc-400">{t('config.keyboardShortcutsDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
              <span><kbd className="px-2 py-1 bg-zinc-800 rounded">1</kbd> {t('config.switchToScene')} 1</span>
              <span className="text-zinc-500">{t('scenes.liveStage')}</span>
            </div>
            <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
              <span><kbd className="px-2 py-1 bg-zinc-800 rounded">2</kbd> {t('config.switchToScene')} 2</span>
              <span className="text-zinc-500">{t('scenes.timingTower')}</span>
            </div>
            <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
              <span><kbd className="px-2 py-1 bg-zinc-800 rounded">3</kbd> {t('config.switchToScene')} 3</span>
              <span className="text-zinc-500">{t('scenes.leaderboard')}</span>
            </div>
            <div className="flex justify-between p-2 bg-[#09090B] rounded text-white">
              <span><kbd className="px-2 py-1 bg-zinc-800 rounded">4</kbd> {t('config.switchToScene')} 4</span>
              <span className="text-zinc-500">{t('scenes.pilotFocus')}</span>
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
