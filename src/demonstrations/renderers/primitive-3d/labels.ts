/**
 * labels.ts — label sprite construction + in-code label texture generation for
 * the primitive-3d renderer (extracted from renderer.ts / materials.ts by C0;
 * behavior-identical, pure moves + import rewiring — no logic changes).
 *
 * Owns: makeLabelTexture (the 320x72 canvas texture builder), node label
 * sprites (buildLabelSprite), the standalone `label`-kind node build path
 * (buildLabelKindVisual), and the graph-mode dimming participation of node
 * labels (the owned-material push inside buildLabelSprite).
 */

import * as THREE from "three";
import type { SceneGraph, SceneGraphNode } from "./types";
import type { RuntimeNode } from "./renderer";

/** The subset of renderer state label construction operates on. */
export interface LabelContext {
  graph: SceneGraph | null;
  graphMode: boolean;
  trackDisposable(d: { dispose(): void }): void;
}

/**
 * Build an in-code label sprite texture from plain text (moved here from
 * materials.ts). The canvas texture is generated deterministically per call
 * and must be disposed by the caller (or via disposeScene on the renderer).
 * Never loads external images.
 */
export function makeLabelTexture(
  text: string,
  opts?: { dark?: boolean }
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  const width = 320;
  const height = 72;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const dark = opts?.dark ?? true;
    ctx.clearRect(0, 0, width, height);
    ctx.font = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = dark ? "#f2f5ff" : "#10131c";
    ctx.fillText(String(text).slice(0, 40), width / 2, height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Build the label sprite for a node that carries a label (every non-label
 * kind). The sprite is locked above the node, camera-facing, and in graph
 * scenes participates in selection dimming via the owned-material path.
 */
export function buildLabelSprite(
  ctx: LabelContext,
  rn: RuntimeNode,
  node: SceneGraphNode,
  holder: THREE.Group
): void {
  const texture = makeLabelTexture(node.label ?? node.id, {
    dark: ctx.graph?.background === "dark",
  });
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.y = node.size * 0.9 + 0.4;
  sprite.scale.set(Math.min(node.size, 2) * 2.2, Math.min(node.size, 2) * 0.5, 1);
  holder.add(sprite);
  ctx.trackDisposable(texture);
  if (ctx.graphMode) {
    // Labels stay locked above their nodes and always face the camera
    // (sprites). In graph scenes they participate in selection dimming.
    rn.owned.push({
      material,
      animateOpacity: true,
      animateColor: false,
      baseColor: undefined,
    });
  }
}

/** Standalone `label`-kind node sprite (the `label` case of buildVisual). */
export function buildLabelKindVisual(
  ctx: LabelContext,
  node: SceneGraphNode,
  holder: THREE.Group
): void {
  const texture = makeLabelTexture(node.label ?? node.id, {
    dark: ctx.graph?.background === "dark",
  });
  const material = new THREE.SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(node.size * 2.2, node.size * 0.5, 1);
  holder.add(sprite);
  ctx.trackDisposable(texture);
}
