import {
  ALL_NOTES,
  DEFAULT_NOTEBOOK,
  searchNotes,
  type Note,
  type Notebook,
} from '@dailynote/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { shortDate } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useNotebooks } from '@/store/notebooks-store';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/**
 * The notes list, and the app's front door.
 *
 * The composer used to be the launch screen. The reference puts the library
 * first and reaches capture through the floating button, which is the shape
 * users of every other notes app already expect -- so opening the app now
 * shows what you have rather than a blank page.
 */
export default function NotesList() {
  const theme = useTheme();
  const router = useRouter();
  const { notes, loading } = useNotes();
  const { notebooks } = useNotebooks();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);

  // The selected notebook lives in the route rather than in state: the drawer
  // picks one and dismisses back to here, and having both a param and a
  // useState would mean two sources of truth to keep in step.
  const { filter: requested } = useLocalSearchParams<{ filter?: string }>();
  const filter = requested ?? ALL_NOTES;
  const setFilter = useCallback(
    (next: string) => router.setParams({ filter: next }),
    [router],
  );

  // Only root notes are listed; updates belong inside their thread. Locked
  // notes stay out of every list until the lock is satisfied, and posts written
  // straight to the feed stay out of it entirely -- this list is the private
  // library, and a post was never part of it.
  const rootNotes = useMemo(
    () => notes.filter((note) => note.kind === 'note' && !note.locked && !note.bornPublic),
    [notes],
  );

  const inNotebook = useMemo(() => {
    if (filter === ALL_NOTES) return rootNotes;
    if (filter === DEFAULT_NOTEBOOK) return rootNotes.filter((note) => note.notebookId === null);
    return rootNotes.filter((note) => note.notebookId === filter);
  }, [rootNotes, filter]);

  const results = useMemo(() => searchNotes(inNotebook, query), [inNotebook, query]);

  const openSearch = useCallback(() => {
    setSearching((open) => {
      if (open) setQuery('');
      return !open;
    });
  }, []);

  const fabPressed = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.08 * fabPressed.value }],
  }));

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-end gap-1 px-3 pb-1 pt-1">
        <IconButton
          name="search"
          label={searching ? 'Close search' : 'Search notes'}
          onPress={openSearch}
          tint={searching ? theme.accent : theme.ink}
        />
        <IconButton name="overflow" label="Notebooks" onPress={() => router.push('/notebooks')} />
      </View>

      <Animated.FlatList
        data={results}
        keyExtractor={(result) => result.note.id}
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-32"
        itemLayoutAnimation={motion.layout}
        ListHeaderComponent={
          <ListHeader
            count={inNotebook.length}
            notebooks={notebooks}
            filter={filter}
            onFilter={setFilter}
            searching={searching}
            query={query}
            onQuery={setQuery}
          />
        }
        ListEmptyComponent={loading ? null : <Empty query={query} />}
        renderItem={({ item, index }) => (
          <NoteRow
            note={item.note}
            index={index}
            first={index === 0}
            last={index === results.length - 1}
          />
        )}
      />

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="New note"
        onPress={() => {
          haptics.tap();
          router.push('/note/new');
        }}
        onPressIn={() => {
          fabPressed.value = withSpring(1, motion.SPRING);
        }}
        onPressOut={() => {
          fabPressed.value = withSpring(0, motion.SPRING);
        }}
        style={fabStyle}
        className="absolute bottom-6 right-5 h-16 w-16 items-center justify-center rounded-full bg-accent shadow-lg dark:bg-accent-dark"
      >
        <Icon name="plus" size={30} color={theme.accentInk} />
      </AnimatedPressable>
    </SafeAreaView>
  );
}

function ListHeader({
  count,
  notebooks,
  filter,
  onFilter,
  searching,
  query,
  onQuery,
}: {
  count: number;
  notebooks: Notebook[];
  filter: string;
  onFilter: (next: string) => void;
  searching: boolean;
  query: string;
  onQuery: (next: string) => void;
}) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View className="pb-4">
      <Text className="px-5 text-[40px] font-bold leading-[48px] text-ink dark:text-ink-dark">
        Notes
      </Text>
      <Text className="px-5 pt-0.5 text-[15px] text-muted dark:text-muted-dark">
        {count === 1 ? '1 note' : `${count} notes`}
      </Text>

      {searching ? (
        <Animated.View entering={motion.enter} exiting={motion.exit} className="px-5 pt-3">
          <TextInput
            value={query}
            onChangeText={onQuery}
            placeholder="Search notes"
            placeholderTextColor={theme.faint}
            autoFocus
            autoCorrect={false}
            returnKeyType="search"
            selectionColor={theme.accent}
            className="rounded-xl bg-card px-4 py-3 text-[15px] text-ink web:outline-none dark:bg-card-dark dark:text-ink-dark"
          />
        </Animated.View>
      ) : null}

      {/* The notebook filter rail. The leading button opens the drawer; the
          chips after it are the same set, one tap away. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-5 pt-4"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Notebooks"
          onPress={() => router.push('/notebooks')}
          className="h-11 w-12 items-center justify-center rounded-xl bg-card active:opacity-60 dark:bg-card-dark"
        >
          <Icon name="notebook" size={20} color={theme.ink} />
        </Pressable>

        <Chip label="All notes" active={filter === ALL_NOTES} onPress={() => onFilter(ALL_NOTES)} />
        {notebooks.map((notebook) => (
          <Chip
            key={notebook.id}
            label={notebook.name}
            active={filter === notebook.id}
            onPress={() => onFilter(notebook.id)}
          />
        ))}
        <Chip
          label="Default"
          active={filter === DEFAULT_NOTEBOOK}
          onPress={() => onFilter(DEFAULT_NOTEBOOK)}
        />
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={[
        'h-11 justify-center rounded-xl px-4 active:opacity-60',
        active ? 'bg-elevated dark:bg-elevated-dark' : 'bg-card dark:bg-card-dark',
      ].join(' ')}
    >
      <Text
        className={[
          'text-[15px]',
          active
            ? 'font-semibold text-ink dark:text-ink-dark'
            : 'text-muted dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * One row in the grouped card.
 *
 * The rows share a single card surface rather than each being its own tile:
 * only the first and last round their corners, and a hairline inset from the
 * left divides the ones between.
 */
function NoteRow({
  note,
  index,
  first,
  last,
}: {
  note: Note;
  index: number;
  first: boolean;
  last: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { softDelete, togglePin } = useNotes();
  const swipeable = useRef<SwipeableMethods>(null);

  // The preview is the body minus its title line, flattened to one line. The
  // body is already the document's plain-text projection; only the bullet
  // marker it keeps for `deriveTitle` has to come back off, since a row full
  // of dashes reads as noise at this size.
  const preview = useMemo(
    () =>
      note.body
        .split('\n')
        .slice(1)
        .map((line) => line.replace(/^- /, ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim(),
    [note.body],
  );

  const pressed = useSharedValue(0);
  const pressStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.35 * pressed.value,
  }));

  return (
    <Animated.View entering={motion.stagger(index)} exiting={motion.exit} className="px-4">
      <ReanimatedSwipeable
        ref={swipeable}
        friction={2}
        rightThreshold={40}
        overshootRight={false}
        renderRightActions={() => (
          // Muted, not red: this is a soft delete into Recently deleted, and
          // alarm colours would make tidying up feel like danger.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${note.title ?? 'note'}`}
            onPress={() => {
              haptics.tap();
              swipeable.current?.close();
              void softDelete(note.id);
            }}
            className="ml-2 w-20 items-center justify-center rounded-xl bg-elevated active:opacity-60 dark:bg-elevated-dark"
          >
            <Icon name="trash" size={20} color={theme.muted} />
          </Pressable>
        )}
      >
        <AnimatedPressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
          onLongPress={() => {
            haptics.tap();
            void togglePin(note.id);
          }}
          onPressIn={() => {
            pressed.value = withSpring(1, motion.SPRING);
          }}
          onPressOut={() => {
            pressed.value = withSpring(0, motion.SPRING);
          }}
          style={pressStyle}
          className={[
            'bg-card px-4 dark:bg-card-dark',
            first ? 'rounded-t-2xl pt-4' : 'pt-3.5',
            last ? 'rounded-b-2xl pb-4' : 'pb-3.5',
          ].join(' ')}
        >
          <View className="flex-row items-center gap-2">
            {note.pinnedAt !== null ? (
              <Icon name="pin" size={13} color={theme.accent} />
            ) : null}
            {note.nextReviewAt !== null ? (
              <View className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-accent-dark" />
            ) : null}
            <Text
              numberOfLines={1}
              className="flex-1 text-[17px] font-medium text-ink dark:text-ink-dark"
            >
              {note.title ?? 'Untitled'}
            </Text>
          </View>

          {/* Date and preview share one line, as in the reference: the date
              is the anchor you scan, the preview is what's left over. */}
          <Text numberOfLines={1} className="pt-1 text-[15px] text-muted dark:text-muted-dark">
            <Text className="text-faint dark:text-faint-dark">{shortDate(note.createdAt)}</Text>
            {preview.length > 0 ? `  ${preview}` : ''}
          </Text>
        </AnimatedPressable>
      </ReanimatedSwipeable>

      {!last ? <View className="mx-4 h-px bg-line dark:bg-line-dark" /> : null}
    </Animated.View>
  );
}

function Empty({ query }: { query: string }) {
  return (
    <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
      <Text className="text-[17px] text-muted dark:text-muted-dark">
        {query.length > 0 ? 'Nothing matches.' : 'No notes yet.'}
      </Text>
      {query.length === 0 ? (
        <Text className="pt-2 text-center text-[15px] text-faint dark:text-faint-dark">
          Tap + to write your first one.
        </Text>
      ) : null}
    </Animated.View>
  );
}

function IconButton({
  name,
  label,
  onPress,
  tint,
}: {
  name: Parameters<typeof Icon>[0]['name'];
  label: string;
  onPress: () => void;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
    >
      <Icon name={name} size={22} color={tint ?? theme.ink} />
    </Pressable>
  );
}
