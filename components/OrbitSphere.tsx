"use client";

import Image from "next/image";
import { Camera, HandGrabbing, Plus } from "@phosphor-icons/react";
import * as THREE from "three";
import {
  useEffect,
  useMemo,
  useRef,
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
  lockedAngles: Angle[];
  onOrientationChange: (orientation: Orientation) => void;
  onLock: (orientation: Orientation) => void;
};

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestAngle(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

export function OrbitSphere({
  original,
  orientation,
  lockedAngles,
  onOrientationChange,
  onLock,
}: OrbitSphereProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const innerMeshRef = useRef<THREE.Mesh | null>(null);
  const orientationRef = useRef(orientation);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    yaw: number;
    pitch: number;
  } | null>(null);

  useEffect(() => {
    orientationRef.current = orientation;
  }, [orientation]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.z = 4.8;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.prepend(renderer.domElement);

    const innerGeometry = new THREE.SphereGeometry(1.36, 64, 48);
    const innerMaterial = new THREE.MeshStandardMaterial({
      color: 0x101a38,
      metalness: 0.16,
      roughness: 0.68,
      transparent: true,
      opacity: 0.94,
    });
    const innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMeshRef.current = innerSphere;
    scene.add(innerSphere);

    const gridGeometry = new THREE.SphereGeometry(1.4, 24, 16);
    const gridMaterial = new THREE.MeshBasicMaterial({
      color: 0xbfc5e4,
      transparent: true,
      opacity: 0.32,
      wireframe: true,
    });
    const gridSphere = new THREE.Mesh(gridGeometry, gridMaterial);
    meshRef.current = gridSphere;
    scene.add(gridSphere);

    scene.add(new THREE.AmbientLight(0xdce1ff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffb4a5, 3.2);
    keyLight.position.set(3, 2, 4);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xa4aac8, 2);
    rimLight.position.set(-4, -1, -2);
    scene.add(rimLight);

    const resize = () => {
      const size = Math.max(280, mount.clientWidth);
      renderer.setSize(size, size, false);
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const render = () => {
      const { yaw, pitch } = orientationRef.current;
      const yawRadians = THREE.MathUtils.degToRad(yaw);
      const pitchRadians = THREE.MathUtils.degToRad(pitch);
      gridSphere.rotation.set(pitchRadians, yawRadians, 0);
      innerSphere.rotation.set(pitchRadians * 0.35, yawRadians * 0.35, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      gridGeometry.dispose();
      gridMaterial.dispose();
      innerGeometry.dispose();
      innerMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      meshRef.current = null;
      innerMeshRef.current = null;
    };
  }, []);

  const pins = useMemo(
    () =>
      lockedAngles.map((angle) => {
        const relativeYaw = shortestAngle(orientation.yaw, angle.azimuth);
        const relativeYawRadians = THREE.MathUtils.degToRad(relativeYaw);
        const elevationRadians = THREE.MathUtils.degToRad(angle.elevation);
        const depth =
          Math.cos(relativeYawRadians) * Math.cos(elevationRadians);
        const x =
          50 +
          Math.sin(relativeYawRadians) * Math.cos(elevationRadians) * 39;
        const y =
          50 -
          Math.sin(elevationRadians) * 35 +
          orientation.pitch * 0.16;
        return {
          ...angle,
          x,
          y,
          depth,
        };
      }),
    [lockedAngles, orientation],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      yaw: orientation.yaw,
      pitch: orientation.pitch,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    onOrientationChange({
      yaw: normalizeDegrees(drag.yaw + (event.clientX - drag.x) * 0.46),
      pitch: Math.max(
        -40,
        Math.min(40, drag.pitch - (event.clientY - drag.y) * 0.28),
      ),
    });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div className="orbit-composer">
      <div
        ref={mountRef}
        className="orbit-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="application"
        aria-label="Rotatable perspective sphere"
      >
        <div className="orb-product" aria-hidden="true">
          <Image
            src={original}
            alt=""
            fill
            sizes="180px"
            unoptimized
          />
        </div>

        {pins.map((pin) => (
          <button
            key={pin.id}
            className="camera-pin"
            style={{
              left: `${pin.x}%`,
              top: `${pin.y}%`,
              opacity: pin.depth < -0.2 ? 0.34 : 1,
              transform: `translate(-50%, -50%) scale(${0.82 + Math.max(pin.depth, 0) * 0.18})`,
              zIndex: pin.depth < 0 ? 1 : 5,
            }}
            type="button"
            aria-label={`${pin.label} locked perspective`}
          >
            <Camera size={19} weight="bold" />
          </button>
        ))}

        <div className="orbit-gesture">
          <HandGrabbing size={18} weight="bold" />
          Drag to orbit
        </div>
      </div>

      <div className="orbit-readout">
        <span>
          <strong>{Math.round(normalizeDegrees(orientation.yaw))}°</strong>{" "}
          orbit
        </span>
        <span>
          <strong>{Math.round(orientation.pitch)}°</strong> tilt
        </span>
        <button
          className="button button-secondary button-compact"
          type="button"
          onClick={() => onLock(orientation)}
        >
          <Plus size={17} weight="bold" />
          Lock this view
        </button>
      </div>
    </div>
  );
}
