import { Studio } from "@/components/Studio";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_IMAGE_PATH,
} from "@/lib/site";

export default function Home() {
  const webApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    image: new URL(SOCIAL_IMAGE_PATH, SITE_URL).toString(),
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    featureList: [
      "Generate consistent product photos from one original image",
      "Choose up to eight camera perspectives",
      "Review, regenerate, and download approved shots",
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationJsonLd).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <Studio />
    </>
  );
}
