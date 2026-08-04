import type { Notebook } from '@dailynote/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { newId } from './notes-repo';

/**
 * Notebook persistence, mirroring the shape of `notes-repo`.
 *
 * There is no row for the Default notebook -- a note with a null `notebookId`
 * is in it. Nothing here should ever create one.
 */
export interface NotebooksRepo {
  all(): Promise<Notebook[]>;
  create(name: string, color?: string): Promise<Notebook>;
  rename(id: string, name: string): Promise<void>;
  recolor(id: string, color: string): Promise<void>;
  reorder(ids: readonly string[]): Promise<void>;
  /** Soft-deletes the notebook and empties it back into the Default notebook. */
  remove(id: string): Promise<void>;
}

interface NotebookRow {
  id: string;
  user_id: string | null;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted: number;
}

function toNotebook(row: NotebookRow): Notebook {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    color: row.color,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deleted: row.deleted === 1,
  };
}

export function createNotebooksRepo(db: SQLiteDatabase): NotebooksRepo {
  return {
    async all() {
      const rows = await db.getAllAsync<NotebookRow>(
        'select * from notebooks where deleted = 0 order by sort_order, created_at',
      );
      return rows.map(toNotebook);
    },

    async create(name, color = 'swatch') {
      const now = new Date().toISOString();
      const row = await db.getFirstAsync<{ next: number }>(
        'select coalesce(max(sort_order), -1) + 1 as next from notebooks',
      );
      const notebook: Notebook = {
        id: newId(),
        userId: null,
        name: name.trim(),
        color,
        sortOrder: row?.next ?? 0,
        createdAt: now,
        updatedAt: now,
        deleted: false,
      };

      await db.runAsync(
        `insert into notebooks
           (id, user_id, name, color, sort_order, created_at, updated_at, deleted)
         values (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          notebook.id,
          notebook.userId,
          notebook.name,
          notebook.color,
          notebook.sortOrder,
          notebook.createdAt,
          notebook.updatedAt,
        ],
      );
      return notebook;
    },

    async rename(id, name) {
      await db.runAsync('update notebooks set name = ?, updated_at = ? where id = ?', [
        name.trim(),
        new Date().toISOString(),
        id,
      ]);
    },

    async recolor(id, color) {
      await db.runAsync('update notebooks set color = ?, updated_at = ? where id = ?', [
        color,
        new Date().toISOString(),
        id,
      ]);
    },

    async reorder(ids) {
      const now = new Date().toISOString();
      await db.withTransactionAsync(async () => {
        for (const [index, id] of ids.entries()) {
          await db.runAsync(
            'update notebooks set sort_order = ?, updated_at = ? where id = ?',
            [index, now, id],
          );
        }
      });
    },

    async remove(id) {
      const now = new Date().toISOString();
      // Deleting a notebook must not delete what is filed in it: the notes
      // fall back to the Default notebook rather than disappearing with it.
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'update notes set notebook_id = null, updated_at = ? where notebook_id = ?',
          [now, id],
        );
        await db.runAsync(
          'update notebooks set deleted = 1, updated_at = ? where id = ?',
          [now, id],
        );
      });
    },
  };
}
