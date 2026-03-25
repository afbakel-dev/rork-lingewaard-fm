const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * Expo config plugin that optimizes iOS audio session for AirPlay streaming.
 *
 * 1. Sets AVAudioSession route sharing policy to .longFormAudio
 * 2. Adds a native interruption observer that re-activates the audio session
 *    after screen lock / phone calls / other interruptions — this runs at the
 *    native level so it works even when the JS thread is suspended.
 */
function withAirPlayOptimize(config) {
  // Step 1: Ensure background audio mode in Info.plist
  config = withInfoPlist(config, (config) => {
    if (!config.modResults.UIBackgroundModes) {
      config.modResults.UIBackgroundModes = [];
    }
    if (!config.modResults.UIBackgroundModes.includes('audio')) {
      config.modResults.UIBackgroundModes.push('audio');
    }
    return config;
  });

  // Step 2: Modify AppDelegate with audio session setup + native interruption handler
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

    // Native audio session setup + interruption handler
    // This runs at the native Objective-C/Swift level, NOT in JS,
    // so it works even when the screen is locked and JS is suspended.
    const audioSessionCode = `
    // === AirPlay / Background Audio Optimization ===
    // Set longFormAudio policy for fast AirPlay routing to Sonos
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

    // Native interruption observer — keeps audio alive through screen lock
    // When iOS interrupts the audio (screen lock, phone call, Siri, etc.),
    // this handler re-activates the session so playback continues.
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { notification in
      guard let userInfo = notification.userInfo,
            let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
        return
      }
      if type == .ended {
        // Interruption ended (screen unlocked, call ended, etc.)
        // Re-activate the audio session so playback can continue
        do {
          try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
          print("Audio session re-activated after interruption")
        } catch {
          print("Failed to re-activate audio session: \\(error)")
        }
      }
    }

    // Also observe route changes (AirPlay device connect/disconnect)
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { notification in
      guard let userInfo = notification.userInfo,
            let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
        return
      }
      // Only re-activate when the previous device became unavailable
      // (e.g. AirPlay speaker lost). For normal route selections, iOS handles it.
      if reason == .oldDeviceUnavailable || reason == .wakeFromSleep {
        do {
          try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
          print("Audio session re-activated after route change: \\(reason.rawValue)")
        } catch {
          print("Failed to re-activate after route change: \\(error)")
        }
      }
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
