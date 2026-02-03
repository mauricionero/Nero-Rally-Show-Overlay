import React from 'react';
import { Input } from './ui/input';

export const TimeInput = ({ value, onChange, placeholder = "MM:SS.000", ...props }) => {
  const formatTime = (val) => {
    // Remove non-numeric and non-dot characters
    let cleaned = val.replace(/[^0-9.]/g, '');
    
    // Split by dot to handle minutes:seconds.decimals
    const parts = cleaned.split('.');
    let main = parts[0] || '';
    let decimal = parts[1] || '';
    
    // Limit decimal to 3 digits
    if (decimal.length > 3) {
      decimal = decimal.substring(0, 3);
    }
    
    // Format main part as MM:SS
    if (main.length === 0) return '';
    if (main.length <= 2) {
      // Only minutes
      return decimal ? `${main}.${decimal}` : main;
    }
    
    // Extract last 2 digits as seconds, rest as minutes
    const seconds = main.slice(-2);
    const minutes = main.slice(0, -2);
    
    let formatted = `${minutes}:${seconds}`;
    if (decimal) {
      formatted += `.${decimal}`;
    }
    
    return formatted;
  };

  const handleChange = (e) => {
    const formatted = formatTime(e.target.value);
    onChange(formatted);
  };

  return (
    <Input
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      {...props}
    />
  );
};
