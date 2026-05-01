import TrackPlayer, { Event } from 'react-native-track-player';

const PlaybackState = {
  Error: 'error' as const,
  Stopped: 'stopped' as const,
  Ended: 'ended' as const,
  None: 'none' as const,
  Paused: 'paused' as const,
  Playing: 'playing' as const,
};

module.exports = async function () {
  let lastUrl: string | undefined;
  let userPaused = false;
  let isRecovering = false;

  const restartStream = async (reason: string): Promise<void> => {
    if (isRecovering) {
      console.log('[Service] Recovery already in progress, skipping (' + reason + ')');
      return;
    }
    if (userPaused) {
      console.log('[Service] User paused — not restarting (' + reason + ')');
      return;
    }
    isRecovering = true;
    try {
      const track = await TrackPlayer.getActiveTrack();
      const url = track?.url || lastUrl;
      if (!url) {
        console.log('[Service] No URL to restart (' + reason + ')');
        return;
      }
      console.log('[Service] Restarting stream because: ' + reason);
      const title = track?.title ?? 'Live uitzending';
      const artist = track?.artist ?? 'Lingewaard FM';
      const artwork = track?.artwork;
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url,
        title,
        artist,
        artwork,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      console.log('[Service] Stream restarted successfully');
    } catch (error) {
      console.error('[Service] restartStream failed:', error);
    } finally {
      isRecovering = false;
    }
  };

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[Service] RemotePlay received');
    userPaused = false;
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[Service] RemotePause received');
    userPaused = true;
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[Service] RemoteStop received');
    userPaused = true;
    void TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    console.log('[Service] RemoteDuck:', JSON.stringify(data));
    if (data.permanent) {
      console.log('[Service] Permanent duck — pausing');
      await TrackPlayer.pause();
    } else if (data.paused) {
      console.log('[Service] Temporary duck ended — resuming');
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('[Service] PlaybackState changed:', data.state);

    if (data.state === PlaybackState.Playing) {
      userPaused = false;
    }

    const track = await TrackPlayer.getActiveTrack();
    if (track?.url) {
      lastUrl = track.url;
    }

    if (
      data.state === PlaybackState.Ended ||
      data.state === PlaybackState.Stopped ||
      data.state === PlaybackState.None
    ) {
      if (!userPaused) {
        console.log('[Service] Unexpected state ' + data.state + ' — recovering live stream');
        setTimeout(() => {
          void restartStream('state=' + data.state);
        }, 1500);
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] Playback error:', JSON.stringify(data));

    const track = await TrackPlayer.getActiveTrack();
    const url = track?.url || lastUrl;
    if (!url) {
      console.log('[Service] No track URL to retry');
      return;
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      const delay = attempt * 2000;
      console.log(`[Service] Retry attempt ${attempt} in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        const currentTrack = await TrackPlayer.getActiveTrack();
        if (currentTrack) {
          await TrackPlayer.retry();
          console.log(`[Service] Retry ${attempt} succeeded`);
          return;
        } else {
          await TrackPlayer.reset();
          await TrackPlayer.add({
            url,
            title: 'Live uitzending',
            artist: 'Lingewaard FM',
            isLiveStream: true,
          });
          await TrackPlayer.play();
          console.log(`[Service] Re-added track and playing on attempt ${attempt}`);
          return;
        }
      } catch (error) {
        console.error(`[Service] Retry ${attempt} failed:`, error);
      }
    }

    console.error('[Service] All retry attempts exhausted');
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[Service] Queue ended on live stream — restarting');
    await restartStream('queue-ended');
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (data) => {
    console.log('[Service] Active track changed:', JSON.stringify(data));
    if (data.track?.url) {
      lastUrl = data.track.url;
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, async (data) => {
    console.log('[Service] PlayWhenReadyChanged:', JSON.stringify(data));
  });
};
