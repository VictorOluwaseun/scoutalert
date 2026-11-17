import type { Metadata } from "next";
import localFont from "next/font/local";
import { publicSite } from "@/features/seo/site";
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
  metadataBase: new URL(publicSite.url),
  title: publicSite.title,
  description: publicSite.description,
  applicationName: publicSite.name,
  // Public content opts into indexing explicitly; account and preview routes inherit this default.
  robots: { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: publicSite.name,
    title: publicSite.title,
    description: publicSite.description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: publicSite.title,
    description: publicSite.description,
  },
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
