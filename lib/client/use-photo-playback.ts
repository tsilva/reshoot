"use client";

import { useEffect, useState, useSyncExternalStore, type FocusEvent, type RefObject } from "react";

const ROTATION_INTERVAL_MS = 900;

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

function getPageVisible() { return document.visibilityState === "visible"; }
function getServerReducedMotion() { return true; }
function getServerVisible() { return false; }

export function usePhotoPlayback({ containerRef, frameKey, ready, blocked = false, onAdvance }: {
  containerRef: RefObject<HTMLElement | null>;
  frameKey: string;
  ready: boolean;
  blocked?: boolean;
  onAdvance: () => void;
}) {
  const [rotationOverride, setRotationOverride] = useState<boolean | null>(null);
  const [focusPaused, setFocusPaused] = useState(false);
  const [inView, setInView] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getReducedMotion, getServerReducedMotion);
  const pageVisible = useSyncExternalStore(subscribeToVisibility, getPageVisible, getServerVisible);
  const enabled = rotationOverride ?? !reducedMotion;
  const rotating = enabled && !blocked && !focusPaused && inView && pageVisible && ready;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25), { threshold: 0.25 });
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!rotating) return;
    const timer = window.setTimeout(onAdvance, ROTATION_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [rotating, frameKey, onAdvance]);

  return {
    enabled,
    pause() { setRotationOverride(false); },
    toggle() {
      setRotationOverride(!enabled);
      // Explicit Play also resumes while a keyboard control retains focus.
      setFocusPaused(false);
    },
    onFocusCapture(event: FocusEvent<HTMLElement>) {
      if (event.target.matches(":focus-visible")) setFocusPaused(true);
    },
    onBlurCapture(event: FocusEvent<HTMLElement>) {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocusPaused(false);
    },
  };
}
