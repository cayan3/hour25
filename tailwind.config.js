/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // DESIGN §9: picker 100ms opacity + scale 0.98→1; sheet translate-y.
      // Used only behind motion-safe: — instant under prefers-reduced-motion.
      keyframes: {
        'picker-in': {
          from: { opacity: '0', transform: 'scale(0.98)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'sheet-in': {
          from: { opacity: '0', transform: 'translateY(1rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'picker-in': 'picker-in 100ms ease-out',
        'sheet-in': 'sheet-in 100ms ease-out',
      },
    },
  },
  plugins: [],
};
