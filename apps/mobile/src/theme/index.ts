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
