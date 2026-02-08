/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f7fa',
          100: '#d4eaf1',
          200: '#a9d4e3',
          300: '#74b8cf',
          400: '#5aa6bf',
          500: '#3E94AF',
          600: '#3E94AF',
          700: '#347a91',
          800: '#2a6274',
          900: '#1f4a58',
        },
      },
    },
  },
  plugins: [],
};
