import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

/**
 * The app's icon vocabulary, in one place.
 *
 * Screens name what they mean ("overflow", "pin") rather than which glyph in
 * which family draws it, so swapping a glyph is a one-line change here instead
 * of a hunt through the UI. Two families only: Feather for chrome, Material
 * Community for the editor's formatting controls, which Feather has no
 * equivalents for.
 */

type FeatherName = ComponentProps<typeof Feather>['name'];
type MaterialName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const FEATHER = {
  search: 'search',
  overflow: 'more-vertical',
  back: 'arrow-left',
  close: 'x',
  done: 'check',
  chevron: 'chevron-right',
  plus: 'plus',
  lock: 'lock',
  trash: 'trash-2',
  todos: 'check-square',
  mic: 'mic',
  add: 'plus-circle',
  photos: 'image',
  camera: 'camera',
  files: 'folder',
  allNotes: 'file-text',
  edit: 'edit-2',

  // Social.
  profile: 'user',
  follow: 'user-plus',
  following: 'user-check',
  block: 'slash',
  report: 'flag',
  link: 'link-2',
  share: 'share',
  globe: 'globe',
  views: 'eye',
  refresh: 'refresh-cw',
} as const satisfies Record<string, FeatherName>;

const MATERIAL = {
  notes: 'note-text-outline',
  notebook: 'notebook-outline',
  notebooks: 'notebook-multiple',
  reorder: 'format-list-checks',
  undo: 'undo-variant',
  redo: 'redo-variant',
  pin: 'pin-outline',
  unpin: 'pin-off-outline',

  // Social. The feed's tab glyph is deliberately not a bird, a bell or a
  // house: it is a stack of pages, because what is in there is other people's
  // notes.
  feed: 'file-multiple-outline',
  like: 'heart-outline',
  liked: 'heart',
  followedThrough: 'check-decagram-outline',
  thread: 'comment-text-multiple-outline',

  // Format sheet.
  textSize: 'format-size',
  bold: 'format-bold',
  italic: 'format-italic',
  underline: 'format-underline',
  strikethrough: 'format-strikethrough-variant',
  bulletList: 'format-list-bulleted',
  numberedList: 'format-list-numbered',
  checklist: 'format-list-checkbox',
  indent: 'format-indent-increase',
  outdent: 'format-indent-decrease',
  alignLeft: 'format-align-left',
  alignCenter: 'format-align-center',
  alignRight: 'format-align-right',
  highlight: 'marker',
  doodle: 'draw',
  spreadsheet: 'table',
} as const satisfies Record<string, MaterialName>;

export type IconName = keyof typeof FEATHER | keyof typeof MATERIAL;

export interface IconProps {
  name: IconName;
  size?: number;
  /** Widened past `string` so navigator tint callbacks can pass theirs through. */
  color: ColorValue;
}

export function Icon({ name, size = 22, color }: IconProps) {
  if (name in FEATHER) {
    const glyph = FEATHER[name as keyof typeof FEATHER];
    return <Feather name={glyph} size={size} color={color} />;
  }
  const glyph = MATERIAL[name as keyof typeof MATERIAL];
  return <MaterialCommunityIcons name={glyph} size={size} color={color} />;
}
