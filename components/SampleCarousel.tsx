"use client";

import Image from "next/image";
import { X } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { sampleProducts } from "@/lib/client/sample-products";
import { Dialog } from "@/components/Dialog";
import { SlideshowControls } from "@/components/SlideshowControls";
import { usePhotoPlayback } from "@/lib/client/use-photo-playback";

type SampleView = { productIndex: number; angleIndex: number };

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
  const sampleRef = useRef<HTMLElement>(null);
  const productLoaded = sampleAngles.every((angle) => loadedViews.has(`${product.id}:${angle.id}`));
  const angle = sampleAngles[angleIndex];
  const advance = useCallback(() => setView((current) => nextView(current, 1)), []);
  const playback = usePhotoPlayback({ containerRef: sampleRef, frameKey: `${product.id}:${angle.id}`, ready: productLoaded, blocked: originalOpen, onAdvance: advance });
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
            const firstView = sampleIndex === 0 && index === 0;
            return (
              <Image
                key={`${sampleProduct.id}:${sampleAngle.id}`}
                src={sampleAngle.image}
                style={sampleAngle.offset ? {
                  translate: `${100 * sampleAngle.offset.x / sampleAngle.image.width}% ${100 * sampleAngle.offset.y / sampleAngle.image.height}%`,
                  scale: sampleAngle.offset.scale,
                  transformOrigin: "top left",
                } : undefined}
                sizes="(max-width: 850px) 100vw, 60vw"
                alt={`Generated ${sampleProduct.description}, ${sampleAngle.label.toLowerCase()} studio view`}
                preload={firstView}
                loading={firstView ? undefined : "eager"}
                fetchPriority={firstView ? undefined : "low"}
                onLoad={() => {
                  const key = `${sampleProduct.id}:${sampleAngle.id}`;
                  setLoadedViews((loaded) => loaded.has(key) ? loaded : new Set(loaded).add(key));
                }}
                hidden={sampleProduct.id !== product.id || index !== angleIndex}
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
