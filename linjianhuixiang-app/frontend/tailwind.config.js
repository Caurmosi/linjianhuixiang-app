/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1b2a22',
          soft: '#56695e',
          faint: '#8a9a8f',
        },
        paper: {
          DEFAULT: '#f5f2ea',
          2: '#ece7da',
        },
        surface: '#ffffff',
        line: {
          DEFAULT: '#e3ddcf',
          strong: '#d2c9b5',
        },
        forest: {
          900: '#0e2a1f',
          800: '#103027',
          700: '#14422f',
          600: '#1f5a3f',
          500: '#2e7d52',
          400: '#4fa873',
          300: '#8fcba6',
          200: '#c4e6d2',
          100: '#e6f3ea',
        },
        sun: {
          DEFAULT: '#e09a2e',
          soft: '#f3c879',
        },
        clay: {
          DEFAULT: '#c25a39',
          soft: '#e29a82',
        },
        liv: {
          good: '#2e7d52',
          mid: '#d49a26',
          bad: '#c25a39',
        },
      },
      fontFamily: {
        display: ["'Fraunces'", "'Songti SC'", 'Georgia', 'serif'],
        body: ["'Manrope'", "'PingFang SC'", "'Microsoft YaHei'", 'system-ui', 'sans-serif'],
        mono: ["'Space Grotesk'", "'Manrope'", 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,42,34,.04), 0 12px 30px -12px rgba(27,42,34,.18)',
      },
    },
  },
  plugins: [],
};
