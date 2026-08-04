import {
  documentToText,
  hasCommitmentTag,
  isEmptyDocument,
  paragraph,
  parseHashtags,
  serializeDocument,
  toggleBullet,
  type Block,
} from '@dailynote/core';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockEditor, type BlockEditorHandle } from '@/components/block-editor';
import { BlockToolbar } from '@/components/block-toolbar';
import { todayHeading } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/**
 * The composer, and the launch screen.
 *
 * The whole product bets on capture being frictionless, so this screen opens
 * focused with an empty note and nothing else competing for attention. Per the
 * plan: "if it feels good to type into, you have a product."
 */
export default function Composer() {
  const theme = useTheme();
  const { create, promote, notes } = useNotes();
  const [blocks, setBlocks] = useState<Block[]>(() => [paragraph()]);
  const [focused, setFocused] = useState<number | null>(null);
  const editor = useRef<BlockEditorHandle>(null);
  const [saving, setSaving] = useState(false);
  // Bumped after a save: remounting the editor is what clears it and returns
  // the caret to a fresh title, since autoFocus only fires on mount.
  const [draft, setDraft] = useState(0);

  const body = documentToText(blocks);
  const tags = parseHashtags(body);
  const willCommit = hasCommitmentTag(body);
  const canSave = !isEmptyDocument(blocks) && !saving;

  // Save pill: springs between its disabled and enabled state instead of
  // snapping, and dips under the finger while pressed.
  const enabled = useSharedValue(0);
  const pressed = useSharedValue(0);
  useEffect(() => {
    enabled.value = withSpring(canSave ? 1 : 0, motion.SPRING);
  }, [canSave, enabled]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      enabled.value,
      [0, 1],
      [`${theme.line}99`, theme.ink],
    ),
    transform: [{ scale: (0.96 + 0.04 * enabled.value) * (1 - 0.03 * pressed.value) }],
  }));
  const pillLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(enabled.value, [0, 1], [theme.faint, theme.paper]),
  }));

  // The quiet acknowledgment that capture happened: the note count ticks up
  // with a small pulse. No toast, no checkmark.
  const countPulse = useSharedValue(1);
  const prevCount = useRef(notes.length);
  useEffect(() => {
    if (notes.length > prevCount.current) {
      countPulse.value = withSequence(
        withSpring(1.15, { ...motion.SPRING, stiffness: 500 }),
        withSpring(1, motion.SPRING),
      );
    }
    prevCount.current = notes.length;
  }, [notes.length, countPulse]);
  const countStyle = useAnimatedStyle(() => ({
    transform: [{ scale: countPulse.value }],
  }));

  const save = useCallback(async () => {
    if (isEmptyDocument(blocks) || saving) return;
    setSaving(true);
    try {
      // Both representations are written together: the document is the note,
      // `body` is the plain text everything else reads off it.
      const note = await create(body, { doc: serializeDocument(blocks) });
      // Writing #do promotes the note to a commitment on the spot -- no extra
      // tap, because the tap is what stops people from doing it.
      if (hasCommitmentTag(body)) await promote(note.id);
      haptics.tap();
      setBlocks([paragraph()]);
      setDraft((count) => count + 1);
    } finally {
      setSaving(false);
    }
  }, [blocks, body, saving, create, promote]);

  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-paper-dark" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View entering={motion.enterFade} className="flex-1">
          <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
            <Link href="/notes" asChild>
              <Pressable hitSlop={12} className="active:opacity-60">
                <Animated.Text
                  style={countStyle}
                  className="text-[15px] text-muted dark:text-muted-dark"
                >
                  {notes.length > 0 ? `${notes.length} notes` : 'Notes'}
                </Animated.Text>
              </Pressable>
            </Link>

            <AnimatedPressable
              hitSlop={8}
              onPress={save}
              disabled={!canSave}
              onPressIn={() => {
                pressed.value = withSpring(1, motion.SPRING);
              }}
              onPressOut={() => {
                pressed.value = withSpring(0, motion.SPRING);
              }}
              style={pillStyle}
              className="rounded-full px-4 py-1.5"
            >
              <Animated.Text style={pillLabelStyle} className="text-[13px] font-semibold">
                Save
              </Animated.Text>
            </AnimatedPressable>
          </View>

          <Text className="px-5 pt-3 text-[11px] uppercase tracking-[2px] text-muted dark:text-muted-dark">
            {todayHeading()}
          </Text>

          <ScrollView
            className="flex-1"
            contentContainerClassName="grow pt-2"
            keyboardDismissMode="on-drag"
            // So a tap on the surface below the last line reaches it instead
            // of only dismissing the keyboard.
            keyboardShouldPersistTaps="handled"
          >
            <BlockEditor
              key={draft}
              ref={editor}
              blocks={blocks}
              onChange={setBlocks}
              onFocusChange={setFocused}
              placeholder="What's on your mind?"
              autoFocus
            />
          </ScrollView>

          <Animated.View
            layout={motion.layout}
            className="flex-row flex-wrap items-center gap-2 px-5 pb-3 pt-2"
          >
            {willCommit ? (
              <Animated.View
                entering={motion.enter}
                exiting={motion.exit}
                layout={motion.layout}
                className="flex-row items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 dark:bg-accent-dark/15"
              >
                <View className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-accent-dark" />
                <Text className="text-xs font-medium text-accent dark:text-accent-dark">
                  comes back in 2 days
                </Text>
              </Animated.View>
            ) : null}

            {tags
              .filter((tag) => tag !== 'do')
              .map((tag) => (
                <Animated.View
                  key={tag}
                  entering={motion.enter}
                  exiting={motion.exit}
                  layout={motion.layout}
                  className="rounded-full bg-line/60 px-3 py-1.5 dark:bg-line-dark/60"
                >
                  <Text className="text-xs text-muted dark:text-muted-dark">#{tag}</Text>
                </Animated.View>
              ))}

            {tags.length === 0 ? (
              <Animated.View entering={motion.enterFade} exiting={motion.exit}>
                <Text className="font-serif-italic text-sm text-muted dark:text-muted-dark">
                  #do makes it come back · #tags are just written inline
                </Text>
              </Animated.View>
            ) : null}
          </Animated.View>

          <BlockToolbar
            block={focused === null ? undefined : blocks[focused]}
            onToggleBullet={() => {
              if (focused === null) return;
              setBlocks(toggleBullet(blocks, focused));
              // The toolbar took the tap; give the caret straight back so the
              // keyboard never drops and the next word goes where it should.
              editor.current?.restoreFocus();
            }}
          />
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
