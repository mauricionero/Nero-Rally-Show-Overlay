import React from 'react';
import { useRallyTiming, useRallyWs } from '../contexts/RallyContext.jsx';
import { useTranslation } from '../contexts/TranslationContext.jsx';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Clock3, Check, CheckCheck, CircleX } from 'lucide-react';

const SosDeliveryIndicator = ({ status, tooltipText }) => {
  if (!status) {
    return null;
  }

  if (status === 'sending') {
    return <Clock3 className="w-3.5 h-3.5 text-zinc-400" aria-label={tooltipText} />;
  }

  if (status === 'sent') {
    return <Check className="w-3.5 h-3.5 text-zinc-300" aria-label={tooltipText} />;
  }

  if (status === 'acked') {
    return <CheckCheck className="w-3.5 h-3.5 text-[#22C55E]" aria-label={tooltipText} />;
  }

  if (status === 'error') {
    return <CircleX className="w-3.5 h-3.5 text-red-500" aria-label={tooltipText} />;
  }

  return null;
};

const getEffectiveSosStatus = (sosLevel, sosDelivery) => {
  const normalizedLevel = Number(sosLevel || 0);
  const deliveryStatus = String(sosDelivery?.status || '').trim();

  if (deliveryStatus === 'error') {
    return 'error';
  }

  if (deliveryStatus === 'acked' || normalizedLevel >= 3) {
    return 'acked';
  }

  if (deliveryStatus === 'sent' || normalizedLevel >= 2) {
    return 'sent';
  }

  if (deliveryStatus === 'sending' || normalizedLevel >= 1) {
    return 'sending';
  }

  return '';
};

export default function PilotStatusBadges({ pilotId, stageId, compact = false }) {
  const { t } = useTranslation();
  const { retiredStages, stageAlerts, stageSos } = useRallyTiming();
  const { getSosDeliveryStatus } = useRallyWs();

  const retired = !!retiredStages?.[pilotId]?.[stageId];
  const alert = !!stageAlerts?.[pilotId]?.[stageId];
  const sosLevel = Number(stageSos?.[pilotId]?.[stageId] || 0);
  const sos = sosLevel > 0;
  const sosDelivery = getSosDeliveryStatus(pilotId, stageId);

  if (!retired && !alert && !sos) {
    return null;
  }

  const effectiveSosStatus = getEffectiveSosStatus(sosLevel, sosDelivery);
  const sosTooltipText = effectiveSosStatus === 'sending'
    ? t('status.sosDeliverySending')
    : effectiveSosStatus === 'sent'
      ? t('status.sosDeliverySent')
      : effectiveSosStatus === 'acked'
        ? t('status.sosDeliveryAcked')
        : effectiveSosStatus === 'error'
          ? (sosDelivery?.errorMessage || t('status.sosDeliveryError'))
          : t('status.sosTooltip');

  const containerClassName = compact
    ? 'inline-flex items-center gap-1 whitespace-nowrap shrink-0'
    : 'flex flex-wrap items-center gap-1 max-w-full min-w-0';
  const badgeClassName = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold';

  return (
    <div className={containerClassName}>
      {retired && (
        <span className={`${badgeClassName} bg-red-500/20 text-red-400`}>
          RET
        </span>
      )}
      {alert && (
        <span className={`${badgeClassName} bg-amber-500/20 text-amber-300`}>
          <span aria-hidden="true">⚠️</span>
        </span>
      )}
      {sos && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`${badgeClassName} bg-red-500/20 text-red-300`}>
                <span aria-hidden="true">🆘</span>
                {effectiveSosStatus && (
                  <SosDeliveryIndicator
                    status={effectiveSosStatus}
                    tooltipText={sosTooltipText}
                  />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">{sosTooltipText}</div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
