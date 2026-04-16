import React, { useMemo } from 'react';
import { Gauge, Navigation2 } from 'lucide-react';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';
import {
  getPilotTelemetryGForce,
  getPilotTelemetryGForceColor,
  isPilotTelemetryFresh,
  toFiniteTelemetryNumber
} from '../utils/pilotTelemetry.js';

function Compass({ heading, compact = false }) {
  if (!Number.isFinite(heading)) {
    return null;
  }

  const sizeClass = compact ? 'h-12 w-12' : 'h-16 w-16';
  const markerClass = compact ? 'text-[9px]' : 'text-[11px]';
  const normalizedHeading = ((heading % 360) + 360) % 360;

  return (
    <div className={`relative ${sizeClass} rounded-full border border-white/30`} style={{ filter: 'drop-shadow(0 3px 10px rgba(0,0,0,0.9))' }}>
      <div className="absolute inset-0 rounded-full border border-white/10" />
      <span className={`absolute left-1/2 top-1 -translate-x-1/2 font-bold text-white/85 ${markerClass}`}>N</span>
      <span className={`absolute right-1 top-1/2 -translate-y-1/2 font-bold text-white/60 ${markerClass}`}>E</span>
      <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 font-bold text-white/60 ${markerClass}`}>S</span>
      <span className={`absolute left-1 top-1/2 -translate-y-1/2 font-bold text-white/60 ${markerClass}`}>W</span>
      <Navigation2
        className={`absolute left-1/2 top-1/2 text-[#FF6A00] ${compact ? 'h-5 w-5' : 'h-7 w-7'}`}
        style={{ transform: `translate(-50%, -50%) rotate(${normalizedHeading}deg)`, filter: 'drop-shadow(0 0 8px rgba(255,106,0,0.95))' }}
      />
    </div>
  );
}

export function PilotTelemetryHud({
  pilot,
  telemetry,
  compact = false,
  raised = false,
  className = ''
}) {
  const telemetryNow = useSecondAlignedClock();
  const speed = toFiniteTelemetryNumber(telemetry?.speed);
  const heading = toFiniteTelemetryNumber(telemetry?.heading);
  const gForce = getPilotTelemetryGForce(telemetry);
  const telemetryIsFresh = isPilotTelemetryFresh(telemetry, telemetryNow, 4000);

  const hasRenderableTelemetry = useMemo(() => (
    speed !== null || heading !== null || gForce !== null
  ), [gForce, heading, speed]);

  if (!pilot || !hasRenderableTelemetry || !telemetryIsFresh) {
    return null;
  }

  const speedText = speed !== null ? `${Math.round(speed)}` : null;
  const gForceText = gForce !== null ? `${gForce >= 10 ? gForce.toFixed(0) : gForce.toFixed(1)}G` : null;
  const gForceColor = getPilotTelemetryGForceColor(gForce);
  const bottomOffsetClass = compact
    ? (raised ? 'bottom-8' : 'bottom-2')
    : (raised ? 'bottom-24' : 'bottom-4');
  const telemetryTextStyle = {
    opacity: 0.85,
    WebkitTextStroke: '0.5px rgba(0, 0, 0, 1)'
  };

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {speedText && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${bottomOffsetClass} flex items-end gap-2 text-white`} style={{ textShadow: '0 0 10px rgba(0,0,0,1), 0 0 28px rgba(0,0,0,0.95)' }}>
          <Gauge className={`${compact ? 'mb-1 h-7 w-7' : 'mb-1 h-10 w-10'} text-[#FF6A00]`} />
          <div className="flex items-end gap-1">
            <span className={`${compact ? 'text-5xl leading-none' : 'text-[9rem] leading-none'} font-black tabular-nums`} style={{ ...telemetryTextStyle, fontFamily: 'Barlow Condensed, sans-serif' }}>
              {speedText}
            </span>
            <span className={`${compact ? 'mb-1 text-base' : 'mb-2 text-2xl'} font-bold uppercase tracking-wide`} style={{ ...telemetryTextStyle, fontFamily: 'Barlow Condensed, sans-serif' }}>
              Km/h
            </span>
          </div>
        </div>
      )}

      {(gForceText || heading !== null) && (
        <div className={`absolute right-3 flex items-end gap-3 text-white ${compact ? (raised ? 'bottom-8' : 'bottom-2') : (raised ? 'bottom-24' : 'bottom-4')}`} style={{ textShadow: '0 0 10px rgba(0,0,0,1), 0 0 28px rgba(0,0,0,0.95)' }}>
          {gForceText && (
            <span className={`${compact ? 'text-2xl' : 'text-4xl'} font-black leading-none tabular-nums`} style={{ ...telemetryTextStyle, color: gForceColor, fontFamily: 'Barlow Condensed, sans-serif' }}>
              {gForceText}
            </span>
          )}
          {heading !== null && <Compass heading={heading} compact={compact} />}
        </div>
      )}
    </div>
  );
}

export default PilotTelemetryHud;
