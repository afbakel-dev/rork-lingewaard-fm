import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  // Remote control events (Control Center / Lock Screen / AirPlay)
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

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
