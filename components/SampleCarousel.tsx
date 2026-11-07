"use client";

import Image from "next/image";
import { X } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { sampleProducts } from "@/lib/client/sample-products";
import { Dialog } from "@/components/Dialog";
import { SlideshowControls } from "@/components/SlideshowControls";
import { usePhotoPlayback } from "@/lib/client/use-photo-playback";

type SampleView = { productIndex: number; angleIndex: number };

const OPENING_VIEW_KEY = `${sampleProducts[0].id}:${sampleProducts[0].angles[0].id}`;
const SAMPLE_IMAGE_SIZES = "(max-width: 540px) calc(100vw - 34px), (max-width: 850px) min(calc(100vw - 44px), 720px), min(60vw, 720px)";

function nextView(current: SampleView, direction: -1 | 1): SampleView {
  const angleIndex = current.angleIndex + direction;
  if (angleIndex >= 0 && angleIndex < sampleProducts[current.productIndex].angles.length) {
    return { ...current, angleIndex };
  }
  const productIndex = (current.productIndex + direction + sampleProducts.length) % sampleProducts.length;
  return { productIndex, angleIndex: direction === 1 ? 0 : sampleProducts[productIndex].angles.length - 1 };
}

export function SampleCarousel() {
  const [{ productIndex, angleIndex }, setView] = useState<SampleView>({ productIndex: 0, angleIndex: 0 });
  const product = sampleProducts[productIndex];
  const sampleAngles = product.angles;
  const [originalOpen, setOriginalOpen] = useState(false);
  const [loadedViews, setLoadedViews] = useState<Set<string>>(() => new Set());
  const [openingFailed, setOpeningFailed] = useState(false);
  const sampleRef = useRef<HTMLElement>(null);
  const angle = sampleAngles[angleIndex];
  const frameKey = `${product.id}:${angle.id}`;
  const upcoming = nextView({ productIndex, angleIndex }, 1);
  const upcomingProduct = sampleProducts[upcoming.productIndex];
  const upcomingKey = `${upcomingProduct.id}:${upcomingProduct.angles[upcoming.angleIndex].id}`;
  const ready = loadedViews.has(frameKey) && loadedViews.has(upcomingKey);
  const openingSettled = openingFailed || loadedViews.has(OPENING_VIEW_KEY);
  const previousProduct = (productIndex + sampleProducts.length - 1) % sampleProducts.length;
  const nextProduct = (productIndex + 1) % sampleProducts.length;
  const advance = useCallback(() => setView((current) => nextView(current, 1)), []);
  const playback = usePhotoPlayback({ containerRef: sampleRef, frameKey, ready, blocked: originalOpen, onAdvance: advance });
  const rotationEnabled = playback.enabled;

  function cycleSample(direction: -1 | 1) {
    playback.pause();
    setOriginalOpen(false);
    setView((current) => nextView(current, direction));
  }

  function togglePlayback() {
    playback.toggle();
    setOriginalOpen(false);
  }

  return (
    <section
      className="sample-workspace"
      id="sample"
      ref={sampleRef}
      aria-label="Product photo example"
      aria-roledescription="carousel"
      onFocusCapture={playback.onFocusCapture}
      onBlurCapture={playback.onBlurCapture}
      onKeyDown={(event) => {
        if (originalOpen) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        cycleSample(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <div className="sample-viewer">
        <div className="sample-photo">
          {sampleProducts.flatMap((sampleProduct, sampleIndex) => sampleProduct.angles.map((sampleAngle, index) => {
            const key = `${sampleProduct.id}:${sampleAngle.id}`;
            const firstView = key === OPENING_VIEW_KEY;
            const active = sampleIndex === productIndex && index === angleIndex;
            // Warm the active rotation and the entry frame in each direction after the opening image.
            const adjacentEntry = (sampleIndex === nextProduct && index === 0)
              || (sampleIndex === previousProduct && index === sampleProduct.angles.length - 1);
            const warm = openingSettled && (sampleIndex === productIndex || adjacentEntry);
            if (!firstView && !active && !warm && !loadedViews.has(key)) return null;
            return (
              <Image
                key={key}
                src={sampleAngle.image}
                sizes={SAMPLE_IMAGE_SIZES}
                alt={`Generated ${sampleProduct.description}, ${sampleAngle.label.toLowerCase()} studio view`}
                loading="eager"
                fetchPriority={active ? "high" : "low"}
                onLoad={() => {
                  setLoadedViews((loaded) => loaded.has(key) ? loaded : new Set(loaded).add(key));
                }}
                onError={firstView ? () => setOpeningFailed(true) : undefined}
                hidden={!active}
              />
            );
          }))}
        </div>
      </div>
      <div className="sample-toolbar">
        <SlideshowControls playing={rotationEnabled} onPrevious={() => cycleSample(-1)} onNext={() => cycleSample(1)} onTogglePlayback={togglePlayback} />
        <button className="sample-original-preview" type="button" aria-haspopup="dialog" aria-controls="sample-original-modal" title="View illustrative original photo" onClick={() => setOriginalOpen(true)}>
          <Image src={product.upload} alt="" width={44} height={44} sizes="(hover: hover) 120px, 44px" loading="eager" />
          <span>Show original</span>
        </button>
      </div>
      {originalOpen ? (
        <Dialog labelledBy="sample-original-title" onClose={() => setOriginalOpen(false)}>
          <section className="sample-original-modal" id="sample-original-modal">
            <span id="sample-original-title" className="sr-only">Original photo: {product.label}</span>
            <Image src={product.upload} alt={`Illustrative original: ${product.description} with a cluttered household background`} sizes="(max-width: 1008px) 100vw, 960px" loading="eager" />
            <button type="button" className="sample-original-close" aria-label="Close original photo" data-autofocus onClick={() => setOriginalOpen(false)}><X size={22} aria-hidden="true" /></button>
          </section>
        </Dialog>
      ) : null}
      <p className="sr-only">Illustrative examples. Eight studio views per product; the slideshow changes product after each full rotation. Show original opens the example upload in a dialog and pauses the slideshow.</p>
      <p className="sr-only" aria-live={rotationEnabled ? "off" : "polite"} aria-atomic="true">{product.label}: Generated {angle.label.toLowerCase()} studio view. {angleIndex + 1} of {sampleAngles.length}.</p>
    </section>
  );
}
