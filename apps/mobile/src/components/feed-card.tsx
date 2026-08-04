import type { FeedItem, Profile } from '@dailynote/core';
import { feedEvent, feedEventLabel, feedPreview, feedTitle } from '@dailynote/core';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { sinceThen } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useTheme } from '@/theme';

/**
 * A person, at the size the feed draws them.
 *
 * Falls back to an initial on the accent rather than to a silhouette: an empty
 * avatar is the common case here, so it should look like a deliberate colour
 * choice and not like a missing image.
 */
export function Avatar({
  profile,
  size = 36,
}: {
  profile: Pick<Profile, 'handle' | 'displayName' | 'avatarUrl'>;
  size?: number;
}) {
  const theme = useTheme();
  const initial = (profile.displayName ?? profile.handle).trim().charAt(0).toUpperCase();

  if (profile.avatarUrl !== null) {
    return (
      <Image
        source={{ uri: profile.avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.elevated,
      }}
      className="items-center justify-center"
    >
      <Text style={{ fontSize: size * 0.42, color: theme.muted }} className="font-semibold">
        {initial}
      </Text>
    </View>
  );
}

/**
 * One thread in the feed.
 *
 * The line above the title is the whole design: it says what *happened*, not
 * when the note was written. A thread that came back six weeks later carrying
 * "followed through" is the thing this product has and other feeds do not, so
 * it gets the top line and its own colour.
 */
export function FeedCard({
  item,
  onLike,
  first = false,
  last = false,
}: {
  item: FeedItem;
  onLike?: () => void;
  first?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  const router = useRouter();

  const event = feedEvent(item);
  const preview = feedPreview(item);
  const name = item.displayName ?? `@${item.handle}`;
  const completed = event === 'followed-through';

  return (
    <View className="px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${feedEventLabel(event)}: ${feedTitle(item)}`}
        onPress={() => router.push({ pathname: '/post/[id]', params: { id: item.id } })}
        className={[
          'bg-card px-4 active:opacity-70 dark:bg-card-dark',
          first ? 'rounded-t-2xl pt-4' : 'pt-3.5',
          last ? 'rounded-b-2xl pb-3' : 'pb-3',
        ].join(' ')}
      >
        <View className="flex-row items-center gap-2.5">
          <Pressable
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${name}'s profile`}
            onPress={() =>
              router.push({ pathname: '/profile/[handle]', params: { handle: item.handle } })
            }
            className="active:opacity-60"
          >
            <Avatar profile={item} size={34} />
          </Pressable>

          <View className="flex-1">
            <Text numberOfLines={1} className="text-[15px] text-ink dark:text-ink-dark">
              <Text className="font-semibold">{name}</Text>
              <Text className="text-muted dark:text-muted-dark">
                {'  '}
                {feedEventLabel(event)}
              </Text>
            </Text>
            <Text className="pt-0.5 text-[13px] text-faint dark:text-faint-dark">
              @{item.handle} · {sinceThen(item.activeAt)}
            </Text>
          </View>

          {completed ? (
            <Icon name="followedThrough" size={19} color={theme.accent} />
          ) : null}
        </View>

        <Text
          numberOfLines={2}
          className="pt-3 font-serif text-[19px] leading-6 text-ink dark:text-ink-dark"
        >
          {feedTitle(item)}
        </Text>
        {preview.length > 0 ? (
          <Text numberOfLines={2} className="pt-1 text-[15px] leading-5 text-muted dark:text-muted-dark">
            {preview}
          </Text>
        ) : null}

        <View className="flex-row items-center gap-4 pt-3">
          <LikeButton item={item} onPress={onLike} />

          {item.updateCount > 0 ? (
            <Stat
              icon="thread"
              label={`${item.updateCount} ${item.updateCount === 1 ? 'update' : 'updates'}`}
            />
          ) : null}
          {item.viewCount > 0 ? <Stat icon="views" label={String(item.viewCount)} /> : null}
        </View>
      </Pressable>

      {!last ? <View className="mx-4 h-px bg-line dark:bg-line-dark" /> : null}
    </View>
  );
}

function LikeButton({ item, onPress }: { item: FeedItem; onPress?: (() => void) | undefined }) {
  const theme = useTheme();
  const tint = item.likedByMe ? theme.accent : theme.faint;

  return (
    <Pressable
      hitSlop={8}
      disabled={onPress === undefined}
      accessibilityRole="button"
      accessibilityLabel={item.likedByMe ? 'Remove like' : 'Like'}
      accessibilityState={{ selected: item.likedByMe }}
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      className="flex-row items-center gap-1.5 active:opacity-60"
    >
      <Icon name={item.likedByMe ? 'liked' : 'like'} size={17} color={tint} />
      {item.likeCount > 0 ? (
        <Text style={{ color: tint }} className="text-[13px]">
          {item.likeCount}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Stat({ icon, label }: { icon: 'thread' | 'views'; label: string }) {
  const theme = useTheme();
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon name={icon} size={16} color={theme.faint} />
      <Text className="text-[13px] text-faint dark:text-faint-dark">{label}</Text>
    </View>
  );
}
