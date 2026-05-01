const { withInfoPlist } = require('@expo/config-plugins');

/**
 * Expo config plugin for iOS background audio.
 *
 * IMPORTANT: We deliberately do NOT touch AVAudioSession from native code.
 * react-native-track-player owns the audio session lifecycle end-to-end.
 *
 * Earlier versions of this plugin called
 *   AVAudioSession.setCategory(.playback, mode: .default,
 *     policy: .longFormAudio,
 *     options: [.allowAirPlay, .allowBluetoothA2DP])
 * inside AppDelegate. That call throws on iOS because `.allowAirPlay`
 * is not a valid option when policy is `.longFormAudio` (AirPlay 2 is
 * implicit). The throw was caught, but the session was left in an
 * inconsistent state. When the user locked the screen, iOS could not
 * verify that the audio session was actually producing output and
 * terminated the app process exactly ~50 seconds later — which is the
 * exact symptom we were seeing.
 *
 * This plugin now ONLY ensures Info.plist declares background audio.
 * RNTP configures the category (.playback) on setupPlayer().
 */
function withAirPlayOptimize(config) {
  config = withInfoPlist(config, (config) => {
    if (!config.modResults.UIBackgroundModes) {
      config.modResults.UIBackgroundModes = [];
    }
    if (!config.modResults.UIBackgroundModes.includes('audio')) {
      config.modResults.UIBackgroundModes.push('audio');
    }
    return config;
  });

  return config;
}

module.exports = withAirPlayOptimize;
