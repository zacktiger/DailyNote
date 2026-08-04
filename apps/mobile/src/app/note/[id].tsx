import { parseDocument, threadOf, toggleBullet, type Block, type Note } from '@dailynote/core';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated from 'react-native-reanimated';

import { BlockEditor, type BlockEditorHandle } from '@/components/block-editor';
import { BlockToolbar } from '@/components/block-toolbar';
import { comesBack, formatDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useNotes } from '@/store/notes-store';

/** How long the writing has to stop before an edit is written to SQLite. */
const AUTOSAVE_MS = 600;

/** Note detail: edit the note, promote to a commitment, read the thread. */
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

  // Keyed on the note id so the draft initialises from storage once, on mount,
  // rather than being synced back by an effect -- store refreshes must never
  // clobber what the user is currently typing.
  return <NoteEditor key={note.id} note={note} />;
}

function NoteEditor({ note }: { note: Note }) {
  const router = useRouter();
  const { notes, setContent, softDelete, promote } = useNotes();
  const [blocks, setBlocks] = useState<Block[]>(() => parseDocument(note.doc, note.body));
  const [focused, setFocused] = useState<number | null>(null);
  const editor = useRef<BlockEditorHandle>(null);

  // Autosave, because there is no longer one input whose blur means "done":
  // with a block per line, blur fires every time the caret moves between them.
  // So the note is written once the writing pauses, and again on the way out.
  const latest = useRef(blocks);
  const unsaved = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (!unsaved.current) return;
    unsaved.current = false;
    void setContent(note.id, latest.current);
  }, [note.id, setContent]);

  // Kept in a ref so the unmount effect below can stay on empty deps. `flush`
  // closes over `setContent`, whose identity changes on every store refresh --
  // an effect depending on it would re-run its cleanup, and saving from a
  // cleanup that fires on every save is a loop.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      flushRef.current();
    };
  }, []);

  const change = useCallback((next: Block[]) => {
    setBlocks(next);
    latest.current = next;
    unsaved.current = true;

    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), AUTOSAVE_MS);
  }, []);

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

      <ScrollView
        contentContainerClassName="pb-10 pt-3"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <Text className="pb-3 text-center text-xs text-faint dark:text-faint-dark">
          {formatDay(note.createdAt)}
        </Text>

        <BlockEditor
          ref={editor}
          blocks={blocks}
          onChange={change}
          onFocusChange={setFocused}
          placeholder="Untitled"
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

      <BlockToolbar
        block={focused === null ? undefined : blocks[focused]}
        onToggleBullet={() => {
          if (focused === null) return;
          change(toggleBullet(blocks, focused));
          // The toolbar took the tap; give the caret straight back so the
          // keyboard never drops and the next word goes where it should.
          editor.current?.restoreFocus();
        }}
      />
    </KeyboardAvoidingView>
  );
}
