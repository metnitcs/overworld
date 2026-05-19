/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Kawaii pastel palette (inspired by DMO's UI style)
        'kw-cream':     '#fff4d6',   // soft cream main bg
        'kw-cream-2':   '#ffe9b8',   // darker cream
        'kw-sky':       '#7cc7eb',   // light sky blue
        'kw-sky-2':     '#5ba8d6',   // mid sky
        'kw-blue':      '#2e7cb5',   // header dark blue
        'kw-blue-deep': '#1e4f8a',   // header gradient deep
        'kw-panel':     '#c5e4f3',   // panel light blue
        'kw-panel-2':   '#9ed0e9',   // panel mid
        'kw-panel-in':  '#e8f4fc',   // inner panel near white
        'kw-orange':    '#ff9842',   // primary button
        'kw-orange-2':  '#f06a1a',   // primary button hover
        'kw-red':       '#e74c3c',   // danger
        'kw-pink':      '#ffd6e0',   // chat bubble light
        'kw-pink-2':    '#fbc4d4',   // chat bubble accent
        'kw-yellow':    '#ffd93d',
        'kw-gold':      '#f5a623',
        'kw-hp':        '#ff5e5e',
        'kw-mp':        '#4f8ed6',
        'kw-exp':       '#ffd23f',
        'kw-text':      '#2d3a4d',   // main text - dark navy
        'kw-text-dim':  '#6a7990',
        'kw-border':    '#7aa8c4',
        'kw-border-2':  '#4a7796',
      },
      fontFamily: {
        thai: ['Kanit', 'Mali', 'Tahoma', 'Trebuchet MS', 'sans-serif'],
      },
      boxShadow: {
        'pop': '0 3px 0 rgba(0,0,0,0.18), 0 0 0 2px rgba(255,255,255,0.6) inset',
        'panel': '0 4px 12px rgba(30,80,140,0.25), inset 0 1px 0 rgba(255,255,255,0.7)',
        'btn-orange': '0 3px 0 #c44d10, 0 0 0 2px rgba(255,255,255,0.4) inset',
        'btn-blue': '0 3px 0 #1e4f8a, 0 0 0 2px rgba(255,255,255,0.4) inset',
      },
      keyframes: {
        hitshake: {
          '0%,100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-8px)' },
          '40%': { transform: 'translateX(8px)' },
          '60%': { transform: 'translateX(-4px)' },
          '80%': { transform: 'translateX(4px)' },
        },
        flash: {
          '0%,100%': { filter: 'brightness(1)' },
          '50%': { filter: 'brightness(2.5)' },
        },
        floatup: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-60px)' },
        },
        bounce2: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        warpPulse: {
          '0%,100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.15)', opacity: '1' },
        },
      },
      animation: {
        hitshake: 'hitshake 0.4s',
        flash: 'flash 0.3s',
        floatup: 'floatup 1s ease-out forwards',
        bounce2: 'bounce2 1.4s ease-in-out infinite',
        warpPulse: 'warpPulse 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
