import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { signOut as signOutOfProviders } from '@/lib/auth-providers';
import { isAuthConfigured, supabase, watchAppStateForRefresh } from '@/lib/supabase';

/**
 * Who is signed in, if anyone.
 *
 * "Nobody" is the normal state, not a loading gap. The notes half of the app
 * never reads this store: writing, editing, notebooks, the review loop and
 * Recently deleted all work with no account, forever. Only publishing asks.
 */

interface AuthContextValue {
  session: Session | null;
  /** The account id, which is also the profile's primary key once one exists. */
  userId: string | null;
  /** False until the stored session has been read back from disk. */
  ready: boolean;
  /** False in a build with no Supabase credentials compiled in. */
  configured: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isAuthConfigured);

  useEffect(() => {
    if (supabase === null) return;

    let active = true;

    // The stored session comes back from AsyncStorage asynchronously, so there
    // is a moment where a signed-in user looks signed out. `ready` covers it;
    // rendering a sign-in button during that moment would be a visible flicker
    // on every cold start.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });

    const stopRefreshing = watchAppStateForRefresh();

    return () => {
      active = false;
      data.subscription.unsubscribe();
      stopRefreshing();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      ready,
      configured: isAuthConfigured,
      async signOut() {
        await signOutOfProviders();
        setSession(null);
      },
    }),
    [session, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}
