export const getStageSortTime = (stage) => {
  if (!stage) return '';
  return stage.startTime || stage.endTime || '';
};

export const compareStagesBySchedule = (a, b) => {
  const aTime = getStageSortTime(a);
  const bTime = getStageSortTime(b);

  if (!aTime) return 1;
  if (!bTime) return -1;
  return aTime.localeCompare(bTime);
};

export const formatStageScheduleRange = (stage) => {
  if (!stage) return '';

  const start = stage.startTime || '';
  const end = stage.endTime || '';

  if (!start && !end) return '';
  return `${start} -> ${end}`;
};
