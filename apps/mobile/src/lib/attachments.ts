import { image, type ImageBlock } from '@dailynote/core';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

/**
 * Images that belong to a note, kept in the app's own storage.
 *
 * The picker hands back a URI in a cache or a system photo container -- somewhere
 * that can be cleared, or that the app may not be able to read again later. So
 * the file is copied in, and the note refers to the copy.
 *
 * What a note stores is a **relative** path (`attachments/<uuid>.jpg`), never an
 * absolute `file:///` URI. iOS changes the app container's path between installs
 * and updates, so an absolute URI saved today is a broken image after the next
 * one. The absolute form is rebuilt at render time by `attachmentUri`.
 */

const FOLDER = 'attachments';

/**
 * Whether this platform can hold attachments at all.
 *
 * `expo-file-system` has no web implementation, so there is nowhere durable to
 * put a picked file: a blob URL dies on reload, and inlining the bytes would
 * put a base64 photo inside every note row. The web build therefore does not
 * offer to add one, rather than offering it and failing.
 */
export const canAttachImages = Platform.OS !== 'web';

/** Everything lands here, so there is one place to look and one to clear. */
function folder(): Directory {
  const directory = new Directory(Paths.document, FOLDER);
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

/**
 * The absolute URI to hand an `<Image>`, rebuilt for wherever the app lives now.
 *
 * Null where there is no file system: a note written on a phone still opens on
 * the web build, and its images show as placeholders instead of crashing it.
 */
export function attachmentUri(path: string): string | null {
  if (!canAttachImages) return null;
  return new File(Paths.document, path).uri;
}

/**
 * Copies a picked image in and returns the note-relative path to it.
 *
 * The name is a fresh UUID rather than the original filename: two photos from
 * a camera roll are routinely both `IMG_0001.jpg`.
 */
export async function saveAttachment(sourceUri: string): Promise<string> {
  const destination = new File(folder(), `${Crypto.randomUUID()}.${extensionOf(sourceUri)}`);
  await new File(sourceUri).copy(destination);

  return `${FOLDER}/${destination.name}`;
}

/**
 * Asks for a photo and returns the block for it, or null if the user backed out.
 *
 * The intrinsic size travels with the block so the editor can hold the right
 * amount of space open before the file has loaded.
 */
export async function pickImage(): Promise<ImageBlock | null> {
  if (!canAttachImages) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // A note is not a photo library: some compression is worth the storage.
    quality: 0.85,
  });
  if (result.canceled) return null;

  const asset = result.assets[0];
  if (asset === undefined) return null;

  return image(await saveAttachment(asset.uri), asset.width, asset.height);
}

function extensionOf(uri: string): string {
  // Strip any query or fragment first: a content:// URI can carry both.
  const name = uri.split(/[?#]/)[0] ?? '';
  const match = /\.([a-zA-Z0-9]+)$/.exec(name);

  return match?.[1]?.toLowerCase() ?? 'jpg';
}
