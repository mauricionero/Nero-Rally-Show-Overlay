export const getStageSortDate = (stage) => {
  if (!stage) return '';
  return stage.date || '';
};

export const getStageSortTime = (stage) => {
  if (!stage) return '';
  return stage.startTime || stage.endTime || '';
};

export const compareStagesBySchedule = (a, b) => {
  const aDate = getStageSortDate(a);
  const bDate = getStageSortDate(b);
  const aTime = getStageSortTime(a);
  const bTime = getStageSortTime(b);

  if (aDate && bDate && aDate !== bDate) {
    return aDate.localeCompare(bDate);
  }

  if (!aDate && bDate) return 1;
  if (aDate && !bDate) return -1;

  if (!aTime && !bTime) return 0;
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
