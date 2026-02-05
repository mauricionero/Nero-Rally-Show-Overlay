import React, { useEffect, useState, useRef } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { getPilotStatus, getRunningTime, sortPilotsByStatus } from '../../utils/rallyHelpers';
import { ChevronLeft, ChevronRight, Map } from 'lucide-react';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 }
];

// Special ID for Google Maps slot
const MAP_SLOT_ID = '__google_maps__';

export default function Scene1LiveStage({ hideStreams = false }) {
  const { pilots, stages, currentStageId, startTimes, times, categories, chromaKey, mapUrl, logoUrl } = useRally();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLayout, setSelectedLayout] = useState('2x2');
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [bottomScroll, setBottomScroll] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const bottomContainerRef = useRef(null);
  const currentStage = stages.find(s => s.id === currentStageId);
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  const layout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[3];
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  const sortedAllPilots = currentStageId ? sortPilotsByStatus(pilots, currentStageId, startTimes, times) : pilots;

  // Calculate max scroll based on content width
  useEffect(() => {
    if (bottomContainerRef.current) {
      const container = bottomContainerRef.current;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      setMaxScroll(Math.max(0, scrollWidth - clientWidth));
    }
  }, [sortedAllPilots]);
  
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

  // Get display items (pilots or map)
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
              {activePilots.map((pilot) => (
                <div key={pilot.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`pilot-${pilot.id}`}
                    checked={selectedSlotIds.includes(pilot.id)}
                    onCheckedChange={() => toggleSlot(pilot.id)}
                    disabled={!selectedSlotIds.includes(pilot.id) && selectedSlotIds.length >= layout.slots}
                  />
                  <label htmlFor={`pilot-${pilot.id}`} className="text-white text-sm cursor-pointer">
                    {pilot.name}
                  </label>
                </div>
              ))}
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
            const status = currentStageId ? getPilotStatus(pilot.id, currentStageId, startTimes, times) : 'not_started';
            const startTime = currentStageId ? startTimes[pilot.id]?.[currentStageId] : null;
            const finishTime = currentStageId ? times[pilot.id]?.[currentStageId] : null;
            const category = categories.find(c => c.id === pilot.categoryId);
            
            let displayTime = '';
            let timeColor = 'text-zinc-400';
            if (status === 'racing' && startTime) {
              displayTime = getRunningTime(startTime);
              timeColor = 'text-[#FF8C00]';
            } else if (status === 'finished' && finishTime) {
              displayTime = finishTime;
              timeColor = 'text-[#1a5f1a]';
            } else if (startTime) {
              displayTime = `Start: ${startTime}`;
              timeColor = 'text-zinc-500';
            }
            
            return (
              <div key={pilot.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: hideStreams ? chromaKey : 'black' }}>
                {category && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 z-10" style={{ backgroundColor: category.color }} />
                )}
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

      {currentStage && currentStageId && (
        <div className="absolute bottom-8 left-8 right-8">
          <div className="bg-black/95 backdrop-blur-sm border-l-4 border-[#FF4500] overflow-hidden mb-4">
            <div className="p-4 flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>Current Stage</p>
                <p className="text-white text-3xl font-bold uppercase mt-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {currentStage.ssNumber ? `SS${currentStage.ssNumber}` : ''} {currentStage.name}
                </p>
              </div>
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Channel Logo" 
                  className="h-12 max-w-[150px] object-contain"
                />
              )}
            </div>
          </div>

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
                className="flex gap-2 py-2 transition-transform duration-300"
                style={{ transform: `translateX(-${bottomScroll}px)` }}
              >
                {sortedAllPilots.map((pilot) => {
                  const status = currentStageId ? getPilotStatus(pilot.id, currentStageId, startTimes, times) : 'not_started';
                  const startTime = currentStageId ? startTimes[pilot.id]?.[currentStageId] : null;
                  const finishTime = currentStageId ? times[pilot.id]?.[currentStageId] : null;
                  const category = categories.find(c => c.id === pilot.categoryId);
                  
                  let borderColor = 'border-zinc-700';
                  let timeDisplay = '';
                  let timeColor = 'text-zinc-500';
                  
                  if (status === 'finished' && finishTime) {
                    borderColor = 'border-[#1a5f1a]';
                    timeDisplay = finishTime;
                    timeColor = 'text-[#1a5f1a]';
                  } else if (status === 'racing' && startTime) {
                    borderColor = 'border-[#FF8C00]';
                    timeDisplay = getRunningTime(startTime);
                    timeColor = 'text-[#FF8C00]';
                  } else if (startTime) {
                    timeDisplay = `Start: ${startTime}`;
                    timeColor = 'text-zinc-500';
                  }
                  
                  return (
                    <div key={pilot.id} className={`relative flex-shrink-0 bg-white/5 border-2 ${borderColor} px-4 py-2 min-w-[150px]`}>
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                      <div className="pl-2">
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
