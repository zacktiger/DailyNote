import { composeFeed, profileName, type FeedItem, type Profile } from '@dailynote/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, FeedCard } from '@/components/feed-card';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * Somebody's published work, and nothing else.
 *
 * A profile shows only what its owner chose to make public -- there is no
 * private surface here to leak, because the private notes never left the
 * device that wrote them. On your own profile this is also the honest count of
 * what you have published, which is the number worth watching if you are
 * wondering whether the social layer is eating the notes app.
 */
export default function ProfileScreen() {
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const theme = useTheme();
  const goBack = useGoBack();
  const { me, items, following, blocked, repo, setFollowing, setBlocked, setLiked, updateMe } =
    useSocial();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [missing, setMissing] = useState(false);
  const [sheet, setSheet] = useState<'more' | 'edit' | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const found = await repo.profileByHandle(handle);
      if (!active) return;
      setProfile(found);
      setMissing(found === null);
      if (found !== null) setCounts(await repo.followCounts(found.id));
    })();
    return () => {
      active = false;
    };
    // `items` is in the deps so the follower count refreshes after a follow,
    // which is the only thing on this screen that changes underneath it.
  }, [repo, handle, items, following]);

  const like = useCallback(
    (item: FeedItem) => {
      void setLiked(item.id, !item.likedByMe);
    },
    [setLiked],
  );

  if (missing) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">No such handle.</Text>
        <Pressable onPress={goBack} className="mt-4 active:opacity-60">
          <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (profile === null) {
    return <View className="flex-1 bg-canvas dark:bg-canvas-dark" />;
  }

  const mine = me?.id === profile.id;
  const followed = following.has(profile.id);
  const isBlocked = blocked.has(profile.id);
  const published = composeFeed(
    items.filter((item) => item.authorId === profile.id),
    { blocked: mine ? undefined : blocked },
  );

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-2 pb-1 pt-1">
        <ToolbarIcon name="back" label="Back" onPress={goBack} />
        <View className="flex-1" />
        <ToolbarIcon name="overflow" label="More" onPress={() => setSheet('more')} />
      </View>

      <ScrollView contentContainerClassName="pb-24">
        <View className="items-center px-6 pb-5 pt-2">
          <Avatar profile={profile} size={76} />
          <Text className="pt-3 text-[22px] font-bold text-ink dark:text-ink-dark">
            {profileName(profile)}
          </Text>
          <Text className="pt-0.5 text-[15px] text-muted dark:text-muted-dark">
            @{profile.handle}
          </Text>
          {profile.bio !== null && profile.bio.trim().length > 0 ? (
            <Text className="px-4 pt-3 text-center text-[15px] leading-5 text-ink dark:text-ink-dark">
              {profile.bio}
            </Text>
          ) : null}

          <View className="flex-row gap-6 pt-4">
            <Count value={published.length} label={published.length === 1 ? 'thread' : 'threads'} />
            <Count
              value={counts.followers}
              label={counts.followers === 1 ? 'follower' : 'followers'}
            />
            <Count value={counts.following} label="following" />
          </View>

          <View className="pt-5">
            {mine ? (
              <Pressable
                onPress={() => setSheet('edit')}
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                className="h-10 justify-center rounded-full bg-elevated px-6 active:opacity-70 dark:bg-elevated-dark"
              >
                <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
                  Edit profile
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  haptics.tap();
                  void setFollowing(profile.id, !followed);
                }}
                disabled={isBlocked}
                accessibilityRole="button"
                accessibilityLabel={followed ? 'Unfollow' : 'Follow'}
                accessibilityState={{ selected: followed, disabled: isBlocked }}
                className={[
                  'h-10 justify-center rounded-full px-8 active:opacity-70',
                  followed || isBlocked
                    ? 'bg-elevated dark:bg-elevated-dark'
                    : 'bg-accent dark:bg-accent-dark',
                ].join(' ')}
              >
                <Text
                  className="text-[15px] font-semibold"
                  style={{ color: followed || isBlocked ? theme.muted : theme.accentInk }}
                >
                  {isBlocked ? 'Blocked' : followed ? 'Following' : 'Follow'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {published.length === 0 ? (
          <Text className="px-10 pt-8 text-center text-[15px] text-faint dark:text-faint-dark">
            {mine ? 'You have not published anything yet.' : 'Nothing published yet.'}
          </Text>
        ) : (
          published.map((item, index) => (
            <FeedCard
              key={item.id}
              item={item}
              onLike={() => like(item)}
              first={index === 0}
              last={index === published.length - 1}
            />
          ))
        )}
      </ScrollView>

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="Profile">
        <View className="pb-2">
          {mine ? (
            <MenuRow icon="edit" label="Edit profile" onPress={() => setSheet('edit')} />
          ) : (
            <MenuRow
              icon="block"
              label={isBlocked ? `Unblock @${profile.handle}` : `Block @${profile.handle}`}
              destructive={!isBlocked}
              onPress={() => {
                setSheet(null);
                if (isBlocked) {
                  void setBlocked(profile.id, false);
                  return;
                }
                Alert.alert(
                  `Block @${profile.handle}?`,
                  'You will not see each other. This also unfollows.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Block',
                      style: 'destructive',
                      onPress: () => void setBlocked(profile.id, true),
                    },
                  ],
                );
              }}
            />
          )}
        </View>
      </Sheet>

      <EditSheet
        visible={sheet === 'edit'}
        profile={profile}
        onClose={() => setSheet(null)}
        onSave={async (patch) => {
          await updateMe(patch);
          setProfile(await repo.profileByHandle(handle));
          setSheet(null);
        }}
      />
    </SafeAreaView>
  );
}

function EditSheet({
  visible,
  profile,
  onClose,
  onSave,
}: {
  visible: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (patch: { displayName: string | null; bio: string | null }) => Promise<void>;
}) {
  const theme = useTheme();
  const [name, setName] = useState(profile.displayName ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');

  // Re-seeded each time the sheet opens, so a cancelled edit does not sit in
  // the fields waiting to reappear. Adjusted during render rather than in an
  // effect: an effect would paint the stale values for a frame first.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(profile.displayName ?? '');
      setBio(profile.bio ?? '');
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Edit profile">
      <View className="gap-3 px-5 pb-4">
        <Field label="Display name" value={name} onChange={setName} placeholder={profile.handle} />
        <Field
          label="Bio"
          value={bio}
          onChange={setBio}
          placeholder="A line about you"
          multiline
        />

        <Pressable
          onPress={() => {
            haptics.tap();
            void onSave({
              displayName: name.trim().length > 0 ? name.trim() : null,
              bio: bio.trim().length > 0 ? bio.trim() : null,
            });
          }}
          accessibilityRole="button"
          accessibilityLabel="Save profile"
          className="mt-1 h-12 items-center justify-center rounded-xl bg-accent active:opacity-70 dark:bg-accent-dark"
        >
          <Text className="text-[15px] font-semibold" style={{ color: theme.accentInk }}>
            Save
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View>
      <Text className="pb-1.5 text-[13px] font-medium text-muted dark:text-muted-dark">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.faint}
        multiline={multiline}
        selectionColor={theme.accent}
        className={[
          'rounded-xl bg-elevated px-4 py-3 text-[15px] text-ink web:outline-none dark:bg-elevated-dark dark:text-ink-dark',
          multiline ? 'min-h-20' : '',
        ].join(' ')}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

function Count({ value, label }: { value: number; label: string }) {
  return (
    <View className="items-center">
      <Text className="text-[17px] font-bold text-ink dark:text-ink-dark">{value}</Text>
      <Text className="text-[13px] text-muted dark:text-muted-dark">{label}</Text>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  destructive = false,
  onPress,
}: {
  icon: IconName;
  label: string;
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
      <Text className="flex-1 text-[16px]" style={{ color: tint }}>
        {label}
      </Text>
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
