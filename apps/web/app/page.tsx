import type { Metadata } from "next";
import { connection } from "next/server";
import { WebsitePreview } from "@/features/onboarding/website-preview";
import { publicSite } from "@/features/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: publicSite.name,
    title: publicSite.title,
    description: publicSite.description,
    url: "/",
    locale: "en_US",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${publicSite.url}/#organization`,
      name: publicSite.name,
      url: publicSite.url,
      logo: `${publicSite.url}/icon.svg`,
      email: "info@scoutalert.app",
    },
    {
      "@type": "WebSite",
      "@id": `${publicSite.url}/#website`,
      name: publicSite.name,
      url: publicSite.url,
      description: publicSite.description,
      inLanguage: "en",
      publisher: { "@id": `${publicSite.url}/#organization` },
    },
  ],
};

/** Serves crawlable product content at the canonical URL, with actions matching the runtime launch mode. */
export default async function Home() {
  await connection();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <WebsitePreview
        websiteOnly={process.env.SCOUTALERT_WEBSITE_ONLY === "true"}
      />
    </>
  );
}
