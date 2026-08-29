import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { light: '#EAF0FD', DEFAULT: '#2455C9', dark: '#163A82' },
        secondary: { light: '#FCE7EF', DEFAULT: '#E94F84', dark: '#993556' },
        success: { light: '#E4F6ED', DEFAULT: '#1F9D6B', dark: '#173404' },
        fundo: '#F4F6FA',
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};

export default config;
