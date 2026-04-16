import React from 'react';

export default function DebugIdText({ id, className = '' }) {
  const text = String(id || '').trim();

  if (!text) {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center rounded border border-zinc-700/70 bg-zinc-900/70 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-zinc-500 ${className}`.trim()}
    >
      {text}
    </span>
  );
}
