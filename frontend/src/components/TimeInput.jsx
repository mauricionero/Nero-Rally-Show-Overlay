import React from 'react';
import { Input } from './ui/input';

export const TimeInput = ({ value, onChange, placeholder = "MM:SS.000", format = "total", ...props }) => {
  const handleChange = (e) => {
    let val = e.target.value;
    
    // Allow numbers, colon, and decimal point
    val = val.replace(/[^0-9:.]/g, '');
    
    onChange(val);
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
