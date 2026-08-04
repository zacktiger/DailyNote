import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import * as motion from '@/lib/motion';
import { useTheme } from '@/theme';

/**
 * The bottom sheet the Format and Add panels live in.
 *
 * Deliberately not @gorhom/bottom-sheet: neither panel is draggable or
 * snap-pointed in the reference -- they appear, you tap something, they go
 * away -- so a Modal with a slide transition is the whole requirement, and it
 * avoids a dependency that would need its own gesture plumbing.
 */
export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Tapping the scrim dismisses; the sheet itself swallows the press. */}
      <Pressable className="flex-1 justify-end" onPress={onClose}>
        <View className="absolute inset-0 bg-black/40" />

        <Animated.View
          entering={SlideInDown.duration(motion.ENTER_MS)}
          exiting={SlideOutDown.duration(motion.EXIT_MS)}
        >
          <Pressable onPress={(event) => event.stopPropagation()}>
            <View
              className="rounded-t-3xl bg-sheet dark:bg-sheet-dark"
              style={{ paddingBottom: insets.bottom + 12 }}
            >
              <View className="flex-row items-center justify-between px-5 pb-3 pt-5">
                <Text className="text-[22px] font-semibold text-ink dark:text-ink-dark">
                  {title}
                </Text>
                <Pressable
                  hitSlop={12}
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={`Close ${title}`}
                  className="h-9 w-9 items-center justify-center rounded-full bg-elevated active:opacity-60 dark:bg-elevated-dark"
                >
                  <Icon name="close" size={18} color={theme.muted} />
                </Pressable>
              </View>

              {children}
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

/** A square icon button on the sheet's elevated surface. */
export function SheetButton({
  icon,
  label,
  active = false,
  disabled = false,
  onPress,
  flex = true,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  flex?: boolean;
}) {
  const theme = useTheme();
  const tint = disabled ? theme.faint : active ? theme.accentInk : theme.ink;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      className={[
        flex ? 'flex-1' : '',
        'h-12 items-center justify-center rounded-xl active:opacity-60',
        active ? 'bg-accent dark:bg-accent-dark' : 'bg-elevated dark:bg-elevated-dark',
      ].join(' ')}
    >
      <Icon name={icon} size={22} color={tint} />
    </Pressable>
  );
}
