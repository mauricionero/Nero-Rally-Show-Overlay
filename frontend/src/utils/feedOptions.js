export const getFeedOptionValue = (type, id) => `${type}:${id}`;

export const buildFeedOptions = ({ pilots = [], cameras = [], externalMedia = [], pilotPositions = {} }) => {
  const feeds = [];

  cameras
    .filter((camera) => camera.isActive && camera.streamUrl)
    .forEach((camera) => {
      feeds.push({
        value: getFeedOptionValue('camera', camera.id),
        id: camera.id,
        type: 'camera',
        name: camera.name,
        streamUrl: camera.streamUrl
      });
    });

  externalMedia
    .filter((media) => media.url)
    .forEach((media) => {
      feeds.push({
        value: getFeedOptionValue('media', media.id),
        id: media.id,
        type: 'media',
        name: media.name,
        url: media.url,
        icon: media.icon || 'Map'
      });
    });

  pilots
    .filter((pilot) => pilot.streamUrl)
    .forEach((pilot) => {
      feeds.push({
        value: getFeedOptionValue('pilot', pilot.id),
        id: pilot.id,
        type: 'pilot',
        name: pilot.name,
        streamUrl: pilot.streamUrl,
        position: pilotPositions[pilot.id]
      });
    });

  return feeds;
};

export const findFeedByValue = (feeds, value) => feeds.find((feed) => feed.value === value) || null;
