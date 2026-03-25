import TrackPlayer, { Event } from 'react-native-track-player';

const STREAM_URL = 'https://totaal-streaming.de:8110/radio.mp3';

let userInitiatedStop = false;

export function setUserInitiatedStop(value: boolean) {
  userInitiatedStop = value;
}

module.exports = async function () {
  let lastUrl: string = STREAM_URL;

  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    console.log('[Service] RemotePlay received');
    userInitiatedStop = false;
    void TrackPlayer.play();
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    console.log('[Service] RemotePause received');
    void TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    console.log('[Service] RemoteStop received');
    userInitiatedStop = true;
    void TrackPlayer.stop();
  });

  TrackPlayer.addEventListener(Event.RemoteDuck, async (data) => {
    console.log('[Service] RemoteDuck:', JSON.stringify(data));
    if (data.permanent) {
      console.log('[Service] Permanent duck — pausing');
      await TrackPlayer.pause();
    } else if (data.paused) {
      console.log('[Service] Temporary duck — audio paused by system, waiting...');
    } else {
      console.log('[Service] Duck ended — resuming playback');
      await TrackPlayer.play();
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
    console.log('[Service] PlaybackState changed:', data.state);

    if (data.state === 'error' || data.state === 'stopped') {
      if (!userInitiatedStop) {
        console.log('[Service] Unexpected stop/error — will attempt restart');
        await restartStream(lastUrl);
      }
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, async (data) => {
    console.log('[Service] Playback error:', JSON.stringify(data));
    if (userInitiatedStop) return;

    await restartStream(lastUrl);
  });

  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, async () => {
    console.log('[Service] Queue ended on live stream');
    if (userInitiatedStop) return;

    await restartStream(lastUrl);
  });

  TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (data) => {
    console.log('[Service] Active track changed:', JSON.stringify(data));
    if (data.track?.url) {
      lastUrl = data.track.url;
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackPlayWhenReadyChanged, async (data) => {
    console.log('[Service] PlayWhenReadyChanged:', JSON.stringify(data));
  });

  async function restartStream(url: string) {
    for (let attempt = 1; attempt <= 5; attempt++) {
      if (userInitiatedStop) {
        console.log('[Service] User stopped — aborting restart');
        return;
      }

      const delay = attempt * 2000;
      console.log(`[Service] Restart attempt ${attempt} in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await TrackPlayer.reset();
        await TrackPlayer.add({
          url,
          title: 'Live uitzending',
          artist: 'Lingewaard FM',
          isLiveStream: true,
        });
        await TrackPlayer.play();
        console.log(`[Service] Restart succeeded on attempt ${attempt}`);
        return;
      } catch (error) {
        console.error(`[Service] Restart attempt ${attempt} failed:`, error);
      }
    }
    console.error('[Service] All restart attempts exhausted');
  }
};
