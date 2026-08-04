import {
  documentToText,
  insertImage,
  isEmptyDocument,
  parseDocument,
  serializeDocument,
  setAlign,
  toggleBullet,
  type Align,
  type Block,
  type Note,
} from '@dailynote/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BlockEditor, type BlockEditorHandle } from '@/components/block-editor';
import { FormatSheet } from '@/components/format-sheet';
import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { canAttachImages, pickImage } from '@/lib/attachments';
import { editedAt } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import { useGoBack } from '@/lib/nav';
import { useHistory } from '@/lib/undo';
import { useNotebooks } from '@/store/notebooks-store';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/** How long the writing has to stop before an edit is written to SQLite. */
const AUTOSAVE_MS = 600;

export default function NoteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { notes, loading } = useNotes();

  const note = useMemo(() => notes.find((candidate) => candidate.id === id) ?? null, [notes, id]);

  if (id !== 'new' && note === null) {
    // Still loading is not the same as gone, and rendering "gone" over a note
    // that is about to appear is worse than rendering nothing for a frame.
    return loading ? <View className="flex-1 bg-paper dark:bg-paper-dark" /> : <Missing />;
  }

  // Keyed so the document initialises from storage exactly once, on mount.
  // Store refreshes must never clobber what is being typed.
  return <Editor key={id} note={note} />;
}

function Missing() {
  const goBack = useGoBack();
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-paper dark:bg-paper-dark">
      <Text className="text-[17px] text-muted dark:text-muted-dark">This note is gone.</Text>
      <Pressable onPress={goBack} className="mt-4 active:opacity-60">
        <Text className="text-[15px] font-medium text-accent dark:text-accent-dark">Go back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

/**
 * The note editor: the reference's chrome around the block writing surface.
 *
 * The screen owns saving, undo and the menus; `BlockEditor` owns the caret and
 * the structure of the document. Undo is over whole documents rather than over
 * text, because every edit in the block model already produces a new `Block[]`.
 */
function Editor({ note }: { note: Note | null }) {
  const theme = useTheme();
  const goBack = useGoBack();
  const { create, setContent, softDelete, promote, move, togglePin, setLocked } = useNotes();
  const { notebooks, find } = useNotebooks();

  const history = useHistory<Block[]>(
    useMemo(() => parseDocument(note?.doc, note?.body ?? ''), [note?.doc, note?.body]),
  );
  const blocks = history.value;

  const [focused, setFocused] = useState<number | null>(null);
  const [sheet, setSheet] = useState<'format' | 'more' | 'notebook' | null>(null);
  const editor = useRef<BlockEditorHandle>(null);

  // The id is only known after the first save for a brand new note.
  const noteId = useRef<string | null>(note?.id ?? null);
  const [editedIso, setEditedIso] = useState(note?.updatedAt ?? new Date().toISOString());

  const notebook = find(note?.notebookId ?? null);
  const count = useMemo(
    () => documentToText(blocks).replace(/\s/g, '').length,
    [blocks],
  );

  // --- persistence ---------------------------------------------------------

  const saved = useRef(note === null ? null : serializeDocument(parseDocument(note.doc, note.body)));

  const persist = useCallback(
    async (next: readonly Block[]) => {
      const serialized = serializeDocument(next);
      if (serialized === saved.current) return;
      // A new note is not written until it has content, so backing out of an
      // empty editor leaves nothing behind.
      if (noteId.current === null && isEmptyDocument(next)) return;

      saved.current = serialized;
      if (noteId.current === null) {
        const created = await create(documentToText(next), { doc: serialized });
        noteId.current = created.id;
      } else {
        await setContent(noteId.current, next);
      }
      setEditedIso(new Date().toISOString());
    },
    [create, setContent],
  );

  // Debounced autosave. There is no Save button in the reference and there is
  // none here: leaving the screen is what commits, and this covers a crash.
  useEffect(() => {
    const timer = setTimeout(() => void persist(blocks), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [blocks, persist]);

  // Kept in a ref so the unmount flush can stay on empty deps: an effect
  // depending on `blocks` would fire its cleanup on every keystroke.
  const latest = useRef(blocks);
  useEffect(() => {
    latest.current = blocks;
  }, [blocks]);

  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  useEffect(() => {
    return () => {
      void persistRef.current(latest.current);
    };
  }, []);

  // --- editing -------------------------------------------------------------

  const change = useCallback((next: Block[]) => history.set(next), [history]);

  /** A toolbar edit: its own undo step, and the caret goes back to the note. */
  const apply = useCallback(
    (next: Block[]) => {
      history.set(next, { discrete: true });
      editor.current?.restoreFocus();
    },
    [history],
  );

  const undo = useCallback(() => {
    if (history.undo() !== null) haptics.tap();
  }, [history]);

  const redo = useCallback(() => {
    if (history.redo() !== null) haptics.tap();
  }, [history]);

  // The toolbar acts on the focused block, or on the last one when the caret
  // has left the note -- pressing a format button should never do nothing.
  const target = focused ?? blocks.length - 1;
  const targetBlock = blocks[target];

  const onToggleBullet = useCallback(() => {
    haptics.tap();
    apply(toggleBullet(blocks, target));
  }, [apply, blocks, target]);

  const onAlign = useCallback(
    (align: Align) => {
      haptics.tap();
      apply(setAlign(blocks, target, align));
    },
    [apply, blocks, target],
  );

  const onAddImage = useCallback(() => {
    setSheet(null);
    void (async () => {
      const block = await pickImage();
      if (block === null) return;
      haptics.success();
      apply(insertImage(blocks, focused, block));
    })();
  }, [apply, blocks, focused]);

  // --- actions -------------------------------------------------------------

  const done = useCallback(async () => {
    haptics.tap();
    await persist(blocks);
    goBack();
  }, [persist, blocks, goBack]);

  const requireSaved = useCallback(async () => {
    await persist(blocks);
    return noteId.current;
  }, [persist, blocks]);

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
            // Nothing to delete if it was never saved; block the unmount flush
            // from writing it back on the way out.
            saved.current = serializeDocument(blocks);
            if (noteId.current !== null) await softDelete(noteId.current);
            goBack();
          })();
        },
      },
    ]);
  }, [softDelete, goBack, blocks]);

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
          contentContainerClassName="pb-12 pt-3"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <BlockEditor
            ref={editor}
            blocks={blocks}
            onChange={change}
            onFocusChange={setFocused}
            placeholder="Heading"
            autoFocus={note === null}
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
          <ToolbarIcon
            name="bulletList"
            label="Bullet list"
            onPress={onToggleBullet}
            tint={
              targetBlock !== undefined && targetBlock.type === 'bullet' ? theme.accent : undefined
            }
          />
          <ToolbarIcon name="alignLeft" label="Align left" onPress={() => onAlign('left')} />
          <ToolbarIcon name="alignCenter" label="Align centre" onPress={() => onAlign('center')} />
          <ToolbarIcon
            name="photos"
            label="Add photo"
            onPress={onAddImage}
            disabled={!canAttachImages}
          />
        </View>
      </KeyboardAvoidingView>

      <FormatSheet
        visible={sheet === 'format'}
        onClose={() => setSheet(null)}
        block={targetBlock}
        onToggleBullet={onToggleBullet}
        onAlign={onAlign}
        onAddImage={onAddImage}
      />

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
                  goBack();
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
