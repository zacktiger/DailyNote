import { isTextBlock, type Block } from '@dailynote/core';
import { Pressable, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';

/**
 * Formatting for the block the caret is in, sitting above the keyboard.
 *
 * It appears only while something is focused, and it says what the current
 * block *is* rather than offering a menu of everything possible -- the note is
 * the thing on screen, and this is a thin strip under it.
 */

export interface BlockToolbarProps {
  /** The focused block, or undefined when nothing is. */
  block: Block | undefined;
  onToggleBullet: () => void;
}

export function BlockToolbar({ block, onToggleBullet }: BlockToolbarProps) {
  // Nothing to format when the caret is nowhere, or sitting on an image.
  if (block === undefined || !isTextBlock(block)) return null;

  return (
    <Animated.View
      entering={motion.enterFade}
      exiting={motion.exit}
      className="flex-row items-center gap-1 border-t border-line/60 bg-paper px-3 py-2 dark:border-line-dark/60 dark:bg-paper-dark"
    >
      <ToolbarButton label="•  List" active={block.type === 'bullet'} onPress={onToggleBullet} />
    </Animated.View>
  );
}

function ToolbarButton({
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
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      hitSlop={6}
      className={
        active
          ? 'rounded-full bg-accent/10 px-3 py-1.5 active:opacity-60 dark:bg-accent-dark/15'
          : 'rounded-full px-3 py-1.5 active:opacity-60'
      }
    >
      <Text
        className={
          active
            ? 'text-[13px] font-medium text-accent dark:text-accent-dark'
            : 'text-[13px] font-medium text-muted dark:text-muted-dark'
        }
      >
        {label}
      </Text>
    </Pressable>
  );
}
