/**
 * DataSentinel Design System — TS mirror of the CSS tokens in index.css.
 *
 * Visual direction: warm off-white page, white surfaces, charcoal text,
 * subtle cool-gray hairlines, ONE teal accent. Clean technical aesthetic
 * inspired by Linear, DataHub and OpenMetadata. Single light theme.
 */

export const colors = {
  // Surfaces
  page: '#faf9f5',
  surface: '#ffffff',
  panel: '#ffffff',
  panel2: '#f6f5f1',
  elevated: '#ffffff',
  canvas: '#fbfaf7',

  // Text hierarchy
  text: {
    primary: '#1a2027',
    secondary: '#55606d',
    disabled: '#8a94a1',
  },

  // Hairlines
  border: {
    default: 'rgba(31, 42, 57, 0.09)',
    strong: 'rgba(31, 42, 57, 0.16)',
  },

  // Status
  status: {
    accent: '#0e9a8b', // DataSentinel teal
    accentStrong: '#0b8377',
    running: '#5b7ea6', // neutral info / running
    success: '#2f9e74', // completed / verified
    warning: '#c9892b', // caution
    error: '#cf4f4c', // failed / critical
    pending: '#98a3ad', // waiting
    track: 'rgba(31, 42, 57, 0.08)',
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
