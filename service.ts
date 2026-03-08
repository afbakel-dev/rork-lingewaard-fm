import TrackPlayer, { Event, State } from 'react-native-track-player';

module.exports = async function () {
  // Remote control events (Control Center / Lock Screen / AirPlay)
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  // Handle audio interruptions (Control Center AirPlay route switches)
  // When switching AirPlay output via Control Center, iOS sends an interruption
  // that pauses playback. We need to resume once the route change completes.
  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    console.log('RemoteDuck event:', data);
    if (data.paused) {
      // Audio was interrupted (route is changing)
      // If not permanent, resume after the route stabilizes
      if (!data.permanent) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
          const track = await TrackPlayer.getActiveTrack();
          if (track) {
            await TrackPlayer.play();
            console.log('Resumed playback after route change');
          }
        } catch (error) {
          console.error('Failed to resume after duck:', error);
        }
      }
    }
  });

  // Monitor playback state — auto-recover from unexpected stops
  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    // If player goes to "ready" or "stopped" unexpectedly while a track is loaded,
    // it likely means the route change caused playback to halt
    if (data.state === State.Ready || data.state === State.Stopped) {
      const track = await TrackPlayer.getActiveTrack();
      if (track) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        // Re-check state — only resume if still stuck
        const currentState = (await TrackPlayer.getPlaybackState()).state;
        if (currentState === State.Ready || currentState === State.Stopped) {
          try {
            await TrackPlayer.play();
            console.log('Auto-resumed from stuck state:', data.state);
          } catch (error) {
            console.error('Auto-resume failed:', error);
          }
        }
      }
    }
  });

  // Auto-retry on playback errors (helps with AirPlay/Sonos route changes)
  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('Playback error, attempting recovery:', data);
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track) {
        // Small delay before retry — gives AirPlay route time to stabilize
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await TrackPlayer.retry();
      }
    } catch (error) {
      console.error('Recovery failed:', error);
    }
  });
};
