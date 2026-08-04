import * as AppleAuthentication from 'expo-apple-authentication';
import { useRouter } from 'expo-router';
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

import { Icon } from '@/components/icon';
import {
  canUseApple,
  canUseGoogle,
  EMAIL_PATTERN,
  sendEmailCode,
  signInWithApple,
  signInWithGoogle,
  verifyEmailCode,
  type AuthResult,
} from '@/lib/auth-providers';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { isAuthConfigured } from '@/lib/supabase';
import { useAuth } from '@/store/auth-store';
import { useSocial } from '@/store/social-store';
import { useTheme } from '@/theme';

/**
 * Signing in, which the app asks for exactly once and only to publish.
 *
 * You can write notes for years without seeing this screen. It is reached from
 * the Feed tab, by trying to post or to share a note -- never on launch, never
 * from the Notes tab, and never as a wall in front of reading the feed.
 *
 * On success it hands off to the handle screen if the account has no profile
 * yet, because an account and an identity are two separate things here: the
 * account is who you log in as, the handle is who other people see, and the
 * second is deliberately not derived from the first.
 */
export default function SignIn() {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { userId } = useAuth();
  const { me } = useSocial();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'google' | 'apple' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Where to go once there is a session.
   *
   * `replace`, not `push`: coming back to a sign-in screen you have already
   * satisfied, by way of the back gesture, is a dead end.
   */
  const onward = useCallback(() => {
    haptics.success();
    if (me === null) {
      router.replace('/handle');
    } else {
      goBack();
    }
  }, [me, router, goBack]);

  const run = useCallback(
    (which: 'google' | 'apple', attempt: () => Promise<AuthResult>) => {
      setError(null);
      setBusy(which);
      void (async () => {
        const result = await attempt();
        setBusy(null);
        if (result.ok) {
          onward();
        } else if (!result.cancelled) {
          setError(result.message);
        }
      })();
    },
    [onward],
  );

  const emailReady = EMAIL_PATTERN.test(email.trim());

  const send = useCallback(() => {
    if (!emailReady) return;
    setError(null);
    setBusy('email');
    void (async () => {
      const result = await sendEmailCode(email);
      setBusy(null);
      if (result.ok) {
        setSent(true);
      } else if (!result.cancelled) {
        setError(result.message);
      }
    })();
  }, [emailReady, email]);

  const verify = useCallback(() => {
    if (code.trim().length < 6) return;
    setError(null);
    setBusy('email');
    void (async () => {
      const result = await verifyEmailCode(email, code);
      setBusy(null);
      if (result.ok) {
        onward();
      } else if (!result.cancelled) {
        setError(result.message);
      }
    })();
  }, [code, email, onward]);

  if (userId !== null) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-canvas dark:bg-canvas-dark">
        <Text className="text-[17px] text-muted dark:text-muted-dark">You are signed in.</Text>
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
          <Icon name="close" size={22} color={theme.ink} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerClassName="px-5 pb-12" keyboardShouldPersistTaps="handled">
          <Text className="pt-2 text-[34px] font-bold leading-10 text-ink dark:text-ink-dark">
            Sign in to publish
          </Text>
          <Text className="pt-2 text-[15px] leading-5 text-muted dark:text-muted-dark">
            Your notes never needed an account and still do not. This is only for putting something
            where other people can read it.
          </Text>

          {!isAuthConfigured ? (
            <View className="mt-6 rounded-xl bg-card px-4 py-3.5 dark:bg-card-dark">
              <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">
                Not set up in this build
              </Text>
              <Text className="pt-1 text-[13px] leading-5 text-muted dark:text-muted-dark">
                No Supabase credentials were compiled in. Notes and reading the feed still work.
                See docs/auth.md.
              </Text>
            </View>
          ) : null}

          {error !== null ? (
            <View className="mt-6 rounded-xl bg-card px-4 py-3 dark:bg-card-dark">
              <Text className="text-[14px] leading-5" style={{ color: theme.accent }}>
                {error}
              </Text>
            </View>
          ) : null}

          {canUseGoogle ? (
            <ProviderButton
              icon="globe"
              label="Continue with Google"
              busy={busy === 'google'}
              disabled={busy !== null}
              onPress={() => run('google', signInWithGoogle)}
            />
          ) : null}

          {canUseApple ? (
            // Apple's own button, not a lookalike: guideline 4.8 and the brand
            // rules both require the real control at the real proportions.
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                theme.dark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={{ height: 52, marginTop: 12 }}
              onPress={() => run('apple', signInWithApple)}
            />
          ) : null}

          {/* --- the email escape hatch --- */}
          <View className="pt-7">
            <Text className="pb-1.5 text-[13px] font-medium text-muted dark:text-muted-dark">
              {sent ? 'Enter the code we sent' : 'Or use your email'}
            </Text>

            {sent ? (
              <>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="123456"
                  placeholderTextColor={theme.faint}
                  keyboardType="number-pad"
                  autoFocus
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={verify}
                  selectionColor={theme.accent}
                  className="rounded-xl bg-card px-4 py-3.5 text-[20px] tracking-[6px] text-ink web:outline-none dark:bg-card-dark dark:text-ink-dark"
                />
                <Text className="pt-2 text-[13px] text-faint dark:text-faint-dark">
                  Sent to {email.trim()}.
                </Text>

                <PrimaryButton
                  label="Verify"
                  busy={busy === 'email'}
                  disabled={code.trim().length < 6 || busy !== null}
                  onPress={verify}
                />
                <Pressable
                  onPress={() => {
                    setSent(false);
                    setCode('');
                  }}
                  accessibilityRole="button"
                  className="items-center pt-3 active:opacity-60"
                >
                  <Text className="text-[14px] text-muted dark:text-muted-dark">
                    Use a different address
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.faint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={send}
                  selectionColor={theme.accent}
                  className="rounded-xl bg-card px-4 py-3.5 text-[17px] text-ink web:outline-none dark:bg-card-dark dark:text-ink-dark"
                />
                <PrimaryButton
                  label="Send a code"
                  busy={busy === 'email'}
                  disabled={!emailReady || busy !== null}
                  onPress={send}
                />
                <Text className="pt-3 text-[13px] leading-5 text-faint dark:text-faint-dark">
                  Six digits, no password. Nothing to forget and nothing to leak.
                </Text>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ProviderButton({
  icon,
  label,
  busy,
  disabled,
  onPress,
}: {
  icon: 'globe';
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="mt-6 h-[52px] flex-row items-center justify-center gap-3 rounded-xl bg-card active:opacity-70 dark:bg-card-dark"
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.ink} />
      ) : (
        <>
          <Icon name={icon} size={20} color={theme.ink} />
          <Text className="text-[16px] font-semibold text-ink dark:text-ink-dark">{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function PrimaryButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className={[
        'mt-4 h-12 items-center justify-center rounded-xl active:opacity-70',
        disabled ? 'bg-elevated dark:bg-elevated-dark' : 'bg-accent dark:bg-accent-dark',
      ].join(' ')}
    >
      {busy ? (
        <ActivityIndicator size="small" color={theme.accentInk} />
      ) : (
        <Text
          className="text-[16px] font-semibold"
          style={{ color: disabled ? theme.faint : theme.accentInk }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
