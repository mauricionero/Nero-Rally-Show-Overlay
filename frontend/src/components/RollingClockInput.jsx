import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { clampTimeDecimals } from '../utils/timeFormat.js';

export const formatRollingClockValue = (value, { showSeconds = true, decimals = 0 } = {}) => {
  if (typeof value !== 'string') {
    return '';
  }

  const safeDecimals = clampTimeDecimals(decimals);
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (!showSeconds) {
    const padded = digits.slice(-4).padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  }

  const fractionLength = safeDecimals > 0
    ? Math.min(safeDecimals, Math.max(0, digits.length - 6))
    : 0;
  const window = digits.slice(-(6 + safeDecimals));
  const wholeDigits = digits.length <= 6
    ? digits.slice(-6)
    : window.slice(0, window.length - fractionLength);
  const fractionDigits = fractionLength > 0
    ? window.slice(-fractionLength)
    : '';
  const padded = wholeDigits.padStart(6, '0');
  const fractionText = fractionDigits ? `.${fractionDigits}` : '';
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}${fractionText}`;
};

export const isRollingClockValueValid = (value, { showSeconds = true, decimals = 0 } = {}) => (
  showSeconds
    ? (
        clampTimeDecimals(decimals) > 0
          ? new RegExp(`^\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,${clampTimeDecimals(decimals)}})?$`).test(value)
          : /^\d{2}:\d{2}:\d{2}$/.test(value)
      )
    : /^\d{2}:\d{2}$/.test(value)
);

export const stepRollingClockMinutes = (value, step = 1, { showSeconds = true, decimals = 0 } = {}) => {
  const safeDecimals = clampTimeDecimals(decimals);
  const fallbackValue = showSeconds
    ? `00:00:00${safeDecimals > 0 ? `.${'0'.repeat(safeDecimals)}` : ''}`
    : '00:00';
  if (!isRollingClockValueValid(value, { showSeconds, decimals: safeDecimals })) {
    return fallbackValue;
  }

  const parts = value.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const secondsPart = showSeconds ? (parts[2] || '0') : null;
  const [secondsText, fractionText = ''] = showSeconds ? secondsPart.split('.') : [];
  const seconds = showSeconds ? Number(secondsText || 0) : null;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || (showSeconds && !Number.isFinite(seconds))) {
    return fallbackValue;
  }

  const totalMinutes = (((hours * 60) + minutes + step) % 1440 + 1440) % 1440;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  const baseValue = `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;

  if (!showSeconds) {
    return baseValue;
  }

  const nextSeconds = String(seconds).padStart(2, '0');
  const fraction = safeDecimals > 0
    ? `.${String(fractionText || '').padEnd(safeDecimals, '0').slice(0, safeDecimals)}`
    : '';
  return `${baseValue}:${nextSeconds}${fraction}`;
};

export default function RollingClockInput({
  value,
  onCommit,
  showSeconds = true,
  decimals = 0,
  readOnly = false,
  className,
  placeholder,
  onBlur,
  onKeyDown,
  ...props
}) {
  const [draftValue, setDraftValue] = useState(value || '');

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  const commitValue = (nextValue) => {
    const formattedValue = formatRollingClockValue(nextValue || '', { showSeconds, decimals });
    setDraftValue(formattedValue);
    onCommit?.(formattedValue);
  };

  return (
    <Input
      value={draftValue}
      onChange={(event) => {
        setDraftValue(formatRollingClockValue(event.target.value, { showSeconds, decimals }));
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || readOnly) {
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          commitValue(draftValue);
          event.currentTarget.blur();
          return;
        }

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const baseValue = isRollingClockValueValid(draftValue, { showSeconds, decimals })
            ? draftValue
            : (showSeconds
              ? `00:00:00${clampTimeDecimals(decimals) > 0 ? `.${'0'.repeat(clampTimeDecimals(decimals))}` : ''}`
              : '00:00');
          const step = event.shiftKey ? 5 : 1;
          setDraftValue(stepRollingClockMinutes(baseValue, event.key === 'ArrowUp' ? step : -step, { showSeconds, decimals }));
        }
      }}
      onBlur={(event) => {
        commitValue(draftValue);
        onBlur?.(event);
      }}
      placeholder={placeholder || (showSeconds ? `HH:MM:SS${clampTimeDecimals(decimals) > 0 ? `.${'0'.repeat(clampTimeDecimals(decimals))}` : ''}` : 'HH:MM')}
      className={className}
      inputMode="numeric"
      readOnly={readOnly}
      {...props}
    />
  );
}
