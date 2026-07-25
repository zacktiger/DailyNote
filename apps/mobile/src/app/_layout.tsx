import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { migrate } from '@/db/migrations';
import { NotesProvider } from '@/store/notes-store';

import '../global.css';

export const DATABASE_NAME = 'dailynote.db';

export default function RootLayout() {
  const dark = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <Suspense fallback={<Booting dark={dark} />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
          <NotesProvider>
            <StatusBar style={dark ? 'light' : 'dark'} />
            <Stack
              screenOptions={{
                headerShadowVisible: false,
                headerStyle: { backgroundColor: dark ? '#0b0b0f' : '#ffffff' },
                headerTintColor: dark ? '#f4f4f5' : '#16161a',
                contentStyle: { backgroundColor: dark ? '#0b0b0f' : '#ffffff' },
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

function Booting({ dark }: { dark: boolean }) {
  return (
    <View className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
      <ActivityIndicator color={dark ? '#f4f4f5' : '#16161a'} />
    </View>
  );
}
