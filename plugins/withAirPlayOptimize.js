const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * Expo config plugin that optimizes iOS audio session for AirPlay streaming.
 *
 * Sets AVAudioSession route sharing policy to .longFormAudio, which tells iOS
 * this app streams long-form content (like radio). This significantly reduces
 * AirPlay startup latency to devices like Sonos speakers.
 */
function withAirPlayOptimize(config) {
  // Step 1: Add AVRoutePickerView usage description to Info.plist (optional but good practice)
  config = withInfoPlist(config, (config) => {
    // Ensure background audio mode is set
    if (!config.modResults.UIBackgroundModes) {
      config.modResults.UIBackgroundModes = [];
    }
    if (!config.modResults.UIBackgroundModes.includes('audio')) {
      config.modResults.UIBackgroundModes.push('audio');
    }
    return config;
  });

  // Step 2: Modify AppDelegate to configure audio session with longFormAudio policy
  config = withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;

    // Check if already modified
    if (contents.includes('longFormAudio')) {
      return config;
    }

    // Add AVFoundation import
    if (contents.includes('import UIKit') && !contents.includes('import AVFoundation')) {
      config.modResults.contents = config.modResults.contents.replace(
        'import UIKit',
        'import UIKit\nimport AVFoundation'
      );
    }

    // Add audio session configuration in didFinishLaunchingWithOptions
    // Only set category + policy here. Do NOT call setActive(true) — that would
    // immediately route to the last AirPlay device (Sonos) before the user presses play.
    // The player will activate the session when playback starts.
    const audioSessionCode = `
    // AirPlay optimization: set longFormAudio policy for fast Sonos/AirPlay startup
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .default,
        policy: .longFormAudio,
        options: [.allowAirPlay, .allowBluetooth, .allowBluetoothA2DP]
      )
    } catch {
      print("AirPlay audio session setup failed: \\(error)")
    }
`;

    // Insert before the return in didFinishLaunchingWithOptions
    config.modResults.contents = config.modResults.contents.replace(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
      `${audioSessionCode}    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`
    );

    return config;
  });

  return config;
}

module.exports = withAirPlayOptimize;
