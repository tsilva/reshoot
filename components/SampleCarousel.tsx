"use client";

import Image from "next/image";
import { CaretLeft, CaretRight, Pause, Play, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sampleProducts } from "@/lib/client/sample-products";
import { Dialog } from "@/components/Dialog";

const ROTATION_INTERVAL_MS = 900;

type SampleView = { productIndex: number; angleIndex: number };

function nextView(current: SampleView, direction: -1 | 1): SampleView {
  const angleIndex = current.angleIndex + direction;
  if (angleIndex >= 0 && angleIndex < sampleProducts[current.productIndex].angles.length) {
    return { ...current, angleIndex };
  }
  const productIndex = (current.productIndex + direction + sampleProducts.length) % sampleProducts.length;
  return { productIndex, angleIndex: direction === 1 ? 0 : sampleProducts[productIndex].angles.length - 1 };
}

function subscribeToMotionPreference(onChange: () => void) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

function getReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getPageVisible() {
  return document.visibilityState === "visible";
}

function getServerReducedMotion() { return true; }
function getServerVisible() { return false; }

export function SampleCarousel() {
  const [{ productIndex, angleIndex }, setView] = useState<SampleView>({ productIndex: 0, angleIndex: 0 });
  const product = sampleProducts[productIndex];
  const sampleAngles = product.angles;
  const [originalOpen, setOriginalOpen] = useState(false);
  const [rotationOverride, setRotationOverride] = useState<boolean | null>(null);
  const [focusPaused, setFocusPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [loadedViews, setLoadedViews] = useState<Set<string>>(() => new Set());
  const sampleRef = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, getServerReducedMotion);
  const pageVisible = useSyncExternalStore(subscribeToVisibility, getPageVisible, getServerVisible);
  const rotationEnabled = rotationOverride ?? !reducedMotion;
  const productLoaded = sampleAngles.every((angle) => loadedViews.has(`${product.id}:${angle.id}`));
  const rotating = rotationEnabled && !originalOpen && !focusPaused && inView && pageVisible && productLoaded;
  const angle = sampleAngles[angleIndex];

  useEffect(() => {
    const sample = sampleRef.current;
    if (!sample) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: 0.25 });
    observer.observe(sample);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(() => {
      setView((current) => nextView(current, 1));
    }, ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, product.id, angle.id]);

  function cycleSample(direction: -1 | 1) {
    setRotationOverride(false);
    setOriginalOpen(false);
    setView((current) => nextView(current, direction));
  }

  function togglePlayback() {
    setRotationOverride(!rotationEnabled);
    setOriginalOpen(false);
    // Explicit playback also resumes while a keyboard control retains focus.
    setFocusPaused(false);
  }

  return (
    <section
      className="sample-workspace"
      id="sample"
      ref={sampleRef}
      aria-label="Product photo example"
      aria-roledescription="carousel"
      onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) setFocusPaused(true); }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusPaused(false); }}
      onKeyDown={(event) => {
        if (originalOpen) return;
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        cycleSample(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <div className="sample-viewer">
        <div className="sample-photo">
          {sampleProducts.flatMap((sampleProduct) => sampleProduct.angles.map((sampleAngle, index) => (
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
              preload
              onLoad={() => {
                const key = `${sampleProduct.id}:${sampleAngle.id}`;
                setLoadedViews((loaded) => loaded.has(key) ? loaded : new Set(loaded).add(key));
              }}
              hidden={sampleProduct.id !== product.id || index !== angleIndex}
            />
          )))}
        </div>
      </div>
      <div className="sample-toolbar">
        <div className="sample-playback" role="group" aria-label="Slideshow controls">
          <button className="sample-previous" type="button" aria-label="Previous view" onClick={() => cycleSample(-1)}><CaretLeft size={22} aria-hidden="true" /></button>
          <button className="sample-rotation-toggle" type="button" aria-label={rotationEnabled ? "Pause rotation" : "Play rotation"} title={rotationEnabled ? "Pause rotation" : "Play rotation"} onClick={togglePlayback}>
            {rotationEnabled ? <Pause size={17} weight="fill" aria-hidden="true" /> : <Play size={17} weight="fill" aria-hidden="true" />}
          </button>
          <button className="sample-next" type="button" aria-label="Next view" onClick={() => cycleSample(1)}><CaretRight size={22} aria-hidden="true" /></button>
        </div>
        <button className="sample-original-preview" type="button" aria-haspopup="dialog" aria-controls="sample-original-modal" title="View illustrative original photo" onClick={() => setOriginalOpen(true)}>
          <Image src={product.upload} alt="" width={44} height={44} sizes="(hover: hover) 120px, 44px" loading="eager" />
          <span>Show original</span>
        </button>
      </div>
      {originalOpen ? (
        <Dialog labelledBy="sample-original-title" onClose={() => setOriginalOpen(false)}>
          <section className="sample-original-modal" id="sample-original-modal">
            <header>
              <div>
                <h2 id="sample-original-title">Original photo</h2>
                <p>{product.label}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close original photo" data-autofocus onClick={() => setOriginalOpen(false)}><X size={22} aria-hidden="true" /></button>
            </header>
            <Image src={product.upload} alt={`Illustrative original: ${product.description} with a cluttered household background`} sizes="(max-width: 800px) 90vw, 720px" loading="eager" />
            <p className="sample-original-disclosure">Illustrative example upload</p>
          </section>
        </Dialog>
      ) : null}
      <p className="sr-only">Illustrative examples. Eight studio views per product; the slideshow changes product after each full rotation. Show original opens the example upload in a dialog and pauses the slideshow.</p>
      <p className="sr-only" aria-live={rotationEnabled ? "off" : "polite"} aria-atomic="true">{product.label}: Generated {angle.label.toLowerCase()} studio view. {angleIndex + 1} of {sampleAngles.length}.</p>
    </section>
  );
}
