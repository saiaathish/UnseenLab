"use client";

/**
 * HeroWaveBackground
 *
 * Decorative, extremely conservative animated background for the dark homepage
 * hero. Renders a static CSS gradient fallback at all times; a WebGL layer of
 * soft, slow-moving vertical bars is layered on top only when motion is
 * permitted (OS reduced motion off AND in-app preference off). It is
 * aria-hidden and pointer-events-none — never interactive.
 *
 * Reduced motion is always respected:
 *  - OS "prefers-reduced-motion: reduce"
 *  - in-app preference stored at "unseenlab.preferences.v1" -> reducedMotion
 *  - the document-level "data-reduced-motion" attribute set by the app
 * If any of those indicate reduced motion, Three.js is never initialized.
 * If the page switches to reduced motion while running, the scene is disposed
 * and the static gradient remains. Every failure path degrades to the static
 * gradient and logs at most one console.warn for the lifetime of the module.
 */

import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";

const PREFERENCES_KEY = "unseenlab.preferences.v1";

/** Log at most one warning per component lifetime (module-level flag). */
let warnedOnce = false;
function warnOnce(message: string): void {
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(message);
  }
}

/** Read-only peek at the app's in-app reduced-motion preference. Corrupt or missing data is treated as false. */
function readInAppReducedMotionPreference(): boolean {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return false;
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      const record = parsed as { reducedMotion?: unknown };
      return record.reducedMotion === true;
    }
    return false;
  } catch {
    return false;
  }
}

function reducedMotionNow(): boolean {
  const osReduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const inAppReduced = readInAppReducedMotionPreference();
  const attributeReduced =
    document.documentElement.getAttribute("data-reduced-motion") === "true";
  return osReduced || inAppReduced || attributeReduced;
}

export function HeroWaveBackground() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // ---- Reduced-motion gate: decided BEFORE any WebGL work. ----
    if (reducedMotionNow()) return;

    const container = containerRef.current;
    const wrapper = wrapperRef.current;
    if (!container || !wrapper) return;

    let active = true; // false once unmounted — guards async callbacks
    let reduced = false;
    let failed = false;
    let running = false;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.OrthographicCamera | null = null;
    let timeline: gsap.core.Timeline | null = null;
    let mediaQuery: MediaQueryList | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let intersectionObserver: IntersectionObserver | null = null;
    let attributeObserver: MutationObserver | null = null;

    let frontMesh: THREE.InstancedMesh | null = null;
    let backMesh: THREE.InstancedMesh | null = null;
    let frontGeometry: THREE.BoxGeometry | null = null;
    let backGeometry: THREE.BoxGeometry | null = null;
    let frontMaterial: THREE.MeshBasicMaterial | null = null;
    let backMaterial: THREE.MeshBasicMaterial | null = null;

    const waveState = { p: 0 }; // 0 -> 1 -> 0, driven by the local timeline
    const dummy = new THREE.Object3D();

    let small = false;
    let barCount = 0;
    let barWidth = 0;
    let maxHeight = 0;
    let frontBaseline = 0;
    let backBaseline = 0;
    let xPositions: number[] = [];

    /** Draw one frame of the wave for the given phase (radians). */
    const setWave = (phase: number): void => {
      if (!frontMesh || !backMesh || barCount === 0) return;
      for (let i = 0; i < barCount; i++) {
        const x = xPositions[i] ?? 0;
        const primary = 0.5 + 0.5 * Math.sin(x * 0.006 + phase);
        const secondary =
          0.5 + 0.5 * Math.sin(x * 0.015 - phase * 0.55 + 0.8);
        const h = maxHeight * (0.25 + 0.5 * primary * (0.55 + 0.45 * secondary));

        dummy.position.set(x, frontBaseline + h / 2, 0);
        dummy.scale.set(barWidth, Math.max(1, h), 1);
        dummy.updateMatrix();
        frontMesh.setMatrixAt(i, dummy.matrix);

        const backH =
          maxHeight *
          (0.22 + 0.55 * (0.5 + 0.5 * Math.sin(x * 0.008 + phase * 0.8 + 1.2)));
        dummy.position.set(x, backBaseline + backH / 2, 0);
        dummy.scale.set(barWidth, Math.max(1, backH), 1);
        dummy.updateMatrix();
        backMesh.setMatrixAt(i, dummy.matrix);
      }
      frontMesh.instanceMatrix.needsUpdate = true;
      backMesh.instanceMatrix.needsUpdate = true;
    };

    /** Create (or rebuild) the instanced bar layers. */
    const buildBars = (): void => {
      // Dispose previous layers if any (resize across the small-screen breakpoint).
      try {
        frontMesh?.dispose();
        backMesh?.dispose();
      } catch {
        /* best effort */
      }
      try {
        frontGeometry?.dispose();
        backGeometry?.dispose();
        frontMaterial?.dispose();
        backMaterial?.dispose();
      } catch {
        /* best effort */
      }

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      geometry.translate(0, 0.5, 0); // origin at the base of each bar

      frontGeometry = geometry;
      backGeometry = geometry.clone();
      frontMaterial = new THREE.MeshBasicMaterial({
        color: 0x58a6d9,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      backMaterial = new THREE.MeshBasicMaterial({
        color: 0x3d8bb3,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      });

      frontMesh = new THREE.InstancedMesh(frontGeometry, frontMaterial, barCount);
      backMesh = new THREE.InstancedMesh(backGeometry, backMaterial, barCount);
      frontMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      backMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      backMesh.position.z = -0.5;
      scene?.add(frontMesh, backMesh);
    };

    /** Recompute layout-derived values from the wrapper size. */
    const updateLayout = (width: number, height: number): void => {
      const span = width * 0.94;
      xPositions = new Array<number>(barCount);
      for (let i = 0; i < barCount; i++) {
        xPositions[i] = -span / 2 + (i / Math.max(1, barCount - 1)) * span;
      }
      barWidth = (width / barCount) * 0.55;
      maxHeight = height * 0.3;
      frontBaseline = -height * 0.14;
      backBaseline = -height * 0.06;
    };

    const tick = (): void => {
      if (!active || reduced || !renderer || !scene || !camera) return;
      try {
        setWave(waveState.p * Math.PI * 2);
        renderer.render(scene, camera);
      } catch {
        /* a failed frame must never throw out of the ticker */
      }
    };

    const startLoop = (): void => {
      if (!active || reduced || running) return;
      if (document.visibilityState === "hidden") return;
      running = true;
      try {
        if (!timeline) {
          // This component's OWN local timeline only. Never touches the global timeline.
          timeline = gsap
            .timeline({ repeat: -1, yoyo: true })
            .to(waveState, { p: 1, duration: 10, ease: "sine.inOut" }, 0);
        } else {
          timeline.play();
        }
        gsap.ticker.add(tick);
      } catch (error) {
        running = false;
        warnOnce(
          `HeroWaveBackground: animation failed to start (${
            error instanceof Error ? error.message : "unknown error"
          })`,
        );
      }
    };

    const stopLoop = (): void => {
      if (!running) return;
      running = false;
      try {
        gsap.ticker.remove(tick);
        timeline?.pause();
      } catch {
        /* best effort */
      }
    };

    /** Idempotent full teardown of the WebGL scene. Never throws. */
    const disposeScene = (): void => {
      try {
        gsap.ticker.remove(tick);
      } catch {
        /* best effort */
      }
      try {
        timeline?.kill();
      } catch {
        /* best effort */
      }
      timeline = null;
      running = false;
      try {
        frontMesh?.dispose();
        backMesh?.dispose();
      } catch {
        /* best effort */
      }
      try {
        frontGeometry?.dispose();
        backGeometry?.dispose();
        frontMaterial?.dispose();
        backMaterial?.dispose();
      } catch {
        /* best effort */
      }
      if (renderer) {
        try {
          renderer.domElement.remove();
        } catch {
          /* best effort */
        }
        try {
          renderer.dispose();
        } catch {
          /* best effort */
        }
      }
      renderer = null;
      scene = null;
      camera = null;
      frontMesh = null;
      backMesh = null;
      frontGeometry = null;
      backGeometry = null;
      frontMaterial = null;
      backMaterial = null;
    };

    const initScene = (): boolean => {
      try {
        const rect = wrapper.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        small = width < 768;
        barCount = small ? 22 : 44;
        updateLayout(width, height);

        scene = new THREE.Scene();

        camera = new THREE.OrthographicCamera(
          -width / 2,
          width / 2,
          height / 2,
          -height / 2,
          0.1,
          100,
        );
        camera.position.z = 10;

        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          powerPreference: "low-power",
        });
        renderer.setClearColor(0x000000, 0); // transparent over the CSS gradient
        // Internal drawing buffer at reduced resolution: cap device pixel ratio at
        // 1.5, then render at 75% of that (roughly half the pixels). Capped at 1 on small screens.
        renderer.setPixelRatio(
          small ? 1 : Math.min(window.devicePixelRatio || 1, 1.5) * 0.75,
        );
        renderer.setSize(width, height, true);

        // Duplicate-canvas guard (React StrictMode double mount).
        while (wrapper.firstChild) {
          wrapper.removeChild(wrapper.firstChild);
        }
        wrapper.appendChild(renderer.domElement);

        buildBars();
        setWave(0);
        return true;
      } catch (error) {
        warnOnce(
          `HeroWaveBackground: WebGL unavailable, staying on static fallback (${
            error instanceof Error ? error.message : "unknown error"
          })`,
        );
        disposeScene();
        return false;
      }
    };

    const handleResize = (): void => {
      if (!active || reduced || !renderer || !camera) return;
      try {
        const rect = wrapper.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const nowSmall = width < 768;
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, true);
        if (nowSmall !== small) {
          small = nowSmall;
          barCount = small ? 22 : 44;
          buildBars();
        }
        updateLayout(width, height);
        setWave(waveState.p * Math.PI * 2);
      } catch {
        /* best effort */
      }
    };

    /** Re-evaluate motion preference; dispose or re-init the scene as needed. */
    const applyMotionPreference = (): void => {
      if (!active) return;
      const nowReduced = reducedMotionNow();
      if (nowReduced && !reduced) {
        reduced = true;
        try {
          disposeScene();
        } catch {
          /* best effort */
        }
      } else if (!nowReduced && reduced && !failed) {
        reduced = false;
        if (initScene()) {
          startLoop();
        } else {
          failed = true;
        }
      }
    };

    const handleVisibilityChange = (): void => {
      if (!active || reduced) return;
      if (document.visibilityState === "hidden") {
        stopLoop();
      } else {
        startLoop();
      }
    };

    // ---- Initialization (any failure degrades to the static gradient). ----
    try {
      if (!initScene()) {
        failed = true;
        return;
      }

      mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      mediaQuery.addEventListener("change", applyMotionPreference);

      attributeObserver = new MutationObserver(applyMotionPreference);
      attributeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-reduced-motion"],
      });

      document.addEventListener("visibilitychange", handleVisibilityChange);

      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(wrapper);

      intersectionObserver = new IntersectionObserver((entries) => {
        if (!active || reduced) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            startLoop();
          } else {
            stopLoop();
          }
        }
      });
      intersectionObserver.observe(container);

      // Initial pause conditions (invisible tab or off-screen hero).
      if (document.visibilityState === "hidden") {
        stopLoop();
      } else {
        startLoop();
      }
    } catch (error) {
      warnOnce(
        `HeroWaveBackground: setup failed, staying on static fallback (${
          error instanceof Error ? error.message : "unknown error"
        })`,
      );
      try {
        disposeScene();
      } catch {
        /* best effort */
      }
    }

    return () => {
      active = false;
      disposeScene();
      try {
        resizeObserver?.disconnect();
      } catch {
        /* best effort */
      }
      try {
        intersectionObserver?.disconnect();
      } catch {
        /* best effort */
      }
      try {
        attributeObserver?.disconnect();
      } catch {
        /* best effort */
      }
      try {
        mediaQuery?.removeEventListener("change", applyMotionPreference);
      } catch {
        /* best effort */
      }
      try {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      } catch {
        /* best effort */
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute inset-0 z-0 overflow-hidden pointer-events-none"
    >
      {/* Static fallback: always rendered, the base layer. */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1220] via-[#0d1428] to-[#070b14]" />
      {/* WebGL layer (empty when motion is reduced or unavailable). */}
      <div ref={wrapperRef} className="absolute inset-0" />
    </div>
  );
}
