import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed-card';
import { Icon } from '@/components/icon';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * Writing straight to the feed.
 *
 * This is the one composer in the app that knows it has an audience, and it
 * says so on the screen -- the handle and the word "public" are in the header,
 * before you type. That is the trade that makes it safe to have at all: the
 * notes composer stays a private surface with no audience control anywhere on
 * it, and everything that performs lives behind the Feed tab where you had to
 * go on purpose.
 *
 * A post is stored as a note that was public from birth. It gets threads,
 * updates and the follow-through loop for free, and `bornPublic` keeps it out
 * of the private library on the Notes tab.
 */
export default function NewPost() {
  const theme = useTheme();
  const goBack = useGoBack();
  const { me, post } = useSocial();

  const [body, setBody] = useState('');
  const [publishing, setPublishing] = useState(false);

  const trimmed = body.trim();
  const ready = trimmed.length > 0 && !publishing && me !== null;

  const publish = useCallback(() => {
    if (!ready) return;
    setPublishing(true);
    void (async () => {
      const url = await post(body);
      if (url === null) {
        setPublishing(false);
        return;
      }
      haptics.success();
      goBack();
    })();
  }, [ready, post, body, goBack]);

  if (me === null) {
    // Reachable only by deep link: the feed sends you to /handle first.
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">Claim a handle first.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-paper-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-2 pb-1 pt-1">
        <Pressable
          hitSlop={8}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="close" size={22} color={theme.ink} />
        </Pressable>

        <View className="flex-1" />

        <Pressable
          onPress={publish}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Publish post"
          accessibilityState={{ disabled: !ready }}
          className={[
            'h-10 flex-row items-center gap-2 rounded-full px-5 active:opacity-70',
            ready ? 'bg-accent dark:bg-accent-dark' : 'bg-elevated dark:bg-elevated-dark',
          ].join(' ')}
        >
          {publishing ? (
            <ActivityIndicator size="small" color={theme.accentInk} />
          ) : (
            <Text
              className="text-[15px] font-semibold"
              style={{ color: ready ? theme.accentInk : theme.faint }}
            >
              Post
            </Text>
          )}
        </Pressable>
      </View>

      {/* The audience, stated before a word is typed. A composer that hides
          who can see the result is the failure mode this header exists to
          prevent. */}
      <View className="flex-row items-center gap-2.5 border-b border-line px-5 pb-3 pt-1 dark:border-line-dark">
        <Avatar profile={me} size={30} />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
            @{me.handle}
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-elevated px-3 py-1 dark:bg-elevated-dark">
          <Icon name="globe" size={13} color={theme.muted} />
          <Text className="text-[12px] font-medium text-muted dark:text-muted-dark">Public</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="px-5 pb-12 pt-4" keyboardDismissMode="on-drag">
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Write it out."
            placeholderTextColor={theme.faint}
            multiline
            autoFocus
            selectionColor={theme.accent}
            className="min-h-64 font-serif text-[19px] leading-7 text-ink web:outline-none dark:text-ink-dark"
            textAlignVertical="top"
          />
        </ScrollView>

        <View className="border-t border-line px-5 py-3 dark:border-line-dark">
          <Text className="text-[13px] text-faint dark:text-faint-dark">
            The first line becomes the title. This goes to the feed, not to your notes.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
