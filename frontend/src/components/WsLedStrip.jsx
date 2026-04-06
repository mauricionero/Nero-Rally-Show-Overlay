import React from 'react';
import { ArrowDown, ArrowUp, Crown, GitBranch, Mail, Wifi, WifiLow, WifiOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import PerformanceLed from './PerformanceLed.jsx';
import { getLedLoadRgba, getMessagesPerMinuteLoadLevel } from '../utils/ledLoadColors.js';

/**
 * Shared websocket LED strip for Setup, Times, and Overlay.
 *
 * Keeps the status bar consistent across pages while still allowing a compact
 * size preset and optional ownership badge for Setup. The strip only renders
 * indicators; websocket state and counters stay in hooks/context.
 */
const SIZE_PRESETS = {
  compact: {
    badgeClassName: 'flex items-center justify-center gap-1 px-1 py-0 rounded text-[10px] font-bold uppercase tracking-wide border min-w-[20px] h-[16px]',
    iconClassName: 'w-3 h-3',
    performanceClassName: 'flex items-center justify-center gap-1 px-1 py-0 rounded text-[10px] font-bold uppercase tracking-wide border min-w-[20px] h-[16px] border-zinc-700',
    performanceIconClassName: 'w-3 h-3 text-black/80'
  },
  tiny: {
    badgeClassName: 'inline-flex items-center justify-center rounded border min-w-[16px] h-[16px] px-0.5',
    iconClassName: 'w-2.5 h-2.5',
    performanceClassName: 'inline-flex items-center justify-center rounded border min-w-[16px] h-[16px] px-0.5 border-zinc-700',
    performanceIconClassName: 'w-2.5 h-2.5 text-black/80'
  }
};

export default function WsLedStrip({
  wsEnabled,
  wsConnectionStatus,
  activityAgeMs,
  counts,
  ownership = null,
  size = 'compact',
  performanceIcon = null,
  className = ''
}) {
  const preset = SIZE_PRESETS[size] || SIZE_PRESETS.compact;
  const {
    messagesLastMinute = 0,
    messagesThisSecond = 0,
    receivedMessagesLastMinute = 0,
    receivedMessagesThisSecond = 0,
    sentMessagesLastMinute = 0,
    sentMessagesThisSecond = 0
  } = counts || {};

  const connectionBadge = (() => {
    if (!wsEnabled) return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', Icon: WifiOff };
    if (wsConnectionStatus === 'connecting') return { color: 'bg-[#FACC15] text-black border-transparent', Icon: WifiLow };
    if (wsConnectionStatus === 'connected') return { color: 'bg-[#22C55E] text-black border-transparent', Icon: Wifi };
    if (wsConnectionStatus === 'suspended') return { color: 'bg-[#F97316] text-black border-transparent', Icon: WifiLow };
    if (wsConnectionStatus === 'failed' || wsConnectionStatus === 'error') return { color: 'bg-[#EF4444] text-white border-transparent', Icon: WifiOff };
    return { color: 'bg-zinc-800 text-zinc-400 border-zinc-700', Icon: WifiOff };
  })();

  const activityProgress = wsEnabled && wsConnectionStatus === 'connected' && activityAgeMs !== null
    ? Math.max(0, 1 - (activityAgeMs / 30000))
    : 0;
  const activityLevel = getMessagesPerMinuteLoadLevel(messagesLastMinute);
  const activityFill = activityProgress > 0
    ? getLedLoadRgba(activityLevel, 0.2 + (0.8 * activityProgress))
    : 'rgba(63, 63, 70, 0.45)';
  const ConnectionIcon = connectionBadge.Icon;
  const OwnershipIcon = ownership?.isPrimary ? Crown : GitBranch;

  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {ownership && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`${preset.badgeClassName} ${ownership.isPrimary ? 'bg-[#FACC15] text-black border-transparent' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                <OwnershipIcon className={preset.iconClassName} />
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
              <div className="text-xs">
                <div className="font-semibold">{ownership.title}</div>
                <div>Status: {ownership.label}</div>
                <div>{ownership.description}</div>
                <div className="text-zinc-400">Owner ID: {ownership.ownerId || 'none'}</div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={`${preset.badgeClassName} ${connectionBadge.color}`}>
              <ConnectionIcon className={preset.iconClassName} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
            <div className="text-xs">
              <div className="font-semibold">WebSocket Connection</div>
              <div>Status: {wsConnectionStatus}</div>
              <div>State badge only reflects socket connection state.</div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`${preset.badgeClassName} border-zinc-700 transition-all duration-500`}
              style={{ backgroundColor: activityFill }}
            >
              <Mail className={`${preset.iconClassName} ${activityProgress > 0 ? 'text-black/80' : 'text-zinc-400'}`} />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-[#111827] text-white border border-[#374151]">
            <div className="text-xs">
              <div className="font-semibold">Message Activity</div>
              {activityAgeMs !== null ? (
                <>
                  <div>Last message: {Math.round(activityAgeMs / 1000)}s ago</div>
                  <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> Messages last minute: {messagesLastMinute}</div>
                  <div className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Received last minute: {receivedMessagesLastMinute}</div>
                  <div className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Sent last minute: {sentMessagesLastMinute}</div>
                  <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> Messages this second: {messagesThisSecond}</div>
                  <div className="flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Received this second: {receivedMessagesThisSecond}</div>
                  <div className="flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Sent this second: {sentMessagesThisSecond}</div>
                  <div>LED fades from full brightness to off over 30 seconds.</div>
                </>
              ) : (
                <div>No WebSocket messages received yet.</div>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <PerformanceLed
        {...(performanceIcon ? { icon: performanceIcon } : {})}
        className={preset.performanceClassName}
        iconClassName={preset.performanceIconClassName}
      />
    </div>
  );
}
