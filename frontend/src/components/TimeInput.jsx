import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { clampTimeDecimals } from '../utils/timeFormat.js';
import { getTimeInputPlaceholder, normalizeTimingInput } from '../utils/timeConversion.js';

const formatDraftTimeValue = (value, decimals = 3) => {
  const safeDecimals = clampTimeDecimals(decimals);
  const digits = String(value ?? '').replace(/\D/g, '');

  if (!digits) {
    return '';
  }

  const fractionLength = safeDecimals > 0
    ? Math.min(safeDecimals, Math.max(0, digits.length - 4))
    : 0;
  const window = digits.slice(-(4 + safeDecimals));
  const wholeDigits = digits.length <= 4
    ? digits.slice(-4)
    : window.slice(0, window.length - fractionLength);
  const fractionDigits = fractionLength > 0
    ? window.slice(-fractionLength)
    : '';
  const padded = wholeDigits.padStart(4, '0');
  const fractionText = fractionDigits ? `.${fractionDigits}` : '';
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}${fractionText}`;
};

export const TimeInput = ({ value, onChange, placeholder, format = 'total', decimals = 3, onBlur, onKeyDown, readOnly = false, ...props }) => {
  const [draftValue, setDraftValue] = useState(() => formatDraftTimeValue(value, decimals));

  useEffect(() => {
    setDraftValue(formatDraftTimeValue(value, decimals));
  }, [decimals, value]);

  const commitValue = (nextValue) => {
    const formattedValue = normalizeTimingInput(formatDraftTimeValue(nextValue, decimals), decimals);
    setDraftValue(formatDraftTimeValue(formattedValue, decimals));
    onChange?.(formattedValue);
  };

  return (
    <Input
      {...props}
      value={draftValue}
      onChange={(event) => {
        setDraftValue(formatDraftTimeValue(event.target.value, decimals));
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
        }
      }}
      onBlur={(event) => {
        commitValue(draftValue);
        onBlur?.(event);
      }}
      placeholder={placeholder || getTimeInputPlaceholder(format, decimals)}
      inputMode="numeric"
      readOnly={readOnly}
    />
  );
};
