import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Board",
  description: "A personal kanban board",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The theme script below writes a class onto this element before React
      // hydrates, which is the whole point of it — and which means the markup the
      // server sent and the DOM the client finds disagree about `class` on every
      // dark-theme load. Suppressed here rather than worked around: the mismatch
      // is intentional and one attribute deep, and the alternative is rendering
      // light and correcting it after hydration, which is the flash this avoids.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* No spellcheck anywhere. `spellcheck` is inherited, so one attribute here
          covers every field in the app — titles, the notes editor, the composer,
          the rename fields — rather than each of them opting out. Card titles are
          full of shorthand and product names, and the squiggles under them were
          noise rather than help. */}
      <body
        spellCheck={false}
        className="flex h-full flex-col overflow-hidden"
      >
        {/* Sets the theme class before anything paints. First thing in the body
            and synchronous, so it runs while the rest of the document is still
            being parsed — where a script that waits for React would render the
            light theme and correct it after hydration, which is a white flash on
            every dark-theme load.

            Here rather than in a `<head>` of its own: writing that element by hand
            fights the one the App Router builds, and the two disagreeing is a
            hydration mismatch on every page load. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
