import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const USER_PAUSED_KEY = '@lingewaardfm/userPaused';

async function setUserPausedFlag(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(USER_PAUSED_KEY, value ? '1' : '0');
  } catch (e) {
    console.error('Failed to write userPaused flag:', e);
  }
}

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
    console.log('Web audio player setup');
  },
  play: async (url: string, _title: string, _artist: string) => {
    try {
      if (webAudio) {
        webAudio.pause();
        webAudio.src = '';
      }
      webAudio = new Audio(url);
      webAudio.volume = webVolume;
      await webAudio.play();
      console.log('Web audio playing:', url);
    } catch (error) {
      console.error('Web audio play failed:', error);
      throw error;
    }
  },
  pause: async () => {
    if (webAudio) {
      webAudio.pause();
    }
    console.log('Web audio paused');
  },
  stop: async () => {
    if (webAudio) {
      webAudio.pause();
      webAudio.src = '';
      webAudio = null;
    }
    console.log('Web audio stopped');
  },
  setVolume: async (volume: number) => {
    webVolume = volume;
    if (webAudio) {
      webAudio.volume = volume;
    }
  },
  getVolume: async () => {
    return webVolume;
  },
  updateMetadata: async (_title: string, _artist: string, _artwork?: string) => {
    // No-op on web
  },
};

let nativePlayerModule: AudioPlayerAPI | null = null;

async function getNativePlayer(): Promise<AudioPlayerAPI> {
  if (nativePlayerModule) return nativePlayerModule;

  const TrackPlayer = (await import('react-native-track-player')).default;
  const { Capability, AppKilledPlaybackBehavior, IOSCategoryOptions, IOSCategory, IOSCategoryMode } = await import('react-native-track-player');

  let isSetup = false;

  nativePlayerModule = {
    setup: async () => {
      if (isSetup) return;
      try {
        // Let react-native-track-player manage the audio session exclusively
        // Do NOT use expo-av Audio.setAudioModeAsync — it conflicts with RNTP
        await TrackPlayer.setupPlayer({
          minBuffer: 15,
          maxBuffer: 50,
          playBuffer: 2.5,
          backBuffer: 0,
          waitForBuffer: true,
          autoHandleInterruptions: true,
          iosCategory: IOSCategory.Playback,
          iosCategoryMode: IOSCategoryMode.Default,
          iosCategoryOptions: [
            IOSCategoryOptions.AllowAirPlay,
            IOSCategoryOptions.AllowBluetoothA2DP,
          ],
        });
        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
          progressUpdateEventInterval: 30,
        });
        isSetup = true;
        console.log('TrackPlayer setup complete — background audio configured');
      } catch (error) {
        console.error('TrackPlayer setup failed:', error);
      }
    },
    play: async (url: string, title: string, artist: string, artwork?: string) => {
      await setUserPausedFlag(false);
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url,
        title,
        artist,
        artwork: artwork || undefined,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      console.log('TrackPlayer playing');
    },
    pause: async () => {
      await setUserPausedFlag(true);
      await TrackPlayer.pause();
      console.log('TrackPlayer paused');
    },
    stop: async () => {
      await setUserPausedFlag(true);
      await TrackPlayer.pause();
      console.log('TrackPlayer stopped (paused to keep session alive)');
    },
    setVolume: async (volume: number) => {
      await TrackPlayer.setVolume(volume);
    },
    getVolume: async () => {
      return TrackPlayer.getVolume();
    },
    updateMetadata: async (title: string, artist: string, artwork?: string) => {
      try {
        await (TrackPlayer as any).updateNowPlayingMetadata({ title, artist, artwork });
      } catch {
        try {
          const trackIndex = await TrackPlayer.getActiveTrackIndex();
          if (trackIndex !== null && trackIndex !== undefined) {
            await TrackPlayer.updateMetadataForTrack(trackIndex, { title, artist, artwork });
          }
        } catch (e2) {
          console.error('Failed to update track metadata:', e2);
        }
      }
    },
  };

  return nativePlayerModule;
}

export async function getAudioPlayer(): Promise<AudioPlayerAPI> {
  if (Platform.OS === 'web') {
    return WebAudioPlayer;
  }
  return getNativePlayer();
}
