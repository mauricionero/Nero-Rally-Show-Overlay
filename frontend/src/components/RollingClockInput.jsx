import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';

export const formatRollingClockValue = (value, { showSeconds = true } = {}) => {
  if (typeof value !== 'string') {
    return '';
  }

  const maxDigits = showSeconds ? 6 : 4;
  const digits = value.replace(/\D/g, '').slice(-maxDigits);
  if (!digits) {
    return '';
  }

  if (!showSeconds) {
    const padded = digits.padStart(4, '0');
    return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
  }

  const padded = digits.padStart(6, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
};

export const isRollingClockValueValid = (value, { showSeconds = true } = {}) => (
  showSeconds
    ? /^\d{2}:\d{2}:\d{2}$/.test(value)
    : /^\d{2}:\d{2}$/.test(value)
);

export const stepRollingClockMinutes = (value, step = 1, { showSeconds = true } = {}) => {
  const fallbackValue = showSeconds ? '00:00:00' : '00:00';
  if (!isRollingClockValueValid(value, { showSeconds })) {
    return fallbackValue;
  }

  const parts = value.split(':');
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = showSeconds ? Number(parts[2] || 0) : null;

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

  return `${baseValue}:${String(seconds).padStart(2, '0')}`;
};

export default function RollingClockInput({
  value,
  onCommit,
  showSeconds = true,
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
    const formattedValue = formatRollingClockValue(nextValue || '', { showSeconds });
    setDraftValue(formattedValue);
    onCommit?.(formattedValue);
  };

  return (
    <Input
      value={draftValue}
      onChange={(event) => {
        setDraftValue(formatRollingClockValue(event.target.value, { showSeconds }));
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
          const baseValue = isRollingClockValueValid(draftValue, { showSeconds })
            ? draftValue
            : (showSeconds ? '00:00:00' : '00:00');
          const step = event.shiftKey ? 5 : 1;
          setDraftValue(stepRollingClockMinutes(baseValue, event.key === 'ArrowUp' ? step : -step, { showSeconds }));
        }
      }}
      onBlur={(event) => {
        commitValue(draftValue);
        onBlur?.(event);
      }}
      placeholder={placeholder || (showSeconds ? 'HH:MM:SS' : 'HH:MM')}
      className={className}
      inputMode="numeric"
      readOnly={readOnly}
      {...props}
    />
  );
}
