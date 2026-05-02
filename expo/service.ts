import TrackPlayer, { Event, State } from 'react-native-track-player';
import AsyncStorage from '@react-native-async-storage/async-storage';

const USER_PAUSED_KEY = '@lingewaardfm/userPaused';

/**
 * Minimal playback service.
 *
 * IMPORTANT: iOS terminates apps with UIBackgroundModes=["audio"] that
 * burn CPU in the background — even small amounts. The previous version
 * polled TrackPlayer state every 5s with a watchdog interval, which kept
 * the JS bridge awake and caused iOS to kill the entire app process
 * roughly 50 seconds after screen lock.
 *
 * This version is strictly event-driven:
 *   - No setInterval / no watchdog
 *   - No periodic state polling
 *   - Only reacts to remote control events and to PlaybackError
 *   - Recovery is throttled and bounded so it cannot spin
 *
 * iOS + AVPlayer (used by RNTP on iOS) already keep the audio session
 * alive on its own as long as we don't fight it.
 */
module.exports = async function () {
  let lastUrl: string | undefined;
  let lastTitle: string | undefined;
  let lastArtist: string | undefined;
  let lastArtwork: string | number | undefined;

  let userPausedMemory = false;
  let isRecovering = false;
  let lastRecoveryAt = 0;

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

  const restartStream = async (reason: string): Promise<void> => {
    if (isRecovering) {
      console.log('[Service] Recovery already in progress (' + reason + ')');
      return;
    }
    if (await isUserPaused()) {
      console.log('[Service] User paused — skip recovery (' + reason + ')');
      return;
    }
    const now = Date.now();
    // Hard throttle: at most one recovery every 10s. Prevents tight loops
    // that drain background CPU and cause iOS to kill the app.
    if (now - lastRecoveryAt < 10000) {
      console.log('[Service] Recovery throttled (' + reason + ')');
      return;
    }
    lastRecoveryAt = now;
    isRecovering = true;

    console.log('[Service] Recovery for: ' + reason);

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
        console.log('[Service] Recovery: no URL — abort');
        return;
      }

      const baseUrl = url.split('?')[0];
      console.log('[Service] Recovery: reset+add+play on', baseUrl);
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url: baseUrl,
        title,
        artist,
        artwork,
        isLiveStream: true,
      });
      await TrackPlayer.play();
    } catch (error) {
      console.error('[Service] restartStream error:', error);
    } finally {
      isRecovering = false;
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
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    console.log('[Service] RemoteStop');
    try {
      await AsyncStorage.setItem(USER_PAUSED_KEY, '1');
    } catch {}
    userPausedMemory = true;
    void TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    console.log('[Service] RemoteDuck:', JSON.stringify(data));
    if (data.permanent) {
      await TrackPlayer.pause();
    } else if (data.paused) {
      if (!(await isUserPaused())) {
        await TrackPlayer.play();
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    // Keep this handler EXTREMELY light — it fires often and runs in the
    // background JS thread. Heavy work here is what was killing the app.
    if (data.state === State.Playing) {
      try {
        await AsyncStorage.setItem(USER_PAUSED_KEY, '0');
      } catch {}
      userPausedMemory = false;
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] PlaybackError:', JSON.stringify(data));
    if (await isUserPaused()) return;
    void restartStream('playback-error');
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[Service] PlaybackQueueEnded');
    if (await isUserPaused()) return;
    void restartStream('queue-ended');
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
