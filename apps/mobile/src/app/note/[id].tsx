import { threadOf, type Note } from '@dailynote/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useNotes } from '@/store/notes-store';

/** Note detail: edit the body, promote to a commitment, read the thread. */
export default function NoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes } = useNotes();

  const note = useMemo(() => notes.find((candidate) => candidate.id === id), [notes, id]);

  if (note === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
        <Text className="text-muted dark:text-muted-dark">This note is gone.</Text>
      </View>
    );
  }

  // Keyed on the note id so the draft initialises from the stored body once,
  // on mount, rather than being synced back by an effect -- store refreshes
  // must never clobber what the user is currently typing.
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const { notes, setBody, softDelete, promote } = useNotes();
  const [draft, setDraft] = useState(note.body);

  const updates = useMemo(
    () => threadOf(notes, note.rootId).filter((candidate) => candidate.id !== note.id),
    [notes, note.rootId, note.id],
  );

  const isCommitment = note.nextReviewAt !== null;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-paper dark:bg-paper-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <Pressable
              hitSlop={12}
              onPress={async () => {
                await softDelete(note.id);
                router.back();
              }}
            >
              <Text className="text-base text-muted dark:text-muted-dark">Delete</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerClassName="pb-10" keyboardDismissMode="on-drag">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            if (draft !== note.body) void setBody(note.id, draft);
          }}
          multiline
          textAlignVertical="top"
          className="min-h-[220px] px-5 pt-2 text-lg leading-7 text-ink dark:text-ink-dark"
          selectionColor="#2563eb"
        />

        <View className="px-5 pt-2">
          {isCommitment ? (
            // Forward-looking only. `reviewCount` drives the ladder but is
            // never shown: a tally of how many times you deferred something is
            // a guilt counter, and guilt is the failure mode for this app.
            <Text className="text-sm text-accent dark:text-accent-dark">
              Comes back {formatDate(note.nextReviewAt!)}
            </Text>
          ) : (
            <Pressable
              className="self-start rounded-full border border-line px-4 py-2 active:opacity-60 dark:border-line-dark"
              onPress={() => void promote(note.id)}
            >
              <Text className="text-sm font-medium text-ink dark:text-ink-dark">Follow up</Text>
            </Pressable>
          )}
        </View>

        {updates.length > 0 ? (
          <View className="px-5 pt-8">
            <Text className="pb-2 text-xs uppercase tracking-wide text-muted dark:text-muted-dark">
              Updates
            </Text>
            {updates.map((update) => (
              <View
                key={update.id}
                className="border-l-2 border-line py-2 pl-3 dark:border-line-dark"
              >
                <Text className="text-xs text-muted dark:text-muted-dark">
                  {formatDate(update.createdAt)}
                </Text>
                <Text className="pt-1 text-base text-ink dark:text-ink-dark">{update.body}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
