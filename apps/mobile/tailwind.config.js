/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Paper, not chrome. A notes app should feel like a surface you write
        // on, so the palette is deliberately near-monochrome.
        paper: { DEFAULT: '#ffffff', dark: '#0b0b0f' },
        ink: { DEFAULT: '#16161a', dark: '#f4f4f5' },
        muted: { DEFAULT: '#71717a', dark: '#8b8b93' },
        line: { DEFAULT: '#e4e4e7', dark: '#26262c' },
        accent: { DEFAULT: '#2563eb', dark: '#60a5fa' },
      },
    },
  },
  plugins: [],
};
