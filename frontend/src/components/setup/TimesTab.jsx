import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { TimeInput } from '../TimeInput.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../../utils/timeConversion';
import { X, Clock, Timer } from 'lucide-react';

// Helper to get current time in HH:MM:SS.mmm format
const getCurrentTimeString = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

// Helper to calculate lap time from previous lap
const calculateLapDuration = (currentLapTime, previousLapTime, startTime) => {
  if (!currentLapTime) return '';
  
  const parseTime = (timeStr) => {
    if (!timeStr) return null;
    const parts = timeStr.split(':');
    if (parts.length < 2) return null;
    const hours = parts.length === 3 ? parseInt(parts[0]) : 0;
    const mins = parts.length === 3 ? parseInt(parts[1]) : parseInt(parts[0]);
    const secsAndMs = parts.length === 3 ? parts[2] : parts[1];
    const [secs, ms] = secsAndMs.split('.');
    return (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
  };

  const currentMs = parseTime(currentLapTime);
  const previousMs = previousLapTime ? parseTime(previousLapTime) : (startTime ? parseTime(startTime) : null);
  
  if (currentMs === null || previousMs === null) return '';
  
  const diffMs = currentMs - previousMs;
  if (diffMs < 0) return '';
  
  const totalSecs = diffMs / 1000;
  const mins = Math.floor(totalSecs / 60);
  const secs = (totalSecs % 60).toFixed(3);
  return `${mins}:${secs.padStart(6, '0')}`;
};

export default function TimesTab() {
  const {
    raceType,
    eventName,
    numberOfLaps,
    raceStartTime,
    setRaceStartTime,
    pilots,
    stages,
    times,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime,
    setLapTime,
    getLapTime,
    getPilotLapTimes,
    currentStageId,
    setCurrentStageId
  } = useRally();

  const sortedPilots = [...pilots].sort((a, b) => {
    const orderA = a.startOrder || 999;
    const orderB = b.startOrder || 999;
    return orderA - orderB;
  });

  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  // Get SS stages only for RallyX
  const ssStages = sortedStages.filter(s => s.type === 'SS');

  const handleArrivalTimeChange = (pilotId, stageId, value) => {
    setArrivalTime(pilotId, stageId, value);
    const startTime = getStartTime(pilotId, stageId);
    if (startTime && value) {
      const totalTime = arrivalTimeToTotal(value, startTime);
      if (totalTime) {
        setTime(pilotId, stageId, totalTime);
      }
    }
  };

  const handleTotalTimeChange = (pilotId, stageId, value) => {
    setTime(pilotId, stageId, value);
    const startTime = getStartTime(pilotId, stageId);
    if (startTime && value) {
      const arrivalTime = totalTimeToArrival(value, startTime);
      if (arrivalTime) {
        setArrivalTime(pilotId, stageId, arrivalTime);
      }
    }
  };

  const handleNowClick = (pilotId, stageId, field) => {
    const now = getCurrentTimeString();
    if (field === 'arrival') {
      handleArrivalTimeChange(pilotId, stageId, now);
    } else if (field === 'lap') {
      // For lap times, this is handled separately
    }
  };

  const handleLapNowClick = (pilotId, stageId, lapIndex) => {
    const now = getCurrentTimeString();
    setLapTime(pilotId, stageId, lapIndex, now);
  };

  const isRally = raceType === 'rally';
  const isLapRace = raceType === 'lapRace';
  const isRallyX = raceType === 'rallyX';

  // For Lap Race, use a virtual stage ID
  const lapRaceStageId = '__lap_race__';

  // Rally Times Matrix
  if (isRally) {
    return (
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Time Matrix</CardTitle>
          <CardDescription className="text-zinc-400">Register start times and finish times for each pilot in each stage</CardDescription>
        </CardHeader>
        <CardContent>
          {sortedPilots.length === 0 || sortedStages.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              Add pilots and stages first to register times.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700">
                    <TableHead className="bg-[#18181B] text-white uppercase font-bold sticky left-0" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</TableHead>
                    {sortedStages.map((stage) => (
                      <TableHead key={stage.id} className="bg-[#18181B] text-white uppercase font-bold text-center" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        <div>{stage.ssNumber ? `SS${stage.ssNumber}` : stage.name}</div>
                        <div className="text-xs text-zinc-400 font-normal">Start / Arrival / Total</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPilots.map((pilot) => (
                    <TableRow key={pilot.id} className="border-zinc-700 hover:bg-white/5">
                      <TableCell className="font-bold text-white sticky left-0 bg-[#18181B]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                          {pilot.name}
                        </div>
                      </TableCell>
                      {sortedStages.map((stage) => (
                        <TableCell key={stage.id}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <Input
                                value={getStartTime(pilot.id, stage.id)}
                                onChange={(e) => setStartTime(pilot.id, stage.id, e.target.value)}
                                placeholder="HH:MM"
                                className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                data-testid={`input-start-${pilot.id}-${stage.id}`}
                              />
                              <button
                                onClick={() => setStartTime(pilot.id, stage.id, '')}
                                className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                                title="Clear start time"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="flex gap-1 flex-1">
                                <TimeInput
                                  value={getArrivalTime(pilot.id, stage.id)}
                                  onChange={(val) => handleArrivalTimeChange(pilot.id, stage.id, val)}
                                  placeholder="HH:MM:SS.000"
                                  className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                  data-testid={`input-arrival-${pilot.id}-${stage.id}`}
                                />
                                <TimeInput
                                  value={getTime(pilot.id, stage.id)}
                                  onChange={(val) => handleTotalTimeChange(pilot.id, stage.id, val)}
                                  placeholder="MM:SS.000"
                                  className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                  data-testid={`input-time-${pilot.id}-${stage.id}`}
                                />
                              </div>
                              <button
                                onClick={() => handleNowClick(pilot.id, stage.id, 'arrival')}
                                className="text-zinc-500 hover:text-[#FF4500] transition-colors p-1"
                                title="Set current time"
                              >
                                <Clock className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => {
                                  setArrivalTime(pilot.id, stage.id, '');
                                  setTime(pilot.id, stage.id, '');
                                }}
                                className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                                title="Clear arrival times"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Lap Race Times Matrix
  if (isLapRace) {
    const lapsArray = Array.from({ length: numberOfLaps }, (_, i) => i);
    
    return (
      <Card className="bg-[#18181B] border-zinc-800">
        <CardHeader>
          <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            <Timer className="w-5 h-5" />
            Lap Times - {eventName || 'Untitled Race'}
          </CardTitle>
          <CardDescription className="text-zinc-400">Record lap times for each pilot. {numberOfLaps} laps total.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Race Start Time */}
          <div className="flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700">
            <Label className="text-white whitespace-nowrap">Race Start Time:</Label>
            <Input
              value={raceStartTime}
              onChange={(e) => setRaceStartTime(e.target.value)}
              placeholder="HH:MM:SS"
              className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-40"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRaceStartTime(getCurrentTimeString().slice(0, 8))}
              className="border-zinc-700 text-white"
            >
              <Clock className="w-3 h-3 mr-1" />
              Now
            </Button>
          </div>

          {sortedPilots.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              Add pilots first to register lap times.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-700">
                    <TableHead className="bg-[#18181B] text-white uppercase font-bold sticky left-0 z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</TableHead>
                    {lapsArray.map((lapIndex) => (
                      <TableHead key={lapIndex} className="bg-[#18181B] text-white uppercase font-bold text-center min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                        <div>Lap {lapIndex + 1}</div>
                        <div className="text-xs text-zinc-400 font-normal">Time / Duration</div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedPilots.map((pilot) => {
                    const pilotLaps = getPilotLapTimes(pilot.id, lapRaceStageId);
                    return (
                      <TableRow key={pilot.id} className="border-zinc-700 hover:bg-white/5">
                        <TableCell className="font-bold text-white sticky left-0 bg-[#18181B] z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                            {pilot.name}
                          </div>
                        </TableCell>
                        {lapsArray.map((lapIndex) => {
                          const lapTime = getLapTime(pilot.id, lapRaceStageId, lapIndex);
                          const prevLapTime = lapIndex > 0 ? getLapTime(pilot.id, lapRaceStageId, lapIndex - 1) : null;
                          const lapDuration = calculateLapDuration(lapTime, prevLapTime, raceStartTime);
                          
                          return (
                            <TableCell key={lapIndex}>
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <TimeInput
                                    value={lapTime}
                                    onChange={(val) => setLapTime(pilot.id, lapRaceStageId, lapIndex, val)}
                                    placeholder="HH:MM:SS.000"
                                    className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                  />
                                  <button
                                    onClick={() => handleLapNowClick(pilot.id, lapRaceStageId, lapIndex)}
                                    className="text-zinc-500 hover:text-[#FF4500] transition-colors p-1"
                                    title="Set current time"
                                  >
                                    <Clock className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setLapTime(pilot.id, lapRaceStageId, lapIndex, '')}
                                    className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                                    title="Clear"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                                {lapDuration && (
                                  <div className="text-xs text-[#22C55E] font-mono text-center">
                                    {lapDuration}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // RallyX Times - Multiple races with lap times
  if (isRallyX) {
    return (
      <div className="space-y-6">
        {/* Current Race Selector */}
        <Card className="bg-[#18181B] border-zinc-800">
          <CardHeader>
            <CardTitle className="uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Current Race</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={currentStageId || ''} onValueChange={setCurrentStageId}>
              <SelectTrigger className="bg-[#09090B] border-zinc-700 text-white">
                <SelectValue placeholder="Select race to edit times" />
              </SelectTrigger>
              <SelectContent>
                {ssStages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name} ({stage.numberOfLaps || 0} laps)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Race-specific lap times */}
        {ssStages.map((stage) => {
          const lapsArray = Array.from({ length: stage.numberOfLaps || 0 }, (_, i) => i);
          const stageStartTime = stage.startTime || '';
          
          return (
            <Card key={stage.id} className={`bg-[#18181B] border-zinc-800 ${currentStageId === stage.id ? 'border-l-4 border-l-[#FF4500]' : ''}`}>
              <CardHeader>
                <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  <Timer className="w-5 h-5" />
                  {stage.name}
                  <span className="text-zinc-400 text-sm font-normal">({stage.numberOfLaps || 0} laps)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Race Start Time for this stage */}
                <div className="flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700">
                  <Label className="text-white whitespace-nowrap">Race Start:</Label>
                  <Input
                    value={stageStartTime}
                    readOnly
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-32"
                  />
                  <span className="text-xs text-zinc-500">(Set in The Race tab)</span>
                </div>

                {sortedPilots.length === 0 || lapsArray.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    {lapsArray.length === 0 ? 'Set number of laps in The Race tab' : 'Add pilots first'}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-zinc-700">
                          <TableHead className="bg-[#18181B] text-white uppercase font-bold sticky left-0 z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</TableHead>
                          {lapsArray.map((lapIndex) => (
                            <TableHead key={lapIndex} className="bg-[#18181B] text-white uppercase font-bold text-center min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              <div>Lap {lapIndex + 1}</div>
                              <div className="text-xs text-zinc-400 font-normal">Time / Duration</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedPilots.map((pilot) => (
                          <TableRow key={pilot.id} className="border-zinc-700 hover:bg-white/5">
                            <TableCell className="font-bold text-white sticky left-0 bg-[#18181B] z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                              <div className="flex items-center gap-2">
                                <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                                {pilot.name}
                              </div>
                            </TableCell>
                            {lapsArray.map((lapIndex) => {
                              const lapTime = getLapTime(pilot.id, stage.id, lapIndex);
                              const prevLapTime = lapIndex > 0 ? getLapTime(pilot.id, stage.id, lapIndex - 1) : null;
                              const lapDuration = calculateLapDuration(lapTime, prevLapTime, stageStartTime);
                              
                              return (
                                <TableCell key={lapIndex}>
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-1">
                                      <TimeInput
                                        value={lapTime}
                                        onChange={(val) => setLapTime(pilot.id, stage.id, lapIndex, val)}
                                        placeholder="HH:MM:SS.000"
                                        className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                                      />
                                      <button
                                        onClick={() => handleLapNowClick(pilot.id, stage.id, lapIndex)}
                                        className="text-zinc-500 hover:text-[#FF4500] transition-colors p-1"
                                        title="Set current time"
                                      >
                                        <Clock className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => setLapTime(pilot.id, stage.id, lapIndex, '')}
                                        className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                                        title="Clear"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                    {lapDuration && (
                                      <div className="text-xs text-[#22C55E] font-mono text-center">
                                        {lapDuration}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {ssStages.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            Add SS-type races in The Race tab first to record lap times.
          </div>
        )}
      </div>
    );
  }

  return null;
}
