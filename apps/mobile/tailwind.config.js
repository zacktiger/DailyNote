const palette = require('./src/theme/colors.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' instead of the default 'media' because NativeWind's web runtime
  // crashes in dev under 'media' ("Cannot manually set color scheme").
  // Native is unaffected -- it follows the system scheme either way -- and
  // the web <html> class is synced to the OS setting in app/_layout.tsx.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paper, not chrome. A notes app should feel like a surface you write
        // on, so the palette is warm near-monochrome with one quiet accent
        // reserved for commitments. Hex values live in src/theme/colors.json,
        // shared with runtime code via src/theme.
        paper: { DEFAULT: palette.paper.light, dark: palette.paper.dark },
        canvas: { DEFAULT: palette.canvas.light, dark: palette.canvas.dark },
        card: { DEFAULT: palette.card.light, dark: palette.card.dark },
        ink: { DEFAULT: palette.ink.light, dark: palette.ink.dark },
        muted: { DEFAULT: palette.muted.light, dark: palette.muted.dark },
        faint: { DEFAULT: palette.faint.light, dark: palette.faint.dark },
        line: { DEFAULT: palette.line.light, dark: palette.line.dark },
        accent: { DEFAULT: palette.accent.light, dark: palette.accent.dark },
      },
      fontFamily: {
        // Newsreader carries the writing surface; UI chrome stays on the
        // system sans. React Native needs one exact family name per weight,
        // so these must not be combined with font-weight utilities.
        serif: ['Newsreader_400Regular'],
        'serif-medium': ['Newsreader_500Medium'],
        'serif-italic': ['Newsreader_400Regular_Italic'],
      },
    },
  },
  plugins: [],
};
