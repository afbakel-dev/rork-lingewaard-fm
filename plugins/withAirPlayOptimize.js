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
      // Ensure audio session stays active after route changes
      do {
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        print("Failed to re-activate after route change: \\(error)")
      }
    }

    // CRITICAL: media services reset (happens during long screen lock or system audio glitches).
    // When this fires, the audio session is dead — without re-activation iOS will
    // terminate the backgrounded app within minutes.
    NotificationCenter.default.addObserver(
      forName: AVAudioSession.mediaServicesWereResetNotification,
      object: nil,
      queue: .main
    ) { _ in
      print("AVAudioSession media services were reset — re-configuring")
      do {
        try AVAudioSession.sharedInstance().setCategory(
          .playback,
          mode: .default,
          policy: .longFormAudio,
          options: [.allowAirPlay, .allowBluetooth, .allowBluetoothA2DP]
        )
        try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        print("Failed to recover after media services reset: \\(error)")
      }
    }

    // Activate audio session immediately at launch so iOS counts us as a long-form
    // audio app from second one — this earns the full background grace window.
    do {
      try AVAudioSession.sharedInstance().setActive(true, options: .notifyOthersOnDeactivation)
      print("Audio session activated at launch")
    } catch {
      print("Initial audio session activation failed: \\(error)")
    }

    // Native keep-alive timer: every 25s re-assert that the session is active.
    // Runs natively and survives JS suspension, preventing iOS from reclaiming
    // our background audio slot during long screen-lock sessions.
    let keepAliveTimer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
    keepAliveTimer.schedule(deadline: .now() + 25.0, repeating: 25.0)
    keepAliveTimer.setEventHandler {
      let session = AVAudioSession.sharedInstance()
      if session.category != .playback {
        do {
          try session.setCategory(
            .playback,
            mode: .default,
            policy: .longFormAudio,
            options: [.allowAirPlay, .allowBluetooth, .allowBluetoothA2DP]
          )
        } catch {
          print("Keep-alive setCategory failed: \\(error)")
        }
      }
      do {
        try session.setActive(true, options: .notifyOthersOnDeactivation)
      } catch {
        // ignore — already active
      }
    }
    keepAliveTimer.resume()
    objc_setAssociatedObject(self, "AirPlayKeepAliveTimer", keepAliveTimer, .OBJC_ASSOCIATION_RETAIN)
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
