const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * Expo config plugin for iOS background audio + AirPlay.
 *
 * IMPORTANT: We deliberately do NOT activate the audio session, run keep-alive
 * timers, or re-activate on every route change. react-native-track-player owns
 * the session lifecycle. Fighting it from native code (with invalid setActive
 * options) was causing iOS to silently deactivate the session and terminate
 * the app ~50s after screen lock.
 *
 * What this plugin does:
 *   1. Adds UIBackgroundModes = ["audio"] to Info.plist
 *   2. Sets the AVAudioSession route sharing policy to .longFormAudio so
 *      AirPlay 2 sees us as a long-form audio app. This is configured ONCE
 *      at launch and does NOT activate the session.
 *   3. Adds a minimal interruption observer that re-asserts the route sharing
 *      policy after media services reset (rare but fatal if unhandled).
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

  config = withAppDelegate(config, (config) => {
    const contents = config.modResults.contents;

    if (contents.includes('longFormAudio')) {
      return config;
    }

    if (contents.includes('import UIKit') && !contents.includes('import AVFoundation')) {
      config.modResults.contents = config.modResults.contents.replace(
        'import UIKit',
        'import UIKit\nimport AVFoundation'
      );
    }

    const audioSessionCode = `
    // === AirPlay long-form audio policy (no activation) ===
    // Configure the category + longFormAudio policy so AirPlay 2 routes us
    // correctly. Do NOT call setActive here — react-native-track-player will
    // activate the session when the user taps play.
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,
        mode: .default,
        policy: .longFormAudio,
        options: [.allowAirPlay, .allowBluetoothA2DP]
      )
    } catch {
      print("AirPlay audio session category setup failed: \\(error)")
    }

    // Re-apply category after iOS media services reset (rare hardware glitch).
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification,
      object: nil,
      queue: .main
    ) { _ in
      print("AVAudioSession media services were reset — re-applying category")
      do {
        try AVAudioSession.sharedInstance().setCategory(
          .playback,
          mode: .default,
          policy: .longFormAudio,
          options: [.allowAirPlay, .allowBluetoothA2DP]
        )
      } catch {
        print("Failed to re-apply category after media services reset: \\(error)")
      }
    }
`;

    config.modResults.contents = config.modResults.contents.replace(
      'return super.application(application, didFinishLaunchingWithOptions: launchOptions)',
      `${audioSessionCode}    return super.application(application, didFinishLaunchingWithOptions: launchOptions)`
    );

    return config;
  });

  return config;
}

module.exports = withAirPlayOptimize;
