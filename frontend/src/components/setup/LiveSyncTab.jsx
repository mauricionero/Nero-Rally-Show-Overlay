import React, { useState } from 'react';
import { useRallyWs } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { toast } from 'sonner';
import { Wifi, WifiOff, Copy, Check } from 'lucide-react';
import { getWebSocketOverlayUrl, getWebSocketTimesUrl } from '../../utils/overlayUrls.js';

export default function LiveSyncTab() {
  const { t } = useTranslation();
  const {
    wsChannelKey,
    wsConnectionStatus,
    wsError,
    lastTimesSyncAt,
    connectSyncChannel,
    disconnectSyncChannel,
    generateNewChannelKey
  } = useRallyWs();

  const [copied, setCopied] = useState(false);
  const [newKey, setNewKey] = useState('');

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
    const success = await connectSyncChannel(newKey, { role: 'setup' });
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
    toast.success(t('config.copyOverlayUrlSuccess'));
  };

  const handleCopyTimesUrl = () => {
    const key = wsChannelKey || newKey;
    const url = getWebSocketTimesUrl(key);
    navigator.clipboard.writeText(url);
    toast.success(t('config.copyTimesUrlSuccess'));
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {wsConnectionStatus === 'connected' ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-zinc-500" />}
            {t('config.liveSync')}
          </CardTitle>
          <CardDescription className="text-zinc-400">{t('config.liveSyncDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button
                  onClick={handleCopyOverlayUrl}
                  variant="outline"
                  className="border-zinc-700 text-white"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {t('config.copyOverlayUrl')}
                </Button>
                <Button
                  onClick={handleCopyTimesUrl}
                  variant="outline"
                  className="border-zinc-700 text-white"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  {t('config.copyTimesUrl')}
                </Button>
              </div>
              <div className="text-xs text-zinc-400">
                Last times sync: {lastTimesSyncAt ? new Date(lastTimesSyncAt).toLocaleTimeString() : '--'}
              </div>
              <Button
                onClick={disconnectSyncChannel}
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
    </div>
  );
}
