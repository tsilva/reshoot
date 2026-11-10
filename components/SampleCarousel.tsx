import { SampleCarouselClient } from "@/components/SampleCarouselClient";
import { openingSampleSources, sampleProducts } from "@/lib/sample-products";

const openingSrcSet = openingSampleSources.map(({ src, width }) => `${src} ${width}w`).join(", ");

export function SampleCarousel() {
  return <SampleCarouselClient sampleProducts={sampleProducts} openingSrc={openingSampleSources[0].src} openingSrcSet={openingSrcSet} />;
}
