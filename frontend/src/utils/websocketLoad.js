export const getWebSocketLoadScore = (messagesLastMinute) => {
  const count = Math.max(0, Math.trunc(Number(messagesLastMinute) || 0));

  if (count === 0) return 0;
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

export const getWebSocketLoadRgb = (messagesLastMinute) => {
  const score = getWebSocketLoadScore(messagesLastMinute);

  if (score >= 8) return '239, 68, 68';
  if (score >= 4) return '249, 115, 22';
  if (score >= 2) return '250, 204, 21';
  return '34, 197, 94';
};
