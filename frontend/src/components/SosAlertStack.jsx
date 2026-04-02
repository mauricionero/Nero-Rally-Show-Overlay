import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, RadioTower } from 'lucide-react';
import { useRallyMeta, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Button } from './ui/button.jsx';

export default function SosAlertStack({ offsetClassName = 'top-16' }) {
  const { t } = useTranslation();
  const { pilots, stages } = useRallyMeta();
  const {
    pendingSosAlerts,
    acknowledgeSosAlert,
    wsConnectionStatus
  } = useRallyWs();

  const pilotById = useMemo(
    () => new Map((pilots || []).map((pilot) => [pilot.id, pilot])),
    [pilots]
  );
  const stageById = useMemo(
    () => new Map((stages || []).map((stage) => [stage.id, stage])),
    [stages]
  );

  if (!Array.isArray(pendingSosAlerts) || pendingSosAlerts.length === 0) {
    return null;
  }

  return (
    <div className={`fixed left-3 right-3 ${offsetClassName} z-[70] pointer-events-none`}>
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        {pendingSosAlerts.map((alert) => {
          const pilot = pilotById.get(alert.pilotId) || null;
          const stage = stageById.get(alert.stageId) || null;
          const pilotNumber = pilot?.carNumber || pilot?.startOrder || '?';
          const pilotName = pilot?.name || alert.pilotId;
          const stageName = stage?.name || alert.stageId;

          return (
            <div
              key={alert.notificationId}
              className="pointer-events-auto overflow-hidden rounded-xl border border-red-500/60 bg-[#1a0c0c]/95 shadow-[0_20px_80px_rgba(220,38,38,0.28)] backdrop-blur"
            >
              <div className="flex items-center gap-3 border-b border-red-500/30 bg-red-600/12 px-4 py-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_0_24px_rgba(239,68,68,0.35)]">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black uppercase tracking-[0.22em] text-red-200">
                    {t('status.sosIncomingTitle')}
                  </div>
                  <div className="text-xs text-red-100/80">
                    {t('status.sosIncomingDescription')}
                  </div>
                </div>
                <div className="rounded-full border border-amber-400/40 bg-amber-300 px-3 py-1 text-lg font-black leading-none text-black">
                  {pilotNumber}
                </div>
              </div>

              <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-black uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {pilotName}
                  </div>
                  <div className="mt-1 text-sm text-zinc-200">
                    {t('status.sosIncomingStage')}: {stageName}
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => acknowledgeSosAlert(alert.notificationId)}
                  disabled={wsConnectionStatus !== 'connected'}
                  className="h-10 min-w-[164px] bg-[#16A34A] text-white hover:bg-[#15803D] disabled:bg-zinc-700 disabled:text-zinc-300"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {t('status.confirmSosSeen')}
                </Button>
              </div>

              {wsConnectionStatus !== 'connected' && (
                <div className="flex items-center gap-2 border-t border-zinc-800/80 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  <RadioTower className="h-3.5 w-3.5" />
                  {t('status.sosConfirmationNeedsConnection')}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
