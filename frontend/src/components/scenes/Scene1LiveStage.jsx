import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';
import { useTranslation } from '../../contexts/TranslationContext.jsx';
import { LeftControls } from '../LeftControls.jsx';
import { StreamPlayer } from '../StreamPlayer.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { getPilotStatus, getReferenceNow, getRunningTime, isPilotRetiredForStage, sortPilotsByStatus } from '../../utils/rallyHelpers';
import { ChevronLeft, ChevronRight, Flag, RotateCcw, Video } from 'lucide-react';
import { getExternalMediaIconComponent } from '../../utils/mediaIcons.js';
import { getStageTitle, isLapRaceStageType, isSpecialStageType } from '../../utils/stageTypes.js';

const LAYOUTS = [
  { id: '1', name: '1 Stream', cols: 1, rows: 1, slots: 1 },
  { id: '1x2', name: '1x2 Vertical', cols: 1, rows: 2, slots: 2 },
  { id: '2x1', name: '2x1 Horizontal', cols: 2, rows: 1, slots: 2 },
  { id: '2x2', name: '2x2 Grid', cols: 2, rows: 2, slots: 4 },
  { id: '3x2', name: '3x2 Grid', cols: 3, rows: 2, slots: 6 }
];

const abbreviateTickerName = (name) => {
  if (!name) return '';

  return name
    .split(/\s*\/\s*/)
    .map((part) => {
      const words = part.trim().split(/\s+/).filter(Boolean);

      if (words.length <= 1) {
        return part.trim();
      }

      const firstInitial = words[0][0]?.toUpperCase() || '';
      const lastName = words[words.length - 1];
      return `${firstInitial}. ${lastName}`;
    })
    .join(' / ');
};


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
    chromaKey, mapUrl, logoUrl, eventName, lapTimes, stagePilots, positions,
    cameras, externalMedia, debugDate, retiredStages
  } = useRally();
  const { t } = useTranslation();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedLayout, setSelectedLayout] = useState('2x2');

  // helper to render an icon for a media item
  const renderIcon = (iconName) => {
    const Icon = getExternalMediaIconComponent(iconName);
    return <Icon className="w-5 h-5 text-[#FF4500]" />;
  };
  const [selectedSlotIds, setSelectedSlotIds] = useState([]);
  const [bottomScroll, setBottomScroll] = useState(0);
  const [maxScroll, setMaxScroll] = useState(0);
  const [prevPositions, setPrevPositions] = useState({});
  const bottomContainerRef = useRef(null);
  const bottomTrackRef = useRef(null);
  
  const currentStage = stages.find(s => s.id === currentStageId);
  const activeMedia = externalMedia.filter(m => m.url);
  const isLapRace = isLapRaceStageType(currentStage?.type);
  const isSSStage = isSpecialStageType(currentStage?.type);
  const activeCameras = cameras.filter(c => c.isActive && c.streamUrl);
  
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 100);
    return () => clearInterval(interval);
  }, []);

  const layout = LAYOUTS.find(l => l.id === selectedLayout) || LAYOUTS[3];
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  const sceneNow = useMemo(() => getReferenceNow(debugDate, currentTime), [debugDate, currentTime]);
  
  // Calculate sorted pilots based on stage type
  const sortedPilotsWithPositions = useMemo(() => {
    if (!currentStageId || !currentStage) {
      return pilots.map((p, i) => ({ pilot: p, position: i + 1, completedLaps: 0 }));
    }
    
    if (isLapRace) {
      return calculateLapRacePositions(pilots, currentStageId, lapTimes, stagePilots, currentStage.numberOfLaps || 5);
    }
    
    // For SS and other types, use the existing sort
    const sorted = sortPilotsByStatus(pilots, categories, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
    return sorted.map((pilot, index) => ({ pilot, position: index + 1 }));
  }, [pilots, currentStageId, currentStage, isLapRace, lapTimes, stagePilots, startTimes, times, retiredStages, sceneNow]);

  // Track position changes for animation
  useEffect(() => {
    const newPositions = {};
    sortedPilotsWithPositions.forEach(({ pilot, position }) => {
      newPositions[pilot.id] = position;
    });
    setPrevPositions(newPositions);
  }, [sortedPilotsWithPositions]);

  // Calculate max scroll based on the actual ticker track width
  useEffect(() => {
    const container = bottomContainerRef.current;
    const track = bottomTrackRef.current;

    if (!container || !track) {
      return undefined;
    }

    const updateBottomMetrics = () => {
      const nextMaxScroll = Math.max(0, track.scrollWidth - container.clientWidth);
      setMaxScroll(nextMaxScroll);
      setBottomScroll(prev => Math.min(prev, nextMaxScroll));
    };

    updateBottomMetrics();

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateBottomMetrics);
      resizeObserver.observe(container);
      resizeObserver.observe(track);
      return () => resizeObserver.disconnect();
    }

    window.addEventListener('resize', updateBottomMetrics);
    return () => window.removeEventListener('resize', updateBottomMetrics);
  }, [sortedPilotsWithPositions, pilots]);
  
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
    // Check if it's a camera
    const camera = cameras.find(c => c.id === slotId);
    if (camera) {
      return { type: 'camera', ...camera };
    }
    // Check external media
    if (slotId.startsWith('media-')) {
      const mid = slotId.replace('media-', '');
      const media = externalMedia.find(m => m.id === mid);
      if (media) return { type: 'media', ...media };
    }
    // Otherwise it's a pilot
    const pilot = pilots.find(p => p.id === slotId);
    return pilot ? { type: 'pilot', ...pilot } : null;
  };

  const displayItems = selectedSlotIds.map(id => getDisplayItem(id)).filter(Boolean);

  const gridStyle = {
    height: currentStage && currentStageId ? 'calc(100% - 230px)' : '100%',
    gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`
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

  const handleBottomTickerWheel = (event) => {
    if (maxScroll <= 0) {
      return;
    }

    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;

    if (!delta) {
      return;
    }

    event.preventDefault();
    setBottomScroll((prev) => Math.max(0, Math.min(maxScroll, prev + delta)));
  };

  // Get stage display name - always show stage name, not event name
  const getStageDisplayName = () => {
    if (!currentStage) return '';

    if (isSSStage) {
      return getStageTitle(currentStage, ' ');
    }

    return currentStage.name;
  };

  return (
    <div className="relative w-full h-full p-8" data-testid="scene-1-live-stage">
      <LeftControls>
        <div className="space-y-4">
          <div>
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.layout')}</Label>
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
            <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.selectItems')} ({selectedSlotIds.length}/{layout.slots})</Label>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {/* Camera Options - First priority */}
              {activeCameras.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('streams.additionalCameras')}</div>
                  {activeCameras.map((camera) => (
                    <div key={camera.id} className="flex items-center space-x-2 mb-1">
                      <Checkbox
                        id={`camera-${camera.id}`}
                        checked={selectedSlotIds.includes(camera.id)}
                        onCheckedChange={() => toggleSlot(camera.id)}
                        disabled={!selectedSlotIds.includes(camera.id) && selectedSlotIds.length >= layout.slots}
                      />
                      <label htmlFor={`camera-${camera.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                        <Video className="w-4 h-4 text-[#FF4500]" />
                        {camera.name}
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* External Media options - second priority */}
              {activeMedia.length > 0 && (
                <div className="pb-2 border-b border-zinc-700 mb-2">
                  <div className="text-xs text-zinc-500 uppercase mb-2">{t('scene1.externalMedia')}</div>
                  {activeMedia.map((m) => {
                    const slotId = `media-${m.id}`;
                    return (
                      <div key={m.id} className="flex items-center space-x-2 mb-1">
                        <Checkbox
                          id={`media-${m.id}`}
                          checked={selectedSlotIds.includes(slotId)}
                          onCheckedChange={() => toggleSlot(slotId)}
                          disabled={!selectedSlotIds.includes(slotId) && selectedSlotIds.length >= layout.slots}
                        />
                        <label htmlFor={`media-${m.id}`} className="text-white text-sm cursor-pointer flex items-center gap-2">
                          {renderIcon(m.icon)}
                          {m.name}
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Pilot Options - Third priority */}
              {activePilots.length > 0 && (
                <div className="text-xs text-zinc-500 uppercase mb-2">{t('tabs.pilots')}</div>
              )}
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
              <Label className="text-white text-xs uppercase mb-2 block">{t('scene1.reorderDragDrop')}</Label>
              <div className="space-y-1">
                {selectedSlotIds.map((slotId, index) => {
                  const camera = cameras.find(c => c.id === slotId);
                  const media = slotId.startsWith('media-')
                    ? externalMedia.find(m => m.id === slotId.replace('media-', ''))
                    : null;
                  const pilot = !camera && !media ? pilots.find(p => p.id === slotId) : null;
                  let label = '';
                  if (media) label = media.name;
                  else if (camera) label = camera.name;
                  else if (pilot) label = pilot.name;
                  const isCamera = !!camera;
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
                        {media && renderIcon(media.icon)}
                        {isCamera && <Video className="w-3 h-3 text-[#FF4500]" />}
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

      <div className="grid gap-4" style={gridStyle}>
        {displayItems.length === 0 ? (
          <div className="flex items-center justify-center h-full col-span-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                {t('scene1.noItemsSelected')}
              </p>
              <p className="text-zinc-400 mt-2">{t('scene1.selectPilotsOrMedia')}</p>
            </div>
          </div>
        ) : (
          displayItems.map((item) => {
            // External media item
            if (item.type === 'media') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <iframe
                    src={item.url}
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title={item.name}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    {renderIcon(item.icon)}
                    <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                      {item.name}
                    </p>
                  </div>
                </div>
              );
            }

            // Camera Item
            if (item.type === 'camera') {
              return (
                <div key={item.id} className="relative rounded overflow-hidden border-2 border-[#FF4500]" style={{ backgroundColor: chromaKey }}>
                  <StreamPlayer
                    pilotId={item.id}
                    streamUrl={item.streamUrl}
                    name={item.name}
                    className="w-full h-full"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 to-transparent p-3">
                    <div className="flex items-center gap-2">
                      <Video className="w-5 h-5 text-[#FF4500]" />
                      <p className="text-white font-bold text-lg uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif', textShadow: '0 0 8px rgba(0,0,0,1)' }}>
                        {item.name}
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
              const status = getPilotStatus(pilot.id, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
              const startTime = startTimes[pilot.id]?.[currentStageId];
              const finishTime = times[pilot.id]?.[currentStageId];
              const retired = isPilotRetiredForStage(pilot.id, currentStageId, retiredStages);
              
              if (status === 'retired') {
                displayTime = t('status.retired');
                timeColor = 'text-red-400';
              } else if (status === 'racing' && startTime) {
                displayTime = getRunningTime(startTime, currentStage?.date, sceneNow);
                timeColor = 'text-[#FF8C00]';
              } else if (status === 'finished' && finishTime) {
                displayTime = retired ? `${finishTime} RET` : finishTime;
                timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
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

            <div className="overflow-hidden px-10" ref={bottomContainerRef} onWheel={handleBottomTickerWheel}>
              <div 
                ref={bottomTrackRef}
                className="flex gap-2 py-2 transition-transform duration-500 ease-out"
                style={{ transform: `translateX(-${bottomScroll}px)` }}
              >
                {sortedPilotsWithPositions.map(({ pilot, position, completedLaps, isFinished }) => {
                  const category = categories.find(c => c.id === pilot.categoryId);
                  const pilotMeta = [pilot.car, pilot.team].filter(Boolean).join(' • ');
                  
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
                    const status = getPilotStatus(pilot.id, currentStageId, startTimes, times, retiredStages, currentStage?.date, sceneNow);
                    const startTime = startTimes[pilot.id]?.[currentStageId];
                    const finishTime = times[pilot.id]?.[currentStageId];
                    const retired = isPilotRetiredForStage(pilot.id, currentStageId, retiredStages);
                    
                    if (status === 'retired') {
                      borderColor = 'border-red-500';
                      timeDisplay = t('status.retired');
                      timeColor = 'text-red-400';
                    } else if (status === 'finished' && finishTime) {
                      borderColor = retired ? 'border-amber-400' : 'border-[#22C55E]';
                      timeDisplay = retired ? `${finishTime} RET` : finishTime;
                      timeColor = retired ? 'text-amber-400' : 'text-[#22C55E]';
                    } else if (status === 'racing' && startTime) {
                      borderColor = 'border-[#FF8C00]';
                      timeDisplay = getRunningTime(startTime, currentStage?.date, sceneNow);
                      timeColor = 'text-[#FF8C00]';
                    } else if (startTime) {
                      timeDisplay = `Start: ${startTime}`;
                      timeColor = 'text-zinc-500';
                    }
                  }
                  
                  return (
                    <div 
                      key={pilot.id} 
                      className={`relative flex-shrink-0 w-[170px] bg-white/5 border-2 ${borderColor} px-4 py-2.5 transition-all duration-500 ease-out`}
                      style={{ order: position }}
                    >
                      {category && (
                        <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: category.color }} />
                      )}
                      <div className="pl-2 min-w-0">
                        {isLapRace && (
                          <span className="block text-[#FF4500] font-bold text-sm leading-none mb-1">P{position}</span>
                        )}
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-white text-sm font-bold uppercase truncate" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                            {abbreviateTickerName(pilot.name)}
                          </p>
                          {pilotMeta && (
                            <p className="text-zinc-400 text-[11px] leading-tight truncate">
                              {pilotMeta}
                            </p>
                          )}
                          {timeDisplay && (
                            <p className={`font-mono text-xs truncate ${timeColor}`} style={{ fontFamily: 'JetBrains Mono, monospace' }}>
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
