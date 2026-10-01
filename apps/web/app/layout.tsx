import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/ManropeLatin.woff2",
  variable: "--font-manrope",
  display: "swap",
  weight: "400 800",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "ScoutAlert — Your next move, worth finding",
  description:
    "Brief your personal opportunity scout. Explore jobs, contracts, and client projects on your terms.",
  icons: { icon: "/icon.svg" },
};

/** Supplies the selected product typeface, local code font, and document language. */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
