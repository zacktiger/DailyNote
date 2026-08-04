import { isTextBlock, type Align, type Block } from '@dailynote/core';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { canAttachImages } from '@/lib/attachments';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';

/**
 * Formatting for the block the caret is in, sitting above the keyboard.
 *
 * It appears only while something is focused, and it says what the current
 * block *is* rather than offering a menu of everything possible -- the note is
 * the thing on screen, and this is a thin strip under it.
 */

const ALIGNMENTS: readonly Align[] = ['left', 'center', 'right'];

/** Which edge an alignment icon's short bars sit against. */
const ICON_EDGE: Record<Align, 'flex-start' | 'center' | 'flex-end'> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
};

export interface BlockToolbarProps {
  /** The focused block, or undefined when nothing is. */
  block: Block | undefined;
  onToggleBullet: () => void;
  onAlign: (align: Align) => void;
  onAddImage: () => void;
}

export function BlockToolbar({ block, onToggleBullet, onAlign, onAddImage }: BlockToolbarProps) {
  // Nothing to format when the caret is nowhere at all.
  if (block === undefined) return null;

  return (
    <Animated.View
      entering={motion.enterFade}
      exiting={motion.exit}
      className="flex-row items-center gap-1 border-t border-line/60 bg-paper px-3 py-2 dark:border-line-dark/60 dark:bg-paper-dark"
    >
      {isTextBlock(block) ? (
        <ToolbarButton active={block.type === 'bullet'} onPress={onToggleBullet}>
          <Text
            className={
              block.type === 'bullet'
                ? 'text-[13px] font-medium text-accent dark:text-accent-dark'
                : 'text-[13px] font-medium text-muted dark:text-muted-dark'
            }
          >
            •&nbsp;&nbsp;List
          </Text>
        </ToolbarButton>
      ) : null}

      {ALIGNMENTS.map((align) => (
        <ToolbarButton key={align} active={block.align === align} onPress={() => onAlign(align)}>
          <AlignIcon align={align} active={block.align === align} />
        </ToolbarButton>
      ))}

      {canAttachImages ? (
        <ToolbarButton active={false} onPress={onAddImage}>
          <PhotoIcon />
        </ToolbarButton>
      ) : null}
    </Animated.View>
  );
}

/** A frame with a horizon and a sun in it -- a picture, at 16 pixels. */
function PhotoIcon() {
  return (
    <View className="h-4 w-4 justify-end overflow-hidden rounded-[3px] border border-muted dark:border-muted-dark">
      <View className="absolute right-[2px] top-[2px] h-[3px] w-[3px] rounded-full bg-muted dark:bg-muted-dark" />
      <View className="h-[5px] w-full rounded-t-[4px] bg-muted dark:bg-muted-dark" />
    </View>
  );
}

/**
 * Three stacked bars, the short ones pushed to the edge the text will go to.
 *
 * Drawn rather than set in a font: the app ships no icon set, and the shape is
 * four rectangles.
 */
function AlignIcon({ align, active }: { align: Align; active: boolean }) {
  const bar = active
    ? 'h-[1.5px] rounded-full bg-accent dark:bg-accent-dark'
    : 'h-[1.5px] rounded-full bg-muted dark:bg-muted-dark';

  return (
    <View className="w-4 gap-[3px]" style={{ alignItems: ICON_EDGE[align] }}>
      <View className={`w-full ${bar}`} />
      <View className={`w-2/3 ${bar}`} />
      <View className={`w-full ${bar}`} />
      <View className={`w-2/3 ${bar}`} />
    </View>
  );
}

function ToolbarButton({
  children,
  active,
  onPress,
}: {
  children: ReactNode;
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
      {children}
    </Pressable>
  );
}
