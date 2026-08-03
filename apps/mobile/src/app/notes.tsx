import { searchNotes, type Note } from '@dailynote/core';
import { Link, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { relativeDay } from '@/lib/format';
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
          className="rounded-xl bg-line/40 px-4 py-2.5 text-base text-ink web:outline-none dark:bg-line-dark/50 dark:text-ink-dark"
        />
      </View>

      <FlatList
        data={results}
        keyExtractor={(result) => result.note.id}
        keyboardDismissMode="on-drag"
        contentContainerClassName="pb-16"
        ItemSeparatorComponent={() => (
          <View className="ml-5 h-px bg-line dark:bg-line-dark" />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View className="items-center px-10 pt-24">
              <Text className="font-serif-italic text-lg text-muted dark:text-muted-dark">
                {query.length > 0 ? 'Nothing matches.' : 'No notes yet.'}
              </Text>
              {query.length === 0 ? (
                <Text className="pt-2 text-center text-sm text-faint dark:text-faint-dark">
                  What you write stays on this device.
                </Text>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }) => <NoteRow note={item.note} />}
      />
    </View>
  );
}

function NoteRow({ note }: { note: Note }) {
  const preview = note.body.split('\n').slice(1).join(' ').trim();

  return (
    <Link href={{ pathname: '/note/[id]', params: { id: note.id } }} asChild>
      <Pressable className="px-5 py-3.5 active:bg-line/30 dark:active:bg-line-dark/30">
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
      </Pressable>
    </Link>
  );
}
