import type { Note } from '@dailynote/core';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { shortDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/**
 * Recently deleted.
 *
 * Deletion everywhere else in the app is soft, so this is the only screen that
 * can destroy anything -- and it always asks first.
 */
export default function Trash() {
  const theme = useTheme();
  const router = useRouter();
  const { notes, restore, purge, purgeAll } = useNotes();

  const deleted = useMemo(
    () =>
      notes
        .filter((note) => note.deleted && note.kind === 'note')
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  const confirmEmpty = () => {
    Alert.alert(
      'Delete everything here?',
      `${deleted.length === 1 ? 'This note' : `These ${deleted.length} notes`} cannot be recovered.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptics.tap();
            void purgeAll();
          },
        },
      ],
    );
  };

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
        <Text className="text-[19px] font-semibold text-ink dark:text-ink-dark">
          Recently deleted
        </Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Empty"
          disabled={deleted.length === 0}
          onPress={confirmEmpty}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="trash" size={20} color={deleted.length === 0 ? theme.faint : theme.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-10">
        {deleted.length === 0 ? (
          <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
            <Text className="text-[17px] text-muted dark:text-muted-dark">Nothing here.</Text>
            <Text className="pt-2 text-center text-[15px] text-faint dark:text-faint-dark">
              Deleted notes wait here until you empty this list.
            </Text>
          </Animated.View>
        ) : (
          <View className="mx-4 overflow-hidden rounded-2xl bg-card dark:bg-card-dark">
            {deleted.map((note, index) => (
              <TrashRow
                key={note.id}
                note={note}
                first={index === 0}
                onRestore={() => {
                  haptics.tap();
                  void restore(note.id);
                }}
                onPurge={() => {
                  haptics.tap();
                  void purge(note.id);
                }}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrashRow({
  note,
  first,
  onRestore,
  onPurge,
}: {
  note: Note;
  first: boolean;
  onRestore: () => void;
  onPurge: () => void;
}) {
  const theme = useTheme();

  return (
    <View>
      {!first ? <View className="mx-4 h-px bg-line dark:bg-line-dark" /> : null}
      <View className="flex-row items-center gap-3 px-4 py-3.5">
        <View className="flex-1">
          <Text numberOfLines={1} className="text-[17px] text-ink dark:text-ink-dark">
            {note.title ?? 'Untitled'}
          </Text>
          <Text className="pt-0.5 text-[13px] text-faint dark:text-faint-dark">
            Deleted {shortDate(note.updatedAt)}
          </Text>
        </View>

        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Restore ${note.title ?? 'note'}`}
          onPress={onRestore}
          className="rounded-full bg-elevated px-3 py-1.5 active:opacity-60 dark:bg-elevated-dark"
        >
          <Text className="text-[13px] font-medium text-ink dark:text-ink-dark">Restore</Text>
        </Pressable>

        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${note.title ?? 'note'} for good`}
          onPress={onPurge}
          className="active:opacity-60"
        >
          <Icon name="trash" size={18} color={theme.muted} />
        </Pressable>
      </View>
    </View>
  );
}
