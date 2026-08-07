/**
 * Slack's four-paddle mark, inlined rather than imported: Lucide dropped its
 * brand icons, so there's no `Slack` glyph in the package. Drawn as fills with
 * `currentColor` — like `junior-mark.tsx` — so it inherits the tone of whatever
 * badge it sits in instead of carrying Slack's own four colours onto a board
 * whose whole language is tonal.
 */
export function SlackMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M5.1 15.2a2.6 2.6 0 1 1-2.6-2.6h2.6v2.6Zm1.3 0a2.6 2.6 0 0 1 5.2 0v6.5a2.6 2.6 0 0 1-5.2 0v-6.5Z" />
      <path d="M8.8 5.1a2.6 2.6 0 1 1 2.6-2.6v2.6H8.8Zm0 1.3a2.6 2.6 0 0 1 0 5.2H2.3a2.6 2.6 0 0 1 0-5.2h6.5Z" />
      <path d="M18.9 8.8a2.6 2.6 0 1 1 2.6 2.6h-2.6V8.8Zm-1.3 0a2.6 2.6 0 0 1-5.2 0V2.3a2.6 2.6 0 0 1 5.2 0v6.5Z" />
      <path d="M15.2 18.9a2.6 2.6 0 1 1-2.6 2.6v-2.6h2.6Zm0-1.3a2.6 2.6 0 0 1 0-5.2h6.5a2.6 2.6 0 0 1 0 5.2h-6.5Z" />
    </svg>
  );
}
