"use client";

import { CaretLeft, CaretRight, Pause, Play } from "@phosphor-icons/react";

export function SlideshowControls({ playing, disabled = false, onPrevious, onNext, onTogglePlayback }: {
  playing: boolean;
  disabled?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
}) {
  const playbackLabel = playing ? "Pause rotation" : "Play rotation";
  return (
    <div className="sample-playback" role="group" aria-label="Slideshow controls">
      <button className="sample-previous" type="button" aria-label="Previous view" disabled={disabled} onClick={onPrevious}><CaretLeft size={22} aria-hidden="true" /></button>
      <button className="sample-rotation-toggle" type="button" aria-label={playbackLabel} title={playbackLabel} disabled={disabled} onClick={onTogglePlayback}>
        {playing ? <Pause size={17} weight="fill" aria-hidden="true" /> : <Play size={17} weight="fill" aria-hidden="true" />}
      </button>
      <button className="sample-next" type="button" aria-label="Next view" disabled={disabled} onClick={onNext}><CaretRight size={22} aria-hidden="true" /></button>
    </div>
  );
}
