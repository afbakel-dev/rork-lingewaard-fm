import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Linking,
  ActivityIndicator,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Play, Pause, MessageCircle, Volume2, VolumeX, Radio, Airplay } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { getAudioPlayer, type AudioPlayerAPI } from '@/utils/audioPlayer';

const STREAM_URL: string = 'https://totaal-streaming.de:8110/radio.mp3';
const NOW_PLAYING_URL: string = 'https://totaal-streaming.de:8110/status-json.xsl';
const WHATSAPP_NUMBER: string = '+31644801621';
const LOGO_ARTWORK = require('@/assets/images/lingewaard-fm-logo.jpg');
const NOW_PLAYING_PLACEHOLDER: string = 'Klik op play om te luisteren';

type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface IcecastSource {
  title?: string;
  yp_currently_playing?: string;
}

interface IcecastResponse {
  icestats?: {
    source?: IcecastSource | IcecastSource[];
  };
}

export default function RadioPlayer() {
  const insets = useSafeAreaInsets();
  const [playerState, setPlayerState] = useState<PlayerState>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [nowPlaying, setNowPlaying] = useState<string>(NOW_PLAYING_PLACEHOLDER);
  const [isNowPlayingLoading, setIsNowPlayingLoading] = useState<boolean>(false);
  const previousVolumeRef = useRef<number>(1.0);
  const audioPlayerRef = useRef<AudioPlayerAPI | null>(null);

  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const liveOpacity = useRef(new Animated.Value(1)).current;
  const waveAnim1 = useRef(new Animated.Value(0.3)).current;
  const waveAnim2 = useRef(new Animated.Value(0.5)).current;
  const waveAnim3 = useRef(new Animated.Value(0.7)).current;
  const waveAnim4 = useRef(new Animated.Value(0.4)).current;
  const waveAnim5 = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    void getAudioPlayer().then((player) => {
      audioPlayerRef.current = player;
      void player.setup();
      console.log('Audio player initialized');
    });
  }, []);

  useEffect(() => {
    const liveBlink = Animated.loop(
      Animated.sequence([
        Animated.timing(liveOpacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(liveOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    liveBlink.start();
    return () => liveBlink.stop();
  }, [liveOpacity]);

  useEffect(() => {
    if (playerState === 'playing') {
      const createWaveAnimation = (anim: Animated.Value, minVal: number, maxVal: number, duration: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, { toValue: maxVal, duration, useNativeDriver: false }),
            Animated.timing(anim, { toValue: minVal, duration, useNativeDriver: false }),
          ])
        );

      const animations = [
        createWaveAnimation(waveAnim1, 0.2, 0.9, 400),
        createWaveAnimation(waveAnim2, 0.3, 1.0, 350),
        createWaveAnimation(waveAnim3, 0.1, 0.8, 500),
        createWaveAnimation(waveAnim4, 0.4, 0.95, 300),
        createWaveAnimation(waveAnim5, 0.2, 0.85, 450),
      ];

      animations.forEach(a => a.start());

      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.8, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 1500, useNativeDriver: true }),
        ])
      );
      glow.start();

      return () => {
        animations.forEach(a => a.stop());
        glow.stop();
      };
    } else {
      waveAnim1.setValue(0.3);
      waveAnim2.setValue(0.5);
      waveAnim3.setValue(0.7);
      waveAnim4.setValue(0.4);
      waveAnim5.setValue(0.6);
      glowAnim.setValue(0.3);
    }
  }, [playerState, waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5, glowAnim]);

  const fetchNowPlaying = useCallback(async () => {
    try {
      console.log('Fetching now playing metadata from:', NOW_PLAYING_URL);
      setIsNowPlayingLoading(true);
      const response = await fetch(NOW_PLAYING_URL);

      if (!response.ok) {
        throw new Error(`Now playing request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as IcecastResponse;
      const source = Array.isArray(payload.icestats?.source)
        ? payload.icestats?.source?.[0]
        : payload.icestats?.source;

      const nextTitle = source?.title?.trim() || source?.yp_currently_playing?.trim() || NOW_PLAYING_PLACEHOLDER;
      console.log('Now playing metadata received:', nextTitle);
      setNowPlaying(nextTitle);

      if (audioPlayerRef.current) {
        const artworkUri = Platform.OS !== 'web' ? Image.resolveAssetSource(LOGO_ARTWORK).uri : undefined;
        await audioPlayerRef.current.updateMetadata(nextTitle, 'Lingewaard FM', artworkUri);
      }
    } catch (error) {
      console.error('Failed to fetch now playing metadata:', error);
      setNowPlaying(NOW_PLAYING_PLACEHOLDER);
    } finally {
      setIsNowPlayingLoading(false);
    }
  }, []);

  const startStream = useCallback(async () => {
    try {
      console.log('Starting stream...');
      setPlayerState('loading');
      setErrorMessage('');

      const player = audioPlayerRef.current;
      if (!player) {
        const p = await getAudioPlayer();
        audioPlayerRef.current = p;
        await p.setup();
      }

      const artworkUri = Platform.OS !== 'web' ? Image.resolveAssetSource(LOGO_ARTWORK).uri : undefined;
      await audioPlayerRef.current!.play(STREAM_URL, 'Live uitzending', 'Lingewaard FM', artworkUri);
      setPlayerState('playing');
      console.log('Stream started successfully');
    } catch (error) {
      console.error('Failed to start stream:', error);
      setPlayerState('error');
      setErrorMessage('Kan stream niet laden');
    }
  }, []);

  const pauseStream = useCallback(async () => {
    try {
      console.log('Pausing stream...');
      await audioPlayerRef.current?.pause();
    } catch (error) {
      console.error('Failed to pause stream:', error);
    } finally {
      setPlayerState('idle');
      setNowPlaying(NOW_PLAYING_PLACEHOLDER);
    }
  }, []);

  const togglePlay = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.sequence([
      Animated.timing(buttonScale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.timing(buttonScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    if (playerState === 'playing') {
      void pauseStream();
    } else if (playerState !== 'loading') {
      void startStream();
    }
  }, [playerState, startStream, pauseStream, buttonScale]);

  const toggleMute = useCallback(async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      const player = audioPlayerRef.current;
      if (!player) return;

      if (newMuted) {
        const currentVolume = await player.getVolume();
        previousVolumeRef.current = currentVolume;
        await player.setVolume(0);
      } else {
        await player.setVolume(previousVolumeRef.current || 1.0);
      }
      console.log('Mute toggled:', newMuted);
    } catch (error) {
      console.error('Failed to toggle mute:', error);
    }
  }, [isMuted]);

  const openWhatsApp = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const message = encodeURIComponent('Hallo Lingewaard FM! ');
    const url = WHATSAPP_NUMBER
      ? `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`
      : `https://wa.me/?text=${message}`;
    Linking.openURL(url).catch((err) => {
      console.error('Could not open WhatsApp:', err);
    });
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (playerState === 'playing') {
      void fetchNowPlaying();
      intervalId = setInterval(() => {
        void fetchNowPlaying();
      }, 15000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [fetchNowPlaying, playerState]);

  const waveAnims = [waveAnim1, waveAnim2, waveAnim3, waveAnim4, waveAnim5];

  const renderEqualizer = () => (
    <View style={styles.equalizerContainer}>
      {waveAnims.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.equalizerBar,
            {
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 32],
              }),
              backgroundColor: index % 2 === 0 ? Colors.gradientStart : Colors.gradientEnd,
            },
          ]}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#0F0F18', '#0A0A0F', '#0D0D15']}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.backgroundOrb, styles.orb1]} />
      <View style={[styles.backgroundOrb, styles.orb2]} />

      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Animated.View style={[styles.liveBadge, { opacity: liveOpacity }]}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </Animated.View>

          {playerState === 'playing' && Platform.OS === 'ios' && (
            <TouchableOpacity
              style={styles.airplayHint}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Alert.alert(
                  'AirPlay',
                  'Om via AirPlay te luisteren:\n\n1. Open het Bedieningspaneel\n   (veeg van rechtsboven naar beneden)\n2. Houd het muziekblok ingedrukt\n3. Tik op het AirPlay icoon\n4. Kies je AirPlay speaker\n\nLingewaard FM is nu zichtbaar in het Bedieningspaneel.',
                  [{ text: 'Begrepen', style: 'default' }]
                );
              }}
              activeOpacity={0.7}
              testID="airplay-button"
            >
              <Airplay color={Colors.textMuted} size={16} />
              <Text style={styles.airplayText}>AirPlay</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.centerContent}>
          <Animated.View style={[styles.logoGlow, { opacity: glowAnim }]} />

          <View style={styles.logoContainer}>
            <Image
              source={require('@/assets/images/lingewaard-fm-logo-transparent.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          <View style={styles.divider} />

          <Text style={styles.tagline}>Non-stop & Live Radio</Text>

          {playerState === 'playing' && renderEqualizer()}
          {playerState === 'loading' && (
            <View style={styles.equalizerContainer}>
              <ActivityIndicator size="small" color={Colors.accent} />
            </View>
          )}
          {(playerState === 'idle' || playerState === 'error') && (
            <View style={styles.equalizerPlaceholder} />
          )}
        </View>

        <View style={styles.controls}>
          {playerState === 'playing' && (
            <TouchableOpacity
              style={styles.muteButton}
              onPress={toggleMute}
              activeOpacity={0.7}
              testID="mute-button"
            >
              {isMuted ? (
                <VolumeX color={Colors.textSecondary} size={22} />
              ) : (
                <Volume2 color={Colors.textSecondary} size={22} />
              )}
            </TouchableOpacity>
          )}

          <Animated.View style={[styles.playButtonOuter, { transform: [{ scale: buttonScale }] }]}>
            <TouchableOpacity
              onPress={togglePlay}
              activeOpacity={0.8}
              testID="play-button"
              disabled={playerState === 'loading'}
            >
              <LinearGradient
                colors={[Colors.gradientStart, Colors.gradientMid, Colors.gradientEnd]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.playButton}
              >
                {playerState === 'loading' ? (
                  <ActivityIndicator size="large" color="#FFFFFF" />
                ) : playerState === 'playing' ? (
                  <Pause color="#FFFFFF" size={36} fill="#FFFFFF" />
                ) : (
                  <Play color="#FFFFFF" size={36} fill="#FFFFFF" style={{ marginLeft: 4 }} />
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {playerState === 'playing' && <View style={styles.muteButtonPlaceholder} />}

          {errorMessage ? (
            <Text style={styles.errorText}>{errorMessage}</Text>
          ) : null}
        </View>

        <View style={styles.nowPlayingCard} testID="now-playing-bar">
          <View style={styles.nowPlayingIconWrap}>
            <Radio color={Colors.accent} size={18} />
          </View>
          <View style={styles.nowPlayingContent}>
            <Text style={styles.nowPlayingLabel}>Nu op Lingewaard FM:</Text>
            <Text style={styles.nowPlayingTitle} numberOfLines={2}>
              {isNowPlayingLoading && nowPlaying === NOW_PLAYING_PLACEHOLDER ? 'Bezig met laden...' : nowPlaying}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.whatsappButton}
          onPress={openWhatsApp}
          activeOpacity={0.8}
          testID="whatsapp-button"
        >
          <MessageCircle color="#FFFFFF" size={20} fill="#FFFFFF" />
          <Text style={styles.whatsappText}>Stuur een bericht via WhatsApp</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Lingewaard FM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  backgroundOrb: {
    position: 'absolute' as const,
    borderRadius: 999,
  },
  orb1: {
    width: 300,
    height: 300,
    top: -80,
    right: -100,
    backgroundColor: 'rgba(155, 89, 182, 0.06)',
  },
  orb2: {
    width: 250,
    height: 250,
    bottom: 100,
    left: -80,
    backgroundColor: 'rgba(46, 196, 182, 0.05)',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 20,
  },
  liveBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.liveGlow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.live,
  },
  liveText: {
    color: Colors.live,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 1.5,
  },
  airplayHint: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 5,
  },
  airplayText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '500' as const,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  logoGlow: {
    position: 'absolute' as const,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(91, 141, 239, 0.12)',
  },
  logoContainer: {
    marginBottom: 28,
  },
  logoImage: {
    width: 220,
    height: 140,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: Colors.surfaceBorder,
    marginVertical: 20,
    borderRadius: 1,
  },
  tagline: {
    color: Colors.textMuted,
    fontSize: 14,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
  equalizerContainer: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    height: 40,
    marginTop: 24,
  },
  equalizerBar: {
    width: 4,
    borderRadius: 2,
  },
  equalizerPlaceholder: {
    height: 40,
    marginTop: 24,
  },
  controls: {
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    marginBottom: 32,
    gap: 24,
  },
  muteButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceLight,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  muteButtonPlaceholder: {
    width: 48,
    height: 48,
  },
  playButtonOuter: {
    borderRadius: 46,
  },
  playButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  errorText: {
    color: Colors.live,
    fontSize: 13,
    fontWeight: '500' as const,
    position: 'absolute' as const,
    bottom: -28,
    textAlign: 'center' as const,
    width: '100%' as const,
  },
  nowPlayingCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: 'rgba(19, 19, 26, 0.92)',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    gap: 12,
  },
  nowPlayingIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accentGlow,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  nowPlayingContent: {
    flex: 1,
  },
  nowPlayingLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  },
  nowPlayingTitle: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  whatsappButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: Colors.whatsapp,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
    marginBottom: 20,
  },
  whatsappText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  footer: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center' as const,
    fontWeight: '400' as const,
    letterSpacing: 0.5,
  },
});
