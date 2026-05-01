import TrackPlayer, { Event, State } from 'react-native-track-player';

module.exports = async function () {
  let lastUrl: string | undefined;
  let lastTitle: string | undefined;
  let lastArtist: string | undefined;
  let lastArtwork: string | number | undefined;
  let userPaused = false;
  let isRecovering = false;
  let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRecoveryAt = 0;
  let watchdogInterval: ReturnType<typeof setInterval> | null = null;
  let lastPlayingAt = Date.now();

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
    const now = Date.now();
    if (now - lastRecoveryAt < 4000) {
      console.log('[Service] Recovery throttled (' + reason + ')');
      return;
    }
    lastRecoveryAt = now;
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

      const cacheBuster = Date.now();
      const baseUrl = url.split('?')[0];
      const freshUrl = baseUrl + '?_=' + cacheBuster;

      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: freshUrl,
        title,
        artist,
        artwork,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      lastPlayingAt = Date.now();
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

  const startWatchdog = (): void => {
    if (watchdogInterval) return;
    watchdogInterval = setInterval(async () => {
      if (userPaused || isRecovering) return;
      try {
        const info = await TrackPlayer.getPlaybackState();
        const s = info.state;
        if (s === State.Playing) {
          lastPlayingAt = Date.now();
          return;
        }
        if (s === State.Buffering || s === State.Loading || s === State.Ready) {
          return;
        }
        const silentFor = Date.now() - lastPlayingAt;
        if (silentFor > 8000) {
          console.log('[Service] Watchdog: silent for ' + silentFor + 'ms, state=' + s + ' — recovering');
          void restartStream('watchdog-silent-' + s);
        }
      } catch (error) {
        console.error('[Service] Watchdog error:', error);
      }
    }, 4000);
  };

  const stopWatchdog = (): void => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
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
    cancelPendingRecovery();
    stopWatchdog();
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[Service] RemoteStop received');
    userPaused = true;
    cancelPendingRecovery();
    stopWatchdog();
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

    if (data.state === State.Playing) {
      userPaused = false;
      lastPlayingAt = Date.now();
      cancelPendingRecovery();
      startWatchdog();
    }

    if (data.state === State.Paused) {
      // Could be user pause OR iOS pausing on stream stall.
      // Watchdog will recover if userPaused is false.
    }

    if (
      data.state === State.Stopped ||
      data.state === State.Ended ||
      data.state === State.None ||
      data.state === State.Error
    ) {
      if (!userPaused) {
        console.log('[Service] State indicates stream stopped — scheduling recovery');
        scheduleRestart('state-' + data.state, 2000);
      }
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
