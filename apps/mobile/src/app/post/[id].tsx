import { feedEvent, feedEventLabel, feedTitle, publicUrl, REPORT_REASONS } from '@dailynote/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/feed-card';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { relativeDay } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * Reading one published thread.
 *
 * The body is rendered from its plain-text projection rather than from the
 * block document: a public thread has to read well in a browser eventually
 * (plan-rollout-2 R2.1), and keeping one renderer honest is easier than keeping
 * two in step. Rich rendering arrives with the web surface, for both at once.
 */
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const {
    me,
    items,
    following,
    setLiked,
    setFollowing,
    setBlocked,
    report,
    recordView,
    unshare,
  } = useSocial();

  const item = useMemo(() => items.find((candidate) => candidate.id === id) ?? null, [items, id]);
  const [sheet, setSheet] = useState<'more' | 'report' | null>(null);

  // Counted once per opening, not once per render. A view is someone arriving,
  // and a re-render is not that.
  const counted = useRef(false);
  useEffect(() => {
    if (item === null || counted.current) return;
    counted.current = true;
    void recordView(item.id);
  }, [item, recordView]);

  const share = useCallback(() => {
    if (item === null) return;
    const url = publicUrl(item.handle, item.slug);
    void Share.share({ message: url, url });
  }, [item]);

  const confirmBlock = useCallback(() => {
    if (item === null) return;
    setSheet(null);
    Alert.alert(`Block @${item.handle}?`, 'You will not see each other. This also unfollows.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block',
        style: 'destructive',
        onPress: () => {
          void setBlocked(item.authorId, true);
          goBack();
        },
      },
    ]);
  }, [item, setBlocked, goBack]);

  const confirmUnshare = useCallback(() => {
    if (item === null) return;
    setSheet(null);
    Alert.alert('Remove from the feed?', 'The note stays. The public copy goes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void unshare(item.id);
          goBack();
        },
      },
    ]);
  }, [item, unshare, goBack]);

  const file = useCallback(
    (reason: string) => {
      if (item === null) return;
      setSheet(null);
      void report(item.id, reason);
      haptics.success();
      // No queue to show and no promise about when: guideline 1.2 puts a
      // 24-hour commitment on a person, so the copy promises a look, not a
      // verdict.
      Alert.alert('Reported', 'Thanks. We look at every report.');
    },
    [item, report],
  );

  if (item === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">This is gone.</Text>
        <Pressable onPress={goBack} className="mt-4 active:opacity-60">
          <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const mine = me?.id === item.authorId;
  const followed = following.has(item.authorId);
  const name = item.displayName ?? `@${item.handle}`;
  const event = feedEvent(item);
  const lines = item.body.split('\n').slice(1);

  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-paper-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-2 pb-1 pt-1">
        <ToolbarIcon name="back" label="Back" onPress={goBack} />
        <View className="flex-1" />
        <ToolbarIcon name="share" label="Share link" onPress={share} />
        <ToolbarIcon name="overflow" label="More" onPress={() => setSheet('more')} />
      </View>

      <ScrollView contentContainerClassName="pb-16">
        <View className="flex-row items-center gap-3 px-5 pb-4 pt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name}'s profile`}
            onPress={() =>
              router.push({ pathname: '/profile/[handle]', params: { handle: item.handle } })
            }
            className="active:opacity-60"
          >
            <Avatar profile={item} size={44} />
          </Pressable>

          <View className="flex-1">
            <Text numberOfLines={1} className="text-[16px] font-semibold text-ink dark:text-ink-dark">
              {name}
            </Text>
            <Text className="pt-0.5 text-[13px] text-muted dark:text-muted-dark">
              @{item.handle} · {feedEventLabel(event)} {relativeDay(item.activeAt).toLowerCase()}
            </Text>
          </View>

          {!mine ? (
            <Pressable
              onPress={() => {
                haptics.tap();
                void setFollowing(item.authorId, !followed);
              }}
              accessibilityRole="button"
              accessibilityLabel={followed ? `Unfollow @${item.handle}` : `Follow @${item.handle}`}
              accessibilityState={{ selected: followed }}
              className={[
                'h-9 justify-center rounded-full px-4 active:opacity-70',
                followed ? 'bg-elevated dark:bg-elevated-dark' : 'bg-accent dark:bg-accent-dark',
              ].join(' ')}
            >
              <Text
                className="text-[14px] font-semibold"
                style={{ color: followed ? theme.muted : theme.accentInk }}
              >
                {followed ? 'Following' : 'Follow'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {event === 'followed-through' ? (
          // The badge the whole product argues for. It is the only thing on
          // this screen drawn in the accent that is not a control.
          <View className="mx-5 mb-4 flex-row items-center gap-2 rounded-xl bg-elevated px-4 py-2.5 dark:bg-elevated-dark">
            <Icon name="followedThrough" size={18} color={theme.accent} />
            <Text className="text-[14px] font-medium text-ink dark:text-ink-dark">
              Followed through
            </Text>
          </View>
        ) : null}

        <Text className="px-5 font-serif-medium text-[30px] leading-9 text-ink dark:text-ink-dark">
          {feedTitle(item)}
        </Text>

        <View className="px-5 pt-4">
          {lines.map((line, index) => (
            <Text
              // Lines have no ids and may repeat, so the index is the only
              // stable key available; the list never reorders.
              key={index}
              className="pb-2 font-serif text-[18px] leading-7 text-ink dark:text-ink-dark"
            >
              {line}
            </Text>
          ))}
        </View>

        <View className="mx-5 mt-4 flex-row items-center gap-5 border-t border-line pt-4 dark:border-line-dark">
          <Pressable
            hitSlop={8}
            onPress={() => {
              haptics.tap();
              void setLiked(item.id, !item.likedByMe);
            }}
            accessibilityRole="button"
            accessibilityLabel={item.likedByMe ? 'Remove like' : 'Like'}
            accessibilityState={{ selected: item.likedByMe }}
            className="flex-row items-center gap-2 active:opacity-60"
          >
            <Icon
              name={item.likedByMe ? 'liked' : 'like'}
              size={20}
              color={item.likedByMe ? theme.accent : theme.muted}
            />
            <Text
              className="text-[14px]"
              style={{ color: item.likedByMe ? theme.accent : theme.muted }}
            >
              {item.likeCount > 0 ? item.likeCount : 'Like'}
            </Text>
          </Pressable>

          <View className="flex-row items-center gap-2">
            <Icon name="views" size={18} color={theme.faint} />
            <Text className="text-[14px] text-faint dark:text-faint-dark">{item.viewCount}</Text>
          </View>
        </View>

        <Text className="px-5 pt-5 text-[13px] text-faint dark:text-faint-dark">
          {publicUrl(item.handle, item.slug)}
        </Text>
      </ScrollView>

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="Thread">
        <View className="pb-2">
          <MenuRow icon="link" label="Share link" onPress={() => {
            setSheet(null);
            share();
          }} />
          {mine ? (
            <MenuRow
              icon="trash"
              label="Remove from the feed"
              detail="The note stays in your library"
              destructive
              onPress={confirmUnshare}
            />
          ) : (
            <>
              <MenuRow
                icon={followed ? 'following' : 'follow'}
                label={followed ? `Unfollow @${item.handle}` : `Follow @${item.handle}`}
                onPress={() => {
                  setSheet(null);
                  void setFollowing(item.authorId, !followed);
                }}
              />
              <MenuRow icon="report" label="Report" onPress={() => setSheet('report')} />
              <MenuRow
                icon="block"
                label={`Block @${item.handle}`}
                destructive
                onPress={confirmBlock}
              />
            </>
          )}
        </View>
      </Sheet>

      <Sheet visible={sheet === 'report'} onClose={() => setSheet(null)} title="Report">
        <View className="pb-2">
          {REPORT_REASONS.map((reason) => (
            <MenuRow key={reason} icon="report" label={reason} onPress={() => file(reason)} />
          ))}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  destructive = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = destructive ? theme.muted : theme.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-4 px-5 py-3.5 active:opacity-60"
    >
      <Icon name={icon} size={22} color={tint} />
      <View className="flex-1">
        <Text className="text-[16px]" style={{ color: tint }}>
          {label}
        </Text>
        {detail !== undefined ? (
          <Text className="pt-0.5 text-[13px] text-faint dark:text-faint-dark">{detail}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ToolbarIcon({
  name,
  label,
  onPress,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
    >
      <Icon name={name} size={22} color={theme.ink} />
    </Pressable>
  );
}
