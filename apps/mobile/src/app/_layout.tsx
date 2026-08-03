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
import { colorScheme as nativewindColorScheme } from 'nativewind';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrate } from '@/db/migrations';
import { NotesProvider } from '@/store/notes-store';
import { useTheme } from '@/theme';

import '../global.css';

export const DATABASE_NAME = 'dailynote.db';

// Hold the splash until the serif is ready: the composer is the launch screen,
// and it must not flash from system font to Newsreader mid-boot.
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
    // Web only: with darkMode 'class' (see tailwind.config.js), dark: styles
    // activate via a class on <html>; keep it mirroring the OS setting.
    // Native must not take this path -- set() there overrides the app-level
    // appearance instead of following the system.
    if (Platform.OS === 'web') {
      nativewindColorScheme.set(theme.dark ? 'dark' : 'light');
    }
  }, [theme.dark]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <Suspense fallback={<Booting />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
          <NotesProvider>
            <StatusBar style={theme.dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerStyle: { backgroundColor: theme.paper },
                headerTintColor: theme.ink,
                headerTitleStyle: { fontFamily: 'Newsreader_500Medium', fontSize: 19 },
                headerBackButtonDisplayMode: 'minimal',
                contentStyle: { backgroundColor: theme.paper },
              }}
            >
              {/* The composer is the launch screen: the app opens with the
                  cursor already in an empty note. */}
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="notes" options={{ title: 'Notes' }} />
              <Stack.Screen name="note/[id]" options={{ title: '' }} />
            </Stack>
          </NotesProvider>
        </SQLiteProvider>
      </Suspense>
    </SafeAreaProvider>
  );
}

function Booting() {
  const theme = useTheme();
  return (
    <View className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
      <ActivityIndicator color={theme.muted} />
    </View>
  );
}
