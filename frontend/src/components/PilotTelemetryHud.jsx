import React, { useMemo } from 'react';
import { Gauge, Navigation2 } from 'lucide-react';
import { useSecondAlignedClock } from '../hooks/useSecondAlignedClock.js';
import {
  getPilotTelemetryGForce,
  getPilotTelemetryGForceColor,
  isPilotTelemetryFresh,
  toFiniteTelemetryNumber
} from '../utils/pilotTelemetry.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

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

function RpmHalfGauge({ progress, gearText, compact = false }) {
  const normalizedProgress = Number.isFinite(progress) ? clamp(progress, 0, 1) : 0;
  const sizeClass = compact ? 'h-20 w-32' : 'h-28 w-44';
  const strokeWidth = compact ? 6 : 7;
  const gaugePath = 'M 12 52 A 38 38 0 0 1 88 52';
  const gaugeColor = normalizedProgress > 0.8 ? '#ed1717' : '#1ad35e';

  return (
    <div className={`relative ${sizeClass}`}>
      <svg viewBox="0 0 100 60" className="absolute inset-0 h-full w-full overflow-visible">
        <path
          d={gaugePath}
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={gaugePath}
          fill="none"
          stroke={gaugeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - (normalizedProgress * 100)}
          style={{
            opacity: 0.8,
            filter: `drop-shadow(0 0 10px ${gaugeColor}f2)`
          }}
        />
      </svg>

      {gearText && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`${compact ? 'text-5xl' : 'text-7xl'} font-black leading-none tabular-nums text-white`}
            style={{
              fontFamily: 'Barlow Condensed, sans-serif',
              WebkitTextStroke: '0.5px rgba(0, 0, 0, 1)',
              textShadow: '0 0 10px rgba(0,0,0,0.9), 0 0 18px rgba(0,0,0,0.75)',
              transform: 'translateY(6px)'
            }}
          >
            {gearText}
          </span>
        </div>
      )}
    </div>
  );
}

export function PilotTelemetryHud({
  pilot,
  telemetry,
  trackLengthTotal: trackLengthTotalProp = null,
  compact = false,
  raised = false,
  className = ''
}) {
  const telemetryNow = useSecondAlignedClock();
  const speed = toFiniteTelemetryNumber(telemetry?.speed);
  const heading = toFiniteTelemetryNumber(telemetry?.heading);
  const gForce = getPilotTelemetryGForce(telemetry);
  const rpmReal = toFiniteTelemetryNumber(telemetry?.rpmReal ?? telemetry?.rpm);
  const rpmPercentage = toFiniteTelemetryNumber(telemetry?.rpmPercentage);
  const gear = toFiniteTelemetryNumber(telemetry?.gear);
  const distance = toFiniteTelemetryNumber(telemetry?.distance);
  const trackLengthTotal = toFiniteTelemetryNumber(trackLengthTotalProp);
  const telemetryIsFresh = isPilotTelemetryFresh(telemetry, telemetryNow, 10000);

  const hasRenderableTelemetry = useMemo(() => (
    speed !== null || heading !== null || gForce !== null || rpmReal !== null || rpmPercentage !== null || gear !== null || distance !== null
  ), [distance, gear, gForce, heading, rpmPercentage, rpmReal, speed]);

  if (!pilot || !hasRenderableTelemetry || !telemetryIsFresh) {
    return null;
  }

  const speedText = speed !== null ? `${Math.round(speed)}` : null;
  const gForceText = gForce !== null ? `${gForce >= 10 ? gForce.toFixed(0) : gForce.toFixed(1)}G` : null;
  const gForceColor = getPilotTelemetryGForceColor(gForce);
  const gearText = gear !== null
    ? (gear === -1 ? 'R' : `${Math.trunc(gear)}`)
    : null;
  const rpmProgress = (() => {
    if (rpmPercentage !== null) {
      return clamp(rpmPercentage / 100, 0, 1);
    }

    if (rpmReal !== null) {
      return clamp(rpmReal / 8000, 0, 1);
    }

    return null;
  })();
  const distanceProgress = Number.isFinite(distance) && Number.isFinite(trackLengthTotal) && trackLengthTotal > 0
    ? Math.max(0, Math.min(1, distance / (trackLengthTotal * 1000)))
    : null;
  const bottomOffsetClass = compact
    ? (raised ? 'bottom-10' : 'bottom-4')
    : (raised ? 'bottom-28' : 'bottom-10');
  const telemetryTextStyle = {
    opacity: 0.85,
    WebkitTextStroke: '0.5px rgba(0, 0, 0, 1)'
  };

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {speedText && (
        <div className={`absolute left-1/2 -translate-x-1/2 ${bottomOffsetClass} flex items-end gap-2 text-white`} style={{ textShadow: '0 0 10px rgba(0,0,0,1), 0 0 28px rgba(0,0,0,0.95)' }}>
          <div className="flex items-end gap-1">
            <span className={`${compact ? 'text-6xl leading-none' : 'text-[10rem] leading-none'} font-black tabular-nums`} style={{ ...telemetryTextStyle, fontFamily: 'Barlow Condensed, sans-serif' }}>
              {speedText}
            </span>
            <span className={`${compact ? 'mb-1 text-base' : 'mb-2 text-2xl'} font-bold uppercase tracking-wide`} style={{ ...telemetryTextStyle, fontFamily: 'Barlow Condensed, sans-serif' }}>
              Km/h
            </span>
          </div>
        </div>
      )}

      {(gForceText || heading !== null || gearText || rpmProgress !== null || distanceProgress !== null) && (
        <div className={`absolute right-3 ${compact ? (raised ? 'bottom-10' : 'bottom-4') : (raised ? 'bottom-28' : 'bottom-10')} text-white`} style={{ textShadow: '0 0 10px rgba(0,0,0,1), 0 0 28px rgba(0,0,0,0.95)' }}>
          <div className="flex flex-col items-end gap-2">
            {heading !== null && <Compass heading={heading} compact={compact} />}

            {gForceText && (
              <span className={`${compact ? 'text-2xl' : 'text-4xl'} font-black leading-none tabular-nums`} style={{ ...telemetryTextStyle, color: gForceColor, fontFamily: 'Barlow Condensed, sans-serif' }}>
                {gForceText}
              </span>
            )}

            {rpmProgress !== null && (
              <RpmHalfGauge
                progress={rpmProgress}
                gearText={gearText}
                compact={compact}
              />
            )}

            {distanceProgress !== null && (
              <div className={`${compact ? 'w-40' : 'w-56'} mt-1 flex flex-col items-end gap-1`} aria-hidden="true">
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/60">
                  <div
                    className="h-full rounded-full bg-[#FF6A00]"
                    style={{
                      width: `${Math.max(0, Math.min(100, distanceProgress * 100))}%`,
                      opacity: 0.9,
                      boxShadow: '0 0 12px rgba(255,106,0,0.95)'
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PilotTelemetryHud;
