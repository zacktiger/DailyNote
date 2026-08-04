/**
 * The block document: what a note actually is once it has structure.
 *
 * A note stores two representations of the same content:
 *
 * - `doc`  -- this model, serialized to JSON. The rich source of truth.
 * - `body` -- a plain-text projection of it, produced by `documentToText`.
 *
 * `body` is not redundant. Search scoring, `#hashtag` parsing, `deriveTitle`
 * and the Phase 4 sync cursor all read it, and none of them should have to
 * learn about blocks. Writing the projection on every edit means those keep
 * working untouched, and a note whose `doc` is null -- every note written
 * before this module existed -- is simply a document of paragraphs.
 *
 * Block ids are deliberately *not* persisted. They exist so React can key a
 * list of text inputs without reusing one block's editing state for another;
 * they are minted on parse and dropped on serialize, which keeps stored
 * documents small and free of identifiers nothing outlives the session.
 */

export type Align = 'left' | 'center' | 'right';

interface BlockBase {
  /** Session-scoped. See the note above: never written to storage. */
  id: string;
  align: Align;
}

export interface TextBlock extends BlockBase {
  type: 'paragraph' | 'bullet';
  text: string;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  /** Path relative to the app's document directory, not an absolute file URI. */
  uri: string;
  /** Intrinsic size, stored so layout is known before the image loads. */
  width: number;
  height: number;
}

export type Block = TextBlock | ImageBlock;

/** The serialized envelope. Versioned so a future shape can be told apart. */
const DOC_VERSION = 1;

const ALIGNMENTS: readonly Align[] = ['left', 'center', 'right'];
const DEFAULT_ALIGN: Align = 'left';

/** The marker `documentToText` writes for a bullet, and `title.ts` strips. */
const BULLET_PREFIX = '- ';

let blockSequence = 0;

/**
 * A unique-per-session block id.
 *
 * Unlike note ids these never leave the device or collide across clients, so
 * they need no crypto -- which keeps this module free of platform imports.
 */
export function newBlockId(): string {
  blockSequence += 1;
  return `b${blockSequence}`;
}

export function paragraph(text = '', align: Align = DEFAULT_ALIGN): TextBlock {
  return { id: newBlockId(), type: 'paragraph', text, align };
}

export function bullet(text = '', align: Align = DEFAULT_ALIGN): TextBlock {
  return { id: newBlockId(), type: 'bullet', text, align };
}

export function image(uri: string, width: number, height: number, align: Align = 'center'): ImageBlock {
  return { id: newBlockId(), type: 'image', uri, width, height, align };
}

export function isTextBlock(block: Block): block is TextBlock {
  return block.type === 'paragraph' || block.type === 'bullet';
}

/**
 * Reads a stored document, falling back to the plain body.
 *
 * Total by design: a malformed or partially-unknown `doc` degrades to whatever
 * can be salvaged, and a hard parse failure degrades to the body. A note that
 * cannot be shown is worse than a note that has lost its formatting.
 *
 * Always returns at least one block -- the editor needs somewhere to put the
 * caret, so an empty note is one empty paragraph rather than nothing.
 */
export function parseDocument(doc: string | null | undefined, body: string): Block[] {
  const blocks = doc === null || doc === undefined ? null : safeParse(doc);
  if (blocks !== null && blocks.length > 0) return blocks;
  return fromPlainText(body);
}

function safeParse(doc: string): Block[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(doc);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || parsed.v !== DOC_VERSION || !Array.isArray(parsed.blocks)) return null;

  const blocks: Block[] = [];
  for (const raw of parsed.blocks) {
    const block = readBlock(raw);
    // Skip what we cannot read rather than failing the whole document: one
    // block written by a newer version should not hide the other twenty.
    if (block !== null) blocks.push(block);
  }
  return blocks;
}

function readBlock(raw: unknown): Block | null {
  if (!isRecord(raw)) return null;
  const align = readAlign(raw.align);

  if (raw.type === 'paragraph' || raw.type === 'bullet') {
    return { id: newBlockId(), type: raw.type, text: readString(raw.text), align };
  }

  if (raw.type === 'image' && typeof raw.uri === 'string' && raw.uri.length > 0) {
    return {
      id: newBlockId(),
      type: 'image',
      uri: raw.uri,
      width: readPositive(raw.width),
      height: readPositive(raw.height),
      align,
    };
  }

  return null;
}

/** Every line becomes a paragraph, which is exactly what a plain note was. */
function fromPlainText(body: string): Block[] {
  if (body.length === 0) return [paragraph()];
  return body.split('\n').map((line) => paragraph(line));
}

/**
 * Serializes for storage. Drops ids, and omits `align` when it is the default
 * so a document of ordinary paragraphs stays close to the size of its text.
 */
export function serializeDocument(blocks: readonly Block[]): string {
  const payload = blocks.map((block) => {
    const align = block.align === DEFAULT_ALIGN ? {} : { align: block.align };

    return block.type === 'image'
      ? { type: block.type, uri: block.uri, width: block.width, height: block.height, ...align }
      : { type: block.type, text: block.text, ...align };
  });

  return JSON.stringify({ v: DOC_VERSION, blocks: payload });
}

/**
 * The plain-text projection written to `note.body`.
 *
 * Bullets keep their `- ` marker because everything downstream already handles
 * it -- `deriveTitle` strips it, and search tokenizes it away. Images
 * contribute nothing at all, so a note that opens with a photo takes its title
 * from the first line of actual writing. Alignment is presentation and has no
 * text form.
 */
export function documentToText(blocks: readonly Block[]): string {
  return blocks
    .filter(isTextBlock)
    .map((block) => (block.type === 'bullet' ? BULLET_PREFIX + block.text : block.text))
    .join('\n');
}

/** True when there is nothing worth saving: no image, and no non-blank text. */
export function isEmptyDocument(blocks: readonly Block[]): boolean {
  return blocks.every((block) => isTextBlock(block) && block.text.trim().length === 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readAlign(value: unknown): Align {
  return ALIGNMENTS.includes(value as Align) ? (value as Align) : DEFAULT_ALIGN;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readPositive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}
