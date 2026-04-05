module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        sand: {
          50: '#faf7f2',
          100: '#f4efe6',
          200: '#e9e0d4',
          900: '#0b0b0d'
        },
        card: '#ffffff',
        'card-dark': '#111827',
        heading: '#1f2937',
        'heading-dark': '#f7efe9',
        body: '#6b5b52',
        'body-dark': '#d6cfc9',
        muted: '#8b7d74',
        accent: '#c97a6e',
        'accent-dark': '#e89b85'
      },
      boxShadow: {
        'warm-soft': '0 10px 30px rgba(201,122,110,0.12)'
      },
      borderRadius: {
        '2xl': '1rem'
      }
    }
  },
  plugins: [],
}
