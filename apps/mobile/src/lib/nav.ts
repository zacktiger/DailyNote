import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/**
 * Back, with somewhere to land.
 *
 * `router.back()` is a no-op when there is no history, which is exactly the
 * case whenever a screen is entered directly rather than navigated to: a
 * deep link, a share intent, or a reloaded URL in the web build. The back
 * button would then do nothing at all, stranding the user on the screen.
 * Falling back to the list is what "back" means when there is no back.
 */
export function useGoBack(): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);
}
