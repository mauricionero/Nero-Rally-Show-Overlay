const LED_LOAD_COLORS = [
  '#00CC00',
  '#2ECC71',
  '#7ED957',
  '#C6E94B',
  '#F4E842',
  '#FFD600',
  '#FFB300',
  '#FF8F00',
  '#FF6F00',
  '#F4511E',
  '#D50000'
];

const clampLevel = (level) => {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(10, Math.round(level)));
};

const hexToRgb = (hexColor) => {
  const normalized = hexColor.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

export const getLedLoadColor = (level) => LED_LOAD_COLORS[clampLevel(level)];

export const getLedLoadRgb = (level) => hexToRgb(getLedLoadColor(level));

export const getLedLoadRgba = (level, alpha = 1) => `rgba(${getLedLoadRgb(level)}, ${alpha})`;

export const getMessagesPerMinuteLoadLevel = (messagesPerMinute) => {
  if (!Number.isFinite(messagesPerMinute) || messagesPerMinute <= 0) return 0;
  const count = Math.trunc(messagesPerMinute);

  if (count <= 20) return 1;
  if (count <= 60) return 2;
  if (count <= 100) return 3;
  if (count <= 150) return 4;
  if (count <= 200) return 5;
  if (count <= 250) return 6;
  if (count <= 300) return 7;
  if (count <= 350) return 8;
  if (count <= 400) return 9;
  if (count >= 500) return 10;
  return 9;
};
