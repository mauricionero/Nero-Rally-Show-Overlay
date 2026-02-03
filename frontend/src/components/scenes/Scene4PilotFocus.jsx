import React from 'react';
import { useRally } from '../../contexts/RallyContext.jsx';

export default function Scene4PilotFocus() {
  const { pilots, stages, times } = useRally();
  const activePilots = pilots.filter(p => p.isActive);
  const focusPilot = activePilots[0] || pilots[0];

  if (!focusPilot) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="scene-4-pilot-focus">
        <p className="text-white text-2xl font-bold uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
          No Pilot Selected
        </p>
      </div>
    );
  }

  // Get pilot's stage times
  const pilotTimes = stages.map(stage => ({
    stage,
    time: times[focusPilot.id]?.[stage.id] || '-'
  }));

  return (
    <div className="relative w-full h-full flex" data-testid="scene-4-pilot-focus">
      {/* Left Side - Stream */}
      <div className="flex-1 p-8">
        {focusPilot.streamUrl ? (
          <div className="h-full bg-black rounded overflow-hidden border-2 border-[#FF4500]">
            <iframe
              src={focusPilot.streamUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="autoplay; fullscreen"
              allowFullScreen
              title={focusPilot.name}
            />
          </div>
        ) : (
          <div className="h-full bg-black rounded border-2 border-[#FF4500] flex items-center justify-center">
            <p className="text-zinc-500 text-xl">No stream available</p>
          </div>
        )}
      </div>

      {/* Right Side - Pilot Info */}
      <div className="w-1/3 bg-black/95 backdrop-blur-sm p-8 overflow-y-auto">
        {/* Pilot Header */}
        <div className="text-center mb-8">
          {focusPilot.picture ? (
            <img
              src={focusPilot.picture}
              alt={focusPilot.name}
              className="w-32 h-32 rounded-full object-cover mx-auto mb-4 border-4 border-[#FF4500]"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-zinc-800 mx-auto mb-4 flex items-center justify-center border-4 border-[#FF4500]">
              <span className="text-5xl font-bold text-white">{focusPilot.name.charAt(0)}</span>
            </div>
          )}
          <h2 className="text-4xl font-bold uppercase text-white" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            {focusPilot.name}
          </h2>
          {focusPilot.isActive && (
            <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-[#FF4500] rounded-full">
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              <span className="text-white text-sm font-bold uppercase">LIVE</span>
            </div>
          )}
        </div>

        {/* Stage Times */}
        <div>
          <h3 className="text-2xl font-bold uppercase text-[#FF4500] mb-4" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
            Stage Times
          </h3>
          <div className="space-y-2">
            {pilotTimes.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No stages registered</p>
            ) : (
              pilotTimes.map(({ stage, time }) => (
                <div key={stage.id} className="bg-white/5 border border-white/10 p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-zinc-400 uppercase" style={{ fontFamily: 'Barlow Condensed, sans-serif' }}>
                      {stage.name}
                    </span>
                    <span className="text-white text-xl font-mono" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {time}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
