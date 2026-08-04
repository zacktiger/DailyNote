import type { FeedItem, Note, Profile } from '@dailynote/core';
import {
  handleError,
  normalizeHandle,
  publicUrl,
  publishError,
  publishPatch,
  threadOf,
  uniqueSlug,
  unpublishPatch,
} from '@dailynote/core';
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

import { createSocialRepo, type ProfilePatch, type SocialRepo } from '@/db/social-repo';
import { seedSocial } from '@/lib/social-seed';
import { useNotes } from '@/store/notes-store';

/**
 * The social layer's state.
 *
 * This provider sits inside `NotesProvider` and uses it, because publishing is
 * an operation on a note that already exists -- there is no publish path that
 * does not start from the notes table, including the one the feed composer
 * takes. That is deliberate: `post()` writes a note and then publishes it
 * through exactly the same code a shared note goes through, so "this is now
 * public" happens in one place and can only be wrong once.
 *
 * The notes composer knows nothing about any of this. See docs/product.md.
 */

interface SocialContextValue {
  /** Null until a handle is claimed. Everything that writes requires it. */
  me: Profile | null;
  loading: boolean;
  /** Every mirrored item. `composeFeed` turns this into what a reader sees. */
  items: FeedItem[];
  following: ReadonlySet<string>;
  blocked: ReadonlySet<string>;

  refresh: () => Promise<void>;
  /** Returns an error message, or null if the handle was claimed. */
  claim: (handle: string, displayName: string) => Promise<string | null>;
  updateMe: (patch: ProfilePatch) => Promise<void>;

  /** Writes a post straight to the feed. Never touches the notes list. */
  post: (body: string) => Promise<string | null>;
  /** Publishes an existing private note. Returns its public URL, or null. */
  share: (noteId: string) => Promise<string | null>;
  /** Takes it back. The thread stays; only the public copy goes. */
  unshare: (noteId: string) => Promise<void>;
  /** Why this note cannot be shared, or null. */
  shareError: (note: Note) => string | null;

  setLiked: (itemId: string, liked: boolean) => Promise<void>;
  setFollowing: (authorId: string, following: boolean) => Promise<void>;
  setBlocked: (authorId: string, blocked: boolean) => Promise<void>;
  report: (itemId: string, reason: string) => Promise<void>;
  recordView: (itemId: string) => Promise<void>;

  repo: SocialRepo;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const repo = useMemo(() => createSocialRepo(db), [db]);
  const { notes, repo: notesRepo, refresh: refreshNotes } = useNotes();

  const [me, setMe] = useState<Profile | null>(null);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [following, setFollowingIds] = useState<ReadonlySet<string>>(new Set());
  const [blocked, setBlockedIds] = useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [profile, mirrored, follows, blocks] = await Promise.all([
      repo.me(),
      repo.items(),
      repo.following(),
      repo.blocked(),
    ]);
    setMe(profile);
    setItems(mirrored);
    setFollowingIds(follows);
    setBlockedIds(blocks);
  }, [repo]);

  useEffect(() => {
    let active = true;
    void (async () => {
      // The stand-in server. Idempotent, and it goes away with the real one.
      await seedSocial(repo);
      if (!active) return;
      await refresh();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [repo, refresh]);

  const value = useMemo<SocialContextValue>(() => {
    /**
     * The single publish path.
     *
     * Takes a note that exists, gives it an address, and copies it into the
     * mirror along with the state of its thread. Both `post` and `share` end
     * here; nothing else may make a note public.
     */
    async function publishNote(note: Note, author: Profile): Promise<string> {
      const thread = threadOf(notes, note.rootId);
      const updates = thread.filter((entry) => entry.kind === 'update');

      // The feed sorts on this: the last thing that happened to the thread,
      // which for a live commitment is its most recent update rather than the
      // day it was written.
      const activeAt =
        [note.updatedAt, ...updates.map((entry) => entry.createdAt)].sort().at(-1) ??
        note.updatedAt;

      const slug =
        note.slug ?? uniqueSlug(note.title, await repo.slugsFor(author.id));
      const publishedAt = note.publishedAt ?? new Date().toISOString();

      await notesRepo.update(note.id, {
        ...publishPatch(new Date(publishedAt)),
        slug,
      });

      await repo.mirror({
        id: note.id,
        authorId: author.id,
        slug,
        bornPublic: note.bornPublic,
        title: note.title,
        body: note.body,
        doc: note.doc,
        publishedAt,
        activeAt,
        completedAt: note.completedAt,
        updateCount: updates.length,
      });

      return publicUrl(author.handle, slug);
    }

    return {
      me,
      loading,
      items,
      following,
      blocked,
      repo,
      refresh,

      async claim(handle, displayName) {
        const normalized = normalizeHandle(handle);
        const problem = handleError(normalized);
        if (problem !== null) return problem;
        if (await repo.handleTaken(normalized)) return 'Somebody has that one.';

        const trimmed = displayName.trim();
        await repo.claim(normalized, trimmed.length > 0 ? trimmed : null);
        await refresh();
        return null;
      },

      async updateMe(patch) {
        await repo.updateMe(patch);
        await refresh();
      },

      shareError(note) {
        if (me === null) return 'Claim a handle first.';
        return publishError(note);
      },

      async post(body) {
        if (me === null || body.trim().length === 0) return null;

        // A post is a note that was public from birth. It reuses the whole
        // note machinery -- threads, updates, follow-through -- and is kept
        // out of the private notes list by `bornPublic` alone.
        const note = await notesRepo.create(body, { bornPublic: true });
        const url = await publishNote(note, me);
        await Promise.all([refreshNotes(), refresh()]);
        return url;
      },

      async share(noteId) {
        if (me === null) return null;
        const note = await notesRepo.get(noteId);
        if (note === null || publishError(note) !== null) return null;

        const url = await publishNote(note, me);
        await Promise.all([refreshNotes(), refresh()]);
        return url;
      },

      async unshare(noteId) {
        // The public copy goes first: if the second write fails the note is
        // still marked public but is unreadable, which is the safe way round.
        await repo.unmirror(noteId);
        await notesRepo.update(noteId, { ...unpublishPatch(), slug: null });
        await Promise.all([refreshNotes(), refresh()]);
      },

      async setLiked(itemId, liked) {
        await repo.setLiked(itemId, liked);
        await refresh();
      },

      async setFollowing(authorId, follow) {
        await repo.setFollowing(authorId, follow);
        await refresh();
      },

      async setBlocked(authorId, block) {
        await repo.setBlocked(authorId, block);
        await refresh();
      },

      async report(itemId, reason) {
        await repo.report(itemId, reason);
      },

      async recordView(itemId) {
        await repo.recordView(itemId);
      },
    };
  }, [me, loading, items, following, blocked, repo, refresh, notes, notesRepo, refreshNotes]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialContextValue {
  const context = useContext(SocialContext);
  if (context === null) {
    throw new Error('useSocial must be used inside a <SocialProvider>');
  }
  return context;
}
