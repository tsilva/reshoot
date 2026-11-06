"use client";

import { CaretLeft, CaretRight, Pause, Play } from "@phosphor-icons/react";

export function SlideshowControls({ playing, disabled = false, playbackDisabled = false, previousLabel = "Previous view", nextLabel = "Next view", onPrevious, onNext, onTogglePlayback }: {
  playing: boolean;
  disabled?: boolean;
  playbackDisabled?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
}) {
  const playbackLabel = playing ? "Pause rotation" : "Play rotation";
  return (
    <div className="sample-playback" role="group" aria-label="Slideshow controls">
      <button className="sample-previous" type="button" aria-label={previousLabel} disabled={disabled} onClick={onPrevious}><CaretLeft size={22} aria-hidden="true" /></button>
      <button className="sample-rotation-toggle" type="button" aria-label={playbackLabel} title={playbackDisabled ? "Autoplay requires a complete set" : playbackLabel} disabled={disabled || playbackDisabled} onClick={onTogglePlayback}>
        {playing ? <Pause size={17} weight="fill" aria-hidden="true" /> : <Play size={17} weight="fill" aria-hidden="true" />}
      </button>
      <button className="sample-next" type="button" aria-label={nextLabel} disabled={disabled} onClick={onNext}><CaretRight size={22} aria-hidden="true" /></button>
    </div>
  );
}
