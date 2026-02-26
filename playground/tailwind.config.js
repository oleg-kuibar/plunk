/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'plunk-bg': '#0d1117',
        'plunk-panel': '#161b22',
        'plunk-border': '#30363d',
        'plunk-text': '#c9d1d9',
        'plunk-accent': '#58a6ff',
        'plunk-success': '#3fb950',
        'plunk-warning': '#d29922',
      },
    },
  },
  plugins: [],
};
