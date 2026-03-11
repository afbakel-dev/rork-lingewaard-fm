import TrackPlayer, { Event, State } from 'react-native-track-player';

module.exports = async function () {
  // Remote control events (Control Center / Lock Screen / AirPlay)
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  // Fast resume on AirPlay/Sonos route changes
  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    if (data.paused && !data.permanent) {
      try {
        await TrackPlayer.play();
      } catch (e) {
        console.error('Duck resume failed:', e);
      }
    }
  });

  // Auto-recover from unexpected stops/buffering stalls
  // Live streams can stall — this restarts playback automatically
  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    if (data.state === State.Ready || data.state === State.Stopped || data.state === State.Error) {
      const track = await TrackPlayer.getActiveTrack();
      if (track) {
        // Wait briefly to see if it's a transient state
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const currentState = (await TrackPlayer.getPlaybackState()).state;
        if (currentState === State.Ready || currentState === State.Stopped || currentState === State.Error) {
          try {
            console.log('Auto-recovering from state:', currentState);
            await TrackPlayer.play();
          } catch (error) {
            console.error('Auto-recovery failed:', error);
          }
        }
      }
    }
  });

  // Auto-retry on playback errors
  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('Playback error, retrying:', data);
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track) {
        await TrackPlayer.retry();
      }
    } catch (error) {
      console.error('Recovery failed:', error);
    }
  });

  // Live stream should never "end" — if it does, restart it
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    const track = await TrackPlayer.getActiveTrack();
    if (track) {
      console.log('Queue ended unexpectedly on live stream, restarting');
      try {
        await TrackPlayer.seekTo(0);
        await TrackPlayer.play();
      } catch (error) {
        console.error('Queue end recovery failed:', error);
      }
    }
  });
};
