/**
 * DataSentinel Design System — TS mirror of the CSS tokens in index.css.
 *
 * Visual direction: deep charcoal surfaces, blue-gray hairlines, soft white
 * text, muted gray-blue secondary text, ONE teal accent. Status colors are
 * desaturated so they read as evidence, not neon. Technical, not cyberpunk.
 */

export const colors = {
  // Surfaces
  page: '#0b0e13',
  surface: '#10141b',
  panel: '#141a24',
  panel2: '#182030',
  elevated: '#1b2333',

  // Text hierarchy
  text: {
    primary: '#e8ecf3',
    secondary: '#9aa3b2',
    disabled: '#5f6a7a',
  },

  // Hairlines
  border: {
    default: 'rgba(141, 155, 178, 0.14)',
    strong: 'rgba(141, 155, 178, 0.28)',
  },

  // Status (desaturated, muted)
  status: {
    accent: '#35c2b3', // DataSentinel teal
    running: '#6b96c4', // neutral info / running
    success: '#4a9d7f', // completed / verified
    warning: '#c9a14a', // caution
    error: '#c4645f', // failed / critical
    pending: '#3a414d', // waiting
  },
} as const

export const fonts = {
  sans: `'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`,
  display: `'Space Grotesk', 'Inter', system-ui, sans-serif`,
  mono: `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`,
  editorial: `'Fraunces', Georgia, serif`,
} as const

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const

export const animation = {
  pulse: {
    duration: '1.5s',
    keyframes: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.55 },
    },
  },
} as const