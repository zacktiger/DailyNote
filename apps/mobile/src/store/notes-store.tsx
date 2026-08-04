import type { Block, Note, ReviewAnswer } from '@dailynote/core';
import { applyReview, promoteToCommitment } from '@dailynote/core';
import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createNotesRepo, type CreateOptions, type NotesRepo } from '@/db/notes-repo';

/**
 * Every note is held in memory and re-read from SQLite after each write.
 *
 * That is the plan's section 0.2 option A ceiling -- fine to roughly 10-20k
 * notes, which one person will not reach for years. When it stops being fine,
 * the fix is to make these reads query the repo directly rather than filter the
 * array, and the repo already supports it.
 */

interface NotesContextValue {
  notes: Note[];
  loading: boolean;
  repo: NotesRepo;
  refresh: () => Promise<void>;
  create: (body: string, options?: CreateOptions) => Promise<Note>;
  setBody: (id: string, body: string) => Promise<void>;
  setContent: (id: string, blocks: readonly Block[]) => Promise<void>;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  purge: (id: string) => Promise<void>;
  purgeAll: () => Promise<void>;
  /** Files a note into a notebook; null moves it to the Default notebook. */
  move: (id: string, notebookId: string | null) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  setLocked: (id: string, locked: boolean) => Promise<void>;
  /** Ticks a to-do off, or puts an already-done one back on the list. */
  setCompleted: (id: string, completed: boolean) => Promise<void>;
  promote: (id: string) => Promise<void>;
  review: (id: string, answer: ReviewAnswer, updateBody?: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repo = useMemo(() => createNotesRepo(db), [db]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setNotes(await repo.all());
  }, [repo]);

  useEffect(() => {
    let active = true;
    repo
      .all()
      .then((rows) => {
        if (active) setNotes(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repo]);

  const value = useMemo<NotesContextValue>(() => {
    return {
      notes,
      loading,
      repo,
      refresh,

      async create(body, options) {
        const note = await repo.create(body, options);
        await refresh();
        return note;
      },

      async setBody(id, body) {
        await repo.setBody(id, body);
        await refresh();
      },

      async setContent(id, blocks) {
        await repo.setContent(id, blocks);
        await refresh();
      },

      async softDelete(id) {
        await repo.softDelete(id);
        await refresh();
      },

      async restore(id) {
        await repo.restore(id);
        await refresh();
      },

      async purge(id) {
        await repo.purge(id);
        await refresh();
      },

      async purgeAll() {
        await repo.purgeAll();
        await refresh();
      },

      async move(id, notebookId) {
        await repo.update(id, { notebookId });
        await refresh();
      },

      async togglePin(id) {
        const note = await repo.get(id);
        if (note === null) return;
        await repo.update(id, {
          pinnedAt: note.pinnedAt === null ? new Date().toISOString() : null,
        });
        await refresh();
      },

      async setLocked(id, locked) {
        await repo.update(id, { locked });
        await refresh();
      },

      async setCompleted(id, completed) {
        const note = await repo.get(id);
        if (note === null) return;
        // Un-completing puts the note back in the "due now" bucket rather than
        // restoring whatever future date it had: if you are reopening it, it
        // is because it needs attention now.
        await repo.update(id, {
          completedAt: completed ? new Date().toISOString() : null,
          nextReviewAt: completed ? note.nextReviewAt : new Date().toISOString(),
        });
        await refresh();
      },

      async promote(id) {
        const note = await repo.get(id);
        if (note === null) return;
        await repo.update(id, promoteToCommitment(note, new Date()));
        await refresh();
      },

      async review(id, answer, updateBody) {
        const note = await repo.get(id);
        if (note === null) return;

        const { patch, createsUpdate } = applyReview(note, answer, new Date());
        await repo.update(id, patch);

        // An "add update" answer creates a child note in the same thread. That
        // thread -- a commitment plus the record of acting on it -- is the unit
        // Rollout 2 publishes, which is why it is built now and not later.
        if (createsUpdate && updateBody !== undefined && updateBody.trim().length > 0) {
          await repo.create(updateBody, {
            rootId: note.rootId,
            parentId: note.id,
            kind: 'update',
          });
        }

        await refresh();
      },
    };
  }, [notes, loading, repo, refresh]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const context = useContext(NotesContext);
  if (context === null) {
    throw new Error('useNotes must be used inside a <NotesProvider>');
  }
  return context;
}
