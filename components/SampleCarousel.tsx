"use client";

import Image from "next/image";
import { CaretLeft, CaretRight, Pause, Play } from "@phosphor-icons/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { sampleProducts } from "@/lib/client/sample-products";

const ROTATION_INTERVAL_MS = 900;
const UPLOAD_PREVIEW_MS = 2400;

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
  const [productIndex, setProductIndex] = useState(0);
  const product = sampleProducts[productIndex];
  const sampleAngles = product.angles;
  const [angleIndex, setAngleIndex] = useState(0);
  const [rotationOverride, setRotationOverride] = useState<boolean | null>(null);
  const [focusPaused, setFocusPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const [loadedViews, setLoadedViews] = useState<Set<string>>(() => new Set());
  const sampleRef = useRef<HTMLElement>(null);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, getServerReducedMotion);
  const pageVisible = useSyncExternalStore(subscribeToVisibility, getPageVisible, getServerVisible);
  const rotationEnabled = rotationOverride ?? !reducedMotion;
  const productLoaded = sampleAngles.every((angle) => loadedViews.has(`${product.id}:${angle.id}`));
  const rotating = rotationEnabled && !focusPaused && inView && pageVisible && productLoaded;
  const angle = sampleAngles[angleIndex];
  const angleOrigin = angle.id === "original" ? "Example upload" : "Generated";

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
      setAngleIndex((current) => (current + 1) % sampleAngles.length);
    }, angle.id === "original" ? UPLOAD_PREVIEW_MS : ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, sampleAngles.length, angle.id]);

  function cycleSample(direction: -1 | 1) {
    setRotationOverride(false);
    setAngleIndex((current) => (current + direction + sampleAngles.length) % sampleAngles.length);
  }

  function togglePlayback() {
    setRotationOverride(!rotationEnabled);
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
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        cycleSample(event.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <div className="sample-viewer">
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
            alt={sampleAngle.id === "original"
              ? `Illustrative upload: ${sampleProduct.description} in a noisy phone-style photo with a cluttered background`
              : `Generated ${sampleProduct.description}, ${sampleAngle.label.toLowerCase()} studio view`}
            preload
            onLoad={() => {
              const key = `${sampleProduct.id}:${sampleAngle.id}`;
              setLoadedViews((loaded) => loaded.has(key) ? loaded : new Set(loaded).add(key));
            }}
            hidden={sampleProduct.id !== product.id || index !== angleIndex}
          />
        )))}
        <span className="sample-origin-badge">
          <span className="sample-origin-medallion" aria-hidden="true">
            <Image src="/assets/badges/original.webp" alt="" width={160} height={160} loading="eager" unoptimized hidden={angleOrigin !== "Example upload"} />
            <Image src="/assets/badges/generated.webp" alt="" width={160} height={160} loading="eager" unoptimized hidden={angleOrigin !== "Generated"} />
          </span>
          <span>{angleOrigin}</span>
        </span>
        <button className="sample-previous" aria-label="Previous view" onClick={() => cycleSample(-1)}><CaretLeft size={22} aria-hidden="true" /></button>
        <button className="sample-next" aria-label="Next view" onClick={() => cycleSample(1)}><CaretRight size={22} aria-hidden="true" /></button>
        <button className="sample-rotation-toggle" type="button" aria-label={rotationEnabled ? "Pause rotation" : "Play rotation"} title={rotationEnabled ? "Pause rotation" : "Play rotation"} onClick={togglePlayback}>
          {rotationEnabled ? <Pause size={17} weight="fill" aria-hidden="true" /> : <Play size={17} weight="fill" aria-hidden="true" />}
        </button>
      </div>
      <div className="sample-product-selector" role="group" aria-label="Example product">
        {sampleProducts.map((sampleProduct, index) => (
          <button
            key={sampleProduct.id}
            type="button"
            aria-label={sampleProduct.label}
            title={sampleProduct.label}
            aria-pressed={index === productIndex}
            onClick={() => { setProductIndex(index); setAngleIndex(0); }}
          >
            <Image
              src={sampleProduct.angles[0].image}
              alt=""
              width={58}
              height={58}
              sizes="58px"
              loading="eager"
            />
          </button>
        ))}
      </div>
      <p className="sample-disclosure">Illustrative examples</p>
      <p className="sr-only" aria-live={rotationEnabled ? "off" : "polite"} aria-atomic="true">{product.label}: {angle.id === "original" ? "Illustrative example upload with a cluttered background." : `Generated ${angle.label.toLowerCase()} studio view.`} {angleIndex + 1} of {sampleAngles.length}.</p>
    </section>
  );
}
