import { Platform } from 'react-native';

export interface AudioPlayerAPI {
  setup: () => Promise<void>;
  play: (url: string, title: string, artist: string) => Promise<void>;
  stop: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  getVolume: () => Promise<number>;
  updateMetadata: (title: string, artist: string) => Promise<void>;
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
  updateMetadata: async (_title: string, _artist: string) => {
    // No-op on web
  },
};

let nativePlayerModule: AudioPlayerAPI | null = null;

async function getNativePlayer(): Promise<AudioPlayerAPI> {
  if (nativePlayerModule) return nativePlayerModule;

  const TrackPlayer = (await import('react-native-track-player')).default;
  const { Capability, AppKilledPlaybackBehavior } = await import('react-native-track-player');

  let isSetup = false;

  nativePlayerModule = {
    setup: async () => {
      if (isSetup) return;
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
        });
        isSetup = true;
        console.log('TrackPlayer setup complete');
      } catch (error) {
        console.error('TrackPlayer setup failed:', error);
      }
    },
    play: async (url: string, title: string, artist: string) => {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        url,
        title,
        artist,
        isLiveStream: true,
      });
      await TrackPlayer.play();
      console.log('TrackPlayer playing');
    },
    stop: async () => {
      await TrackPlayer.reset();
      console.log('TrackPlayer stopped');
    },
    setVolume: async (volume: number) => {
      await TrackPlayer.setVolume(volume);
    },
    getVolume: async () => {
      return TrackPlayer.getVolume();
    },
    updateMetadata: async (title: string, artist: string) => {
      try {
        await (TrackPlayer as any).updateNowPlayingMetadata({ title, artist });
      } catch {
        try {
          const trackIndex = await TrackPlayer.getActiveTrackIndex();
          if (trackIndex !== null && trackIndex !== undefined) {
            await TrackPlayer.updateMetadataForTrack(trackIndex, { title, artist });
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
