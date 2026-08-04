import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

/**
 * The gate in front of locked notes.
 *
 * Locking is deliberately device-level rather than an in-app passcode: an app
 * that invents its own PIN has to store it, and storing it badly is worse than
 * not offering the feature. This delegates to whatever the phone already
 * trusts -- fingerprint, face, or the device passcode as a fallback.
 */
export interface LockResult {
  ok: boolean;
  /** Set when the device cannot authenticate at all, rather than refusing to. */
  unavailable?: boolean;
}

/** True when the device has a biometric or passcode enrolled to check against. */
export async function canLock(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return LocalAuthentication.isEnrolledAsync();
}

export async function authenticate(reason = 'Unlock your notes'): Promise<LockResult> {
  if (!(await canLock())) return { ok: false, unavailable: true };

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    // Without this the OS offers no way through for a user who has a passcode
    // but no working fingerprint reader.
    disableDeviceFallback: false,
    cancelLabel: 'Cancel',
  });

  return { ok: result.success };
}
