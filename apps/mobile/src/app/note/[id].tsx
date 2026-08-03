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
import Animated from 'react-native-reanimated';

import { comesBack, formatDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/** Note detail: edit the body, promote to a commitment, read the thread. */
export default function NoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes } = useNotes();

  const note = useMemo(() => notes.find((candidate) => candidate.id === id), [notes, id]);

  if (note === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
        <Text className="font-serif-italic text-lg text-muted dark:text-muted-dark">
          This note is gone.
        </Text>
      </View>
    );
  }

  // Keyed on the note id so the draft initialises from the stored body once,
  // on mount, rather than being synced back by an effect -- store refreshes
  // must never clobber what the user is currently typing.
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const theme = useTheme();
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
                haptics.tap();
                await softDelete(note.id);
                router.back();
              }}
            >
              <Text className="text-[15px] text-muted dark:text-muted-dark">Delete</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerClassName="pb-10" keyboardDismissMode="on-drag">
        <Text className="pt-1 text-center text-xs text-faint dark:text-faint-dark">
          {formatDay(note.createdAt)}
        </Text>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            if (draft !== note.body) void setBody(note.id, draft);
          }}
          multiline
          textAlignVertical="top"
          className="min-h-[220px] px-5 pt-3 font-serif text-[21px] leading-8 text-ink web:outline-none dark:text-ink-dark"
          selectionColor={theme.accent}
        />

        {/* The follow-through loop's entry point. Promoting crossfades the
            pill into the status with a spring reflow and the app's single
            success haptic -- it should feel like something latched, quietly. */}
        <Animated.View layout={motion.layout} className="px-5 pt-2">
          {isCommitment ? (
            // Forward-looking only. `reviewCount` drives the ladder but is
            // never shown: a tally of how many times you deferred something is
            // a guilt counter, and guilt is the failure mode for this app.
            <Animated.View
              entering={motion.enter}
              exiting={motion.exit}
              className="flex-row items-center gap-2"
            >
              <View className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-accent-dark" />
              <Text className="text-sm font-medium text-accent dark:text-accent-dark">
                Comes back {comesBack(note.nextReviewAt!)}
              </Text>
            </Animated.View>
          ) : (
            <AnimatedPressable
              entering={motion.enterFade}
              exiting={motion.exit}
              className="self-start rounded-full bg-accent/10 px-4 py-2 active:opacity-60 dark:bg-accent-dark/15"
              onPress={() => {
                haptics.success();
                void promote(note.id);
              }}
            >
              <Text className="text-sm font-medium text-accent dark:text-accent-dark">
                Follow up
              </Text>
            </AnimatedPressable>
          )}
        </Animated.View>

        {updates.length > 0 ? (
          <View className="px-5 pt-10">
            <Text className="pb-3 text-[11px] uppercase tracking-[2px] text-muted dark:text-muted-dark">
              Updates
            </Text>
            {updates.map((update, index) => (
              <Animated.View
                key={update.id}
                entering={motion.stagger(index)}
                className="mb-4 border-l-2 border-line pl-4 dark:border-line-dark"
              >
                <Text className="text-xs text-muted dark:text-muted-dark">
                  {formatDay(update.createdAt)}
                </Text>
                <Text className="pt-1 font-serif text-[17px] leading-7 text-ink dark:text-ink-dark">
                  {update.body}
                </Text>
              </Animated.View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
