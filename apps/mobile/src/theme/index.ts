import { useColorScheme } from 'react-native';

import palette from './colors.json';

export { palette };

/**
 * The palette, resolved for the current colour scheme.
 *
 * NativeWind classes cover most styling, but React Native props that take a
 * colour value (`selectionColor`, `placeholderTextColor`, navigator header
 * options) need the actual hex — this keeps them on the same palette as the
 * classes instead of scattering hardcoded copies around.
 */
export function useTheme() {
  const dark = useColorScheme() === 'dark';
  return {
    dark,
    paper: dark ? palette.paper.dark : palette.paper.light,
    ink: dark ? palette.ink.dark : palette.ink.light,
    muted: dark ? palette.muted.dark : palette.muted.light,
    faint: dark ? palette.faint.dark : palette.faint.light,
    line: dark ? palette.line.dark : palette.line.light,
    accent: dark ? palette.accent.dark : palette.accent.light,
  } as const;
}
