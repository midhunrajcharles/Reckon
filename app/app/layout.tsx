import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Display: high-contrast editorial serif. Instrument Serif ships under the
// Open Font License — PP Editorial Old is commercial and cannot be shipped.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

// Data values only: hashes, amounts, blocks, timestamps.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

// Sentence rhythm needs a true 200.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  weight: ["200", "400", "600", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Reckon — settlement tape",
  description:
    "Autonomous onchain settlement with independent verification. Reported status is a hypothesis; only the chain settles.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${plexMono.variable} ${plexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
