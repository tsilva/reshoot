"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  Plus,
} from "@phosphor-icons/react";
import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Angle } from "@/lib/types";

type Orientation = {
  yaw: number;
  pitch: number;
};

type OrbitSphereProps = {
  original: string;
  orientation: Orientation;
  orientationLabel: string;
  lockedAngles: Angle[];
  editingAngleId: string | null;
  onOrientationChange: (orientation: Orientation) => void;
  onSelectAngle: (angle: Angle) => void;
  onSave: (orientation: Orientation) => void;
};

const CARDINAL_LABELS = [
  { label: "Front", yaw: 0 },
  { label: "Right", yaw: 90 },
  { label: "Back", yaw: 180 },
  { label: "Left", yaw: 270 },
];

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function circularDistance(from: number, to: number) {
  return Math.abs(((to - from + 540) % 360) - 180);
}

function snapYaw(value: number) {
  const normalized = normalizeDegrees(value);
  const nearestLandmark = Math.round(normalized / 45) * 45;
  return circularDistance(normalized, nearestLandmark) <= 4
    ? normalizeDegrees(nearestLandmark)
    : normalized;
}

function pointForYaw(yaw: number, radius: number) {
  const radians = (normalizeDegrees(yaw) * Math.PI) / 180;
  return {
    left: 50 + Math.sin(radians) * radius,
    top: 50 - Math.cos(radians) * radius,
  };
}

export function OrbitSphere({
  original,
  orientation,
  orientationLabel,
  lockedAngles,
  editingAngleId,
  onOrientationChange,
  onSelectAngle,
  onSave,
}: OrbitSphereProps) {
  const dialRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pointerPitchRef = useRef(orientation.pitch);

  function updateYawFromPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const dial = dialRef.current;
    if (!dial) return;

    const bounds = dial.getBoundingClientRect();
    const x = event.clientX - (bounds.left + bounds.width / 2);
    const y = event.clientY - (bounds.top + bounds.height / 2);
    const yaw = snapYaw((Math.atan2(x, -y) * 180) / Math.PI);

    onOrientationChange({
      yaw,
      pitch: pointerPitchRef.current,
    });
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const source = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-angle-pitch]",
    );
    pointerPitchRef.current = source
      ? Number(source.dataset.anglePitch)
      : orientation.pitch;
    pointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateYawFromPointer(event);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    updateYawFromPointer(event);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function nudgeOrientation(yawDelta: number, pitchDelta: number) {
    onOrientationChange({
      yaw: normalizeDegrees(orientation.yaw + yawDelta),
      pitch: Math.max(-40, Math.min(40, orientation.pitch + pitchDelta)),
    });
  }

  function handleDialKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    let nextYaw = orientation.yaw;

    if (event.key === "ArrowLeft") nextYaw -= 5;
    else if (event.key === "ArrowRight") nextYaw += 5;
    else if (event.key === "PageDown") nextYaw -= 45;
    else if (event.key === "PageUp") nextYaw += 45;
    else if (event.key === "Home") nextYaw = 0;
    else if (event.key === "End") nextYaw = 315;
    else return;

    event.preventDefault();
    onOrientationChange({
      yaw: normalizeDegrees(nextYaw),
      pitch: orientation.pitch,
    });
  }

  const activePoint = pointForYaw(orientation.yaw, 40);

  return (
    <div className="orbit-composer">
      <div className="orbit-map-shell">
        <div className="orbit-map-heading">
          <span>
            <Camera size={16} weight="bold" />
            Camera position
          </span>
          <strong>{orientationLabel}</strong>
        </div>

        <div
          ref={dialRef}
          className="orbit-dial"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleDialKeyDown}
          role="group"
          tabIndex={0}
          aria-label={`Camera orbit map. ${orientationLabel}, ${Math.round(normalizeDegrees(orientation.yaw))} degrees. Use left and right arrow keys to adjust.`}
        >
          <span className="orbit-axis orbit-axis-horizontal" aria-hidden="true" />
          <span className="orbit-axis orbit-axis-vertical" aria-hidden="true" />

          {CARDINAL_LABELS.map((landmark) => (
            <span
              key={landmark.yaw}
              className={`orbit-landmark orbit-landmark-${landmark.yaw}`}
              aria-hidden="true"
            >
              {landmark.label}
            </span>
          ))}

          <div className="orbit-product">
            <Image
              src={original}
              alt=""
              fill
              sizes="160px"
              unoptimized
            />
          </div>

          {lockedAngles.map((angle, index) => {
            if (angle.id === editingAngleId) return null;
            const point = pointForYaw(angle.azimuth, 40);
            return (
              <button
                key={angle.id}
                className="orbit-angle-pin"
                style={{
                  left: `${point.left}%`,
                  top: `${point.top}%`,
                }}
                type="button"
                data-angle-pitch={angle.elevation}
                onPointerDown={() => onSelectAngle(angle)}
                onClick={(event) => {
                  if (event.detail === 0) onSelectAngle(angle);
                }}
                aria-label={`Edit ${angle.label}, ${angle.azimuth} degrees orbit and ${angle.elevation} degrees tilt`}
              >
                {index + 1}
              </button>
            );
          })}

          <span
            className={`orbit-camera-handle ${editingAngleId ? "is-editing" : ""}`}
            style={{
              left: `${activePoint.left}%`,
              top: `${activePoint.top}%`,
            }}
            aria-hidden="true"
          >
            <Camera size={20} weight="fill" />
          </span>
        </div>

        <p className="orbit-map-hint">
          Drag the camera or any numbered view around the ring.
        </p>
      </div>

      <div className="tilt-control">
        <div className="tilt-heading">
          <span>
            <strong>Tilt</strong>
            Move the camera above or below eye level
          </span>
          <output htmlFor="camera-tilt">
            {Math.round(orientation.pitch)}°
          </output>
        </div>
        <input
          id="camera-tilt"
          type="range"
          min="-40"
          max="40"
          step="1"
          value={orientation.pitch}
          onChange={(event) =>
            onOrientationChange({
              yaw: orientation.yaw,
              pitch: Number(event.target.value),
            })
          }
          aria-label="Camera tilt"
          aria-valuetext={`${Math.round(orientation.pitch)} degrees, ${
            orientation.pitch > 8
              ? "high angle"
              : orientation.pitch < -8
                ? "low angle"
                : "eye level"
          }`}
        />
        <div className="tilt-labels" aria-hidden="true">
          <span>Low</span>
          <span>Eye level</span>
          <span>High</span>
        </div>
      </div>

      <div className="orbit-readout">
        <div className="orbit-values">
          <strong>{orientationLabel}</strong>
          <span>
            {Math.round(normalizeDegrees(orientation.yaw))}° orbit ·{" "}
            {Math.round(orientation.pitch)}° tilt
          </span>
        </div>
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={() => onSave(orientation)}
        >
          {editingAngleId ? (
            <Check size={17} weight="bold" />
          ) : (
            <Plus size={17} weight="bold" />
          )}
          {editingAngleId ? "Update angle" : "Add this angle"}
        </button>
      </div>

      <div className="orbit-keyboard-controls">
        <div>
          <span>Orbit</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => nudgeOrientation(-15, 0)}
            aria-label="Rotate camera left 15 degrees"
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => nudgeOrientation(15, 0)}
            aria-label="Rotate camera right 15 degrees"
          >
            <ArrowRight size={18} weight="bold" />
          </button>
        </div>
        <div>
          <span>Tilt</span>
          <button
            type="button"
            className="icon-button"
            onClick={() => nudgeOrientation(0, 8)}
            aria-label="Tilt camera up 8 degrees"
          >
            <ArrowUp size={18} weight="bold" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => nudgeOrientation(0, -8)}
            aria-label="Tilt camera down 8 degrees"
          >
            <ArrowDown size={18} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
