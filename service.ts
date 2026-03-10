import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  // Remote control events (Control Center / Lock Screen / AirPlay)
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  // Fast resume on AirPlay/Sonos route changes
  // When switching audio output, iOS briefly interrupts playback — resume immediately
  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    if (data.paused && !data.permanent) {
      try {
        await TrackPlayer.play();
      } catch (e) {
        console.error('Duck resume failed:', e);
      }
    }
  });

  // Auto-retry on playback errors (AirPlay/Sonos route changes can cause errors)
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
};
