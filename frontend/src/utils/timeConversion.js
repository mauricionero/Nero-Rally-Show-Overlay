// Time conversion utilities

export const arrivalTimeToTotal = (arrivalTime, startTime) => {
  if (!arrivalTime || !startTime) return '';
  
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const arrivalParts = arrivalTime.split(':');
    const arrivalHours = parseInt(arrivalParts[0]);
    const arrivalMinutes = parseInt(arrivalParts[1]);
    const arrivalSeconds = parseFloat(arrivalParts[2] || 0);
    
    const startTotalSeconds = startHours * 3600 + startMinutes * 60;
    const arrivalTotalSeconds = arrivalHours * 3600 + arrivalMinutes * 60 + arrivalSeconds;
    
    let diffSeconds = arrivalTotalSeconds - startTotalSeconds;
    if (diffSeconds < 0) diffSeconds += 24 * 3600; // Handle day rollover
    
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = (diffSeconds % 60).toFixed(3).padStart(6, '0');
    
    return `${minutes}:${seconds}`;
  } catch (e) {
    return '';
  }
};

export const totalTimeToArrival = (totalTime, startTime) => {
  if (!totalTime || !startTime) return '';
  
  try {
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const totalParts = totalTime.split(':');
    const totalMinutes = parseInt(totalParts[0]);
    const totalSeconds = parseFloat(totalParts[1] || 0);
    
    const startTotalSeconds = startHours * 3600 + startMinutes * 60;
    const durationSeconds = totalMinutes * 60 + totalSeconds;
    const arrivalTotalSeconds = startTotalSeconds + durationSeconds;
    
    const arrivalHours = Math.floor(arrivalTotalSeconds / 3600) % 24;
    const arrivalMinutes = Math.floor((arrivalTotalSeconds % 3600) / 60);
    const arrivalSeconds = (arrivalTotalSeconds % 60).toFixed(3).padStart(6, '0');
    
    return `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMinutes).padStart(2, '0')}:${arrivalSeconds}`;
  } catch (e) {
    return '';
  }
};
