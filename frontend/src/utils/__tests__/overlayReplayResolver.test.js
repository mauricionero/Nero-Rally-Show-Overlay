import { getPilotReplaySeekSeconds } from '../overlayReplayResolver.js';
import { buildReplayStageScheduleMap, getFirstCompetitiveStage } from '../replaySchedule.js';

describe('replay scheduling', () => {
  const stages = [
    {
      id: 'stage-ss0',
      type: 'SS',
      ssNumber: '0',
      name: 'Shakedown',
      date: '2026-04-25'
    },
    {
      id: 'stage-ss1',
      type: 'SS',
      ssNumber: '1',
      name: 'Skogsrallyt',
      date: '2026-04-25'
    }
  ];

  const times = {
    'pilot-42': {
      'stage-ss1': '00:14:54'
    }
  };

  it('treats SS1 as the first competitive stage when SS0 is shakedown', () => {
    expect(getFirstCompetitiveStage(stages)?.id).toBe('stage-ss1');
  });

  it('starts the SS1 replay at the replay baseline instead of offsetting by SS0', () => {
    const replayStartDate = '2026-04-24';
    const replayStartTime = '22:49';
    const replayStageScheduleById = buildReplayStageScheduleMap({
      stages,
      times,
      replayStartDate,
      replayStartTime,
      replayStageIntervalSeconds: 60
    });

    expect(replayStageScheduleById.has('stage-ss0')).toBe(false);
    const replayStartDateTime = replayStageScheduleById.get('stage-ss1')?.replayStartDateTime;
    expect(replayStartDateTime?.getFullYear()).toBe(2026);
    expect(replayStartDateTime?.getMonth()).toBe(3);
    expect(replayStartDateTime?.getDate()).toBe(24);
    expect(replayStartDateTime?.getHours()).toBe(22);
    expect(replayStartDateTime?.getMinutes()).toBe(49);
  });

  it('calculates the replay seek from SS1 chapter timing without SS0 drift', () => {
    const seekSeconds = getPilotReplaySeekSeconds({
      pilot: {
        id: 'pilot-42',
        currentStageId: 'stage-ss1',
        replayStageTimes: {
          'stage-ss1': '14:54'
        }
      },
      stages,
      times,
      now: new Date(2026, 3, 24, 22, 49, 0),
      replayStartDate: '2026-04-24',
      replayStartTime: '22:49',
      replayStageIntervalSeconds: 60,
      loadingBufferSeconds: 3
    });

    expect(seekSeconds).toBe(897);
  });
});
