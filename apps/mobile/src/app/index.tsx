import { hasCommitmentTag, parseHashtags } from '@dailynote/core';
import { Link } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { todayHeading } from '@/lib/format';
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
  const inputRef = useRef<TextInput>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const tags = parseHashtags(body);
  const willCommit = hasCommitmentTag(body);
  const canSave = body.trim().length > 0 && !saving;

  const save = useCallback(async () => {
    if (body.trim().length === 0 || saving) return;
    setSaving(true);
    try {
      const note = await create(body);
      // Writing #do promotes the note to a commitment on the spot -- no extra
      // tap, because the tap is what stops people from doing it.
      if (hasCommitmentTag(body)) await promote(note.id);
      setBody('');
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  }, [body, saving, create, promote]);

  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-paper-dark" edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View className="flex-row items-center justify-between px-5 pb-1 pt-2">
          <Link href="/notes" asChild>
            <Pressable hitSlop={12} className="active:opacity-60">
              <Text className="text-[15px] text-muted dark:text-muted-dark">
                {notes.length > 0 ? `${notes.length} notes` : 'Notes'}
              </Text>
            </Pressable>
          </Link>

          <Pressable
            hitSlop={8}
            onPress={save}
            disabled={!canSave}
            className={
              canSave
                ? 'rounded-full bg-ink px-4 py-1.5 active:opacity-80 dark:bg-ink-dark'
                : 'rounded-full bg-line/60 px-4 py-1.5 dark:bg-line-dark/60'
            }
          >
            <Text
              className={
                canSave
                  ? 'text-[13px] font-semibold text-paper dark:text-paper-dark'
                  : 'text-[13px] font-semibold text-faint dark:text-faint-dark'
              }
            >
              Save
            </Text>
          </Pressable>
        </View>

        <Text className="px-5 pt-3 text-[11px] uppercase tracking-[2px] text-muted dark:text-muted-dark">
          {todayHeading()}
        </Text>

        <TextInput
          ref={inputRef}
          value={body}
          onChangeText={setBody}
          autoFocus
          multiline
          textAlignVertical="top"
          placeholder="What's on your mind?"
          placeholderTextColor={theme.faint}
          className="flex-1 px-5 pt-2 font-serif text-[21px] leading-8 text-ink dark:text-ink-dark"
          selectionColor={theme.accent}
        />

        <View className="flex-row flex-wrap items-center gap-2 px-5 pb-3 pt-2">
          {willCommit ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 dark:bg-accent-dark/15">
              <View className="h-1.5 w-1.5 rounded-full bg-accent dark:bg-accent-dark" />
              <Text className="text-xs font-medium text-accent dark:text-accent-dark">
                comes back in 2 days
              </Text>
            </View>
          ) : null}

          {tags
            .filter((tag) => tag !== 'do')
            .map((tag) => (
              <View
                key={tag}
                className="rounded-full bg-line/60 px-3 py-1.5 dark:bg-line-dark/60"
              >
                <Text className="text-xs text-muted dark:text-muted-dark">#{tag}</Text>
              </View>
            ))}

          {tags.length === 0 ? (
            <Text className="font-serif-italic text-sm text-muted dark:text-muted-dark">
              #do makes it come back · #tags are just written inline
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
