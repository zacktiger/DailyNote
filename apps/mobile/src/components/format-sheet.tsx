import {
  blockStyleAt,
  hasInlineMark,
  listStyleAt,
  type Align,
  type BlockStyle,
  type Edit,
  type InlineMark,
  type ListStyle,
  type Selection,
} from '@dailynote/core';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Sheet, SheetButton } from '@/components/sheet';
import { useTheme } from '@/theme';

/** The style chips, in the reference's order. */
const STYLES: readonly { key: BlockStyle; label: string; size: number; weight: '400' | '600' | '700' }[] = [
  { key: 'title', label: 'Title', size: 26, weight: '700' },
  { key: 'subtitle', label: 'Subtitle', size: 21, weight: '700' },
  { key: 'heading', label: 'Heading', size: 17, weight: '600' },
  { key: 'body', label: 'Body', size: 16, weight: '400' },
  { key: 'note', label: 'Note', size: 14, weight: '400' },
];

const MARKS: readonly { key: InlineMark; icon: 'bold' | 'italic' | 'underline' | 'strikethrough' }[] = [
  { key: 'bold', icon: 'bold' },
  { key: 'italic', icon: 'italic' },
  { key: 'underline', icon: 'underline' },
  { key: 'strikethrough', icon: 'strikethrough' },
];

const LISTS: readonly { key: ListStyle; icon: 'bulletList' | 'numberedList' | 'checklist' }[] = [
  { key: 'bullet', icon: 'bulletList' },
  { key: 'numbered', icon: 'numberedList' },
  { key: 'checklist', icon: 'checklist' },
];

const ALIGNMENTS: readonly { key: Align; icon: 'alignLeft' | 'alignCenter' | 'alignRight' }[] = [
  { key: 'left', icon: 'alignLeft' },
  { key: 'center', icon: 'alignCenter' },
  { key: 'right', icon: 'alignRight' },
];

export interface FormatSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The body being edited, and the current selection within it. */
  text: string;
  selection: Selection;
  /** Applies a transform's result back to the editor. */
  onEdit: (edit: Edit) => void;
  align: Align;
  onAlign: (align: Align) => void;
  onBlockStyle: (style: BlockStyle) => void;
  onList: (list: ListStyle) => void;
  onMark: (mark: InlineMark) => void;
  onIndent: (delta: number) => void;
}

/**
 * The formatting panel.
 *
 * Every control reports what is currently applied at the caret, so the sheet
 * doubles as a readout: opening it tells you what the line you are on already
 * is. Alignment is whole-note rather than per-line because a TextInput has one
 * `textAlign` for all of its content.
 */
export function FormatSheet({
  visible,
  onClose,
  text,
  selection,
  align,
  onAlign,
  onBlockStyle,
  onList,
  onMark,
  onIndent,
}: FormatSheetProps) {
  const theme = useTheme();
  const currentStyle = blockStyleAt(text, selection);
  const currentList = listStyleAt(text, selection);

  return (
    <Sheet visible={visible} onClose={onClose} title="Format">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="items-center gap-2 px-5 pb-4"
      >
        {STYLES.map((style) => {
          const active = currentStyle === style.key;
          return (
            <Pressable
              key={style.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onBlockStyle(style.key)}
              className={[
                'justify-center rounded-xl px-4 py-2 active:opacity-60',
                active ? 'bg-accent dark:bg-accent-dark' : '',
              ].join(' ')}
            >
              <Text
                style={{
                  fontSize: style.size,
                  fontWeight: style.weight,
                  color: active ? theme.accentInk : theme.ink,
                }}
              >
                {style.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="flex-row gap-2 px-5 pb-2">
        {MARKS.map((mark) => (
          <SheetButton
            key={mark.key}
            icon={mark.icon}
            label={mark.key}
            active={hasInlineMark(text, selection, mark.key)}
            onPress={() => onMark(mark.key)}
          />
        ))}
      </View>

      <View className="flex-row gap-2 px-5 pb-2">
        {LISTS.map((list) => (
          <SheetButton
            key={list.key}
            icon={list.icon}
            label={`${list.key} list`}
            active={currentList === list.key}
            onPress={() => onList(list.key)}
          />
        ))}
        <SheetButton icon="indent" label="Indent" onPress={() => onIndent(1)} />
        <SheetButton icon="outdent" label="Outdent" onPress={() => onIndent(-1)} />
      </View>

      <View className="flex-row items-center gap-2 px-5 pb-2">
        {ALIGNMENTS.map((option) => (
          <SheetButton
            key={option.key}
            icon={option.icon}
            label={`Align ${option.key}`}
            active={align === option.key}
            onPress={() => onAlign(option.key)}
          />
        ))}
        <View className="flex-1 flex-row items-center justify-end gap-2">
          <Icon name="highlight" size={20} color={theme.faint} />
          <Text className="text-[13px] text-faint dark:text-faint-dark">
            Highlight not yet available
          </Text>
        </View>
      </View>
    </Sheet>
  );
}
