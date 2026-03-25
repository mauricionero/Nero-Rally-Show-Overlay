import React from 'react';
import { Input } from './ui/input';
import { getTimeInputPlaceholder, normalizeTimingInput } from '../utils/timeConversion.js';

export const TimeInput = ({ value, onChange, placeholder, format = "total", decimals = 3, ...props }) => {
  const handleChange = (e) => {
    let val = normalizeTimingInput(e.target.value, decimals);
    
    // Allow numbers, colon, and decimal point
    val = val.replace(/[^0-9:.]/g, '');
    
    onChange(val);
  };

  return (
    <Input
      value={value}
      onChange={handleChange}
      placeholder={placeholder || getTimeInputPlaceholder(format, decimals)}
      {...props}
    />
  );
};
