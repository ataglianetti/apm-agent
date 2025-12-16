/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'apm-dark': '#0d1117',
        'apm-navy': '#1a1f36',
        'apm-purple': '#7c3aed',
        'apm-purple-light': '#a78bfa',
        'apm-purple-dark': '#5b21b6',
        'apm-gray': '#4b5563',
        'apm-gray-light': '#9ca3af',
        'apm-light': '#f9fafb',
      },
      fontFamily: {
        'poppins': ['Poppins', 'sans-serif'],
      }
    }
  },
  plugins: [],
}
