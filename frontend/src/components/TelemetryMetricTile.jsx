import React from 'react';
import { ArrowUp, Battery, Skull, Snowflake, Thermometer, Wifi } from 'lucide-react';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function SignalStrengthBars({ strength = 0, className = '' }) {
  const normalizedStrength = Math.max(0, Math.min(4, Math.trunc(Number(strength) || 0)));

  return (
    <div className={`flex items-end gap-0.5 ${className}`.trim()} aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={bar <= normalizedStrength ? 'bg-[#22C55E]' : 'bg-white/20'}
          style={{
            width: 3,
            height: 4 + (bar * 2),
            borderRadius: 999
          }}
        />
      ))}
    </div>
  );
}

function BatteryLevelBars({ level = 0, className = '' }) {
  const normalizedLevel = Math.max(1, Math.min(4, Math.trunc(Number(level) || 0)));

  return (
    <div className={`flex items-end gap-0.5 ${className}`.trim()} aria-hidden="true">
      {[1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className={bar <= normalizedLevel ? 'bg-current' : 'bg-white/15'}
          style={{
            width: 3,
            height: 4 + (bar * 2),
            borderRadius: 999,
            opacity: bar <= normalizedLevel ? 1 : 0.6
          }}
        />
      ))}
    </div>
  );
}

function MetricIcon({ icon: Icon, rotation = 0, className = '' }) {
  if (!Icon) {
    return null;
  }

  return (
    <Icon
      className={`h-3 w-3 flex-none ${className}`.trim()}
      style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center' }}
    />
  );
}

const getTemperatureTone = (temperature) => {
  const numericValue = Number(temperature);
  if (!Number.isFinite(numericValue)) {
    return {
      icon: Thermometer,
      iconClassName: 'text-[#38BDF8]'
    };
  }

  if (numericValue < 1) {
    return {
      icon: Snowflake,
      iconClassName: 'text-sky-300'
    };
  }

  if (numericValue < 15) {
    return {
      icon: Thermometer,
      iconClassName: 'text-sky-400'
    };
  }

  if (numericValue <= 40) {
    return {
      icon: Thermometer,
      iconClassName: 'text-emerald-400'
    };
  }

  if (numericValue <= 44) {
    return {
      icon: Thermometer,
      iconClassName: 'text-yellow-300'
    };
  }

  if (numericValue < 48) {
    return {
      icon: Thermometer,
      iconClassName: 'text-red-400'
    };
  }

  return {
    icon: Skull,
    iconClassName: 'text-red-500'
  };
};

const getBatteryTone = (batteryPercent) => {
  const numericValue = Number(batteryPercent);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return {
      level: 0,
      iconClassName: 'text-[#38BDF8]'
    };
  }

  const percent = clamp(numericValue, 0, 100);
  if (percent <= 20) {
    return {
      level: 1,
      iconClassName: 'text-red-400'
    };
  }

  if (percent <= 49) {
    return {
      level: 2,
      iconClassName: 'text-orange-400'
    };
  }

  if (percent <= 69) {
    return {
      level: 3,
      iconClassName: 'text-yellow-300'
    };
  }

  return {
    level: 4,
    iconClassName: 'text-emerald-400'
  };
};

export function TelemetryMetricTile({
  icon,
  iconRotation = 0,
  value = '-',
  suffix = '',
  rawValue = undefined,
  combinedValue = '',
  gearValue = '',
  combined = false,
  connectionType = undefined,
  signalStrength = undefined,
  iconClassName = 'text-[#38BDF8]',
  density = 'compact',
  className = ''
}) {
  const isConnectionTile = connectionType !== undefined || signalStrength !== undefined;
  const isHeadingTile = icon === ArrowUp && iconRotation !== 0;
  const isComfortable = density === 'comfortable';
  const rawNumericValue = Number(rawValue);
  const isBatteryTile = icon === Battery;
  const isTemperatureTile = icon === Thermometer || icon === Snowflake || icon === Skull;
  const batteryTone = isBatteryTile ? getBatteryTone(rawNumericValue) : null;
  const temperatureTone = isTemperatureTile ? getTemperatureTone(rawNumericValue) : null;
  const tileClassName = isComfortable
    ? `min-h-[2.8rem] rounded border border-white/10 px-2.5 py-1.5 ${className}`.trim()
    : `rounded border border-white/10 px-1 py-0.5 ${className}`.trim();
  const iconSizeClass = isComfortable ? 'h-3.5 w-3.5' : 'h-3 w-3';
  const valueClassName = isComfortable
    ? 'min-w-0 truncate font-mono text-[10px] font-bold leading-none text-white'
    : 'min-w-0 truncate font-mono text-[9px] font-bold leading-none text-white';
  const suffixClassName = isComfortable
    ? 'text-[8px] font-bold uppercase tracking-[0.1em] text-zinc-400'
    : 'text-[7px] font-bold uppercase tracking-[0.08em] text-zinc-400';
  const combinedTextClassName = isComfortable
    ? 'min-w-0 whitespace-pre font-mono text-[10px] font-bold leading-none text-white'
    : 'min-w-0 whitespace-pre font-mono text-[9px] font-bold leading-none text-white';

  if (combined) {
    return (
      <div className={`flex min-w-0 items-center gap-1 ${tileClassName}`.trim()}>
        <MetricIcon icon={icon || Battery} rotation={isHeadingTile ? iconRotation : 0} className={`${iconClassName} ${iconSizeClass}`.trim()} />
        <span className={combinedTextClassName}>
          {`${combinedValue || '--'}   ${gearValue || '-'}`}
        </span>
      </div>
    );
  }

  if (isConnectionTile) {
    return (
      <div className={`flex min-w-0 items-center justify-between gap-2 ${tileClassName}`.trim()}>
        <div className="flex min-w-0 items-center gap-1">
          <MetricIcon icon={icon || Wifi} rotation={iconRotation} className={`${iconClassName} ${iconSizeClass}`.trim()} />
          <span className={valueClassName}>
            {connectionType || '-'}
          </span>
        </div>
        <SignalStrengthBars strength={signalStrength} className="flex-none" />
      </div>
    );
  }

  if (isBatteryTile) {
    const batteryLevel = batteryTone?.level || 0;
    const resolvedBatteryIconClass = batteryTone?.iconClassName || iconClassName;
    const hasBatteryInfo = batteryLevel > 0;

    return (
      <div className={`flex min-w-0 items-center justify-center gap-1 ${tileClassName}`.trim()}>
        <MetricIcon icon={Battery} rotation={0} className={`${resolvedBatteryIconClass} ${iconSizeClass}`.trim()} />
        {hasBatteryInfo && (
          <BatteryLevelBars level={batteryLevel} className={resolvedBatteryIconClass} />
        )}
        <span className={valueClassName}>{value}</span>
        {suffix && (
          <span className={suffixClassName}>{suffix}</span>
        )}
      </div>
    );
  }

  if (isTemperatureTile) {
    const resolvedTemperatureIcon = temperatureTone?.icon || icon || Thermometer;
    const resolvedTemperatureIconClass = temperatureTone?.iconClassName || iconClassName;

    return (
      <div className={`flex min-w-0 items-center justify-center gap-1 ${tileClassName}`.trim()}>
        <MetricIcon icon={resolvedTemperatureIcon} rotation={isHeadingTile ? iconRotation : 0} className={`${resolvedTemperatureIconClass} ${iconSizeClass}`.trim()} />
        <span className={`${valueClassName} ${resolvedTemperatureIconClass}`.trim()}>{value}</span>
        {suffix && (
          <span className={`${suffixClassName} ${resolvedTemperatureIconClass}`.trim()}>{suffix}</span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center justify-center gap-1 ${tileClassName}`.trim()}>
      <MetricIcon icon={icon} rotation={isHeadingTile ? iconRotation : 0} className={`${iconClassName} ${iconSizeClass}`.trim()} />
      <span className={valueClassName}>{value}</span>
      {suffix && (
        <span className={suffixClassName}>{suffix}</span>
      )}
    </div>
  );
}

export default TelemetryMetricTile;
