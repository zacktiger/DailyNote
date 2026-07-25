import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { noteTags, notes, tags } from './schema';

/**
 * Zod schemas shared by the app, the (eventual) server and any importer.
 *
 * The enums are declared here as well as in the DB check constraints on
 * purpose: the constraint is the guarantee, this is the error message.
 */

export const noteKindSchema = z.enum(['note', 'update']);
export const noteSourceSchema = z.enum(['composer', 'share', 'shortcut', 'import', 'clipboard']);
export const visibilitySchema = z.enum(['private', 'unlisted', 'public']);

export const noteSelectSchema = createSelectSchema(notes, {
  kind: noteKindSchema,
  source: noteSourceSchema,
  visibility: visibilitySchema,
});

export const noteInsertSchema = createInsertSchema(notes, {
  kind: noteKindSchema,
  source: noteSourceSchema,
  visibility: visibilitySchema,
  body: z.string().max(1_000_000, 'Note is too large'),
}).refine(
  (note) => note.visibility !== 'private' || note.publishedAt == null,
  { message: 'A private note cannot have a published_at', path: ['publishedAt'] },
);

export const tagSelectSchema = createSelectSchema(tags);
export const tagInsertSchema = createInsertSchema(tags, {
  name: z.string().min(1).max(64),
});

export const noteTagSelectSchema = createSelectSchema(noteTags);
export const noteTagInsertSchema = createInsertSchema(noteTags);

export type NoteRow = z.infer<typeof noteSelectSchema>;
export type NoteInsert = z.infer<typeof noteInsertSchema>;
export type TagRow = z.infer<typeof tagSelectSchema>;
export type NoteTagRow = z.infer<typeof noteTagSelectSchema>;
