import { ALL_NOTES, DEFAULT_NOTEBOOK, type Notebook } from '@dailynote/core';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { useGoBack } from '@/lib/nav';
import { useNotebooks } from '@/store/notebooks-store';
import { useNotes } from '@/store/notes-store';
import { swatchColor, useTheme } from '@/theme';

/** The colours a new notebook can be given, as palette keys. */
const SWATCHES = ['swatch', 'swatchWarm', 'accent'] as const;

/**
 * The notebooks drawer.
 *
 * Three groups, as in the reference: everything, the user's own notebooks, and
 * the fixed shelves (Default, Locked, Recently deleted) that cannot be renamed
 * or removed.
 */
export default function Notebooks() {
  const theme = useTheme();
  const router = useRouter();
  const goBack = useGoBack();
  const { notes, refresh: refreshNotes } = useNotes();
  const { notebooks, create, remove, rename, recolor, refresh: refreshNotebooks } = useNotebooks();

  // One sheet serves both actions: null while closed, a notebook when
  // renaming, 'new' when creating.
  const [target, setTarget] = useState<Notebook | 'new' | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('swatch');
  const [editing, setEditing] = useState(false);

  const counts = useMemo(() => {
    const byNotebook = new Map<string, number>();
    let total = 0;
    let unfiled = 0;
    let locked = 0;

    for (const note of notes) {
      if (note.kind !== 'note') continue;
      if (note.locked) {
        locked += 1;
        continue;
      }
      total += 1;
      if (note.notebookId === null) unfiled += 1;
      else byNotebook.set(note.notebookId, (byNotebook.get(note.notebookId) ?? 0) + 1);
    }
    return { byNotebook, total, unfiled, locked };
  }, [notes]);

  const trashCount = useMemo(() => notes.filter((note) => note.deleted).length, [notes]);

  const openCreate = () => {
    setName('');
    setColor('swatch');
    setTarget('new');
  };

  const openRename = (notebook: Notebook) => {
    setName(notebook.name);
    setColor(notebook.color);
    setTarget(notebook);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || target === null) return;
    haptics.tap();
    if (target === 'new') {
      await create(trimmed, color);
    } else {
      await rename(target.id, trimmed);
      if (color !== target.color) await recolor(target.id, color);
    }
    setTarget(null);
  };

  const confirmRemove = (notebook: Notebook) => {
    const count = counts.byNotebook.get(notebook.id) ?? 0;
    Alert.alert(
      `Delete "${notebook.name}"?`,
      count > 0
        ? `Its ${count === 1 ? 'note' : `${count} notes`} will move to the Default notebook.`
        : 'This notebook is empty.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await remove(notebook.id);
              // remove() re-files the notebook's notes, so the notes store is
              // stale until it re-reads.
              await refreshNotes();
              await refreshNotebooks();
            })();
          },
        },
      ],
    );
  };

  /** Filtering the list is the drawer's whole job, so every row closes it. */
  const openFilter = (filter: string) => {
    router.dismissTo({ pathname: '/', params: { filter } });
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <View className="flex-row items-center justify-between px-4 pb-2 pt-1">
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={goBack}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="close" size={24} color={theme.ink} />
        </Pressable>
        <Text className="text-[19px] font-semibold text-ink dark:text-ink-dark">Notebooks</Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Done editing' : 'Edit notebooks'}
          onPress={() => setEditing((on) => !on)}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <Icon name="reorder" size={22} color={editing ? theme.accent : theme.ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerClassName="pb-10">
        <Group>
          <Row
            icon="allNotes"
            label="All notes"
            trailing={String(counts.total)}
            highlighted
            onPress={() => openFilter(ALL_NOTES)}
          />
        </Group>

        <View className="flex-row items-center justify-between px-6 pb-2 pt-7">
          <Text className="text-[17px] font-medium text-ink dark:text-ink-dark">My notebooks</Text>
          <Pressable
            hitSlop={10}
            accessibilityRole="button"
            onPress={openCreate}
            className="active:opacity-60"
          >
            <Text className="text-[17px] font-medium text-accent dark:text-accent-dark">New</Text>
          </Pressable>
        </View>

        {notebooks.length === 0 ? (
          <Text className="px-6 pb-2 text-[15px] text-faint dark:text-faint-dark">
            No notebooks yet. Tap New to make one.
          </Text>
        ) : (
          <Group>
            {notebooks.map((notebook, index) => (
              <Row
                key={notebook.id}
                swatch={swatchColor(theme, notebook.color)}
                label={notebook.name}
                trailing={String(counts.byNotebook.get(notebook.id) ?? 0)}
                first={index === 0}
                editing={editing}
                onPress={() => (editing ? openRename(notebook) : openFilter(notebook.id))}
                onRemove={() => confirmRemove(notebook)}
              />
            ))}
          </Group>
        )}

        <View className="pt-7">
          <Group>
            <Row
              icon="notebooks"
              label="Default notebook"
              trailing={String(counts.unfiled)}
              first
              onPress={() => openFilter(DEFAULT_NOTEBOOK)}
            />
            <Row
              icon="lock"
              label="Locked notes"
              trailing={counts.locked > 0 ? String(counts.locked) : undefined}
              trailingIcon="lock"
              onPress={() => router.push('/locked')}
            />
            <Row
              icon="trash"
              label="Recently deleted"
              trailing={String(trashCount)}
              onPress={() => router.push('/trash')}
            />
          </Group>
        </View>
      </ScrollView>

      <Sheet
        visible={target !== null}
        onClose={() => setTarget(null)}
        title={target === 'new' ? 'New notebook' : 'Rename notebook'}
      >
        <View className="px-5 pb-2">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Notebook name"
            placeholderTextColor={theme.faint}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            selectionColor={theme.accent}
            className="rounded-xl bg-elevated px-4 py-3 text-[16px] text-ink web:outline-none dark:bg-elevated-dark dark:text-ink-dark"
          />

          <View className="flex-row items-center gap-3 pt-4">
            {SWATCHES.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`Colour ${key}`}
                accessibilityState={{ selected: color === key }}
                onPress={() => setColor(key)}
                className={[
                  'h-10 w-10 items-center justify-center rounded-full border-2',
                  color === key ? 'border-ink dark:border-ink-dark' : 'border-transparent',
                ].join(' ')}
              >
                <View
                  className="h-7 w-7 rounded-md"
                  style={{ backgroundColor: swatchColor(theme, key) }}
                />
              </Pressable>
            ))}

            <View className="flex-1" />

            <Pressable
              accessibilityRole="button"
              onPress={submit}
              disabled={name.trim().length === 0}
              className={[
                'rounded-full px-6 py-2.5 active:opacity-60',
                name.trim().length === 0
                  ? 'bg-elevated dark:bg-elevated-dark'
                  : 'bg-accent dark:bg-accent-dark',
              ].join(' ')}
            >
              <Text
                className="text-[15px] font-semibold"
                style={{ color: name.trim().length === 0 ? theme.faint : theme.accentInk }}
              >
                {target === 'new' ? 'Create' : 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return (
    <View className="mx-4 overflow-hidden rounded-2xl bg-card dark:bg-card-dark">{children}</View>
  );
}

function Row({
  icon,
  swatch,
  label,
  trailing,
  trailingIcon,
  first = false,
  highlighted = false,
  editing = false,
  onPress,
  onRemove,
}: {
  icon?: IconName;
  swatch?: string;
  label: string;
  trailing?: string;
  trailingIcon?: IconName;
  first?: boolean;
  highlighted?: boolean;
  editing?: boolean;
  onPress: () => void;
  onRemove?: () => void;
}) {
  const theme = useTheme();

  return (
    <View>
      {!first ? <View className="ml-16 h-px bg-line dark:bg-line-dark" /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        className={[
          'flex-row items-center gap-4 px-4 py-4 active:opacity-60',
          highlighted ? 'bg-elevated dark:bg-elevated-dark' : '',
        ].join(' ')}
      >
        <View className="w-7 items-center">
          {swatch !== undefined ? (
            <View className="h-7 w-6 rounded-[3px]" style={{ backgroundColor: swatch }} />
          ) : icon !== undefined ? (
            <Icon name={icon} size={24} color={theme.ink} />
          ) : null}
        </View>

        <Text className="flex-1 text-[17px] text-ink dark:text-ink-dark">{label}</Text>

        {editing && onRemove !== undefined ? (
          <Animated.View entering={motion.enter} exiting={motion.exit}>
            <Pressable
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${label}`}
              onPress={onRemove}
              className="active:opacity-60"
            >
              <Icon name="trash" size={20} color={theme.muted} />
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {trailing !== undefined ? (
              <Text className="text-[15px] text-muted dark:text-muted-dark">{trailing}</Text>
            ) : null}
            {trailingIcon !== undefined ? (
              <Icon name={trailingIcon} size={16} color={theme.muted} />
            ) : null}
            <Icon name="chevron" size={18} color={theme.faint} />
          </>
        )}
      </Pressable>
    </View>
  );
}
