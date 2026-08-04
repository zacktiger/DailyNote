import {
  Newsreader_400Regular,
  Newsreader_400Regular_Italic,
  Newsreader_500Medium,
  useFonts,
} from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrate } from '@/db/migrations';
import { AuthProvider } from '@/store/auth-store';
import { NotebooksProvider } from '@/store/notebooks-store';
import { NotesProvider } from '@/store/notes-store';
import { SocialProvider } from '@/store/social-store';
import { useTheme } from '@/theme';

import '../global.css';

export const DATABASE_NAME = 'dailynote.db';

// Hold the splash until the serif is ready: note titles are set in Newsreader
// and must not flash from the system font to it mid-boot.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useTheme();
  const [fontsReady, fontError] = useFonts({
    Newsreader_400Regular,
    Newsreader_400Regular_Italic,
    Newsreader_500Medium,
  });
  // A font failure falls back to system fonts rather than blocking launch.
  const ready = fontsReady || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    // tailwind.config.js uses darkMode 'class', which means the `dark:`
    // variants only activate for the scheme NativeWind has been told about.
    // This must run on native too, not just web: without it every `dark:`
    // class silently no-ops on device while useTheme() -- which reads
    // useColorScheme() directly -- goes dark anyway, so dark navigator chrome
    // ends up drawn behind light-styled content.
    nativewindColorScheme.set(theme.dark ? 'dark' : 'light');
    // Paints the window behind the React root, killing the white flash
    // between the splash screen tearing down and the first frame.
    void SystemUI.setBackgroundColorAsync(theme.canvas);
  }, [theme]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.canvas }}>
      <SafeAreaProvider>
        <Suspense fallback={<Booting />}>
          <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
            <NotebooksProvider>
              <NotesProvider>
                {/* Inside NotesProvider, not beside it: publishing is an
                    operation on a note, so the social store reads the notes
                    store rather than keeping a second copy of the same rows.
                    Auth wraps social because a profile is keyed to an account,
                    and nothing in the notes half reads either of them. */}
                <AuthProvider>
                  <SocialProvider>
                    <StatusBar style={theme.dark ? 'light' : 'dark'} />
                    <Stack
                      screenOptions={{
                        // Every screen draws its own header: the reference chrome
                        // is a plain icon row, not a navigator title bar.
                        headerShown: false,
                        contentStyle: { backgroundColor: theme.canvas },
                      }}
                    >
                      <Stack.Screen name="(tabs)" />
                      <Stack.Screen name="note/[id]" />
                      <Stack.Screen
                        name="notebooks"
                        options={{
                          presentation: 'modal',
                          animation: 'slide_from_bottom',
                        }}
                      />
                      <Stack.Screen name="trash" />
                      <Stack.Screen name="locked" />
                      <Stack.Screen name="post/[id]" />
                      <Stack.Screen
                        name="post/new"
                        options={{
                          presentation: 'modal',
                          animation: 'slide_from_bottom',
                        }}
                      />
                      <Stack.Screen name="profile/[handle]" />
                      <Stack.Screen
                        name="handle"
                        options={{
                          presentation: 'modal',
                          animation: 'slide_from_bottom',
                        }}
                      />
                      <Stack.Screen
                        name="sign-in"
                        options={{
                          presentation: 'modal',
                          animation: 'slide_from_bottom',
                        }}
                      />
                    </Stack>
                  </SocialProvider>
                </AuthProvider>
              </NotesProvider>
            </NotebooksProvider>
          </SQLiteProvider>
        </Suspense>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Booting() {
  const theme = useTheme();
  return (
    <View className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}
