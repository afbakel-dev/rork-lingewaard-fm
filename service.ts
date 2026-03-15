import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
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
    console.log('[Service] RemoteDuck:', data);
    if (data.paused && !data.permanent) {
      try {
        await TrackPlayer.play();
      } catch (e) {
        console.error('[Service] Duck resume failed:', e);
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('[Service] PlaybackState changed:', data.state);
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] Playback error, will retry:', data);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track) {
        await TrackPlayer.retry();
        console.log('[Service] Retry succeeded');
      }
    } catch (error) {
      console.error('[Service] Retry failed:', error);
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[Service] Queue ended on live stream');
    const track = await TrackPlayer.getActiveTrack();
    if (track) {
      try {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
        console.log('[Service] Restarted after queue end');
      } catch (error) {
        console.error('[Service] Queue end recovery failed:', error);
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (data) => {
    console.log('[Service] Active track changed:', data);
  });
};
