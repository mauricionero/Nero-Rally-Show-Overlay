export const formatMsAsShortTime = (ms, fallback = '--') => {
  if (!Number.isFinite(ms)) return fallback;
  const roundedSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
};
