"use client";

import Image from "next/image";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Camera,
  CaretDown,
  Check,
  CheckCircle,
  DownloadSimple,
  FloppyDisk,
  ImageSquare,
  Plus,
  Sparkle,
  SpinnerGap,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { zipSync } from "fflate";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { OrbitSphere } from "@/components/OrbitSphere";
import { clearShoot, loadShoot, saveShoot } from "@/lib/storage";
import {
  DEFAULT_ANGLES,
  createInitialState,
  type Angle,
  type Shot,
  type ShotStatus,
  type StudioState,
  type StudioStep,
} from "@/lib/types";

const REJECTION_REASONS = [
  "Wrong angle",
  "Product changed",
  "Lighting mismatch",
  "Missing detail",
];

const STEP_ITEMS: Array<{ label: string; step: StudioStep }> = [
  { label: "Original", step: "upload" },
  { label: "Perspectives", step: "angles" },
  { label: "Review", step: "review" },
];

const PRESET_GUIDES: Record<string, string> = {
  front: "/assets/angle-guides/front.jpg",
  "front-three-quarter": "/assets/angle-guides/front-three-quarter.jpg",
  "right-profile": "/assets/angle-guides/right-profile.jpg",
  back: "/assets/angle-guides/back.jpg",
};

const DEFAULT_ANGLE_IDS = new Set(DEFAULT_ANGLES.map((angle) => angle.id));

type Orientation = {
  yaw: number;
  pitch: number;
};

type GeneratedReference = {
  label: string;
  image: string;
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestAngle(from: number, to: number) {
  return Math.abs(((to - from + 540) % 360) - 180);
}

function labelForOrientation({ yaw, pitch }: Orientation) {
  const normalized = normalizeDegrees(yaw);
  const directions = [
    "Front",
    "Front 3/4 right",
    "Right profile",
    "Back 3/4 right",
    "Back",
    "Back 3/4 left",
    "Left profile",
    "Front 3/4 left",
  ];
  const direction = directions[Math.round(normalized / 45) % 8];
  if (pitch > 18) return `High ${direction.toLowerCase()}`;
  if (pitch < -18) return `Low ${direction.toLowerCase()}`;
  return direction;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function extensionForDataUrl(dataUrl: string) {
  const mediaType = dataUrl.slice(5, dataUrl.indexOf(";"));
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generationErrorMessage(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Generation failed.";

  if (/insufficient (credits|balance)|payment required/i.test(message)) {
    return "OpenRouter needs more credits before this shot can be generated.";
  }

  if (/unauthorized|invalid.*(key|token)|authentication/i.test(message)) {
    return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in the server environment.";
  }

  return message.length > 240
    ? "The image service returned an unexpected error. Retry this shot in a moment."
    : message;
}

function stepPosition(step: StudioStep) {
  if (step === "upload") return 0;
  if (step === "angles") return 1;
  return 2;
}

function normalizedRestoredState(saved: StudioState): StudioState {
  if (saved.step !== "generating") return saved;
  return {
    ...saved,
    step: "review",
    shots: saved.shots.map((shot) =>
      shot.status === "generating" || shot.status === "queued"
        ? {
            ...shot,
            status: "error",
            error: "Generation was interrupted. Retry this shot.",
          }
        : shot,
    ),
  };
}

export function Studio() {
  const [state, setState] = useState<StudioState>(createInitialState);
  const [hydrated, setHydrated] = useState(false);
  const [orientation, setOrientation] = useState<Orientation>({
    yaw: 18,
    pitch: 2,
  });
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousStepRef = useRef<StudioStep | null>(null);

  useEffect(() => {
    let active = true;
    loadShoot()
      .then((saved) => {
        if (!active) return;
        if (saved?.original) {
          setState(normalizedRestoredState(saved));
          setLastSaved(saved.savedAt ?? null);
        }
      })
      .catch(() => {
        setToast("Local recovery is unavailable in this browser.");
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !state.original) return;
    const timeout = window.setTimeout(() => {
      const savedAt = Date.now();
      saveShoot({ ...state, savedAt })
        .then(() => setLastSaved(savedAt))
        .catch(() => setToast("Could not save this shoot locally."));
    }, 320);
    return () => window.clearTimeout(timeout);
  }, [hydrated, state]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!hydrated) return;
    if (previousStepRef.current === null) {
      previousStepRef.current = state.step;
      return;
    }
    if (previousStepRef.current === state.step) return;

    previousStepRef.current = state.step;
    window.scrollTo({ top: 0, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => {
      mainRef.current
        ?.querySelector<HTMLElement>("[data-step-heading]")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydrated, state.step]);

  const original = state.original;
  const activeShot = useMemo(
    () => state.shots.find((shot) => shot.id === activeShotId) ?? null,
    [activeShotId, state.shots],
  );
  const approvedShots = useMemo(
    () =>
      state.shots.filter(
        (shot) => shot.status === "approved" && shot.imageUrl,
      ),
    [state.shots],
  );
  const unresolvedShots = useMemo(
    () => state.shots.filter((shot) => shot.status !== "approved"),
    [state.shots],
  );
  const customAngles = useMemo(
    () => state.angles.filter((angle) => !DEFAULT_ANGLE_IDS.has(angle.id)),
    [state.angles],
  );

  function updateState(patch: Partial<StudioState>) {
    setState((current) => ({ ...current, ...patch }));
  }

  function updateShot(id: string, patch: Partial<Shot>) {
    setState((current) => ({
      ...current,
      shots: current.shots.map((shot) =>
        shot.id === id ? { ...shot, ...patch } : shot,
      ),
    }));
  }

  async function acceptFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setToast("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setToast("Keep the original image under 20 MB.");
      return;
    }

    const image = await fileToDataUrl(file);
    setState((current) => ({
      ...createInitialState(),
      original: image,
      originalName: file.name,
      angles: current.angles.length
        ? current.angles
        : createInitialState().angles,
    }));
    setToast("Original loaded. Your shoot is saved locally.");
  }

  async function loadSample() {
    try {
      const response = await fetch("/assets/sample-doll.png");
      const image = await fileToDataUrl(await response.blob());
      setState({
        ...createInitialState(),
        original: image,
        originalName: "sample-handmade-doll.png",
      });
      setToast("Sample doll loaded.");
    } catch {
      setToast("The sample image could not be loaded.");
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void acceptFile(file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  }

  function addAngle(next: Orientation) {
    const duplicate = state.angles.some(
      (angle) =>
        shortestAngle(angle.azimuth, next.yaw) < 12 &&
        Math.abs(angle.elevation - next.pitch) < 10,
    );

    if (duplicate) {
      setToast("That perspective is already locked.");
      return;
    }
    if (state.angles.length >= 8) {
      setToast("A shoot can contain up to 8 perspectives.");
      return;
    }

    const angle: Angle = {
      id: crypto.randomUUID(),
      label: labelForOrientation(next),
      azimuth: Math.round(normalizeDegrees(next.yaw)),
      elevation: Math.round(next.pitch),
    };
    updateState({ angles: [...state.angles, angle] });
    setToast(`${angle.label} locked.`);
  }

  function removeAngle(id: string) {
    updateState({ angles: state.angles.filter((angle) => angle.id !== id) });
  }

  function togglePreset(preset: Angle) {
    const selected = state.angles.some((angle) => angle.id === preset.id);
    updateState({
      angles: selected
        ? state.angles.filter((angle) => angle.id !== preset.id)
        : [...state.angles, { ...preset }],
    });
    setToast(`${preset.label} ${selected ? "removed" : "selected"}.`);
  }

  async function requestGeneration(
    target: Angle,
    references: GeneratedReference[],
    feedback?: string,
  ) {
    if (!original) throw new Error("The original image is missing.");

    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        original,
        references,
        target,
        feedback,
      }),
    });
    const result = (await response.json()) as {
      image?: string;
      error?: string;
    };

    if (!response.ok || !result.image) {
      throw new Error(result.error ?? "Generation failed.");
    }
    return result.image;
  }

  async function generateAll() {
    if (!original || state.angles.length === 0) return;

    const shots: Shot[] = state.angles.map((angle) => ({
      id: angle.id,
      angle,
      status: "queued",
      reasons: [],
      feedback: "",
    }));
    setState((current) => ({
      ...current,
      step: "generating",
      shots,
    }));

    const generatedReferences: GeneratedReference[] = [];

    for (const shot of shots) {
      updateShot(shot.id, { status: "generating", error: undefined });
      try {
        const image = await requestGeneration(
          shot.angle,
          generatedReferences.slice(-3),
        );
        generatedReferences.push({
          label: shot.angle.label,
          image,
        });
        updateShot(shot.id, {
          imageUrl: image,
          status: "ready",
          error: undefined,
        });
      } catch (error) {
        updateShot(shot.id, {
          status: "error",
          error: generationErrorMessage(error),
        });
      }
    }

    setState((current) => ({ ...current, step: "review" }));
  }

  function approveShot(id: string) {
    updateShot(id, {
      status: "approved",
      reasons: [],
      feedback: "",
      error: undefined,
    });
    if (activeShotId === id) setActiveShotId(null);
  }

  function rejectShot(id: string) {
    updateShot(id, { status: "rejected" });
    setActiveShotId(id);
  }

  function toggleReason(reason: string) {
    if (!activeShot) return;
    const reasons = activeShot.reasons.includes(reason)
      ? activeShot.reasons.filter((item) => item !== reason)
      : [...activeShot.reasons, reason];
    updateShot(activeShot.id, { reasons });
  }

  async function regenerateShot(shot: Shot) {
    const references = approvedShots
      .filter((reference) => reference.id !== shot.id)
      .slice(-4)
      .map((reference) => ({
        label: reference.angle.label,
        image: reference.imageUrl!,
      }));
    const feedback = [...shot.reasons, shot.feedback]
      .filter(Boolean)
      .join(". ");

    updateShot(shot.id, { status: "generating", error: undefined });
    setActiveShotId(null);

    try {
      const image = await requestGeneration(
        shot.angle,
        references,
        feedback || "Improve fidelity to the original product.",
      );
      updateShot(shot.id, {
        imageUrl: image,
        status: "ready",
        reasons: [],
        feedback: "",
        error: undefined,
      });
      setToast(`${shot.angle.label} is ready to review again.`);
    } catch (error) {
      updateShot(shot.id, {
        status: "error",
        error: generationErrorMessage(error),
      });
      setToast("That shot could not be regenerated.");
    }
  }

  function downloadApproved() {
    const files: Record<string, Uint8Array> = {};
    approvedShots.forEach((shot, index) => {
      const image = shot.imageUrl!;
      const extension = extensionForDataUrl(image);
      files[
        `${String(index + 1).padStart(2, "0")}-${slugify(shot.angle.label)}.${extension}`
      ] = dataUrlToBytes(image);
    });

    if (!Object.keys(files).length) {
      setToast("Approve at least one shot before downloading.");
      return;
    }

    const archive = zipSync(files, { level: 6 });
    const blob = new Blob([new Uint8Array(archive)], {
      type: "application/zip",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `reshoot-${new Date().toISOString().slice(0, 10)}.zip`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    window.setTimeout(() => {
      anchor.remove();
      URL.revokeObjectURL(url);
    }, 30_000);
  }

  async function startNewShoot() {
    if (
      state.original &&
      !window.confirm(
        "Start a new shoot? This removes the current local images and review progress.",
      )
    ) {
      return;
    }
    await clearShoot();
    setState(createInitialState());
    setActiveShotId(null);
    setLastSaved(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (!hydrated) {
    return (
      <main className="boot-screen">
        <div className="boot-mark">
          <SpinnerGap size={26} weight="bold" className="spin" />
        </div>
        <p>Opening your studio…</p>
      </main>
    );
  }

  const currentStep = stepPosition(state.step);

  return (
    <div className="studio-shell">
      <header className="app-header">
        <div className="header-inner">
          <button
            className="wordmark"
            type="button"
            onClick={() => updateState({ step: "upload" })}
            aria-label="Reshoot studio"
          >
            <Image
              src="/brand/logo/wordmark.png"
              alt="Reshoot"
              fill
              sizes="132px"
              priority
            />
          </button>

          <div className="header-actions">
            <span className="save-indicator" aria-live="polite">
              <FloppyDisk size={16} weight="bold" />
              {lastSaved ? "Saved locally" : "Local studio"}
            </span>
            {state.original && (
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => void startNewShoot()}
              >
                <Plus size={16} weight="bold" />
                New shoot
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="step-rail" aria-label="Shoot progress">
        {STEP_ITEMS.map((item, index) => {
          const canNavigate = Boolean(original) && index < currentStep;
          return (
            <button
              key={item.label}
              type="button"
              className={`step-item ${currentStep === index ? "is-current" : ""} ${currentStep > index ? "is-complete" : ""}`}
              disabled={!canNavigate}
              aria-current={currentStep === index ? "step" : undefined}
              onClick={() => updateState({ step: item.step })}
            >
              <span>
                {currentStep > index ? <Check size={13} /> : index + 1}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <main className="studio-main" ref={mainRef}>
        {state.step === "upload" && (
          <section className="upload-layout">
            <div className="intro-copy">
              <span className="eyebrow">
                <ImageSquare size={15} weight="bold" />
                Original photo
              </span>
              <h1 data-step-heading tabIndex={-1}>Upload original</h1>
              <p>
                Add one clear product photo to guide every generated view.
              </p>

              <div className="trust-row">
                <span>
                  <FloppyDisk size={17} weight="bold" />
                  Saved here. Sent only when you generate.
                </span>
                <span>
                  <CheckCircle size={17} weight="bold" />
                  Original remains the identity reference.
                </span>
              </div>
            </div>

            <div className="upload-panel">
              {original ? (
                <div className="original-preview">
                  <Image
                    src={original}
                    alt="Original product upload"
                    fill
                    sizes="(max-width: 720px) 92vw, 540px"
                    unoptimized
                    priority
                  />
                  <span className="source-badge">Original reference</span>
                  <button
                    className="image-replace"
                    type="button"
                    onClick={() => inputRef.current?.click()}
                  >
                    <UploadSimple size={16} weight="bold" />
                    Replace
                  </button>
                </div>
              ) : (
                <label
                  className="upload-dropzone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileChange}
                  />
                  <span className="upload-icon">
                    <UploadSimple size={30} weight="bold" />
                  </span>
                  <strong>Choose your product photo</strong>
                  <span>or drop it here</span>
                  <small>JPG, PNG, or WebP · up to 20 MB</small>
                </label>
              )}

              {original && (
                <input
                  ref={inputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                />
              )}

              <div className="upload-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void loadSample()}
                >
                  <ImageSquare size={19} weight="bold" />
                  Try the sample doll
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!original}
                  onClick={() => updateState({ step: "angles" })}
                >
                  Continue to perspectives
                  <ArrowRight size={19} weight="bold" />
                </button>
              </div>
            </div>
          </section>
        )}

        {state.step === "angles" && original && (
          <section className="angle-section">
            <button
              type="button"
              className="back-link"
              onClick={() => updateState({ step: "upload" })}
            >
              <ArrowLeft size={17} weight="bold" />
              Back to original
            </button>

            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  <Camera size={15} weight="bold" />
                  Camera planning
                </span>
                <h1 data-step-heading tabIndex={-1}>Choose perspectives</h1>
              </div>
              <p>
                Start with these four recommended angles, or choose the views
                you need.
              </p>
            </div>

            <div className="original-reference-strip">
              <div className="original-reference-thumb">
                <Image
                  src={original}
                  alt="Original product reference"
                  fill
                  sizes="72px"
                  unoptimized
                />
              </div>
              <div>
                <span className="panel-label">Original reference</span>
                <strong>Your product stays the identity reference</strong>
              </div>
            </div>

            <section className="preset-planner" aria-labelledby="preset-title">
              <div className="preset-heading">
                <div>
                  <span className="panel-label">Recommended starter set</span>
                  <h2 id="preset-title">Choose the views you need</h2>
                </div>
                <strong>{state.angles.length} selected</strong>
              </div>

              <div className="preset-grid">
                {DEFAULT_ANGLES.map((preset) => {
                  const selected = state.angles.some(
                    (angle) => angle.id === preset.id,
                  );
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`preset-card ${selected ? "is-selected" : ""}`}
                      aria-pressed={selected}
                      onClick={() => togglePreset(preset)}
                    >
                      <span className="preset-card-image" aria-hidden="true">
                        <Image
                          src={PRESET_GUIDES[preset.id]}
                          alt=""
                          fill
                          sizes="(max-width: 720px) 45vw, 220px"
                        />
                        <span className="preset-check">
                          <Check size={15} weight="bold" />
                        </span>
                      </span>
                      <span>
                        <strong>{preset.label}</strong>
                        <small>
                          {preset.azimuth}° orbit · {preset.elevation}° tilt
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <details className="custom-angle-panel">
              <summary>
                <span>
                  <strong>Add a custom angle</strong>
                  <small>Optional precision control</small>
                </span>
                <CaretDown size={18} weight="bold" />
              </summary>

              <div className="custom-angle-content">
                <OrbitSphere
                  original={original}
                  orientation={orientation}
                  lockedAngles={customAngles}
                  onOrientationChange={setOrientation}
                  onLock={addAngle}
                />

                <aside className="custom-angle-plan">
                  <div className="panel-title-row">
                    <div>
                      <span className="panel-label">Custom views</span>
                      <strong>
                        {customAngles.length}{" "}
                        {customAngles.length === 1 ? "angle" : "angles"} added
                      </strong>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => {
                        setOrientation({ yaw: 0, pitch: 0 });
                        setToast("Camera returned to front.");
                      }}
                      aria-label="Reset custom camera"
                    >
                      <ArrowCounterClockwise size={18} weight="bold" />
                    </button>
                  </div>

                  {customAngles.length ? (
                    <div className="shot-plan-list">
                      {customAngles.map((angle, index) => (
                        <div className="shot-plan-item" key={angle.id}>
                          <span className="plan-index">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span>
                            <strong>{angle.label}</strong>
                            <small>
                              {angle.azimuth}° orbit · {angle.elevation}° tilt
                            </small>
                          </span>
                          <button
                            className="icon-button icon-button-small"
                            type="button"
                            onClick={() => removeAngle(angle.id)}
                            aria-label={`Remove ${angle.label}`}
                          >
                            <X size={15} weight="bold" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="custom-angle-empty">
                      Use the controls to add a view outside the starter set.
                    </p>
                  )}
                </aside>
              </div>
            </details>

            <div className="selection-action-bar">
              <div>
                <span className="panel-label">Selection</span>
                <strong>
                  {state.angles.length}{" "}
                  {state.angles.length === 1 ? "view" : "views"} selected
                </strong>
              </div>
              <button
                className="button button-primary"
                type="button"
                disabled={state.angles.length === 0}
                onClick={() => void generateAll()}
              >
                <Sparkle size={20} weight="fill" />
                Generate {state.angles.length}{" "}
                {state.angles.length === 1 ? "shot" : "shots"}
              </button>
            </div>
          </section>
        )}

        {state.step === "generating" && original && (
          <GeneratingView state={state} original={original} />
        )}

        {state.step === "review" && original && (
          <section className="review-section">
            <div className="section-heading review-heading">
              <div>
                <span className="eyebrow">
                  <CheckCircle size={15} weight="fill" />
                  Human review
                </span>
                <h1 data-step-heading tabIndex={-1}>
                  Curate the contact sheet
                </h1>
              </div>
              <div className="review-summary">
                <span>
                  <strong>{approvedShots.length}</strong> approved
                </span>
                <span>
                  <strong>{state.shots.length - approvedShots.length}</strong>{" "}
                  to resolve
                </span>
              </div>
            </div>

            <div className="reference-strip">
              <div className="reference-thumb">
                <Image
                  src={original}
                  alt="Original identity anchor"
                  fill
                  sizes="72px"
                  unoptimized
                />
              </div>
              <div>
                <span className="panel-label">Original photo</span>
                <strong>Authoritative identity anchor</strong>
                <p>
                  Generated references support spatial consistency only. The
                  original always wins.
                </p>
              </div>
            </div>

            <div className="review-grid">
              {state.shots.map((shot, index) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={index}
                  onApprove={() => approveShot(shot.id)}
                  onReject={() => rejectShot(shot.id)}
                  onRetry={() => void regenerateShot(shot)}
                />
              ))}
            </div>

            <div className="review-action-bar">
              <div>
                <span className="panel-label">Selection</span>
                <strong>
                  {approvedShots.length} of {state.shots.length} approved
                </strong>
              </div>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  approvedShots.length === 0 || unresolvedShots.length > 0
                }
                onClick={() => updateState({ step: "export" })}
              >
                Finish review
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>
          </section>
        )}

        {state.step === "export" && original && (
          <section className="export-layout">
            <div className="export-hero">
              <span className="success-mark">
                <Check size={34} weight="bold" />
              </span>
              <span className="eyebrow">Shoot complete</span>
              <h1 data-step-heading tabIndex={-1}>
                Your contact sheet is ready.
              </h1>
              <p>
                Download every approved perspective in one archive. Your local
                studio stays intact until you start a new shoot.
              </p>

              <div className="export-stats">
                <div>
                  <strong>{approvedShots.length}</strong>
                  <span>Approved shots</span>
                </div>
                <div>
                  <strong>
                    {state.shots.length - approvedShots.length}
                  </strong>
                  <span>Not included</span>
                </div>
              </div>

              {unresolvedShots.length > 0 && (
                <div className="export-warning">
                  <WarningCircle size={20} weight="fill" />
                  {unresolvedShots.length} unresolved{" "}
                  {unresolvedShots.length === 1 ? "shot is" : "shots are"} not
                  included in the download.
                </div>
              )}

              <div className="export-actions">
                <button
                  className="button button-primary button-large"
                  type="button"
                  disabled={approvedShots.length === 0}
                  onClick={downloadApproved}
                >
                  <DownloadSimple size={21} weight="bold" />
                  Download approved
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => updateState({ step: "review" })}
                >
                  Back to review
                </button>
              </div>
            </div>

            <div className="export-contact-sheet">
              {approvedShots.map((shot, index) => (
                <figure key={shot.id}>
                  <div>
                    <Image
                      src={shot.imageUrl!}
                      alt={`${shot.angle.label} approved product view`}
                      fill
                      sizes="(max-width: 720px) 45vw, 220px"
                      unoptimized
                    />
                  </div>
                  <figcaption>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {shot.angle.label}
                  </figcaption>
                </figure>
              ))}
              {!approvedShots.length && (
                <div className="empty-contact-sheet">
                  <ImageSquare size={34} weight="light" />
                  <span>No approved shots yet</span>
                </div>
              )}
            </div>

            <button
              className="button button-quiet danger-action"
              type="button"
              onClick={() => void startNewShoot()}
            >
              <Trash size={17} weight="bold" />
              Start new shoot
            </button>
          </section>
        )}
      </main>

      {activeShot && (
        <div
          className="sheet-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveShotId(null);
          }}
        >
          <section
            className="feedback-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div>
                <span className="panel-label">Needs work</span>
                <h2 id="feedback-title">{activeShot.angle.label}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Close feedback"
                onClick={() => setActiveShotId(null)}
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            <div className="feedback-preview">
              {activeShot.imageUrl && (
                <Image
                  src={activeShot.imageUrl}
                  alt={`${activeShot.angle.label} rejected shot`}
                  fill
                  sizes="420px"
                  unoptimized
                />
              )}
            </div>

            <fieldset>
              <legend>What is off?</legend>
              <div className="reason-chips">
                {REJECTION_REASONS.map((reason) => {
                  const selected = activeShot.reasons.includes(reason);
                  return (
                    <button
                      key={reason}
                      className={selected ? "is-selected" : ""}
                      type="button"
                      onClick={() => toggleReason(reason)}
                      aria-pressed={selected}
                    >
                      {selected && <Check size={14} weight="bold" />}
                      {reason}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="feedback-label">
              <span>What should change?</span>
              <textarea
                rows={3}
                value={activeShot.feedback}
                onChange={(event) =>
                  updateShot(activeShot.id, {
                    feedback: event.target.value,
                  })
                }
                placeholder="Bring the camera slightly lower and preserve the exact stitching around the collar."
              />
            </label>

            <button
              className="button button-primary button-large"
              type="button"
              onClick={() => void regenerateShot(activeShot)}
            >
              <ArrowCounterClockwise size={19} weight="bold" />
              Regenerate shot
            </button>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function GeneratingView({
  state,
  original,
}: {
  state: StudioState;
  original: string;
}) {
  const completed = state.shots.filter((shot) =>
    ["ready", "approved", "rejected"].includes(shot.status),
  ).length;
  const progress =
    state.shots.length === 0
      ? 0
      : Math.round((completed / state.shots.length) * 100);

  return (
    <section className="generating-layout">
      <div className="generating-orbit" aria-hidden="true">
        <div className="generating-original">
          <Image
            src={original}
            alt=""
            fill
            sizes="220px"
            unoptimized
            priority
          />
        </div>
        <span className="generating-spark">
          <SpinnerGap size={28} weight="bold" className="spin" />
        </span>
      </div>

      <div className="generating-copy">
        <span className="eyebrow">
          <SpinnerGap size={15} weight="bold" className="spin" />
          Building your contact sheet
        </span>
        <h1 data-step-heading tabIndex={-1}>
          Keeping every view in character.
        </h1>
        <p>
          The original remains the identity anchor. Each finished AI view is
          clearly labelled and used only as an additional spatial reference for
          the next angle.
        </p>

        <div className="progress-track" aria-label={`${progress}% complete`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-labels">
          <strong>{progress}%</strong>
          <span>
            {completed} of {state.shots.length} complete
          </span>
        </div>

        <div className="generation-list">
          {state.shots.map((shot, index) => (
            <div key={shot.id} className={`generation-item ${shot.status}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{shot.angle.label}</strong>
              <GenerationStatus status={shot.status} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GenerationStatus({ status }: { status: ShotStatus }) {
  if (status === "generating") {
    return <SpinnerGap size={18} weight="bold" className="spin" />;
  }
  if (status === "ready" || status === "approved") {
    return <Check size={18} weight="bold" />;
  }
  if (status === "error") {
    return <WarningCircle size={18} weight="fill" />;
  }
  return <span className="queue-dot" />;
}

function ShotCard({
  shot,
  index,
  onApprove,
  onReject,
  onRetry,
}: {
  shot: Shot;
  index: number;
  onApprove: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const isApproved = shot.status === "approved";
  const isRejected = shot.status === "rejected";
  const isLoading = shot.status === "generating";
  const isError = shot.status === "error";

  return (
    <article
      className={`shot-card ${isApproved ? "is-approved" : ""} ${isRejected ? "is-rejected" : ""}`}
    >
      <div className="shot-card-topline">
        <span>{String(index + 1).padStart(2, "0")}</span>
        <span className="ai-label">AI-generated reference</span>
      </div>

      <div className="shot-image">
        {shot.imageUrl ? (
          <Image
            src={shot.imageUrl}
            alt={`${shot.angle.label} generated product view`}
            fill
            sizes="(max-width: 720px) 46vw, 360px"
            unoptimized
          />
        ) : (
          <div className="shot-placeholder">
            {isLoading ? (
              <SpinnerGap size={30} weight="bold" className="spin" />
            ) : (
              <WarningCircle size={30} weight="light" />
            )}
          </div>
        )}

        {isApproved && (
          <span className="approval-badge">
            <Check size={16} weight="bold" />
            Approved
          </span>
        )}
      </div>

      <div className="shot-meta">
        <div>
          <strong>{shot.angle.label}</strong>
          <span>
            {shot.angle.azimuth}° · {shot.angle.elevation}°
          </span>
        </div>
        {isError && <p>{shot.error}</p>}
      </div>

      {isError ? (
        <button
          className="button button-secondary card-wide-button"
          type="button"
          onClick={onRetry}
        >
          <ArrowCounterClockwise size={16} weight="bold" />
          Retry shot
        </button>
      ) : (
        <div className="shot-actions">
          <button
            className={isApproved ? "is-active" : ""}
            type="button"
            onClick={onApprove}
            disabled={isLoading || !shot.imageUrl}
          >
            <Check size={17} weight="bold" />
            {isApproved ? "Looks good" : "Approve"}
          </button>
          <button
            className={isRejected ? "is-active" : ""}
            type="button"
            onClick={onReject}
            disabled={isLoading || !shot.imageUrl}
          >
            <X size={16} weight="bold" />
            Needs work
          </button>
        </div>
      )}
    </article>
  );
}
