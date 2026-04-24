import React, { useEffect, useState } from 'react';
import { Input } from './ui/input';

export default function DateInput({
  value,
  onCommit,
  onBlur,
  onKeyDown,
  className,
  ...props
}) {
  const [draftValue, setDraftValue] = useState(value || '');

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  const commitValue = (nextValue) => {
    onCommit?.(nextValue || '');
  };

  return (
    <Input
      type="date"
      value={draftValue}
      onChange={(event) => setDraftValue(event.target.value)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) {
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
      className={className}
      style={{ colorScheme: 'light' }}
      {...props}
    />
  );
}
