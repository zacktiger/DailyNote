const palette = require('./src/theme/colors.json');

/** One palette entry -> a Tailwind colour with a `-dark` shade. */
const shade = (name) => ({ DEFAULT: palette[name].light, dark: palette[name].dark });

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // 'class' instead of the default 'media' because NativeWind's web runtime
  // crashes in dev under 'media' ("Cannot manually set color scheme"). The
  // class is synced to the OS setting on every platform in app/_layout.tsx --
  // native included, or `dark:` variants never activate there at all.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark-first, OLED black with a single amber accent. The canvas is
        // true black so cards read as objects lifted off it; anything that
        // needs to sit above a card goes on `elevated`. Hex values live in
        // src/theme/colors.json, shared with runtime code via src/theme.
        canvas: shade('canvas'),
        paper: shade('paper'),
        card: shade('card'),
        elevated: shade('elevated'),
        sheet: shade('sheet'),
        ink: shade('ink'),
        muted: shade('muted'),
        faint: shade('faint'),
        line: shade('line'),
        accent: shade('accent'),
        // Text/icons drawn on top of an accent fill.
        'accent-ink': shade('accentInk'),
        // Notebook folder swatches.
        swatch: shade('swatch'),
        'swatch-warm': shade('swatchWarm'),
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
