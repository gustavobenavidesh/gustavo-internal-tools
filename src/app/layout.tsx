import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
        {children}
      </body>
    </html>
  );
}
