import { Platform } from 'react-native';

export interface AudioPlayerAPI {
  setup: () => Promise<void>;
  play: (url: string, title: string, artist: string, artwork?: string) => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getVolume: () => Promise<number>;
  updateMetadata: (title: string, artist: string, artwork?: string) => Promise<void>;
}

let webAudio: HTMLAudioElement | null = null;
let webVolume = 1.0;

const WebAudioPlayer: AudioPlayerAPI = {
  setup: async () => {
    console.log('[WebAudio] Setup complete');
  },
  play: async (url: string) => {
    if (webAudio) {
      webAudio.pause();
      webAudio.src = '';
    }
    webAudio = new Audio(url);
    webAudio.volume = webVolume;
    await webAudio.play();
    console.log('[WebAudio] Playing:', url);
  },
  pause: async () => {
    webAudio?.pause();
    console.log('[WebAudio] Paused');
  },
  stop: async () => {
    if (webAudio) {
      webAudio.pause();
      webAudio.src = '';
      webAudio = null;
    }
    console.log('[WebAudio] Stopped');
  },
  setVolume: async (volume: number) => {
    webVolume = volume;
    if (webAudio) webAudio.volume = volume;
  },
  getVolume: async () => webVolume,
  updateMetadata: async () => {},
};

let nativePlayerModule: AudioPlayerAPI | null = null;

async function getNativePlayer(): Promise<AudioPlayerAPI> {
  if (nativePlayerModule) return nativePlayerModule;

  const TrackPlayer = (await import('react-native-track-player')).default;
  const {
    Capability,
    AppKilledPlaybackBehavior,
    IOSCategoryOptions,
    IOSCategory,
    IOSCategoryMode,
  } = await import('react-native-track-player');

  let isSetup = false;

  nativePlayerModule = {
    setup: async () => {
      if (isSetup) return;
      try {
        await TrackPlayer.setupPlayer({
          maxBuffer: 30,
          minBuffer: 5,
          playBuffer: 2,
          backBuffer: 0,
          waitForBuffer: true,
          autoHandleInterruptions: true,
          iosCategory: IOSCategory.Playback,
          iosCategoryMode: IOSCategoryMode.Default,
          iosCategoryOptions: [
            IOSCategoryOptions.AllowAirPlay,
            IOSCategoryOptions.AllowBluetooth,
            IOSCategoryOptions.AllowBluetoothA2DP,
          ],
        });
        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
          progressUpdateEventInterval: 10,
        });
        isSetup = true;
        console.log('[TrackPlayer] Setup complete — background audio configured');
      } catch (error) {
        console.error('[TrackPlayer] Setup failed:', error);
      }
    },
    play: async (url: string, title: string, artist: string, artwork?: string) => {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url,
        title,
        artist,
        artwork: artwork || undefined,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      console.log('[TrackPlayer] Playing');
    },
    pause: async () => {
      await TrackPlayer.pause();
      console.log('[TrackPlayer] Paused');
    },
    stop: async () => {
      await TrackPlayer.reset();
      console.log('[TrackPlayer] Stopped');
    },
    setVolume: async (volume: number) => {
      await TrackPlayer.setVolume(volume);
    },
    getVolume: async () => {
      return TrackPlayer.getVolume();
    },
    updateMetadata: async (title: string, artist: string, artwork?: string) => {
      try {
        const trackIndex = await TrackPlayer.getActiveTrackIndex();
        if (trackIndex !== null && trackIndex !== undefined) {
          await TrackPlayer.updateMetadataForTrack(trackIndex, { title, artist, artwork });
        }
      } catch (e) {
        console.error('[TrackPlayer] Failed to update metadata:', e);
      }
    },
  };

  return nativePlayerModule;
}

export async function getAudioPlayer(): Promise<AudioPlayerAPI> {
  if (Platform.OS === 'web') return WebAudioPlayer;
  return getNativePlayer();
}
