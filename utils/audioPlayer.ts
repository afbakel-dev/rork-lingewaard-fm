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
  const { Capability, AppKilledPlaybackBehavior, IOSCategoryOptions } = await import('react-native-track-player');
  const { Audio, InterruptionModeIOS } = await import('expo-av');

  let isSetup = false;

  nativePlayerModule = {
    setup: async () => {
      if (isSetup) return;
      try {
        // CRITICAL: Tell iOS this app needs background audio
        // This configures AVAudioSession at the Expo framework level
        await Audio.setAudioModeAsync({
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        });

        await TrackPlayer.setupPlayer({
          maxBuffer: 10,         // 10s buffer — enough to survive network hiccups
          minBuffer: 3,          // Rebuffer when below 3s
          playBuffer: 1,         // Start playing after just 1s buffered
          backBuffer: 0,         // No back buffer for live streams
          waitForBuffer: false,  // Don't wait — start playback immediately
          autoHandleInterruptions: true,
          iosCategoryOptions: [IOSCategoryOptions.AllowAirPlay, IOSCategoryOptions.AllowBluetooth, IOSCategoryOptions.AllowBluetoothA2DP],
        });
        await TrackPlayer.updateOptions({
          capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
          compactCapabilities: [Capability.Play, Capability.Pause],
          android: {
            appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
          },
        });
        isSetup = true;
        console.log('TrackPlayer setup complete — minimal buffer, AirPlay optimized');
      } catch (error) {
        console.error('TrackPlayer setup failed:', error);
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
      console.log('TrackPlayer playing');
    },
    pause: async () => {
      await TrackPlayer.pause();
      console.log('TrackPlayer paused');
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
