import TrackPlayer, { Event } from 'react-native-track-player';

module.exports = async function () {
  let lastUrl: string | undefined;
  let lastTitle: string | undefined;
  let lastArtist: string | undefined;
  let lastArtwork: string | number | undefined;
  let userPaused = false;
  let isRecovering = false;
  let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;

  const cancelPendingRecovery = (): void => {
    if (recoveryTimeout) {
      clearTimeout(recoveryTimeout);
      recoveryTimeout = null;
    }
  };

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
      let url = lastUrl;
      let title = lastTitle ?? 'Live uitzending';
      let artist = lastArtist ?? 'Lingewaard FM';
      let artwork = lastArtwork;

      try {
        const track = await TrackPlayer.getActiveTrack();
        if (track?.url) {
          url = track.url;
          title = track.title ?? title;
          artist = track.artist ?? artist;
          artwork = track.artwork ?? artwork;
        }
      } catch {}

      if (!url) {
        console.log('[Service] No URL to restart (' + reason + ')');
        return;
      }
      console.log('[Service] Restarting stream because: ' + reason);
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

  const scheduleRestart = (reason: string, delayMs: number): void => {
    if (userPaused || isRecovering) return;
    cancelPendingRecovery();
    recoveryTimeout = setTimeout(() => {
      recoveryTimeout = null;
      void restartStream(reason);
    }, delayMs);
  };

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[Service] RemotePlay received');
    userPaused = false;
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[Service] RemotePause received');
    userPaused = true;
    cancelPendingRecovery();
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[Service] RemoteStop received');
    userPaused = true;
    cancelPendingRecovery();
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

    if (data.state === 'playing') {
      userPaused = false;
      cancelPendingRecovery();
    }

    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.url) {
        lastUrl = track.url;
        lastTitle = track.title ?? lastTitle;
        lastArtist = track.artist ?? lastArtist;
        lastArtwork = track.artwork ?? lastArtwork;
      }
    } catch {}
  });

  TrackPlayer.addEventListener(Event.PlaybackError, (data) => {
    console.log('[Service] Playback error:', JSON.stringify(data));
    if (userPaused) {
      console.log('[Service] User paused — ignoring playback error');
      return;
    }
    scheduleRestart('playback-error', 2000);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    console.log('[Service] Queue ended on live stream — restarting');
    if (userPaused) {
      console.log('[Service] User paused — ignoring queue-ended');
      return;
    }
    scheduleRestart('queue-ended', 1500);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (data) => {
    console.log('[Service] Active track changed');
    if (data.track?.url) {
      lastUrl = data.track.url;
      lastTitle = data.track.title ?? lastTitle;
      lastArtist = data.track.artist ?? lastArtist;
      lastArtwork = data.track.artwork ?? lastArtwork;
    }
  });
};
