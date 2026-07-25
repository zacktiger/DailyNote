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

import { useNotes } from '@/store/notes-store';

/**
 * The composer, and the launch screen.
 *
 * The whole product bets on capture being frictionless, so this screen opens
 * focused with an empty note and nothing else competing for attention. Per the
 * plan: "if it feels good to type into, you have a product."
 */
export default function Composer() {
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
        <View className="flex-row items-center justify-between px-5 pb-2 pt-1">
          <Link href="/notes" asChild>
            <Pressable hitSlop={12}>
              <Text className="text-base text-muted dark:text-muted-dark">
                {notes.length > 0 ? `${notes.length} notes` : 'Notes'}
              </Text>
            </Pressable>
          </Link>

          <Pressable hitSlop={12} onPress={save} disabled={!canSave}>
            <Text
              className={
                canSave
                  ? 'text-base font-semibold text-accent dark:text-accent-dark'
                  : 'text-base font-semibold text-line dark:text-line-dark'
              }
            >
              Save
            </Text>
          </Pressable>
        </View>

        <TextInput
          ref={inputRef}
          value={body}
          onChangeText={setBody}
          autoFocus
          multiline
          textAlignVertical="top"
          placeholder="What's on your mind?"
          placeholderTextColor="#a1a1aa"
          className="flex-1 px-5 pt-2 text-lg leading-7 text-ink dark:text-ink-dark"
          selectionColor="#2563eb"
        />

        <View className="flex-row flex-wrap items-center gap-2 px-5 pb-3">
          {willCommit ? (
            <View className="rounded-full bg-accent/10 px-3 py-1">
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
                className="rounded-full border border-line px-3 py-1 dark:border-line-dark"
              >
                <Text className="text-xs text-muted dark:text-muted-dark">#{tag}</Text>
              </View>
            ))}

          {tags.length === 0 ? (
            <Text className="text-xs text-muted dark:text-muted-dark">
              #do makes it come back · #tags are just written inline
            </Text>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
