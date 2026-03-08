import { requireNativeViewManager, requireNativeModule } from 'expo-modules-core';
import React from 'react';
import { ViewProps, Platform } from 'react-native';

// Types
interface AirPlayRoutePickerViewProps extends ViewProps {
  tintColor?: string;
  activeTintColor?: string;
}

interface AirPlayRoutePickerModuleType {
  updateNowPlaying(title: string, artist: string, isLive: boolean): void;
  clearNowPlaying(): void;
  isExternalOutputActive(): boolean;
}

// Only load native components on iOS
const isIOS = Platform.OS === 'ios';

const NativeView = isIOS
  ? requireNativeViewManager('AirPlayRoutePicker')
  : null;

const NativeModule: AirPlayRoutePickerModuleType | null = isIOS
  ? requireNativeModule('AirPlayRoutePicker')
  : null;

/**
 * Native AirPlay route picker button.
 * Renders the iOS AVRoutePickerView which shows available AirPlay devices.
 * On non-iOS platforms, renders nothing.
 */
export function AirPlayButton(props: AirPlayRoutePickerViewProps) {
  if (!NativeView) return null;
  return React.createElement(NativeView, props);
}

/**
 * Update the Now Playing info shown in Control Center and on the Lock Screen.
 * This enables the AirPlay button in the Control Center media widget.
 */
export function updateNowPlaying(title: string, artist: string, isLive: boolean = true): void {
  NativeModule?.updateNowPlaying(title, artist, isLive);
}

/**
 * Clear the Now Playing info from Control Center.
 */
export function clearNowPlaying(): void {
  NativeModule?.clearNowPlaying();
}

/**
 * Check if audio is currently playing through an external output (AirPlay/Bluetooth).
 */
export function isExternalOutputActive(): boolean {
  return NativeModule?.isExternalOutputActive() ?? false;
}
