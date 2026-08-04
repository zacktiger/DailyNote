import { handleError, normalizeHandle } from '@dailynote/core';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
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

import { Icon } from '@/components/icon';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useAuth } from '@/store/auth-store';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * Claiming a handle: the one moment the app asks for an identity.
 *
 * It sits behind the Feed tab and nothing on the notes side ever routes here.
 * A person can use this app for years without seeing this screen, and the copy
 * says so rather than implying they are missing out.
 */
export default function ClaimHandle() {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { me, claim } = useSocial();
  const { userId } = useAuth();

  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [taken, setTaken] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

  const normalized = normalizeHandle(handle);
  // Validation is shown only once there is enough typed to be worth judging;
  // telling somebody their handle is too short at one character is nagging.
  const problem = useMemo(
    () => (normalized.length === 0 ? null : handleError(normalized)),
    [normalized],
  );
  const error = taken ?? problem;
  const ready = normalized.length > 0 && problem === null && !claiming;

  const submit = useCallback(() => {
    if (!ready) return;
    setTaken(null);
    setClaiming(true);
    void (async () => {
      const failure = await claim(normalized, name);
      setClaiming(false);
      if (failure !== null) {
        setTaken(failure);
        return;
      }
      haptics.success();
      router.replace({ pathname: '/profile/[handle]', params: { handle: normalized } });
    })();
  }, [ready, claim, normalized, name, router]);

  // Reachable by deep link, or by signing out with this screen still on the
  // stack. A handle belongs to an account, so there is nothing to claim yet.
  if (userId === null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">Sign in first.</Text>
        <Pressable
          onPress={() => router.replace('/sign-in')}
          className="mt-4 active:opacity-60"
          accessibilityRole="button"
        >
          <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Sign in</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (me !== null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">
          You are already @{me.handle}.
        </Text>
        <Pressable onPress={goBack} className="mt-4 active:opacity-60">
          <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-2 pb-1 pt-1">
        <Pressable
          hitSlop={8}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="back" size={22} color={theme.ink} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
          <Text className="pt-2 text-[34px] font-bold leading-10 text-ink dark:text-ink-dark">
            Pick a handle
          </Text>
          <Text className="pt-2 text-[15px] leading-5 text-muted dark:text-muted-dark">
            It goes on the things you publish. Your notes stay private either way — nothing
            already written moves.
          </Text>

          <View className="pt-7">
            <Text className="pb-1.5 text-[13px] font-medium text-muted dark:text-muted-dark">
              Handle
            </Text>
            <View
              className={[
                'flex-row items-center rounded-xl bg-card px-4 dark:bg-card-dark',
                error !== null ? 'border border-accent dark:border-accent-dark' : '',
              ].join(' ')}
            >
              <Text className="text-[17px] text-faint dark:text-faint-dark">@</Text>
              <TextInput
                value={handle}
                onChangeText={(next) => {
                  setTaken(null);
                  setHandle(next);
                }}
                placeholder="yourname"
                placeholderTextColor={theme.faint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={submit}
                selectionColor={theme.accent}
                className="flex-1 py-3.5 text-[17px] text-ink web:outline-none dark:text-ink-dark"
              />
            </View>
            <Text
              className="pt-2 text-[13px]"
              style={{ color: error !== null ? theme.accent : theme.faint }}
            >
              {error ?? 'Letters, numbers and underscores. 3 to 30 characters.'}
            </Text>
          </View>

          <View className="pt-5">
            <Text className="pb-1.5 text-[13px] font-medium text-muted dark:text-muted-dark">
              Display name (optional)
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="What people should call you"
              placeholderTextColor={theme.faint}
              maxLength={50}
              selectionColor={theme.accent}
              className="rounded-xl bg-card px-4 py-3.5 text-[17px] text-ink web:outline-none dark:bg-card-dark dark:text-ink-dark"
            />
          </View>

          <Pressable
            onPress={submit}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityLabel="Claim handle"
            accessibilityState={{ disabled: !ready }}
            className={[
              'mt-7 h-12 items-center justify-center rounded-xl active:opacity-70',
              ready ? 'bg-accent dark:bg-accent-dark' : 'bg-elevated dark:bg-elevated-dark',
            ].join(' ')}
          >
            {claiming ? (
              <ActivityIndicator size="small" color={theme.accentInk} />
            ) : (
              <Text
                className="text-[16px] font-semibold"
                style={{ color: ready ? theme.accentInk : theme.faint }}
              >
                Claim @{normalized.length > 0 ? normalized : 'handle'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
