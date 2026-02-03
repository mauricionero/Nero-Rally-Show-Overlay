import React from 'react';

export const StreamThumbnail = ({ streamUrl, name, className = '', showAlways = false, isActive = false }) => {
  const shouldShow = showAlways || isActive;
  
  if (!streamUrl || !shouldShow) {
    return (
      <div className={`bg-zinc-800 flex items-center justify-center ${className}`}>
        <span className="text-lg font-bold text-zinc-600">
          {name?.charAt(0) || '?'}
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-black relative overflow-hidden ${className}`}>
      <iframe
        src={streamUrl}
        className="w-full h-full"
        frameBorder="0"
        allow="autoplay"
        title={name}
        style={{ pointerEvents: 'none' }}
      />
    </div>
  );
};
