import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { shortDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { authenticate } from '@/lib/lock';
import * as motion from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

type Gate = 'checking' | 'locked' | 'open' | 'unavailable';

/**
 * Locked notes, behind the device lock.
 *
 * The gate is re-armed every time the screen mounts: leaving and coming back
 * asks again, which is the whole point of locking a note in the first place.
 */
export default function Locked() {
  const theme = useTheme();
  const router = useRouter();
  const { notes, setLocked } = useNotes();
  const [gate, setGate] = useState<Gate>('checking');
  // Bumped by the Unlock button to re-run the prompt after a refusal.
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setGate('checking');
    setAttempt((count) => count + 1);
  }, []);

  useEffect(() => {
    // The OS prompt is the external system here; the state lands in its
    // callback rather than in the effect body.
    let active = true;
    void authenticate('Unlock your notes').then((result) => {
      if (!active) return;
      setGate(result.unavailable === true ? 'unavailable' : result.ok ? 'open' : 'locked');
    });
    return () => {
      active = false;
    };
  }, [attempt]);

  const locked = useMemo(
    () => notes.filter((note) => note.locked && !note.deleted && note.kind === 'note'),
    [notes],
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => router.back()}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="back" size={24} color={theme.ink} />
        </Pressable>
        <Text className="text-[19px] font-semibold text-ink dark:text-ink-dark">Locked notes</Text>
        <View className="h-11 w-11" />
      </View>

      {gate === 'open' ? (
        <ScrollView contentContainerClassName="pb-10">
          {locked.length === 0 ? (
            <Message
              title="No locked notes."
              detail="Lock a note from its ⋮ menu to keep it here."
            />
          ) : (
            <View className="mx-4 overflow-hidden rounded-2xl bg-card dark:bg-card-dark">
              {locked.map((note, index) => (
                <View key={note.id}>
                  {index > 0 ? <View className="mx-4 h-px bg-line dark:bg-line-dark" /> : null}
                  <View className="flex-row items-center gap-3 px-4 py-3.5">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({ pathname: '/note/[id]', params: { id: note.id } })
                      }
                      className="flex-1 active:opacity-60"
                    >
                      <Text numberOfLines={1} className="text-[17px] text-ink dark:text-ink-dark">
                        {note.title ?? 'Untitled'}
                      </Text>
                      <Text className="pt-0.5 text-[13px] text-faint dark:text-faint-dark">
                        {shortDate(note.createdAt)}
                      </Text>
                    </Pressable>

                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Unlock ${note.title ?? 'note'}`}
                      onPress={() => {
                        haptics.tap();
                        void setLocked(note.id, false);
                      }}
                      className="rounded-full bg-elevated px-3 py-1.5 active:opacity-60 dark:bg-elevated-dark"
                    >
                      <Text className="text-[13px] font-medium text-ink dark:text-ink-dark">
                        Unlock
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      ) : gate === 'unavailable' ? (
        <Message
          title="This device has no lock set up."
          detail="Add a fingerprint, face unlock or screen lock in system settings to use locked notes."
        />
      ) : gate === 'locked' ? (
        <View className="items-center px-10 pt-24">
          <Icon name="lock" size={32} color={theme.muted} />
          <Text className="pt-4 text-[17px] text-muted dark:text-muted-dark">
            These notes are locked.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            className="mt-5 rounded-full bg-accent px-6 py-2.5 active:opacity-60 dark:bg-accent-dark"
          >
            <Text className="text-[15px] font-semibold" style={{ color: theme.accentInk }}>
              Unlock
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Message({ title, detail }: { title: string; detail: string }) {
  return (
    <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
      <Text className="text-center text-[17px] text-muted dark:text-muted-dark">{title}</Text>
      <Text className="pt-2 text-center text-[15px] text-faint dark:text-faint-dark">{detail}</Text>
    </Animated.View>
  );
}
