import TrackPlayer, { Event, State as TrackState } from 'react-native-track-player';

const PLAYING = TrackState.Playing;
const PAUSED = TrackState.Paused;
const STOPPED = TrackState.Stopped;
const ERROR = TrackState.Error;
const READY = TrackState.Ready;

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
  let wasPlayingBeforeInterruption = false;

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('PlaybackState changed:', data.state);

    if (data.state === PLAYING) {
      wasPlayingBeforeInterruption = true;
    }

    if (data.state === PAUSED) {
      const track = await TrackPlayer.getActiveTrack();
      if (track && wasPlayingBeforeInterruption) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const currentState = (await TrackPlayer.getPlaybackState()).state;
        if (currentState === PAUSED) {
          try {
            console.log('Auto-resuming after interruption (was playing)');
            await TrackPlayer.play();
          } catch (error) {
            console.error('Auto-resume failed:', error);
          }
        }
      }
    }

    if (data.state === STOPPED || data.state === ERROR) {
      const track = await TrackPlayer.getActiveTrack();
      if (track && wasPlayingBeforeInterruption) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const currentState = (await TrackPlayer.getPlaybackState()).state;
        if (currentState === STOPPED || currentState === ERROR) {
          try {
            console.log('Auto-recovering from state:', currentState);
            await TrackPlayer.play();
          } catch (error) {
            console.error('Auto-recovery failed:', error);
          }
        }
      }
    }

    if (data.state === READY) {
      const track = await TrackPlayer.getActiveTrack();
      if (track && wasPlayingBeforeInterruption) {
        try {
          console.log('Auto-playing after Ready state');
          await TrackPlayer.play();
        } catch (error) {
          console.error('Auto-play on Ready failed:', error);
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
