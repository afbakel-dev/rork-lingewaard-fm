import TrackPlayer, { Event, State } from 'react-native-track-player';

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
      // Permanent interruption (e.g. phone call ended the session) — pause
      console.log('[Service] Permanent duck — pausing');
      await TrackPlayer.pause();
    } else if (data.paused) {
      // Temporary duck started (e.g. notification, Siri) — pause
      console.log('[Service] Temporary duck started — pausing');
      await TrackPlayer.pause();
    } else {
      // Duck ended — resume playback
      console.log('[Service] Duck ended — resuming');
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('[Service] PlaybackState changed:', data.state);

    // Capture last known URL whenever player is active, so we can recover after errors
    if (
      data.state === State.Playing ||
      data.state === State.Buffering ||
      data.state === State.Loading ||
      data.state === State.Ready
    ) {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.url) {
        lastUrl = track.url as string;
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] Playback error:', JSON.stringify(data));

    const track = await TrackPlayer.getActiveTrack();
    const url = (track?.url as string) || lastUrl;
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
    const url = (track?.url as string) || lastUrl;
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
      lastUrl = data.track.url as string;
    }
  });

  // This event fires when AirPlay/Bluetooth routes change.
  // When iOS switches the audio output (e.g. iPhone → Sonos), the player briefly
  // sets playWhenReady=false, then fires this event with playWhenReady=true once
  // the new route is ready. Calling play() here is what resumes audio on the new device.
  TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, async (data) => {
    console.log('[Service] PlayWhenReadyChanged:', JSON.stringify(data));
    if (data.playWhenReady) {
      try {
        const state = await TrackPlayer.getPlaybackState();
        // Only call play() if we're not already playing — avoid double-triggering
        if (state.state !== State.Playing) {
          console.log('[Service] Route ready — resuming playback on new output device');
          await TrackPlayer.play();
        }
      } catch (error) {
        console.error('[Service] Failed to resume after route change:', error);
      }
    }
  });
};
