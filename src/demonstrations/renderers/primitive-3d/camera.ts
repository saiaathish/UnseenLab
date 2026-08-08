/**
 * camera.ts — camera creation, framing and orbit application for the
 * primitive-3d renderer (extracted from renderer.ts by C0; behavior-identical,
 * pure moves + import rewiring — no logic changes).
 *
 * Owns the orbit state record, the canonical-graph view direction, the
 * graph-mode orthographic frustum math and the restricted graph-orbit clamp.
 * Functions are pure over their inputs: frameCamera returns the (possibly
 * replaced) camera and the orthographic base half-height instead of mutating
 * a host object, so nothing here reaches into the renderer.
 */

import * as THREE from "three";
import type { SceneGraph } from "./types";
import { clampNum } from "./operators";

// Canonical-graph (graph-like scene) camera constants ------------------------
// Graph scenes are rendered as an alternate projection of the same canonical
// graph the 2D diagram resolves: the camera is near-orthographic with heavily
// restricted rotation so the graph never degenerates into spaghetti.
export const GRAPH_VIEW_DIR = new THREE.Vector3(0, 0.55, 1).normalize(); // +z, slight tilt
export const GRAPH_AZIMUTH_BAND = 0.45; // rad of allowed azimuth swing around default
export const GRAPH_POLAR_BAND = 0.18; // rad of allowed polar tilt around default

/** Orbit/framing state shared with the renderer's pointer controls. */
export interface OrbitState {
  azimuth: number;
  polar: number;
  distance: number;
  target: THREE.Vector3;
  defaultAzimuth: number;
  defaultPolar: number;
  defaultDistance: number;
  userControlled: boolean;
}

/** Inputs for frameCamera: the graph-mode flag, the live orbit record and the
 * current orthographic base half-height (perspective framing leaves it
 * untouched, so it is echoed back unchanged). */
export interface FrameInput {
  graphMode: boolean;
  orbit: OrbitState;
  orthoBaseHalf: number;
}

/** Frame the camera from the graph's raw node-position diagonal. Returns the
 * camera to use (a fresh Orthographic/PerspectiveCamera when the projection
 * class changed) and the orthographic base half-height. */
export function frameCamera(
  camera: THREE.Camera | null,
  graph: SceneGraph,
  input: FrameInput
): { camera: THREE.Camera; orthoBaseHalf: number } | null {
  if (!camera) return null;
  let cam: THREE.Camera = camera;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const n of graph.nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    minZ = Math.min(minZ, n.position.z);
    maxX = Math.max(maxX, n.position.x);
    maxY = Math.max(maxY, n.position.y);
    maxZ = Math.max(maxZ, n.position.z);
  }
  const hasNodes = Number.isFinite(minX);
  const center = new THREE.Vector3(
    hasNodes ? (minX + maxX) / 2 : 0,
    hasNodes ? (minY + maxY) / 2 : 0,
    hasNodes ? (minZ + maxZ) / 2 : 0
  );
  const diagonal = hasNodes
    ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
    : 0;
  const distance = clampNum(diagonal * 2.2, 4, 120);

  const { graphMode, orbit, orthoBaseHalf } = input;
  if (graphMode) {
    // Near-orthographic default for canonical graphs: the graph lives in a
    // plane, so a flat projection keeps it readable and never turns it into
    // spaghetti. Rotation is clamped to a narrow band around the default.
    if (!(cam instanceof THREE.OrthographicCamera)) {
      cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 2000);
    }
    const baseHalf = Math.max(diagonal * 0.72, 1.4);
    const dir = GRAPH_VIEW_DIR;
    const pos = center.clone().addScaledVector(dir, distance);
    cam.position.copy(pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    orbit.target.copy(center);
    orbit.distance = distance;
    orbit.defaultDistance = distance;
    orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
    orbit.defaultPolar = Math.acos(dir.y / dir.length());
    orbit.azimuth = orbit.defaultAzimuth;
    orbit.polar = orbit.defaultPolar;
    orbit.userControlled = false;
    return { camera: cam, orthoBaseHalf: baseHalf };
  }

  if (!(cam instanceof THREE.PerspectiveCamera)) {
    cam = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  }
  const dir = new THREE.Vector3(1, 0.65, 1.35).normalize();
  const pos = center.clone().addScaledVector(dir, distance);
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);

  orbit.target.copy(center);
  orbit.distance = distance;
  orbit.defaultDistance = distance;
  orbit.defaultAzimuth = Math.atan2(dir.x, dir.z);
  orbit.defaultPolar = Math.acos(dir.y);
  orbit.azimuth = orbit.defaultAzimuth;
  orbit.polar = orbit.defaultPolar;
  orbit.userControlled = false;
  return { camera: cam, orthoBaseHalf };
}

/** Apply the current orbit state to the camera (called every frame). */
export function applyCamera(
  camera: THREE.Camera | null,
  orbit: OrbitState,
  orthoBaseHalf: number,
  cameraAspect: number
): void {
  if (!camera) return;
  const { azimuth, polar, distance, target } = orbit;
  const sp = Math.sin(polar);
  const cp = Math.cos(polar);
  camera.position.set(
    target.x + distance * sp * Math.sin(azimuth),
    target.y + distance * cp,
    target.z + distance * sp * Math.cos(azimuth)
  );
  camera.lookAt(target);
  if (camera instanceof THREE.OrthographicCamera) {
    // Zoom = frustum scaling; distance is the zoom factor (larger = out).
    const halfH = orthoBaseHalf * (distance / orbit.defaultDistance);
    const halfW = halfH * cameraAspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
}

/** Graph scenes: rotation is heavily restricted so the graph never turns
 * into spaghetti — a narrow azimuth swing and a small tilt band. */
export function clampGraphOrbit(orbit: OrbitState): void {
  orbit.azimuth = clampNum(
    orbit.azimuth,
    orbit.defaultAzimuth - GRAPH_AZIMUTH_BAND,
    orbit.defaultAzimuth + GRAPH_AZIMUTH_BAND
  );
  orbit.polar = clampNum(
    orbit.polar,
    orbit.defaultPolar - GRAPH_POLAR_BAND,
    orbit.defaultPolar + GRAPH_POLAR_BAND
  );
}
