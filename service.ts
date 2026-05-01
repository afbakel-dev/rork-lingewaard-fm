import TrackPlayer, { Event, State } from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_PAUSED_KEY = '@lingewaardfm/userPaused';

module.exports = async function () {
  let lastUrl: string | undefined;
  let lastTitle: string | undefined;
  let lastArtist: string | undefined;
  let lastArtwork: string | number | undefined;
  let userPausedMemory = false;
  let isRecovering = false;
  let recoveryTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastRecoveryAt = 0;
  let recoveryAttempts = 0;
  let watchdogInterval: ReturnType<typeof setInterval> | null = null;
  let lastPlayingAt = Date.now();

  const isUserPaused = async (): Promise<boolean> => {
    try {
      const v = await AsyncStorage.getItem(USER_PAUSED_KEY);
      if (v !== null) {
        userPausedMemory = v === '1';
      }
    } catch (e) {
      console.error('[Service] Failed to read userPaused flag:', e);
    }
    return userPausedMemory;
  };

  const cancelPendingRecovery = (): void => {
    if (recoveryTimeout) {
      clearTimeout(recoveryTimeout);
      recoveryTimeout = null;
    }
  };

  const tryGentleResume = async (): Promise<boolean> => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (!track?.url) return false;
      console.log('[Service] Gentle resume — calling play() on existing track');
      await TrackPlayer.play();
      // Give it 2.5s to actually transition to Playing
      await new Promise((r) => setTimeout(r, 2500));
      const info = await TrackPlayer.getPlaybackState();
      const isAlive =
        info.state === State.Playing ||
        info.state === State.Buffering ||
        info.state === State.Loading ||
        info.state === State.Ready;
      console.log('[Service] Gentle resume result:', info.state, 'alive=', isAlive);
      return isAlive;
    } catch (e) {
      console.error('[Service] Gentle resume failed:', e);
      return false;
    }
  };

  const hardRestart = async (): Promise<boolean> => {
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
      console.log('[Service] hardRestart: no URL');
      return false;
    }

    // Use the clean base URL — Icecast can mishandle aggressive cache-busting
    // and the stream is always live so a fresh socket is enough.
    const baseUrl = url.split('?')[0];

    try {
      console.log('[Service] hardRestart: reset+add+play on', baseUrl);
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: baseUrl,
        title,
        artist,
        artwork,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      // Verify
      await new Promise((r) => setTimeout(r, 2500));
      const info = await TrackPlayer.getPlaybackState();
      const isAlive =
        info.state === State.Playing ||
        info.state === State.Buffering ||
        info.state === State.Loading ||
        info.state === State.Ready;
      console.log('[Service] hardRestart result:', info.state, 'alive=', isAlive);
      return isAlive;
    } catch (e) {
      console.error('[Service] hardRestart failed:', e);
      return false;
    }
  };

  const restartStream = async (reason: string): Promise<void> => {
    if (isRecovering) {
      console.log('[Service] Recovery already in progress (' + reason + ')');
      return;
    }
    if (await isUserPaused()) {
      console.log('[Service] User paused — aborting recovery (' + reason + ')');
      return;
    }
    const now = Date.now();
    if (now - lastRecoveryAt < 1500) {
      console.log('[Service] Recovery throttled (' + reason + ')');
      return;
    }
    lastRecoveryAt = now;
    isRecovering = true;
    recoveryAttempts += 1;
    const attempt = recoveryAttempts;

    console.log('[Service] Recovery attempt #' + attempt + ' for: ' + reason);

    try {
      // Step 1: try gentle resume — it does NOT tear down the audio session,
      // which keeps iOS counting us as "actively playing" through the recovery.
      const resumed = await tryGentleResume();
      if (resumed) {
        console.log('[Service] Gentle resume succeeded');
        recoveryAttempts = 0;
        lastPlayingAt = Date.now();
        return;
      }

      // Step 2: full restart
      const restarted = await hardRestart();
      if (restarted) {
        console.log('[Service] Hard restart succeeded');
        recoveryAttempts = 0;
        lastPlayingAt = Date.now();
        return;
      }

      // Step 3: failed — schedule another attempt with backoff
      // Cap at 6 attempts (~ 1+2+4+8+15+15 = 45s of retries)
      if (attempt < 6) {
        const backoffMs = Math.min(15000, Math.pow(2, attempt) * 1000);
        console.log('[Service] Recovery failed, retrying in ' + backoffMs + 'ms');
        isRecovering = false;
        scheduleRestart('retry-' + attempt, backoffMs);
        return;
      }
      console.log('[Service] Recovery exhausted attempts');
    } catch (error) {
      console.error('[Service] restartStream error:', error);
    } finally {
      isRecovering = false;
    }
  };

  const scheduleRestart = (reason: string, delayMs: number): void => {
    if (isRecovering) return;
    cancelPendingRecovery();
    recoveryTimeout = setTimeout(() => {
      recoveryTimeout = null;
      void (async () => {
        if (await isUserPaused()) return;
        void restartStream(reason);
      })();
    }, delayMs);
  };

  const startWatchdog = (): void => {
    if (watchdogInterval) return;
    // Watchdog runs at 5s — only fires on hard-stop states with a real
    // silence window. iOS event listeners do most of the work; this is a
    // safety net for cases where no event fires (e.g. silent socket close).
    watchdogInterval = setInterval(async () => {
      if (isRecovering) return;
      if (await isUserPaused()) return;
      try {
        const info = await TrackPlayer.getPlaybackState();
        const s = info.state;
        if (s === State.Playing) {
          lastPlayingAt = Date.now();
          recoveryAttempts = 0;
          return;
        }
        if (
          s === State.Buffering ||
          s === State.Loading ||
          s === State.Ready
        ) {
          // Allow up to 25s of buffering before kicking it
          if (Date.now() - lastPlayingAt > 25000) {
            console.log('[Service] Watchdog: stuck in ' + s + ' for >25s');
            void restartStream('watchdog-stuck-' + s);
          }
          return;
        }
        // Hard-stop states: Stopped / Ended / None / Error / Paused-without-user
        const silentFor = Date.now() - lastPlayingAt;
        if (silentFor > 8000) {
          console.log(
            '[Service] Watchdog: silent ' +
              silentFor +
              'ms in state=' +
              s +
              ' — recovering'
          );
          void restartStream('watchdog-silent-' + s);
        }
      } catch (error) {
        console.error('[Service] Watchdog error:', error);
      }
    }, 5000);
  };

  const stopWatchdog = (): void => {
    if (watchdogInterval) {
      clearInterval(watchdogInterval);
      watchdogInterval = null;
    }
  };

  // Prime userPaused from storage at boot
  void isUserPaused();

  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    console.log('[Service] RemotePlay');
    try {
      await AsyncStorage.setItem(USER_PAUSED_KEY, '0');
    } catch {}
    userPausedMemory = false;
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    console.log('[Service] RemotePause');
    try {
      await AsyncStorage.setItem(USER_PAUSED_KEY, '1');
    } catch {}
    userPausedMemory = true;
    cancelPendingRecovery();
    stopWatchdog();
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[Service] RemoteStop');
    try {
      await AsyncStorage.setItem(USER_PAUSED_KEY, '1');
    } catch {}
    userPausedMemory = true;
    cancelPendingRecovery();
    stopWatchdog();
    void TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    console.log('[Service] RemoteDuck:', JSON.stringify(data));
    if (data.permanent) {
      await TrackPlayer.pause();
    } else if (data.paused) {
      // Temporary duck ended (e.g. Siri finished) — resume
      if (!(await isUserPaused())) {
        await TrackPlayer.play();
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('[Service] PlaybackState:', data.state);

    if (data.state === State.Playing) {
      try {
        await AsyncStorage.setItem(USER_PAUSED_KEY, '0');
      } catch {}
      userPausedMemory = false;
      lastPlayingAt = Date.now();
      recoveryAttempts = 0;
      cancelPendingRecovery();
      startWatchdog();
    }

    if (
      data.state === State.Stopped ||
      data.state === State.Ended ||
      data.state === State.None ||
      data.state === State.Error
    ) {
      if (!(await isUserPaused())) {
        console.log('[Service] Hard-stop state — recovering');
        scheduleRestart('state-' + data.state, 250);
      }
    }

    if (data.state === State.Paused) {
      // If user did not press pause, this is iOS auto-pausing on a stall.
      // Try a quick gentle resume after a short delay.
      if (!(await isUserPaused())) {
        console.log('[Service] Paused without user — scheduling gentle resume');
        scheduleRestart('paused-no-user', 1500);
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

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] PlaybackError:', JSON.stringify(data));
    if (await isUserPaused()) return;
    scheduleRestart('playback-error', 250);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[Service] PlaybackQueueEnded');
    if (await isUserPaused()) return;
    scheduleRestart('queue-ended', 250);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, (data) => {
    if (data.track?.url) {
      lastUrl = data.track.url;
      lastTitle = data.track.title ?? lastTitle;
      lastArtist = data.track.artist ?? lastArtist;
      lastArtwork = data.track.artwork ?? lastArtwork;
    }
  });
};
