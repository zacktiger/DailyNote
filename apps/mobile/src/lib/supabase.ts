import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

/**
 * The Supabase client, or null when the app was built without credentials.
 *
 * Null is a supported state, not an error. Rollout 1 is a complete notes app
 * with no account and no network, so a build with no Supabase project must
 * still launch, still write notes, and still read the feed -- it simply cannot
 * sign anybody in. Every caller checks `isAuthConfigured` rather than assuming
 * a client exists.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isAuthConfigured = url.length > 0 && anonKey.length > 0;

export const supabase: SupabaseClient | null = isAuthConfigured
  ? createClient(url, anonKey, {
      auth: {
        // The session lives in AsyncStorage rather than SecureStore: a Supabase
        // session is a few kilobytes of JSON and Android's keystore-backed
        // store is documented as unreliable above 2KB per value. The refresh
        // token is the thing worth protecting, and the hardening move is a
        // short token lifetime on the server, not a store that truncates.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        // No URL to parse: OAuth is completed by a native SDK handing us an
        // id token, never by a redirect the app has to read.
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Refreshes the token only while the app is in front of the user.
 *
 * Without this the timer keeps firing in the background, which on Android
 * means refresh calls from a process that is about to be frozen -- they fail,
 * and the user comes back signed out.
 */
export function watchAppStateForRefresh(): () => void {
  if (supabase === null) return () => {};

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });

  if (AppState.currentState === 'active') void supabase.auth.startAutoRefresh();
  return () => subscription.remove();
}
