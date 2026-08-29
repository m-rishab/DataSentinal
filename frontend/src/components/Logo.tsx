/* DataSentinel brand mark — a nested shield reading as "watchdog / guard".
   Flat, no glow: a 1px teal ring with a check inside. Sized by `px`. */

export default function Logo({ size = 26, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="3"
        y="3"
        width="26"
        height="26"
        rx="7"
        stroke="var(--color-accent, #0e9a8b)"
        strokeOpacity="0.55"
        strokeWidth="1.4"
      />
      <path
        d="M16 6.8l7 2.8v6.1c0 4.3-3 7.3-7 8.7-4-1.4-7-4.4-7-8.7V9.6l7-2.8z"
        stroke="var(--color-primary, #1a2027)"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M12.4 15.9l2.4 2.4 5-5.2"
        stroke="var(--color-accent, #0e9a8b)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}