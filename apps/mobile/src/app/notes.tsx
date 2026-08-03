import { searchNotes, type Note } from '@dailynote/core';
import { Link, Stack } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { relativeDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/**
 * The notes list, with search.
 *
 * Search is a JS filter over the in-memory array (plan section 0.2, option A).
 * The ranking lives in @dailynote/core so it is unit tested without a simulator.
 */
export default function NotesList() {
  const theme = useTheme();
  const { notes, loading } = useNotes();
  const [query, setQuery] = useState('');

  const results = useMemo(
    // Only root notes in the list; updates are shown inside their thread.
    () => searchNotes(notes.filter((note) => note.kind === 'note'), query),
    [notes, query],
  );

  return (
    <View className="flex-1 bg-paper dark:bg-paper-dark">
      <Stack.Screen options={{ title: 'Notes' }} />

      <View className="px-5 pb-3 pt-2">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.faint}
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={theme.accent}
          className="rounded-xl bg-line/40 px-4 py-2.5 text-base text-ink web:outline-none focus:bg-line/60 dark:bg-line-dark/50 dark:text-ink-dark dark:focus:bg-line-dark/70"
        />
      </View>

      <Animated.FlatList
        data={results}
        keyExtractor={(result) => result.note.id}
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-16"
        itemLayoutAnimation={motion.layout}
        ItemSeparatorComponent={() => (
          <View className="ml-5 h-px bg-line dark:bg-line-dark" />
        )}
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
              <Text className="font-serif-italic text-lg text-muted dark:text-muted-dark">
                {query.length > 0 ? 'Nothing matches.' : 'No notes yet.'}
              </Text>
              {query.length === 0 ? (
                <Text className="pt-2 text-center text-sm text-faint dark:text-faint-dark">
                  What you write stays on this device.
                </Text>
              ) : null}
            </Animated.View>
          )
        }
        renderItem={({ item }) => <NoteRow note={item.note} />}
      />
    </View>
  );
}

function NoteRow({ note }: { note: Note }) {
  const { softDelete } = useNotes();
  const swipeable = useRef<SwipeableMethods>(null);
  const preview = note.body.split('\n').slice(1).join(' ').trim();

  // Rows dip very slightly under the finger; the spring makes it feel like
  // paper giving, not a button.
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.02 * pressed.value }],
  }));

  return (
    <ReanimatedSwipeable
      ref={swipeable}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        // Muted, not red: deletion here is a soft delete, and alarm colours
        // would make tidying feel like danger.
        <Pressable
          onPress={() => {
            haptics.tap();
            swipeable.current?.close();
            void softDelete(note.id);
          }}
          className="w-24 items-center justify-center bg-line/60 active:opacity-60 dark:bg-line-dark/60"
        >
          <Text className="text-sm font-medium text-muted dark:text-muted-dark">Delete</Text>
        </Pressable>
      )}
    >
      <Link href={{ pathname: '/note/[id]', params: { id: note.id } }} asChild>
      <AnimatedPressable
        entering={motion.enterFade}
        exiting={motion.exit}
        onPressIn={() => {
          pressed.value = withSpring(1, motion.SPRING);
        }}
        onPressOut={() => {
          pressed.value = withSpring(0, motion.SPRING);
        }}
        style={pressStyle}
        className="px-5 py-3.5 active:bg-line/30 dark:active:bg-line-dark/30"
      >
        <View className="flex-row items-center gap-2">
          {note.nextReviewAt !== null ? (
            <View className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-accent-dark" />
          ) : null}
          <Text
            numberOfLines={1}
            className="flex-1 font-serif-medium text-[17px] text-ink dark:text-ink-dark"
          >
            {note.title ?? 'Untitled'}
          </Text>
          <Text className="text-xs text-faint dark:text-faint-dark">
            {relativeDay(note.createdAt)}
          </Text>
        </View>

        {preview.length > 0 ? (
          <Text numberOfLines={1} className="pt-1 text-sm text-muted dark:text-muted-dark">
            {preview}
          </Text>
        ) : null}
      </AnimatedPressable>
      </Link>
    </ReanimatedSwipeable>
  );
}
