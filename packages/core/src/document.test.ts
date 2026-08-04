import { describe, expect, it } from 'vitest';
import {
  bullet,
  documentToText,
  image,
  isEmptyDocument,
  paragraph,
  parseDocument,
  serializeDocument,
  setAlign,
  toggleBullet,
  type Block,
} from './document';
import { parseHashtags } from './hashtags';
import { deriveTitle } from './title';

describe('parseDocument', () => {
  it('turns a plain body into one paragraph per line', () => {
    const blocks = parseDocument(null, 'Groceries\nmilk\noats');

    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'paragraph', 'paragraph']);
    expect(blocks.map((block) => (block as { text: string }).text)).toEqual([
      'Groceries',
      'milk',
      'oats',
    ]);
  });

  it('always yields at least one block, so the caret has a home', () => {
    expect(parseDocument(null, '')).toHaveLength(1);
    expect(parseDocument('{"v":1,"blocks":[]}', '')).toHaveLength(1);
  });

  it('gives every block a distinct id', () => {
    const blocks = parseDocument(null, 'one\ntwo\nthree');
    expect(new Set(blocks.map((block) => block.id)).size).toBe(3);
  });

  it('falls back to the body when the doc is not valid JSON', () => {
    const blocks = parseDocument('{ not json', 'the writing survived');
    expect(documentToText(blocks)).toBe('the writing survived');
  });

  it('falls back to the body when the version is unknown', () => {
    const blocks = parseDocument('{"v":99,"blocks":[{"type":"paragraph","text":"x"}]}', 'fallback');
    expect(documentToText(blocks)).toBe('fallback');
  });

  it('skips unreadable blocks rather than losing the whole document', () => {
    const doc =
      '{"v":1,"blocks":[{"type":"paragraph","text":"kept"},{"type":"future"},{"type":"bullet","text":"also kept"}]}';

    expect(documentToText(parseDocument(doc, 'ignored'))).toBe('kept\n- also kept');
  });

  it('defaults a missing or unknown alignment to left', () => {
    const doc = '{"v":1,"blocks":[{"type":"paragraph","text":"a"},{"type":"paragraph","text":"b","align":"sideways"}]}';
    expect(parseDocument(doc, '').map((block) => block.align)).toEqual(['left', 'left']);
  });
});

describe('serializeDocument', () => {
  it('round-trips content, type and alignment', () => {
    const blocks: Block[] = [
      paragraph('Groceries', 'center'),
      bullet('milk'),
      image('attachments/a.jpg', 800, 600),
    ];

    const restored = parseDocument(serializeDocument(blocks), '');

    expect(restored.map((block) => [block.type, block.align])).toEqual([
      ['paragraph', 'center'],
      ['bullet', 'left'],
      ['image', 'center'],
    ]);
    expect(restored[2]).toMatchObject({ uri: 'attachments/a.jpg', width: 800, height: 600 });
  });

  it('omits the default alignment and never writes ids', () => {
    const serialized = serializeDocument([paragraph('plain')]);

    expect(serialized).toBe('{"v":1,"blocks":[{"type":"paragraph","text":"plain"}]}');
  });
});

describe('documentToText', () => {
  it('marks bullets so the rest of core keeps understanding them', () => {
    expect(documentToText([paragraph('Groceries'), bullet('milk'), bullet('oats')])).toBe(
      'Groceries\n- milk\n- oats',
    );
  });

  it('omits images, so a note that opens with a photo still titles from its writing', () => {
    const blocks = [image('attachments/a.jpg', 100, 100), paragraph('Beach day')];

    expect(documentToText(blocks)).toBe('Beach day');
    expect(deriveTitle(documentToText(blocks))).toBe('Beach day');
  });

  it('ignores alignment, which is presentation only', () => {
    expect(documentToText([paragraph('centred', 'center')])).toBe('centred');
  });

  it('keeps the first block as the title and the rest as the preview', () => {
    const blocks = [paragraph('Groceries for the week'), bullet('milk')];
    const body = documentToText(blocks);

    expect(deriveTitle(body)).toBe('Groceries for the week');
    // What the list card shows beneath the title: everything after line one.
    expect(body.split('\n').slice(1).join(' ').trim()).toBe('- milk');
  });

  it('leaves hashtags where the parser can still find them', () => {
    expect(parseHashtags(documentToText([paragraph('call the dentist #do')]))).toEqual(['do']);
  });
});

describe('toggleBullet', () => {
  it('turns a paragraph into a bullet and back', () => {
    const blocks = [paragraph('milk')];

    const bulleted = toggleBullet(blocks, 0);
    expect(bulleted[0]!.type).toBe('bullet');
    expect(toggleBullet(bulleted, 0)[0]!.type).toBe('paragraph');
  });

  it('keeps the text and the alignment', () => {
    const [toggled] = toggleBullet([paragraph('milk', 'center')], 0);

    expect(toggled).toMatchObject({ text: 'milk', align: 'center' });
  });

  it('leaves the rest of the document alone', () => {
    const blocks = [paragraph('Groceries'), paragraph('milk'), paragraph('oats')];

    expect(documentToText(toggleBullet(blocks, 1))).toBe('Groceries\n- milk\noats');
  });

  it('is a no-op on an image or an index that is not there', () => {
    const blocks = [image('attachments/a.jpg', 10, 10)];

    expect(toggleBullet(blocks, 0)[0]!.type).toBe('image');
    expect(toggleBullet(blocks, 7)).toHaveLength(1);
  });

  it('does not mutate the document it was given', () => {
    const blocks = [paragraph('milk')];
    toggleBullet(blocks, 0);

    expect(blocks[0]!.type).toBe('paragraph');
  });
});

describe('setAlign', () => {
  it('aligns one block and leaves the others', () => {
    const blocks = [paragraph('Groceries'), paragraph('milk')];

    expect(setAlign(blocks, 0, 'center').map((block) => block.align)).toEqual(['center', 'left']);
  });

  it('aligns an image too', () => {
    expect(setAlign([image('attachments/a.jpg', 10, 10)], 0, 'right')[0]!.align).toBe('right');
  });

  it('survives the round trip through storage', () => {
    const aligned = setAlign([paragraph('centred')], 0, 'center');

    expect(parseDocument(serializeDocument(aligned), '')[0]!.align).toBe('center');
  });

  it('is a no-op for an index that is not there', () => {
    expect(setAlign([paragraph('a')], 4, 'right')[0]!.align).toBe('left');
  });

  it('does not mutate the document it was given', () => {
    const blocks = [paragraph('a')];
    setAlign(blocks, 0, 'right');

    expect(blocks[0]!.align).toBe('left');
  });
});

describe('isEmptyDocument', () => {
  it('is true for a blank note', () => {
    expect(isEmptyDocument([paragraph()])).toBe(true);
    expect(isEmptyDocument([paragraph('  '), bullet('\t')])).toBe(true);
  });

  it('is false once anything is written', () => {
    expect(isEmptyDocument([paragraph('x')])).toBe(false);
  });

  it('is false for an image-only note, which is worth saving', () => {
    expect(isEmptyDocument([paragraph(''), image('attachments/a.jpg', 10, 10)])).toBe(false);
  });
});
