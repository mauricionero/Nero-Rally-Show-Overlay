import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { getPilotStatus, getRunningTime, sortPilotsByStatus } from '../../utils/rallyHelpers';
import { ChevronLeft, ChevronRight, Map, Flag, RotateCcw } from 'lucide-react';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 }
];

const MAP_SLOT_ID = '__google_maps__';

// Helper to calculate position for Lap Race based on lap times
const calculateLapRacePositions = (pilots, stageId, lapTimes, stagePilots, numberOfLaps) => {
  const selectedPilotIds = stagePilots[stageId] || pilots.map(p => p.id);
  const selectedPilots = pilots.filter(p => selectedPilotIds.includes(p.id));
  
  const pilotData = selectedPilots.map(pilot => {
    const pilotLaps = lapTimes[pilot.id]?.[stageId] || [];
    const completedLaps = pilotLaps.filter(t => t && t.trim() !== '').length;
    
    // Calculate total time from lap times
    let totalTimeMs = 0;
    pilotLaps.forEach(lapTime => {
      if (!lapTime) return;
      const parts = lapTime.split(':');
      if (parts.length >= 2) {
        const hours = parts.length === 3 ? parseInt(parts[0]) || 0 : 0;
        const mins = parts.length === 3 ? parseInt(parts[1]) || 0 : parseInt(parts[0]) || 0;
        const secsStr = parts.length === 3 ? parts[2] : parts[1];
        const [secs, ms] = (secsStr || '0').split('.');
        totalTimeMs += (hours * 3600 + mins * 60 + parseFloat(secs || 0) + parseFloat(`0.${ms || 0}`)) * 1000;
      }
    });
    
    const isFinished = completedLaps >= numberOfLaps;
    
    return { 
      pilot, 
      completedLaps, 
      totalTimeMs,
      isFinished,
      lastLapTime: pilotLaps[pilotLaps.length - 1] || null
    };
  });

  // Sort: most laps first, then by total time (fastest)
  pilotData.sort((a, b) => {
    if (b.completedLaps !== a.completedLaps) return b.completedLaps - a.completedLaps;
    if (a.completedLaps === 0) return 0;
    return a.totalTimeMs - b.totalTimeMs;
  });

  return pilotData.map((data, index) => ({
    ...data,
    position: index + 1
  }));
};

export default function Scene1LiveStage({ hideStreams = false }) {
  const { 
    pilots, stages, currentStageId, startTimes, times, categories, 
    chromaKey, mapUrl, logoUrl, eventName, lapTimes, stagePilots, positions 
  } = useRally();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLayout, setSelectedLayout] = useState('2x2');
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [bottomScroll, setBottomScroll] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [prevPositions, setPrevPositions] = useState({});
  const bottomContainerRef = useRef(null);
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const isLapRace = currentStage?.type === 'Lap Race';
  const isSSStage = currentStage?.type === 'SS';
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  const layout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[3];
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  
  // Calculate sorted pilots based on stage type
  const sortedPilotsWithPositions = useMemo(() => {
    if (!currentStageId || !currentStage) {
      return pilots.map((p, i) => ({ pilot: p, position: i + 1, completedLaps: 0 }));
    }
    
    if (isLapRace) {
      return calculateLapRacePositions(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
    }
    
    // For SS and other types, use the existing sort
    const sorted = sortPilotsByStatus(pilots, currentStageId, startTimes, times);
    return sorted.map((pilot, index) => ({ pilot, position: index + 1 }));
  }, [pilots, currentStageId, currentStage, isLapRace, lapTimes, stagePilots, startTimes, times]);

  // Track position changes for animation
  useEffect(() => {
    const newPositions = {};
    sortedPilotsWithPositions.forEach(({ pilot, position }) => {
      newPositions[pilot.id] = position;
    });
    setPrevPositions(newPositions);
  }, [sortedPilotsWithPositions]);

  // Calculate max scroll based on content width
  useEffect(() => {
    if (bottomContainerRef.current) {
      const container = bottomContainerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      setMaxScroll(Math.max(0, scrollWidth - clientWidth));
    }
  }, [sortedPilotsWithPositions]);
  
  // Auto-select active pilots up to layout slots
  useEffect(() => {
    if (selectedSlotIds.length === 0 && activePilots.length > 0) {
      setSelectedSlotIds(activePilots.slice(0, layout.slots).map(p => p.id));
    }
  }, [activePilots, layout.slots, selectedSlotIds.length]);

  const toggleSlot = (slotId) => {
    setSelectedSlotIds(prev => {
      if (prev.includes(slotId)) {
        return prev.filter(id => id !== slotId);
      } else if (prev.length < layout.slots) {
        return [...prev, slotId];
      }
      return prev;
    });
  };

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    if (dragIndex === dropIndex) return;

    setSelectedSlotIds(prev => {
      const newOrder = [...prev];
      const [removed] = newOrder.splice(dragIndex, 1);
      newOrder.splice(dropIndex, 0, removed);
      return newOrder;
    });
  };

  const getDisplayItem = (slotId) => {
    if (slotId === MAP_SLOT_ID) {
      return { type: 'map', id: MAP_SLOT_ID };
    }
    const pilot = pilots.find(p => p.id === slotId);
    return pilot ? { type: 'pilot', ...pilot } : null;
  };

  const displayItems = selectedSlotIds.map(id => getDisplayItem(id)).filter(Boolean);

  const getGridClass = () => {
    return `grid-cols-${layout.cols} grid-rows-${layout.rows}`;
  };

  // Get pilot position and lap info for Lap Race
  const getPilotLapInfo = (pilotId) => {
    const data = sortedPilotsWithPositions.find(d => d.pilot.id === pilotId);
    if (!data) return null;
    return {
      position: data.position,
      completedLaps: data.completedLaps || 0,
      isFinished: data.isFinished || false,
      totalLaps: currentStage?.numberOfLaps || 0
    };
  };

  // Get stage display name - always show stage name, not event name
  const getStageDisplayName = () => {
    if (!currentStage) return '';
    
    if (isSSStage && currentStage.ssNumber) {
      return `SS${currentStage.ssNumber} ${currentStage.name}`;
    }
    
    return currentStage.name;
  };

  return (
    <div className="relative w-full h-full p-8" data-testid="scene-1-live-stage">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">Layout</Label>
            <Select value={selectedLayout} onValueChange={setSelectedLayout}>
              <SelectTrigger className="bg-[#18181B] border-zinc-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LAYOUTS.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-white text-xs uppercase mb-2 block">Select Items ({selectedSlotIds.length}/{layout.slots})</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Google Maps Option */}
              {mapUrl && (
                <div className="flex items-center space-x-2 pb-2 border-b border-zinc-700 mb-2">
                  <Checkbox
                    id="slot-map"
                    checked={selectedSlotIds.includes(MAP_SLOT_ID)}
                    onCheckedChange={() => toggleSlot(MAP_SLOT_ID)}
                    disabled={!selectedSlotIds.includes(MAP_SLOT_ID) && selectedSlotIds.length >= layout.slots}
                  />
                  <label htmlFor="slot-map" className="text-white text-sm cursor-pointer flex items-center gap-2">
                    <Map className="w-4 h-4 text-[#FF4500]" />
                    Google Maps
                  </label>
                </div>
              )}
              
              {/* Pilot Options */}
              {activePilots.map((pilot) => {
                const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
                return (
                  <div key={pilot.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`pilot-${pilot.id}`}
                      checked={selectedSlotIds.includes(pilot.id)}
                      onCheckedChange={() => toggleSlot(pilot.id)}
                      disabled={!selectedSlotIds.includes(pilot.id) && selectedSlotIds.length >= layout.slots}
                    />
                    <label htmlFor={`pilot-${pilot.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                      {lapInfo && (
                        <span className="text-[#FF4500] font-bold text-xs">P{lapInfo.position}</span>
                      )}
                      {pilot.name}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {selectedSlotIds.length > 0 && (
            <div>
              <Label className="text-white text-xs uppercase mb-2 block">Reorder (Drag & Drop)</Label>
              <div className="space-y-1">
                {selectedSlotIds.map((slotId, index) => {
                  const isMap = slotId === MAP_SLOT_ID;
                  const pilot = !isMap ? pilots.find(p => p.id === slotId) : null;
                  const label = isMap ? 'Google Maps' : pilot?.name;
                  if (!label) return null;
                  
                  return (
                    <div
                      key={slotId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="bg-[#18181B] border border-zinc-700 p-2 rounded cursor-move hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-500 text-xs">{index + 1}.</span>
                        {isMap && <Map className="w-3 h-3 text-[#FF4500]" />}
                        <span className="text-white text-sm">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </LeftControls>

      <div className={`grid ${getGridClass()} gap-4 h-[calc(100%-200px)]`}>
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full col-span-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                No Items Selected
              </p>
              <p className="text-zinc-400 mt-2">Select pilots or Google Maps from the left panel</p>
            </div>
          </div>
        ) : (
          displayItems.map((item) => {
            // Google Maps Item
            if (item.type === 'map') {
              return (
                <div key={MAP_SLOT_ID} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <iframe
                    src={mapUrl}
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Rally Map"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <Map className="w-5 h-5 text-[#FF4500]" />
                      <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                        Rally Map
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            // Pilot Stream Item
            const pilot = item;
            const category = categories.find(c => c.id === pilot.categoryId);
            const lapInfo = isLapRace ? getPilotLapInfo(pilot.id) : null;
            
            let displayTime = '';
            let timeColor = 'text-zinc-400';
            let positionBadge = null;
            
            if (isLapRace && lapInfo) {
              // Lap Race display
              positionBadge = (
                <div className="absolute top-2 left-2 bg-black/80 px-2 py-1 rounded flex items-center gap-1">
                  <span className="text-[#FF4500] font-bold text-lg">P{lapInfo.position}</span>
                  <span className="text-zinc-400 text-sm">
                    Lap {lapInfo.completedLaps}/{lapInfo.totalLaps}
                  </span>
                </div>
              );
              if (lapInfo.isFinished) {
                displayTime = 'FINISHED';
                timeColor = 'text-[#22C55E]';
              }
            } else if (isSSStage) {
              // SS Stage display (original logic)
              const status = getPilotStatus(pilot.id, currentStageId, startTimes, times);
              const startTime = startTimes[pilot.id]?.[currentStageId];
              const finishTime = times[pilot.id]?.[currentStageId];
              
              if (status === 'racing' && startTime) {
                displayTime = getRunningTime(startTime);
                timeColor = 'text-[#FF8C00]';
              } else if (status === 'finished' && finishTime) {
                displayTime = finishTime;
                timeColor = 'text-[#22C55E]';
              } else if (startTime) {
                displayTime = `Start: ${startTime}`;
                timeColor = 'text-zinc-500';
              }
            }
            
            return (
              <div key={pilot.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 z-10" style={{ backgroundColor: category.color }} />
                )}
                {positionBadge}
                {!hideStreams && (
                  <StreamPlayer
                    pilotId={pilot.id}
                    streamUrl={pilot.streamUrl}
                    name={pilot.name}
                    className="w-full h-full"
                  />
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1), 2px 2px 4px rgba(0,0,0,1), -1px -1px 2px rgba(0,0,0,1)' }}>
                      <span className="text-zinc-400 text-base mr-2" style={{ textShadow: '0 0 6px rgba(0,0,0,1)' }}>#{pilot.startOrder || '?'}</span>
                      {pilot.name}
                    </p>
                    {displayTime && (
                      <p className={`font-mono text-lg font-bold ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace', textShadow: '0 0 10px rgba(0,0,0,1), 2px 2px 6px rgba(0,0,0,1), -1px -1px 3px rgba(0,0,0,1)' }}>
                        {displayTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Panel - Current Stage Info */}
      {currentStage && currentStageId && (
        <div className="absolute bottom-8 left-8 right-8">
          <div className="bg-black/95 backdrop-blur-sm border-l-4 border-[#FF4500] overflow-hidden mb-4">
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isLapRace ? (
                  <RotateCcw className="w-6 h-6 text-[#FACC15]" />
                ) : (
                  <Flag className="w-6 h-6 text-[#FF4500]" />
                )}
                <div>
                  <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {isLapRace ? 'Race' : 'Current Stage'}
                  </p>
                  <p className="text-white text-3xl font-bold uppercase mt-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {getStageDisplayName()}
                  </p>
                </div>
              </div>
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Channel Logo" 
                  className="h-16 max-w-[200px] object-contain"
                />
              )}
            </div>
          </div>

          {/* Bottom Ticker - Pilots sorted by position */}
          <div className="relative bg-black/95 backdrop-blur-sm border-t-2 border-[#FF4500]">
            {bottomScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.max(0, bottomScroll - 200))}
                className="absolute left-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            <div className="overflow-hidden px-10" ref={bottomContainerRef}>
              <div 
                className="flex gap-2 py-2 transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${bottomScroll}px)` }}
              >
                {sortedPilotsWithPositions.map(({ pilot, position, completedLaps, isFinished }) => {
                  const category = categories.find(c => c.id === pilot.categoryId);
                  
                  let borderColor = 'border-zinc-700';
                  let timeDisplay = '';
                  let timeColor = 'text-zinc-500';
                  
                  if (isLapRace) {
                    if (isFinished) {
                      borderColor = 'border-[#22C55E]';
                      timeDisplay = 'FINISHED';
                      timeColor = 'text-[#22C55E]';
                    } else if (completedLaps > 0) {
                      borderColor = 'border-[#FACC15]';
                      timeDisplay = `Lap ${completedLaps}/${currentStage?.numberOfLaps || 0}`;
                      timeColor = 'text-[#FACC15]';
                    }
                  } else if (isSSStage) {
                    const status = getPilotStatus(pilot.id, currentStageId, startTimes, times);
                    const startTime = startTimes[pilot.id]?.[currentStageId];
                    const finishTime = times[pilot.id]?.[currentStageId];
                    
                    if (status === 'finished' && finishTime) {
                      borderColor = 'border-[#22C55E]';
                      timeDisplay = finishTime;
                      timeColor = 'text-[#22C55E]';
                    } else if (status === 'racing' && startTime) {
                      borderColor = 'border-[#FF8C00]';
                      timeDisplay = getRunningTime(startTime);
                      timeColor = 'text-[#FF8C00]';
                    } else if (startTime) {
                      timeDisplay = `Start: ${startTime}`;
                      timeColor = 'text-zinc-500';
                    }
                  }
                  
                  return (
                    <div 
                      key={pilot.id} 
                      className={`relative flex-shrink-0 bg-white/5 border-2 ${borderColor} px-4 py-2 min-w-[150px] transition-all duration-500 ease-out`}
                      style={{ order: position }}
                    >
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                      <div className="pl-2 flex items-center gap-2">
                        {isLapRace && (
                          <span className="text-[#FF4500] font-bold text-sm">P{position}</span>
                        )}
                        <div>
                          <p className="text-white text-sm font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                            {pilot.name}
                          </p>
                          {timeDisplay && (
                            <p className={`font-mono text-xs ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                              {timeDisplay}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {bottomScroll < maxScroll && maxScroll > 0 && (
              <button
                onClick={() => setBottomScroll(Math.min(maxScroll, bottomScroll + 200))}
                className="absolute right-0 top-0 bottom-0 z-10 bg-black/90 hover:bg-black px-2 text-white"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
