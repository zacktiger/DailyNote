import { useMemo } from 'react';
import { useColorScheme } from 'react-native';

import palette from './colors.json';

export { palette };

type PaletteKey = keyof typeof palette;

export type Theme = { dark: boolean } & Record<PaletteKey, string>;

const KEYS = Object.keys(palette) as PaletteKey[];

function resolve(dark: boolean): Theme {
  const entries = KEYS.map((key) => [key, dark ? palette[key].dark : palette[key].light]);
  return { dark, ...Object.fromEntries(entries) } as Theme;
}

// Both schemes are resolved once at module load: the object identity is stable,
// so a theme value in a dependency array does not retrigger effects on render.
const THEMES = { light: resolve(false), dark: resolve(true) } as const;

/**
 * The palette, resolved for the current colour scheme.
 *
 * NativeWind classes cover most styling, but React Native props that take a
 * colour value (`selectionColor`, `placeholderTextColor`, navigator header
 * options, icon glyph fills) need the actual hex — this keeps them on the same
 * palette as the classes instead of scattering hardcoded copies around.
 */
export function useTheme(): Theme {
  const dark = useColorScheme() === 'dark';
  return useMemo(() => (dark ? THEMES.dark : THEMES.light), [dark]);
}

/**
 * Resolves a stored palette key, such as a notebook's colour.
 *
 * Notebooks store a key rather than a hex value so they re-theme with the app,
 * but the key comes out of the database and may name a colour that a later
 * release removed -- hence the fallback rather than an index straight into the
 * theme.
 */
export function swatchColor(theme: Theme, key: string): string {
  return key in palette ? theme[key as PaletteKey] : theme.swatch;
}
