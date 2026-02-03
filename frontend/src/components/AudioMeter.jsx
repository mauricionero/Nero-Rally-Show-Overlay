import React, { useState, useEffect, useRef } from 'react';

/**
 * AudioMeter - Visual audio level indicator
 * 
 * NOTE: Due to browser security (CORS), we cannot access actual audio data from
 * cross-origin iframes (like VDO.Ninja). This component provides:
 * 1. A simulated meter when no real data is available
 * 2. VDO.Ninja has built-in meters via &meter=1 URL param
 * 
 * For real audio monitoring, recommend using VDO.Ninja's built-in meter feature
 * or a dedicated audio monitoring tool.
 */
export const AudioMeter = ({ 
  isActive = true, 
  isMuted = false, 
  volume = 100,
  height = 150,
  width = 10,
  className = '',
  showLabels = false
}) => {
  const [levels, setLevels] = useState({ left: 0, right: 0 });
  const animationRef = useRef(null);
  
  // Simulate audio levels when active and not muted
  useEffect(() => {
    if (!isActive || isMuted) {
      setLevels({ left: 0, right: 0 });
      return;
    }
    
    // Simulate realistic audio activity
    const animate = () => {
      const baseLevel = (volume / 100) * 0.6; // Base level based on volume
      const variation = Math.random() * 0.3; // Random variation
      const left = Math.min(1, baseLevel + variation + (Math.random() > 0.9 ? 0.2 : 0));
      const right = Math.min(1, baseLevel + variation + (Math.random() > 0.9 ? 0.2 : 0));
      
      setLevels({ left, right });
      animationRef.current = requestAnimationFrame(animate);
    };
    
    // Slower update rate for simulation
    const interval = setInterval(() => {
      const baseLevel = (volume / 100) * 0.6;
      const variation = Math.random() * 0.3;
      const left = Math.min(1, baseLevel + variation + (Math.random() > 0.9 ? 0.2 : 0));
      const right = Math.min(1, baseLevel + variation + (Math.random() > 0.9 ? 0.2 : 0));
      setLevels({ left, right });
    }, 100);
    
    return () => {
      clearInterval(interval);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, isMuted, volume]);
  
  const renderBar = (level, side) => {
    const segments = 20;
    const activeSegments = Math.floor(level * segments);
    
    return (
      <div 
        className="flex flex-col-reverse gap-[1px]"
        style={{ width: `${width / 2 - 1}px`, height: `${height}px` }}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < activeSegments;
          let color = 'bg-zinc-800'; // Inactive
          
          if (isActive) {
            const percent = (i / segments) * 100;
            if (percent < 60) {
              color = 'bg-green-500'; // Safe zone (0-60%)
            } else if (percent < 80) {
              color = 'bg-yellow-500'; // Caution zone (60-80%)
            } else {
              color = 'bg-red-500'; // Danger zone (80-100%)
            }
          }
          
          return (
            <div
              key={`${side}-${i}`}
              className={`w-full transition-colors duration-75 ${color}`}
              style={{ height: `${(height / segments) - 1}px` }}
            />
          );
        })}
      </div>
    );
  };
  
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="flex gap-[2px] bg-black p-1 rounded">
        {renderBar(levels.left, 'left')}
        {renderBar(levels.right, 'right')}
      </div>
      {showLabels && (
        <div className="flex justify-between w-full text-[8px] text-zinc-500 mt-1 px-1">
          <span>L</span>
          <span>R</span>
        </div>
      )}
    </div>
  );
};

/**
 * GlobalAudioMeter - Shows combined/master audio level
 */
export const GlobalAudioMeter = ({ 
  streamConfigs = {},
  globalVolume = 100,
  globalMuted = false,
  height = 200,
  width = 20,
  className = ''
}) => {
  const [level, setLevel] = useState(0);
  
  useEffect(() => {
    if (globalMuted) {
      setLevel(0);
      return;
    }
    
    // Count active (unmuted) streams
    const activeStreams = Object.values(streamConfigs).filter(c => c && !c.muted);
    const hasActiveStreams = activeStreams.length > 0;
    
    if (!hasActiveStreams) {
      setLevel(0);
      return;
    }
    
    // Simulate combined audio level
    const interval = setInterval(() => {
      const baseLevel = (globalVolume / 100) * 0.5;
      const streamContribution = Math.min(activeStreams.length * 0.1, 0.3);
      const variation = Math.random() * 0.2;
      const newLevel = Math.min(1, baseLevel + streamContribution + variation);
      setLevel(newLevel);
    }, 100);
    
    return () => clearInterval(interval);
  }, [streamConfigs, globalVolume, globalMuted]);
  
  const segments = 30;
  const activeSegments = Math.floor(level * segments);
  
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div 
        className="flex flex-col-reverse gap-[1px] bg-black p-1 rounded"
        style={{ width: `${width}px`, height: `${height}px` }}
      >
        {Array.from({ length: segments }).map((_, i) => {
          const isActive = i < activeSegments;
          let color = 'bg-zinc-800';
          
          if (isActive) {
            const percent = (i / segments) * 100;
            if (percent < 60) {
              color = 'bg-green-500';
            } else if (percent < 80) {
              color = 'bg-yellow-500';
            } else {
              color = 'bg-red-500';
            }
          }
          
          return (
            <div
              key={i}
              className={`w-full transition-colors duration-75 ${color}`}
              style={{ height: `${(height / segments) - 1}px` }}
            />
          );
        })}
      </div>
      <span className="text-[9px] text-zinc-500 mt-1">MASTER</span>
    </div>
  );
};
