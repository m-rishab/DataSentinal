/**
 * DataSentinel Design System
 *
 * Minimal, flat, eye-comfortable dark theme.
 * NO gradients, NO neon glow, NO pure black/white.
 * Saturated colors only on borders/text/small accents, never large fills.
 */

export const colors = {
  // Surface layers
  page: '#0d0f12',
  card: '#14171b',
  elevated: '#1a1e23',

  // Text hierarchy
  text: {
    primary: '#e4e6eb',
    secondary: '#8b9099',
    disabled: '#5a5f68',
  },

  // Borders
  border: {
    default: 'rgba(255, 255, 255, 0.08)',
    strong: 'rgba(255, 255, 255, 0.15)',
  },

  // Status colors (desaturated, muted)
  status: {
    running: '#6b96c4',      // desaturated blue-gray
    success: '#4a9d7f',      // muted sage-teal
    error: '#c4645f',        // dusty red
    pending: '#3a3f47',      // neutral gray
  },
} as const

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const

export const animation = {
  // Running node pulse: opacity only, no glow
  pulse: {
    duration: '1.5s',
    keyframes: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.6 },
    },
  },
} as const
