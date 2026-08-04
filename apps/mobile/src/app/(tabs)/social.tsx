import { composeFeed, type FeedItem } from '@dailynote/core';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, FeedCard } from '@/components/feed-card';
import { Icon } from '@/components/icon';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { AnimatedPressable } from '@/lib/motion';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * The feed: other people's notes, and the ones you chose to share.
 *
 * Two things live behind this tab and they are deliberately both here rather
 * than anywhere near the notes composer -- posting straight to the feed, and
 * reading what other people published. The notes app on the first tab does not
 * know this screen exists, which is the arrangement docs/product.md asks for:
 * capture never acquires an audience.
 *
 * Order is reverse chronological and there is nowhere to put a ranking signal.
 * See `composeFeed`.
 */
export default function Feed() {
  const theme = useTheme();
  const router = useRouter();
  const { me, needed, items, following, blocked, loading, setLiked } = useSocial();

  const [scope, setScope] = useState<'following' | 'everyone'>('everyone');

  /**
   * The screen standing between the reader and publishing, or null.
   *
   * Sign-in and the handle claim are two steps, and this names whichever is
   * outstanding so nobody is sent to one they have already satisfied. Reading
   * never consults it.
   */
  const gate: Href | null =
    needed === 'sign-in' ? '/sign-in' : needed === 'handle' ? '/handle' : null;

  const feed = useMemo(
    () =>
      composeFeed(items, {
        following: scope === 'following' ? following : undefined,
        blocked,
        selfId: me?.id ?? null,
      }),
    [items, scope, following, blocked, me],
  );

  const like = useCallback(
    (item: FeedItem) => {
      void setLiked(item.id, !item.likedByMe);
    },
    [setLiked],
  );

  const fabPressed = useSharedValue(0);
  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.08 * fabPressed.value }],
  }));

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-end gap-1 px-3 pb-1 pt-1">
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={me === null ? 'Set up your profile' : 'Your profile'}
          onPress={() =>
            router.push(
              gate ?? { pathname: '/profile/[handle]', params: { handle: me?.handle ?? '' } },
            )
          }
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          {me === null ? (
            <Icon name="profile" size={22} color={theme.ink} />
          ) : (
            <Avatar profile={me} size={30} />
          )}
        </Pressable>
      </View>

      <Animated.FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        contentContainerClassName="pb-32"
        itemLayoutAnimation={motion.layout}
        ListHeaderComponent={
          <Header scope={scope} onScope={setScope} count={feed.length} needed={needed} />
        }
        ListEmptyComponent={loading ? null : <Empty scope={scope} />}
        renderItem={({ item, index }) => (
          <FeedCard
            item={item}
            onLike={() => like(item)}
            first={index === 0}
            last={index === feed.length - 1}
          />
        )}
      />

      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="Write a post"
        onPress={() => {
          haptics.tap();
          router.push(gate ?? '/post/new');
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
        <Icon name="edit" size={26} color={theme.accentInk} />
      </AnimatedPressable>
    </SafeAreaView>
  );
}

function Header({
  scope,
  onScope,
  count,
  needed,
}: {
  scope: 'following' | 'everyone';
  onScope: (next: 'following' | 'everyone') => void;
  count: number;
  needed: 'sign-in' | 'handle' | null;
}) {
  const router = useRouter();
  const theme = useTheme();

  return (
    <View className="pb-4">
      <Text className="px-5 text-[40px] font-bold leading-[48px] text-ink dark:text-ink-dark">
        Feed
      </Text>
      <Text className="px-5 pt-0.5 text-[15px] text-muted dark:text-muted-dark">
        {count === 1 ? '1 thread' : `${count} threads`}
      </Text>

      {needed !== null ? (
        // A prompt, not a wall. Reading the feed needs no account at all, and
        // demanding a sign-up before you can see anything is how a social tab
        // teaches people to avoid it.
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push(needed === 'sign-in' ? '/sign-in' : '/handle')}
          className="mx-4 mt-4 flex-row items-center gap-3 rounded-2xl bg-card px-4 py-3.5 active:opacity-70 dark:bg-card-dark"
        >
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
              {needed === 'sign-in' ? 'Sign in to publish' : 'Pick a handle to post'}
            </Text>
            <Text className="pt-0.5 text-[13px] text-muted dark:text-muted-dark">
              {needed === 'sign-in'
                ? 'Reading needs nothing. Your notes need nothing either.'
                : 'One more step, and it is the only one that shows.'}
            </Text>
          </View>
          <Icon name="chevron" size={20} color={theme.faint} />
        </Pressable>
      ) : null}

      <View className="flex-row gap-2 px-5 pt-4">
        <Segment label="Everyone" active={scope === 'everyone'} onPress={() => onScope('everyone')} />
        <Segment
          label="Following"
          active={scope === 'following'}
          onPress={() => onScope('following')}
        />
      </View>
    </View>
  );
}

function Segment({
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
          active ? 'font-semibold text-ink dark:text-ink-dark' : 'text-muted dark:text-muted-dark',
        ].join(' ')}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Empty({ scope }: { scope: 'following' | 'everyone' }) {
  return (
    <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
      <Text className="text-[17px] text-muted dark:text-muted-dark">
        {scope === 'following' ? 'Nobody you follow has posted.' : 'Nothing published yet.'}
      </Text>
      <Text className="pt-2 text-center text-[15px] text-faint dark:text-faint-dark">
        {scope === 'following'
          ? 'Switch to Everyone to find someone.'
          : 'Share a note, or write a post.'}
      </Text>
    </Animated.View>
  );
}
