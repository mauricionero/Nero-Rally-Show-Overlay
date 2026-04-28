import React, { useEffect, useMemo, useState } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useRallyWs } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Bug, CalendarDays } from 'lucide-react';
import { DEFAULT_DEBUG_FLAGS, loadDebugFlags, saveDebugFlags } from '../../utils/debugFlags.js';

export default function DebugTab() {
  const { t } = useTranslation();
  const { debugDate, setDebugDate, displayIdsInSetup, setDisplayIdsInSetup } = useRally();
  const {
    wsOwnership,
    wsLatestSnapshotAt,
    wsLastSnapshotGeneratedAt,
    wsLastSnapshotReceivedAt
  } = useRallyWs();
  const [debugFlags, setDebugFlags] = useState(() => loadDebugFlags());
  const [debugDateDraft, setDebugDateDraft] = useState(debugDate || '');

  useEffect(() => {
    setDebugDateDraft(debugDate || '');
  }, [debugDate]);

  const debugOptions = useMemo(() => ([
    {
      key: 'sync',
      title: 'Sync internals',
      description: 'Show centralized sync-engine, session-marker, and websocket apply debug logs.'
    },
    {
      key: 'transport',
      title: 'Transport messages',
      description: 'Show detailed TX/RX/ECHO websocket transport logs.'
    },
    {
      key: 'telemetry',
      title: 'Telemetry logs',
      description: 'Show telemetry-specific debug and warning logs.'
    },
    {
      key: 'replay',
      title: 'Replay time calculations',
      description: 'Show replay-stage timing calculations, chapter matches, offsets, and final video seek values.'
    },
    {
      key: 'connection',
      title: 'Connection lifecycle',
      description: 'Show connection bootstrap, replay, subscribe, and reconnect-service logs.'
    },
    {
      key: 'outbound',
      title: 'Outbound queue',
      description: 'Show outbound package building, chunking, and queue publish logs.'
    },
    {
      key: 'heartbeat',
      title: 'Heartbeat logs',
      description: 'Show ownership heartbeat, lease claim, release, and takeover logs.'
    }
  ]), []);

  const formatSnapshotDateTime = (value) => {
    const timestamp = Number(value || 0);
    if (!timestamp) {
      return '—';
    }

    try {
      return new Date(timestamp).toLocaleString();
    } catch (error) {
      return String(timestamp);
    }
  };

  const isOwner = !!wsOwnership?.hasOwnership;

  const updateDebugFlag = (flagKey, checked) => {
    const nextFlags = {
      ...DEFAULT_DEBUG_FLAGS,
      ...(debugFlags || {}),
      [flagKey]: checked === true
    };
    const savedFlags = saveDebugFlags(nextFlags);
    setDebugFlags(savedFlags);
  };

  return (
    <div className="space-y-4">
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Bug className="w-5 h-5" />
            {t('debug.title')}
          </CardTitle>
          <CardDescription className="text-zinc-400">
            {t('debug.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-white">{t('debug.simulatedDate')}</Label>
            <Input
              type="date"
              value={debugDateDraft}
              onChange={(e) => setDebugDateDraft(e.target.value)}
              onBlur={() => setDebugDate(debugDateDraft)}
              className="bg-[#09090B] border-zinc-700 text-white"
              data-testid="input-debug-date"
            />
            <p className="text-xs text-zinc-500">{t('debug.help')}</p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => setDebugDate('')}
              variant="outline"
              className="border-zinc-700 text-white"
              disabled={!debugDate}
            >
              {t('debug.clearDebugDate')}
            </Button>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <CalendarDays className="w-4 h-4" />
              <span>
                {debugDate ? `${t('debug.activeDate')}: ${debugDate}` : t('debug.usingRealDate')}
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-500">{t('debug.syncNote')}</p>

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div>
              <div className="text-sm font-semibold text-white">{t('debug.setupVisualsTitle')}</div>
              <p className="text-xs text-zinc-500">
                {t('debug.setupVisualsDescription')}
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-[#09090B] px-3 py-3">
              <Checkbox
                checked={displayIdsInSetup === true}
                onCheckedChange={(checked) => setDisplayIdsInSetup(checked === true)}
                className="mt-0.5 border-zinc-600"
              />
              <div className="space-y-1">
                <div className="text-sm font-medium text-white">{t('debug.displayIds')}</div>
                <div className="text-xs text-zinc-500">{t('debug.displayIdsDescription')}</div>
              </div>
            </label>
          </div>

          <div className="space-y-2 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-zinc-400">{t('debug.latestSnapshotKnown')}</span>
              <span className="text-white font-mono text-right">{formatSnapshotDateTime(wsLatestSnapshotAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-zinc-400">{isOwner ? t('debug.lastSnapshotGeneratedAt') : t('debug.lastSnapshotGotAt')}</span>
              <span className="text-white font-mono text-right">
                {formatSnapshotDateTime(isOwner ? wsLastSnapshotGeneratedAt : wsLastSnapshotReceivedAt)}
              </span>
            </div>
          </div>

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div>
              <div className="text-sm font-semibold text-white">Debug logs</div>
              <p className="text-xs text-zinc-500">
                These options are persisted locally and take effect immediately.
              </p>
            </div>

            <div className="space-y-3">
              {debugOptions.map((option) => (
                <label key={option.key} className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-[#09090B] px-3 py-3">
                  <Checkbox
                    checked={debugFlags?.[option.key] === true}
                    onCheckedChange={(checked) => updateDebugFlag(option.key, checked)}
                    className="mt-0.5 border-zinc-600"
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-medium text-white">{option.title}</div>
                    <div className="text-xs text-zinc-500">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
