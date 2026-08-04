import type { Note } from '@dailynote/core';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { comesBack } from '@/lib/format';
import { haptics } from '@/lib/haptics';
import * as motion from '@/lib/motion';
import { useNotes } from '@/store/notes-store';
import { useTheme } from '@/theme';

/**
 * To-dos: the notes that come back.
 *
 * This is a view over the notes table, not a second kind of object. A note
 * becomes a to-do by being promoted to a commitment (writing `#do`, or the
 * editor's follow-up action), which is what gives it a `nextReviewAt`.
 */
export default function Todos() {
  const { notes } = useNotes();

  // "Due" is a function of the clock, so it is state that ticks rather than
  // something read during render -- a to-do that comes due while the screen is
  // open moves into Due on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { due, upcoming, done } = useMemo(() => {
    const commitments = notes.filter(
      (note) => note.kind === 'note' && !note.locked && note.nextReviewAt !== null,
    );
    return {
      due: commitments.filter(
        (note) => note.completedAt === null && new Date(note.nextReviewAt!).getTime() <= now,
      ),
      upcoming: commitments.filter(
        (note) => note.completedAt === null && new Date(note.nextReviewAt!).getTime() > now,
      ),
      done: commitments.filter((note) => note.completedAt !== null),
    };
  }, [notes, now]);

  const empty = due.length + upcoming.length + done.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-canvas dark:bg-canvas-dark" edges={['top', 'left', 'right']}>
      <Animated.ScrollView contentContainerClassName="pb-24">
        <Text className="px-5 pt-6 text-[40px] font-bold leading-[48px] text-ink dark:text-ink-dark">
          To-dos
        </Text>
        <Text className="px-5 pt-0.5 text-[15px] text-muted dark:text-muted-dark">
          {due.length > 0 ? `${due.length} due now` : 'Nothing due'}
        </Text>

        {empty ? (
          <Animated.View entering={motion.enterFade} className="items-center px-10 pt-24">
            <Text className="text-[17px] text-muted dark:text-muted-dark">No to-dos yet.</Text>
            <Text className="pt-2 text-center text-[15px] text-faint dark:text-faint-dark">
              Write #do in a note, or use Follow up in the editor.
            </Text>
          </Animated.View>
        ) : null}

        <Section title="Due" notes={due} />
        <Section title="Later" notes={upcoming} />
        <Section title="Done" notes={done} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, notes }: { title: string; notes: Note[] }) {
  if (notes.length === 0) return null;

  return (
    <View className="pt-7">
      <Text className="px-5 pb-2 text-[13px] font-semibold uppercase tracking-[1px] text-muted dark:text-muted-dark">
        {title}
      </Text>
      <View className="mx-4 overflow-hidden rounded-2xl bg-card dark:bg-card-dark">
        {notes.map((note, index) => (
          <TodoRow key={note.id} note={note} first={index === 0} />
        ))}
      </View>
    </View>
  );
}

function TodoRow({ note, first }: { note: Note; first: boolean }) {
  const theme = useTheme();
  const router = useRouter();
  const { setCompleted } = useNotes();
  const complete = note.completedAt !== null;

  return (
    <View>
      {!first ? <View className="mx-4 h-px bg-line dark:bg-line-dark" /> : null}
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
        className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-60"
      >
        <Pressable
          hitSlop={10}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: complete }}
          accessibilityLabel={`Mark ${note.title ?? 'note'} done`}
          onPress={() => {
            haptics.success();
            void setCompleted(note.id, !complete);
          }}
          className={[
            'h-6 w-6 items-center justify-center rounded-full border-2',
            complete ? 'border-accent bg-accent dark:border-accent-dark dark:bg-accent-dark' : 'border-faint dark:border-faint-dark',
          ].join(' ')}
        >
          {complete ? <Icon name="done" size={14} color={theme.accentInk} /> : null}
        </Pressable>

        <View className="flex-1">
          <Text
            numberOfLines={1}
            className={[
              'text-[17px]',
              complete
                ? 'text-faint line-through dark:text-faint-dark'
                : 'text-ink dark:text-ink-dark',
            ].join(' ')}
          >
            {note.title ?? 'Untitled'}
          </Text>
          {!complete ? (
            <Text className="pt-0.5 text-[13px] text-muted dark:text-muted-dark">
              Comes back {comesBack(note.nextReviewAt!)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
