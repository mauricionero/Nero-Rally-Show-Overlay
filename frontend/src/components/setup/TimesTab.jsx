import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { TimeInput } from '../TimeInput.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../../utils/timeConversion';
import { X, Clock, Flag, RotateCcw, Car, Timer, CheckSquare, Square } from 'lucide-react';

// Helper to get current time in HH:MM:SS.mmm format
const getCurrentTimeString = () => {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${ms}`;
};

// Helper to calculate lap duration from previous lap
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

const getStageTypeIcon = (type) => {
  switch (type) {
    case 'SS': return Flag;
    case 'Lap Race': return RotateCcw;
    case 'Liaison': return Car;
    case 'Service Park': return Timer;
    default: return Flag;
  }
};

const getStageTypeColor = (type) => {
  switch (type) {
    case 'SS': return 'border-l-[#FF4500]';
    case 'Lap Race': return 'border-l-[#FACC15]';
    case 'Liaison': return 'border-l-blue-400';
    case 'Service Park': return 'border-l-green-400';
    default: return 'border-l-zinc-400';
  }
};

// SS Stage Component - Card layout for each pilot
function SSStageCard({ stage, pilots, categories }) {
  const {
    times,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime
  } = useRally();

  const sortedPilots = [...pilots].sort((a, b) => (a.startOrder || 999) - (b.startOrder || 999));

  const handleArrivalTimeChange = (pilotId, value) => {
    setArrivalTime(pilotId, stage.id, value);
    const startTime = getStartTime(pilotId, stage.id);
    if (startTime && value) {
      const totalTime = arrivalTimeToTotal(value, startTime);
      if (totalTime) {
        setTime(pilotId, stage.id, totalTime);
      }
    }
  };

  const handleTotalTimeChange = (pilotId, value) => {
    setTime(pilotId, stage.id, value);
    const startTime = getStartTime(pilotId, stage.id);
    if (startTime && value) {
      const arrivalTime = totalTimeToArrival(value, startTime);
      if (arrivalTime) {
        setArrivalTime(pilotId, stage.id, arrivalTime);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {sortedPilots.map((pilot) => {
        const category = categories.find(c => c.id === pilot.categoryId);
        return (
          <Card key={pilot.id} className="bg-[#09090B] border-zinc-700 relative">
            {category && (
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: category.color }} />
            )}
            <CardContent className="p-3 pl-4">
              {/* Pilot Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                {pilot.carNumber && (
                  <span className="bg-[#FF4500] text-white text-xs font-bold px-1 py-0.5 rounded">
                    {pilot.carNumber}
                  </span>
                )}
                <span className="text-white font-bold text-sm uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {pilot.name}
                </span>
              </div>
              
              {/* Start Time */}
              <div className="mb-2">
                <Label className="text-xs text-zinc-400">Start Time</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={getStartTime(pilot.id, stage.id)}
                    onChange={(e) => setStartTime(pilot.id, stage.id, e.target.value)}
                    placeholder="HH:MM"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-8"
                  />
                  <button
                    onClick={() => setStartTime(pilot.id, stage.id, '')}
                    className="text-zinc-500 hover:text-red-500 transition-colors p-0.5"
                    title="Clear"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {/* Arrival Time */}
              <div className="mb-2">
                <Label className="text-xs text-zinc-400">Arrival Time</Label>
                <div className="flex items-center gap-1">
                  <TimeInput
                    value={getArrivalTime(pilot.id, stage.id)}
                    onChange={(val) => handleArrivalTimeChange(pilot.id, val)}
                    placeholder="HH:MM:SS.000"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-8 flex-1"
                  />
                  <button
                    onClick={() => setArrivalTime(pilot.id, stage.id, getCurrentTimeString())}
                    className="text-zinc-400 hover:text-[#FF4500] transition-colors p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded"
                    title="Set current time"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setArrivalTime(pilot.id, stage.id, '');
                      setTime(pilot.id, stage.id, '');
                    }}
                    className="text-zinc-500 hover:text-red-500 transition-colors p-0.5"
                    title="Clear"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {/* Total Time */}
              <div>
                <Label className="text-xs text-zinc-400">Total Time</Label>
                <div className="flex items-center gap-1">
                  <TimeInput
                    value={getTime(pilot.id, stage.id)}
                    onChange={(val) => handleTotalTimeChange(pilot.id, val)}
                    placeholder="MM:SS.000"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-8 flex-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Liaison/Service Park Stage Component - Simple start/end per pilot
function LiaisonStageCard({ stage, pilots, categories }) {
  const { setStartTime, getStartTime, setTime, getTime } = useRally();

  const sortedPilots = [...pilots].sort((a, b) => (a.startOrder || 999) - (b.startOrder || 999));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {sortedPilots.map((pilot) => {
        const category = categories.find(c => c.id === pilot.categoryId);
        return (
          <Card key={pilot.id} className="bg-[#09090B] border-zinc-700 relative">
            {category && (
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l" style={{ backgroundColor: category.color }} />
            )}
            <CardContent className="p-3 pl-4">
              {/* Pilot Header */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                <span className="text-white font-bold text-sm uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {pilot.name}
                </span>
              </div>
              
              {/* Start Time */}
              <div className="mb-2">
                <Label className="text-xs text-zinc-400">Start Time</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={getStartTime(pilot.id, stage.id)}
                    onChange={(e) => setStartTime(pilot.id, stage.id, e.target.value)}
                    placeholder="HH:MM"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-8 flex-1"
                  />
                  <button
                    onClick={() => setStartTime(pilot.id, stage.id, getCurrentTimeString().slice(0, 5))}
                    className="text-zinc-500 hover:text-[#FF4500] transition-colors p-1"
                    title="Set current time"
                  >
                    <Clock className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setStartTime(pilot.id, stage.id, '')}
                    className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              
              {/* End Time */}
              <div>
                <Label className="text-xs text-zinc-400">End Time</Label>
                <div className="flex items-center gap-1">
                  <Input
                    value={getTime(pilot.id, stage.id)}
                    onChange={(e) => setTime(pilot.id, stage.id, e.target.value)}
                    placeholder="HH:MM"
                    className="bg-[#18181B] border-zinc-700 text-center font-mono text-xs text-white h-8 flex-1"
                  />
                  <button
                    onClick={() => setTime(pilot.id, stage.id, getCurrentTimeString().slice(0, 5))}
                    className="text-zinc-500 hover:text-[#FF4500] transition-colors p-1"
                    title="Set current time"
                  >
                    <Clock className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setTime(pilot.id, stage.id, '')}
                    className="text-zinc-500 hover:text-red-500 transition-colors p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Lap Race Stage Component - Laps x Pilots matrix with pilot selection
function LapRaceStageCard({ stage, pilots, categories }) {
  const {
    setLapTime,
    getLapTime,
    getStagePilots,
    togglePilotInStage,
    selectAllPilotsInStage,
    deselectAllPilotsInStage,
    updateStage
  } = useRally();

  const selectedPilotIds = getStagePilots(stage.id);
  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.id));
  const sortedPilots = [...selectedPilots].sort((a, b) => (a.startOrder || 999) - (b.startOrder || 999));
  
  const lapsArray = Array.from({ length: stage.numberOfLaps || 5 }, (_, i) => i);
  const allSelected = selectedPilotIds.length === pilots.length;
  const noneSelected = selectedPilotIds.length === 0;

  return (
    <div className="space-y-4">
      {/* Race Start Time */}
      <div className="flex items-center gap-4 p-3 bg-[#09090B] rounded border border-zinc-700">
        <Label className="text-white whitespace-nowrap">Race Start Time:</Label>
        <Input
          value={stage.startTime || ''}
          onChange={(e) => updateStage(stage.id, { startTime: e.target.value })}
          placeholder="HH:MM:SS"
          className="bg-[#18181B] border-zinc-700 text-center font-mono text-white h-8 w-40"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => updateStage(stage.id, { startTime: getCurrentTimeString().slice(0, 8) })}
          className="border-zinc-700 text-white"
        >
          <Clock className="w-3 h-3 mr-1" />
          Now
        </Button>
      </div>

      {/* Pilot Selection */}
      <div className="p-3 bg-[#09090B] rounded border border-zinc-700">
        <div className="flex items-center justify-between mb-2">
          <Label className="text-white">Pilots in this race ({selectedPilotIds.length}/{pilots.length})</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => selectAllPilotsInStage(stage.id)}
              className={`text-xs ${allSelected ? 'text-green-500' : 'text-zinc-400'}`}
            >
              <CheckSquare className="w-3 h-3 mr-1" />
              All
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deselectAllPilotsInStage(stage.id)}
              className={`text-xs ${noneSelected ? 'text-red-500' : 'text-zinc-400'}`}
            >
              <Square className="w-3 h-3 mr-1" />
              None
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {pilots.map(pilot => (
            <label
              key={pilot.id}
              className={`flex items-center gap-1 px-2 py-1 rounded cursor-pointer transition-colors ${
                selectedPilotIds.includes(pilot.id)
                  ? 'bg-[#FF4500]/20 border border-[#FF4500]'
                  : 'bg-zinc-800 border border-zinc-700'
              }`}
            >
              <Checkbox
                checked={selectedPilotIds.includes(pilot.id)}
                onCheckedChange={() => togglePilotInStage(stage.id, pilot.id)}
                className="w-3 h-3"
              />
              <span className="text-white text-xs">{pilot.name}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Lap Times Matrix */}
      {sortedPilots.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          Select pilots to record lap times
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="text-left text-white uppercase font-bold p-2 sticky left-0 bg-[#18181B] z-10" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  Pilot
                </th>
                {lapsArray.map((lapIndex) => (
                  <th key={lapIndex} className="text-center text-white uppercase font-bold p-2 min-w-[140px]" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    <div>Lap {lapIndex + 1}</div>
                    <div className="text-xs text-zinc-400 font-normal">Time / Duration</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedPilots.map((pilot) => {
                const category = categories.find(c => c.id === pilot.categoryId);
                return (
                  <tr key={pilot.id} className="border-b border-zinc-800 hover:bg-white/5">
                    <td className="p-2 sticky left-0 bg-[#18181B] z-10">
                      <div className="flex items-center gap-2">
                        {category && (
                          <div className="w-1 h-6 rounded" style={{ backgroundColor: category.color }} />
                        )}
                        <span className="text-zinc-500 text-xs">#{pilot.startOrder || '?'}</span>
                        <span className="text-white font-bold text-sm" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                          {pilot.name}
                        </span>
                      </div>
                    </td>
                    {lapsArray.map((lapIndex) => {
                      const lapTime = getLapTime(pilot.id, stage.id, lapIndex);
                      const prevLapTime = lapIndex > 0 ? getLapTime(pilot.id, stage.id, lapIndex - 1) : null;
                      const lapDuration = calculateLapDuration(lapTime, prevLapTime, stage.startTime);
                      
                      return (
                        <td key={lapIndex} className="p-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <TimeInput
                                value={lapTime}
                                onChange={(val) => setLapTime(pilot.id, stage.id, lapIndex, val)}
                                placeholder="HH:MM:SS.000"
                                className="bg-[#09090B] border-zinc-700 text-center font-mono text-xs text-white h-7 flex-1"
                              />
                              <button
                                onClick={() => setLapTime(pilot.id, stage.id, lapIndex, getCurrentTimeString())}
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
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TimesTab() {
  const { pilots, stages, categories } = useRally();

  const sortedStages = [...stages].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });

  if (pilots.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Add pilots first in the Pilots tab to record times.
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Add stages first in The Race tab to record times.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {sortedStages.map((stage) => {
        const Icon = getStageTypeIcon(stage.type);
        const borderColor = getStageTypeColor(stage.type);
        
        return (
          <Card key={stage.id} className={`bg-[#18181B] border-zinc-800 border-l-4 ${borderColor}`}>
            <CardHeader>
              <CardTitle className="uppercase text-white flex items-center gap-2" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                <Icon className="w-5 h-5" />
                {stage.type === 'SS' && stage.ssNumber && <span className="text-[#FF4500]">SS{stage.ssNumber}</span>}
                {stage.name}
                {stage.type === 'Lap Race' && (
                  <span className="text-sm text-zinc-400 font-normal">({stage.numberOfLaps} laps)</span>
                )}
              </CardTitle>
              {stage.type !== 'Lap Race' && stage.startTime && (
                <CardDescription className="text-zinc-400">
                  Scheduled: {stage.startTime}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {stage.type === 'SS' && (
                <SSStageCard stage={stage} pilots={pilots} categories={categories} />
              )}
              {(stage.type === 'Liaison' || stage.type === 'Service Park') && (
                <LiaisonStageCard stage={stage} pilots={pilots} categories={categories} />
              )}
              {stage.type === 'Lap Race' && (
                <LapRaceStageCard stage={stage} pilots={pilots} categories={categories} />
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
