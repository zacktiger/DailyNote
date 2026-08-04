import { isTextBlock, type Align, type Block } from '@dailynote/core';
import { Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Sheet, SheetButton } from '@/components/sheet';
import { canAttachImages } from '@/lib/attachments';
import { useTheme } from '@/theme';

const ALIGNMENTS: readonly { key: Align; icon: 'alignLeft' | 'alignCenter' | 'alignRight' }[] = [
  { key: 'left', icon: 'alignLeft' },
  { key: 'center', icon: 'alignCenter' },
  { key: 'right', icon: 'alignRight' },
];

export interface FormatSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The block the caret is in, or undefined when nothing is focused. */
  block: Block | undefined;
  onToggleBullet: () => void;
  onAlign: (align: Align) => void;
  onAddImage: () => void;
}

/**
 * The formatting panel.
 *
 * Every control reports what is applied to the focused block, so the sheet
 * doubles as a readout: opening it tells you what the line you are on already
 * is. What it offers is exactly what the block document can express -- bullets,
 * alignment and images -- rather than a menu of controls that would have
 * nowhere to be stored.
 */
export function FormatSheet({
  visible,
  onClose,
  block,
  onToggleBullet,
  onAlign,
  onAddImage,
}: FormatSheetProps) {
  const theme = useTheme();
  const text = block !== undefined && isTextBlock(block) ? block : undefined;

  return (
    <Sheet visible={visible} onClose={onClose} title="Format">
      <View className="flex-row gap-2 px-5 pb-2">
        <SheetButton
          icon="bulletList"
          label="Bullet list"
          active={text?.type === 'bullet'}
          disabled={text === undefined}
          onPress={onToggleBullet}
        />
        {ALIGNMENTS.map((option) => (
          <SheetButton
            key={option.key}
            icon={option.icon}
            label={`Align ${option.key}`}
            active={block?.align === option.key}
            disabled={block === undefined}
            onPress={() => onAlign(option.key)}
          />
        ))}
      </View>

      <View className="flex-row items-center gap-2 px-5 pb-2">
        <SheetButton
          icon="photos"
          label="Add photo"
          disabled={!canAttachImages}
          onPress={onAddImage}
          flex={false}
        />
        <Text className="flex-1 text-[13px] text-faint dark:text-faint-dark">
          {canAttachImages
            ? 'Add a photo from your library. Long-press one in the note to remove it.'
            : 'Photos need the phone; the web build has nowhere to keep them.'}
        </Text>
      </View>

      {block === undefined ? (
        <View className="flex-row items-center gap-2 px-5 pb-2 pt-1">
          <Icon name="edit" size={14} color={theme.faint} />
          <Text className="text-[13px] text-faint dark:text-faint-dark">
            Tap a line in the note to format it.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
