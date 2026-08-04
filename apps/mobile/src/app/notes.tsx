import { searchNotes, type Note } from '@dailynote/core';
import { Link, Stack, useRouter } from 'expo-router';
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
 * The notes list: a shelf of cards on a deeper background, with a large
 * title and a floating "+" back to the composer. The composer stays the
 * launch screen -- this is the library, not the front door.
 *
 * Search is a JS filter over the in-memory array (plan section 0.2, option A).
 * The ranking lives in @dailynote/core so it is unit tested without a simulator.
 */
export default function NotesList() {
  const theme = useTheme();
  const router = useRouter();
  const { notes, loading } = useNotes();
  const [query, setQuery] = useState('');

  const rootNotes = useMemo(
    // Only root notes in the list; updates are shown inside their thread.
    () => notes.filter((note) => note.kind === 'note'),
    [notes],
  );
  const results = useMemo(() => searchNotes(rootNotes, query), [rootNotes, query]);

  const fabPressed = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.08 * fabPressed.value }],
  }));

  return (
    <View className="flex-1 bg-canvas dark:bg-canvas-dark">
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: theme.canvas },
        }}
      />

      <Animated.FlatList
        data={results}
        keyExtractor={(result) => result.note.id}
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-28"
        itemLayoutAnimation={motion.layout}
        ListHeaderComponent={
          <View className="px-5 pb-4 pt-1">
            <Text className="font-serif-medium text-[32px] text-ink dark:text-ink-dark">
              Notes
            </Text>
            <Text className="pt-0.5 text-[13px] text-muted dark:text-muted-dark">
              {rootNotes.length === 1 ? '1 note' : `${rootNotes.length} notes`}
              {' · private, on this device'}
            </Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={theme.faint}
              autoCorrect={false}
              returnKeyType="search"
              selectionColor={theme.accent}
              className="mt-4 rounded-full border border-line/60 bg-card px-4 py-2.5 text-base text-ink web:outline-none dark:border-line-dark/60 dark:bg-card-dark dark:text-ink-dark"
            />
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <Animated.View entering={motion.enterFade} className="items-center px-10 pt-20">
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
        renderItem={({ item, index }) => <NoteCard note={item.note} index={index} />}
      />

      {/* Floating compose button, MIUI-style; it returns to the composer
          rather than opening a second one -- capture has one front door. */}
      <AnimatedPressable
        onPress={() => {
          haptics.tap();
          router.navigate('/');
        }}
        onPressIn={() => {
          fabPressed.value = withSpring(1, motion.SPRING);
        }}
        onPressOut={() => {
          fabPressed.value = withSpring(0, motion.SPRING);
        }}
        style={fabStyle}
        className="absolute bottom-8 right-5 h-14 w-14 items-center justify-center rounded-full bg-accent dark:bg-accent-dark"
      >
        <Text className="text-[30px] leading-9 text-paper dark:text-paper-dark">+</Text>
      </AnimatedPressable>
    </View>
  );
}

function NoteCard({ note, index }: { note: Note; index: number }) {
  const { softDelete } = useNotes();
  const swipeable = useRef<SwipeableMethods>(null);
  const preview = note.body.split('\n').slice(1).join(' ').trim();

  // Cards dip very slightly under the finger; the spring makes it feel like
  // paper giving, not a button.
  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.02 * pressed.value }],
  }));

  return (
    // Entering/exiting live on this wrapper, not the pressable: a layout
    // animation and the press-scale transform on the same view fight over
    // `transform`, and Reanimated warns about exactly that.
    <Animated.View
      entering={motion.stagger(index)}
      exiting={motion.exit}
      className="px-4 pb-3"
    >
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
            className="ml-3 w-20 items-center justify-center rounded-2xl bg-line/60 active:opacity-60 dark:bg-line-dark/60"
          >
            <Text className="text-sm font-medium text-muted dark:text-muted-dark">Delete</Text>
          </Pressable>
        )}
      >
        <Link href={{ pathname: '/note/[id]', params: { id: note.id } }} asChild>
          <AnimatedPressable
            onPressIn={() => {
              pressed.value = withSpring(1, motion.SPRING);
            }}
            onPressOut={() => {
              pressed.value = withSpring(0, motion.SPRING);
            }}
            style={pressStyle}
            className="rounded-2xl border border-line/60 bg-card px-4 py-3.5 dark:border-line-dark/60 dark:bg-card-dark"
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
            </View>

            {preview.length > 0 ? (
              <Text numberOfLines={2} className="pt-1 text-sm leading-5 text-muted dark:text-muted-dark">
                {preview}
              </Text>
            ) : null}

            <Text className="pt-2 text-xs text-faint dark:text-faint-dark">
              {relativeDay(note.createdAt)}
            </Text>
          </AnimatedPressable>
        </Link>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}
