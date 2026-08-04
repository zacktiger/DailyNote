import type { Notebook } from '@dailynote/core';
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

import { createNotebooksRepo, type NotebooksRepo } from '@/db/notebooks-repo';

interface NotebooksContextValue {
  notebooks: Notebook[];
  loading: boolean;
  repo: NotebooksRepo;
  refresh: () => Promise<void>;
  create: (name: string, color?: string) => Promise<Notebook>;
  rename: (id: string, name: string) => Promise<void>;
  recolor: (id: string, color: string) => Promise<void>;
  reorder: (ids: readonly string[]) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Looks up a notebook by id; null id (the Default notebook) yields null. */
  find: (id: string | null) => Notebook | null;
}

const NotebooksContext = createContext<NotebooksContextValue | null>(null);

/**
 * Notebooks are few and change rarely, so the whole set is held in memory and
 * re-read after each write -- the same approach as the notes store, and for the
 * same reason: one source of truth, no cache invalidation to get wrong.
 */
export function NotebooksProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repo = useMemo(() => createNotebooksRepo(db), [db]);

  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setNotebooks(await repo.all());
  }, [repo]);

  useEffect(() => {
    let active = true;
    repo
      .all()
      .then((rows) => {
        if (active) setNotebooks(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repo]);

  const value = useMemo<NotebooksContextValue>(
    () => ({
      notebooks,
      loading,
      repo,
      refresh,

      find(id) {
        if (id === null) return null;
        return notebooks.find((notebook) => notebook.id === id) ?? null;
      },

      async create(name, color) {
        const notebook = await repo.create(name, color);
        await refresh();
        return notebook;
      },

      async rename(id, name) {
        await repo.rename(id, name);
        await refresh();
      },

      async recolor(id, color) {
        await repo.recolor(id, color);
        await refresh();
      },

      async reorder(ids) {
        await repo.reorder(ids);
        await refresh();
      },

      async remove(id) {
        await repo.remove(id);
        await refresh();
      },
    }),
    [notebooks, loading, repo, refresh],
  );

  return <NotebooksContext.Provider value={value}>{children}</NotebooksContext.Provider>;
}

export function useNotebooks(): NotebooksContextValue {
  const context = useContext(NotebooksContext);
  if (context === null) {
    throw new Error('useNotebooks must be used inside a <NotebooksProvider>');
  }
  return context;
}
