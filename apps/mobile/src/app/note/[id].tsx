import {
  applyBlockStyle,
  applyListStyle,
  changeIndent,
  characterCount,
  continueList,
  toggleInlineMark,
  type Align,
  type BlockStyle,
  type Edit,
  type InlineMark,
  type ListStyle,
  type Note,
  type Selection,
} from '@dailynote/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormatSheet } from '@/components/format-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Sheet, SheetButton } from '@/components/sheet';
import { editedAt } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useHistory } from '@/lib/undo';
import { useNotebooks } from '@/store/notebooks-store';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/** How long after the last keystroke the note is written to SQLite. */
const AUTOSAVE_MS = 800;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, loading } = useNotes();

  const note = useMemo(
    () => notes.find((candidate) => candidate.id === id) ?? null,
    [notes, id],
  );

  if (id !== 'new' && note === null) {
    // Still loading is not the same as gone, and rendering "gone" over a note
    // that is about to appear is worse than rendering nothing for a frame.
    return loading ? <View className="flex-1 bg-paper dark:bg-paper-dark" /> : <Missing />;
  }

  // Keyed so the draft initialises from the stored body exactly once. Store
  // refreshes must never clobber what is being typed.
  return <Editor key={id} note={note} />;
}

function Missing() {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
      <Text className="text-[17px] text-muted dark:text-muted-dark">This note is gone.</Text>
      <Pressable onPress={() => router.back()} className="mt-4 active:opacity-60">
        <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Go back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/**
 * The note editor.
 *
 * The title is the body's first line rather than a separate column, which is
 * what keeps `deriveTitle` honest -- renaming the note and editing its first
 * line are the same act. The two TextInputs are a presentation split over one
 * string, joined on every keystroke.
 */
function Editor({ note }: { note: Note | null }) {
  const theme = useTheme();
  const router = useRouter();
  const { create, setBody, softDelete, promote, move, togglePin, setLocked } = useNotes();
  const { notebooks, find } = useNotebooks();

  const stored = note?.body ?? '';
  const [title, setTitle] = useState(() => stored.split('\n')[0] ?? '');
  const history = useHistory(stored.split('\n').slice(1).join('\n'));
  const [align, setAlign] = useState<Align>('left');

  const [selection, setSelection] = useState<Selection>({ start: 0, end: 0 });
  const [pending, setPending] = useState<Selection | null>(null);
  const [sheet, setSheet] = useState<'format' | 'add' | 'more' | 'notebook' | null>(null);

  const bodyRef = useRef<TextInput>(null);
  // The id is only known after the first save for a brand new note.
  const noteId = useRef<string | null>(note?.id ?? null);
  const savedRef = useRef(stored);
  const [editedIso, setEditedIso] = useState(note?.updatedAt ?? new Date().toISOString());

  const body = history.value;
  const composed = useMemo(
    () => (body.length > 0 ? `${title}\n${body}` : title),
    [title, body],
  );

  const notebook = find(note?.notebookId ?? null);
  const count = characterCount(composed);

  // --- persistence ---------------------------------------------------------

  const persist = useCallback(
    async (text: string) => {
      if (text === savedRef.current) return;
      if (text.trim().length === 0 && noteId.current === null) return;

      savedRef.current = text;
      if (noteId.current === null) {
        // A new note is not written until it has content, so backing out of an
        // empty editor leaves nothing behind.
        const created = await create(text);
        noteId.current = created.id;
      } else {
        await setBody(noteId.current, text);
      }
      setEditedIso(new Date().toISOString());
    },
    [create, setBody],
  );

  // Debounced autosave. There is no Save button in the reference and there is
  // none here: leaving the screen is what commits, and this covers a crash.
  useEffect(() => {
    const timer = setTimeout(() => void persist(composed), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [composed, persist]);

  // Tracked in a ref so the unmount flush below can read the latest text
  // without re-subscribing -- an unmount cleanup that depended on `composed`
  // would fire on every keystroke instead of on the way out.
  const composedRef = useRef(composed);
  useEffect(() => {
    composedRef.current = composed;
  }, [composed]);

  useEffect(() => {
    // Flush on unmount, so backing out never loses the last few characters.
    return () => {
      void persist(composedRef.current);
    };
  }, [persist]);

  // --- editing -------------------------------------------------------------

  /** Applies a transform, recording it as its own undo step. */
  const apply = useCallback(
    (edit: Edit | null) => {
      if (edit === null) return;
      history.set(edit.text, edit.selection, { discrete: true });
      setSelection(edit.selection);
      setPending(edit.selection);
    },
    [history],
  );

  const onChangeBody = useCallback(
    (next: string) => {
      const previous = history.value;

      // Enter inside a list continues it. Detected by diffing rather than
      // onKeyPress, which does not fire reliably for Enter on Android.
      if (next.length === previous.length + 1) {
        const at = selection.start;
        const isNewlineHere =
          next[at] === '\n' &&
          next.slice(0, at) === previous.slice(0, at) &&
          next.slice(at + 1) === previous.slice(at);

        if (isNewlineHere) {
          const continued = continueList(previous, { start: at, end: at });
          if (continued !== null) {
            apply(continued);
            return;
          }
        }
      }

      history.set(next, selection);
    },
    [history, selection, apply],
  );

  const onSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(event.nativeEvent.selection);
      // Release the controlled selection once the input has honoured it, so
      // it does not fight the caret on the next keystroke.
      setPending(null);
    },
    [],
  );

  const undo = useCallback(() => {
    const entry = history.undo();
    if (entry !== null) {
      setSelection(entry.selection);
      setPending(entry.selection);
      haptics.tap();
    }
  }, [history]);

  const redo = useCallback(() => {
    const entry = history.redo();
    if (entry !== null) {
      setSelection(entry.selection);
      setPending(entry.selection);
      haptics.tap();
    }
  }, [history]);

  const onBlockStyle = useCallback(
    (style: BlockStyle) => apply(applyBlockStyle(history.value, selection, style)),
    [apply, history.value, selection],
  );
  const onList = useCallback(
    (list: ListStyle) => apply(applyListStyle(history.value, selection, list)),
    [apply, history.value, selection],
  );
  const onMark = useCallback(
    (mark: InlineMark) => apply(toggleInlineMark(history.value, selection, mark)),
    [apply, history.value, selection],
  );
  const onIndent = useCallback(
    (delta: number) => apply(changeIndent(history.value, selection, delta)),
    [apply, history.value, selection],
  );

  /** The checklist button on the main toolbar, as in the reference. */
  const toggleChecklist = useCallback(() => {
    haptics.tap();
    onList('checklist');
    bodyRef.current?.focus();
  }, [onList]);

  // --- actions -------------------------------------------------------------

  const done = useCallback(async () => {
    haptics.tap();
    await persist(composed);
    router.back();
  }, [persist, composed, router]);

  const confirmDelete = useCallback(() => {
    setSheet(null);
    Alert.alert('Delete this note?', 'You can restore it from Recently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            haptics.tap();
            // Nothing to delete if it was never saved.
            savedRef.current = composed;
            if (noteId.current !== null) await softDelete(noteId.current);
            router.back();
          })();
        },
      },
    ]);
  }, [softDelete, router, composed]);

  const requireSaved = useCallback(async () => {
    await persist(composed);
    return noteId.current;
  }, [persist, composed]);

  return (
    <SafeAreaView className="flex-1 bg-paper dark:bg-paper-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center px-2 pb-1 pt-1">
        <ToolbarIcon name="back" label="Back" onPress={() => void done()} />

        <View className="flex-1 flex-row items-center justify-center gap-4">
          <ToolbarIcon name="undo" label="Undo" onPress={undo} disabled={!history.canUndo} />
          <ToolbarIcon name="redo" label="Redo" onPress={redo} disabled={!history.canRedo} />
        </View>

        <ToolbarIcon name="overflow" label="More" onPress={() => setSheet('more')} />
        <ToolbarIcon name="done" label="Done" onPress={() => void done()} />
      </View>

      <View className="border-b border-line px-5 pb-2.5 dark:border-line-dark">
        <Text className="text-[13px] text-muted dark:text-muted-dark">
          {editedAt(editedIso)}
          {count > 0 ? `  |  ${count}` : ''}
          {`  |  ${notebook?.name ?? 'Default notebook'}`}
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="pb-12"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Heading"
            placeholderTextColor={theme.faint}
            selectionColor={theme.accent}
            cursorColor={theme.accent}
            multiline
            textAlign={align}
            submitBehavior="submit"
            onSubmitEditing={() => bodyRef.current?.focus()}
            className="px-5 pt-4 text-[30px] font-bold leading-9 text-ink web:outline-none dark:text-ink-dark"
          />

          <TextInput
            ref={bodyRef}
            value={body}
            onChangeText={onChangeBody}
            onSelectionChange={onSelectionChange}
            selection={pending ?? undefined}
            autoFocus={note === null}
            multiline
            textAlign={align}
            textAlignVertical="top"
            placeholder="Start writing"
            placeholderTextColor={theme.faint}
            selectionColor={theme.accent}
            cursorColor={theme.accent}
            className="min-h-[320px] px-5 pt-3 text-[17px] leading-7 text-ink web:outline-none dark:text-ink-dark"
          />
        </ScrollView>

        {/* The reference's editing rail, pinned above the keyboard. */}
        <View className="flex-row items-center justify-around border-t border-line bg-paper px-2 py-2 dark:border-line-dark dark:bg-paper-dark">
          <ToolbarIcon
            name="textSize"
            label="Format"
            onPress={() => setSheet('format')}
            tint={theme.accent}
          />
          <ToolbarIcon name="checklist" label="Checklist" onPress={toggleChecklist} />
          <ToolbarIcon name="bulletList" label="Bullets" onPress={() => onList('bullet')} />
          <ToolbarIcon name="numberedList" label="Numbers" onPress={() => onList('numbered')} />
          <ToolbarIcon name="add" label="Add" onPress={() => setSheet('add')} />
        </View>
      </KeyboardAvoidingView>

      <FormatSheet
        visible={sheet === 'format'}
        onClose={() => setSheet(null)}
        text={body}
        selection={selection}
        onEdit={apply}
        align={align}
        onAlign={setAlign}
        onBlockStyle={onBlockStyle}
        onList={onList}
        onMark={onMark}
        onIndent={onIndent}
      />

      <AddSheet visible={sheet === 'add'} onClose={() => setSheet(null)} />

      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="Note">
        <View className="pb-2">
          <MenuRow
            icon={note?.pinnedAt != null ? 'unpin' : 'pin'}
            label={note?.pinnedAt != null ? 'Unpin' : 'Pin to top'}
            onPress={() => {
              setSheet(null);
              void (async () => {
                const id = await requireSaved();
                if (id !== null) await togglePin(id);
              })();
            }}
          />
          <MenuRow
            icon="notebook"
            label={`Move to notebook${notebook !== null ? ` · ${notebook.name}` : ''}`}
            onPress={() => setSheet('notebook')}
          />
          <MenuRow
            icon="todos"
            label="Follow up"
            detail="Brings this note back in a couple of days"
            onPress={() => {
              setSheet(null);
              haptics.success();
              void (async () => {
                const id = await requireSaved();
                if (id !== null) await promote(id);
              })();
            }}
          />
          <MenuRow
            icon="lock"
            label="Lock this note"
            onPress={() => {
              setSheet(null);
              void (async () => {
                const id = await requireSaved();
                if (id !== null) {
                  await setLocked(id, true);
                  router.back();
                }
              })();
            }}
          />
          <MenuRow icon="trash" label="Delete" destructive onPress={confirmDelete} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'notebook'} onClose={() => setSheet(null)} title="Move to">
        <ScrollView className="max-h-80">
          <MenuRow
            icon="notebooks"
            label="Default notebook"
            selected={note?.notebookId == null}
            onPress={() => {
              setSheet(null);
              void (async () => {
                const id = await requireSaved();
                if (id !== null) await move(id, null);
              })();
            }}
          />
          {notebooks.map((option) => (
            <MenuRow
              key={option.id}
              icon="notebook"
              label={option.name}
              selected={note?.notebookId === option.id}
              onPress={() => {
                setSheet(null);
                void (async () => {
                  const id = await requireSaved();
                  if (id !== null) await move(id, option.id);
                })();
              }}
            />
          ))}
        </ScrollView>
      </Sheet>
    </SafeAreaView>
  );
}

/**
 * The attachment panel.
 *
 * Photos, Camera and Files are inert for now: the body is a plain-text string,
 * and putting real attachments in it needs a store for the files plus an
 * editor that can render them inline -- neither of which exists yet. The panel
 * is here because it is part of the screen's shape, and it says so plainly
 * rather than failing silently when tapped.
 */
function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const items: readonly { icon: IconName; label: string }[] = [
    { icon: 'photos', label: 'Photos' },
    { icon: 'camera', label: 'Camera' },
    { icon: 'doodle', label: 'Doodle' },
    { icon: 'spreadsheet', label: 'Spreadsheet' },
    { icon: 'files', label: 'Files' },
  ];

  return (
    <Sheet visible={visible} onClose={onClose} title="Add">
      <View className="flex-row flex-wrap gap-4 px-5 pb-2">
        {items.map((item) => (
          <View key={item.label} className="w-[21%] items-center">
            <SheetButton icon={item.icon} label={item.label} disabled onPress={() => {}} flex={false} />
            <Text className="pt-1.5 text-center text-[12px] text-faint dark:text-faint-dark">
              {item.label}
            </Text>
          </View>
        ))}
      </View>
      <Text className="px-5 pb-2 pt-2 text-[13px] text-faint dark:text-faint-dark">
        Attachments are not available yet.
      </Text>
    </Sheet>
  );
}

function MenuRow({
  icon,
  label,
  detail,
  selected = false,
  destructive = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  selected?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = destructive ? theme.muted : theme.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
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
      {selected ? <Icon name="done" size={18} color={theme.accent} /> : null}
    </Pressable>
  );
}

function ToolbarIcon({
  name,
  label,
  onPress,
  disabled = false,
  tint,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      hitSlop={8}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
    >
      <Icon name={name} size={22} color={disabled ? theme.faint : (tint ?? theme.ink)} />
    </Pressable>
  );
}
