import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { isAuthConfigured, supabase } from '@/lib/supabase';

/**
 * The three ways in, behind one shape.
 *
 * All three end at `signInWithIdToken` or `verifyOtp` and produce the same
 * `auth.users` row, so nothing downstream -- profiles, publishing, the feed --
 * ever asks how somebody signed in. That is the point of doing this in one
 * file: the rest of the app sees an account, not a provider.
 *
 * Why these three, in this order:
 *
 * - **Google** is the one people will actually use on Android.
 * - **Email code** is the escape hatch for anyone who does not want Google
 *   holding the relationship. Six digits, not a password: there is nothing to
 *   breach and no reset flow to build. Not a magic link either -- a link means
 *   mail app to browser to deep link back into the app, and that handoff breaks
 *   often enough to lose people.
 * - **Apple** is required by App Store guideline 4.8 the moment Google ships,
 *   because an email code cannot satisfy 4.8's "keep the email private" test.
 *   It is wired now so the iOS build needs no new code, and hidden on Android
 *   where nothing can have an Apple identity attached yet.
 */

export type AuthResult =
  | { ok: true }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

const CANCELLED: AuthResult = { ok: false, cancelled: true };

function failed(message: string): AuthResult {
  return { ok: false, cancelled: false, message };
}

const NOT_CONFIGURED = failed('Sign-in is not set up in this build.');

/**
 * The OAuth client that identifies this app to Google.
 *
 * It is the *web* client id even on Android, and that trips everyone up once:
 * the Android client is matched by package name and signing fingerprint in the
 * Google console and is never named here, while the web client is the audience
 * Supabase validates the id token against.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

export const canUseGoogle = GOOGLE_WEB_CLIENT_ID.length > 0 && isAuthConfigured;

/**
 * Apple is offered on iOS only.
 *
 * The flow works on Android through a web redirect, but until an iOS build
 * ships nobody can have an Apple identity to come back to, so the button would
 * be an empty room. When iOS lands this becomes a real availability check.
 */
export const canUseApple = Platform.OS === 'ios' && isAuthConfigured;

let googleConfigured = false;

/**
 * Loads the Google SDK on first use, never at import.
 *
 * The module calls `TurboModuleRegistry.getEnforcing` at its top level, which
 * throws the moment it is imported into a runtime without the native side --
 * Expo Go, most obviously. A static import here would put that throw in the
 * root layout's provider chain and take the whole app down on boot, including
 * the notes half, which has nothing to do with signing in.
 *
 * Deferring it means Expo Go runs everything except this one button.
 */
async function loadGoogle() {
  const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
  if (!googleConfigured) {
    GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    googleConfigured = true;
  }
  return GoogleSignin;
}

export async function signInWithGoogle(): Promise<AuthResult> {
  if (supabase === null || !canUseGoogle) return NOT_CONFIGURED;

  try {
    const GoogleSignin = await loadGoogle();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    const response = await GoogleSignin.signIn();
    if (response.type !== 'success') return CANCELLED;

    const idToken = response.data.idToken;
    if (idToken === null) {
      // Reachable when the console's web client id does not match the one
      // configured here -- Google returns a user but no token to verify.
      return failed('Google did not return a token. Check the web client id.');
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    return error === null ? { ok: true } : failed(error.message);
  } catch (error) {
    return failed(messageOf(error));
  }
}

export async function signInWithApple(): Promise<AuthResult> {
  if (supabase === null || !canUseApple) return NOT_CONFIGURED;

  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    if (credential.identityToken === null) return failed('Apple did not return a token.');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    return error === null ? { ok: true } : failed(error.message);
  } catch (error) {
    // The user tapping Cancel arrives here as a thrown error, not a value.
    if (isAppleCancellation(error)) return CANCELLED;
    return failed(messageOf(error));
  }
}

/** Sends the six-digit code. Creates the account if the address is new. */
export async function sendEmailCode(email: string): Promise<AuthResult> {
  if (supabase === null) return NOT_CONFIGURED;

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  return error === null ? { ok: true } : failed(error.message);
}

export async function verifyEmailCode(email: string, code: string): Promise<AuthResult> {
  if (supabase === null) return NOT_CONFIGURED;

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  });
  return error === null ? { ok: true } : failed(error.message);
}

export async function signOut(): Promise<void> {
  if (supabase === null) return;
  await supabase.auth.signOut();
  // Google keeps its own session. Leaving it signed in means the next tap
  // silently returns the same account with no chooser, which is not what
  // somebody who just signed out expects.
  //
  // Only if it was ever loaded: someone who signed in by email must not drag
  // the native module into the runtime on their way out.
  if (googleConfigured) {
    const GoogleSignin = await loadGoogle();
    await GoogleSignin.signOut().catch(() => null);
  }
}

function isAppleCancellation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ERR_REQUEST_CANCELED'
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** A plain check the sign-in screen uses to decide what to draw. */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
