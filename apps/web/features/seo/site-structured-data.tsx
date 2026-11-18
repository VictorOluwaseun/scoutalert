import { publicSite } from "./site";

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

/** Describes the public brand to search engines without adding a screen or changing the onboarding flow. */
export function SiteStructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
      }}
    />
  );
}
