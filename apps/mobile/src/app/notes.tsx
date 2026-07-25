import { searchNotes, type Note } from '@dailynote/core';
import { Link, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';

import { useNotes } from '@/store/notes-store';

/**
 * The notes list, with search.
 *
 * Search is a JS filter over the in-memory array (plan section 0.2, option A).
 * The ranking lives in @dailynote/core so it is unit tested without a simulator.
 */
export default function NotesList() {
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

      <View className="px-5 pb-2 pt-1">
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor="#a1a1aa"
          autoCorrect={false}
          className="rounded-xl bg-line/50 px-4 py-3 text-base text-ink dark:bg-line-dark/60 dark:text-ink-dark"
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
            <Text className="px-5 pt-8 text-center text-muted dark:text-muted-dark">
              {query.length > 0 ? 'Nothing matches.' : 'No notes yet.'}
            </Text>
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
      <Pressable className="px-5 py-3 active:opacity-60">
        <View className="flex-row items-center gap-2">
          {note.nextReviewAt !== null ? (
            <View className="h-2 w-2 rounded-full bg-accent dark:bg-accent-dark" />
          ) : null}
          <Text
            numberOfLines={1}
            className="flex-1 text-base font-medium text-ink dark:text-ink-dark"
          >
            {note.title ?? 'Untitled'}
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
