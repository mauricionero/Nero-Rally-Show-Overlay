import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { TimeInput } from '../TimeInput.jsx';
import { arrivalTimeToTotal, totalTimeToArrival } from '../../utils/timeConversion';
import { X } from 'lucide-react';

export default function TimesTab() {
  const {
    pilots,
    stages,
    times,
    setTime,
    getTime,
    setArrivalTime,
    getArrivalTime,
    setStartTime,
    getStartTime
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
                  <TableHead className="bg-[#18181B] text-white uppercase font-bold" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>Pilot</TableHead>
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
                    <TableCell className="font-bold text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
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
