import React from 'react';
import { useRally } from '../../contexts/RallyContext';

export default function Scene1LiveStage() {
  const { pilots, stages, currentStageId } = useRally();
  const activePilots = pilots.filter(p => p.isActive && p.streamUrl);
  const currentStage = stages.find(s => s.id === currentStageId);

  const getGridClass = () => {
    const count = activePilots.length;
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    if (count <= 6) return 'grid-cols-3 grid-rows-2';
    if (count <= 9) return 'grid-cols-3 grid-rows-3';
    return 'grid-cols-4';
  };

  return (
    <div className="relative w-full h-full p-8" data-testid="scene-1-live-stage">
      {/* Stream Grid */}
      <div className={`grid ${getGridClass()} gap-4 h-full`}>
        {activePilots.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                No Active Pilots
              </p>
              <p className="text-zinc-400 mt-2">Select active pilots in setup</p>
            </div>
          </div>
        ) : (
          activePilots.map((pilot) => (
            <div
              key={pilot.id}
              className="relative bg-black rounded overflow-hidden border-2 border-[#FF4500]">
              <iframe
                src={pilot.streamUrl}
                className="w-full h-full"
                frameBorder="0"
                allow="autoplay; fullscreen"
                allowFullScreen
                title={pilot.name}
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-4">
                <p className="text-white font-bold text-xl uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {pilot.name}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Lower Third - Current Stage */}
      {currentStage && (
        <div className="absolute bottom-8 left-8 right-8">
          <div className="bg-black/95 backdrop-blur-sm p-6 border-l-4 border-[#FF4500]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-sm uppercase" style={{ fontFamily: 'Inter, sans-serif' }}>Current Stage</p>
                <p className="text-white text-4xl font-bold uppercase mt-1" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                  {currentStage.name}
                </p>
              </div>
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
