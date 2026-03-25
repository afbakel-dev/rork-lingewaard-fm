import TrackPlayer, { Event } from 'react-native-track-player';

const PlaybackState = {
  Error: 'error' as const,
  Stopped: 'stopped' as const,
};

module.exports = async function () {
  let lastUrl: string | undefined;

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[Service] RemotePlay received');
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[Service] RemotePause received');
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[Service] RemoteStop received');
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

    if (data.state === PlaybackState.Error || data.state === PlaybackState.Stopped) {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.url) {
        lastUrl = track.url;
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
    const track = await TrackPlayer.getActiveTrack();
    const url = track?.url || lastUrl;
    if (url) {
      try {
        await TrackPlayer.reset();
        await TrackPlayer.add({
          url,
          title: 'Live uitzending',
          artist: 'Lingewaard FM',
          isLiveStream: true,
        });
        await TrackPlayer.play();
        console.log('[Service] Restarted after queue end');
      } catch (error) {
        console.error('[Service] Queue end recovery failed:', error);
      }
    }
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
