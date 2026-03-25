import React from 'react';
import { Video, Map } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger } from './ui/select';
import { getExternalMediaIconComponent } from '../utils/mediaIcons.js';

const FeedOptionContent = ({ feed }) => {
  if (!feed) return null;

  if (feed.type === 'camera') {
    return (
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-[#FF4500]" />
        <span>{feed.name}</span>
      </div>
    );
  }

  if (feed.type === 'media') {
    const Icon = getExternalMediaIconComponent(feed.icon);
    return (
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[#FF4500]" />
        <span>{feed.name}</span>
      </div>
    );
  }

  if (feed.type === 'stage-map') {
    return (
      <div className="flex items-center gap-2">
        <Map className="w-4 h-4 text-[#FF4500]" />
        <span>{feed.name}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {feed.position && <span className="text-[#FF4500] text-xs font-bold">P{feed.position}</span>}
      <span>{feed.name}</span>
    </div>
  );
};

export function FeedSelect({
  value,
  onValueChange,
  feeds,
  placeholder,
  noneOption,
  triggerClassName = '',
  contentClassName = '',
  groupLabels
}) {
  const selectedFeed = feeds.find((feed) => feed.value === value);
  const cameraFeeds = feeds.filter((feed) => feed.type === 'camera');
  const mediaFeeds = feeds.filter((feed) => feed.type === 'media');
  const stageMapFeeds = feeds.filter((feed) => feed.type === 'stage-map');
  const pilotFeeds = feeds.filter((feed) => feed.type === 'pilot');

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={triggerClassName}>
        {selectedFeed ? (
          <FeedOptionContent feed={selectedFeed} />
        ) : noneOption ? (
          <span className="text-zinc-400">{noneOption.label}</span>
        ) : (
          <span className="text-zinc-400">{placeholder}</span>
        )}
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {noneOption && <SelectItem value={noneOption.value}>{noneOption.label}</SelectItem>}

        {cameraFeeds.length > 0 && groupLabels?.cameras && (
          <div className="px-2 py-1 text-xs text-zinc-500 uppercase">{groupLabels.cameras}</div>
        )}
        {cameraFeeds.map((feed) => (
          <SelectItem key={feed.value} value={feed.value}>
            <FeedOptionContent feed={feed} />
          </SelectItem>
        ))}

        {mediaFeeds.length > 0 && groupLabels?.media && (
          <div className="px-2 py-1 text-xs text-zinc-500 uppercase">{groupLabels.media}</div>
        )}
        {mediaFeeds.map((feed) => (
          <SelectItem key={feed.value} value={feed.value}>
            <FeedOptionContent feed={feed} />
          </SelectItem>
        ))}

        {stageMapFeeds.length > 0 && groupLabels?.maps && (
          <div className="px-2 py-1 text-xs text-zinc-500 uppercase">{groupLabels.maps}</div>
        )}
        {stageMapFeeds.map((feed) => (
          <SelectItem key={feed.value} value={feed.value}>
            <FeedOptionContent feed={feed} />
          </SelectItem>
        ))}

        {pilotFeeds.length > 0 && groupLabels?.pilots && (
          <div className="px-2 py-1 text-xs text-zinc-500 uppercase">{groupLabels.pilots}</div>
        )}
        {pilotFeeds.map((feed) => (
          <SelectItem key={feed.value} value={feed.value}>
            <FeedOptionContent feed={feed} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
