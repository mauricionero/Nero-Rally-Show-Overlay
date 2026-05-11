import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from './ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

const formatDisplayDate = (value) => {
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }

  return value;
};

const formatIsoDate = (date) => {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value) => {
  if (!value) return undefined;

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export default function DateInput({
  value,
  onCommit,
  onBlur,
  className,
  placeholder = 'Select date',
  disabled = false,
  ...props
}) {
  const [draftValue, setDraftValue] = useState(value || '');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setDraftValue(value || '');
  }, [value]);

  const selectedDate = useMemo(() => parseIsoDate(draftValue), [draftValue]);
  const displayValue = formatDisplayDate(draftValue);

  const commitValue = (nextValue) => {
    const normalizedValue = nextValue || '';
    setDraftValue(normalizedValue);
    onCommit?.(normalizedValue);
    onBlur?.();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-md border border-zinc-700 bg-[#09090B] px-3 text-left text-white shadow-sm transition-colors hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF4500] disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        >
          <CalendarDays className="h-4 w-4 flex-none text-[#FF4500] drop-shadow-[0_0_6px_rgba(255,69,0,0.35)]" />
          <span className={cn('min-w-0 flex-1 truncate text-sm', !displayValue && 'text-zinc-500')}>
            {displayValue || placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto border-zinc-700 bg-[#09090B] p-0 text-white" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(nextDate) => {
            if (!nextDate) return;
            commitValue(formatIsoDate(nextDate));
            setOpen(false);
          }}
          className="rounded-md border-none"
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
