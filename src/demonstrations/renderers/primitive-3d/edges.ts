/**
 * edges.ts — graph/flow edges + trails for the primitive-3d renderer
 * (extracted from renderer.ts by C0; behavior-identical, pure moves + import
 * rewiring — no logic changes).
 *
 * Owns: the RuntimeEdge record, buildGraphEdge (derived canonical-graph
 * edges: shaft + arrowhead/inhibits bar + mid-edge label), buildFlowEdge
 * (legacy plain flows_to/transfers_to edges), the per-frame updateEdge math
 * (world-space shaft/head/label placement), and pushTrailPoint (the
 * world-position trail ring buffer).
 */

import * as THREE from "three";
import type { GraphEdgePlan } from "./scene-graph";
import type {
  SceneGraph,
  SceneGraphRelationship,
} from "./types";
import type { RuntimeNode } from "./renderer";
import { materialFor } from "./materials";
import { makeLabelTexture } from "./labels";

const Y_UP = new THREE.Vector3(0, 1, 0);

/** Runtime record for a rendered edge (canonical or legacy flow). */
export interface RuntimeEdge {
  /** The derived edge (canonical graph). Legacy flow edges carry a minimal
   * plan (no arrowhead/label) and are only drawn for non-graph scenes. */
  plan: GraphEdgePlan;
  from: RuntimeNode;
  to: RuntimeNode;
  group: THREE.Group;
  shaft: {
    geometry: THREE.BufferGeometry;
    attribute: THREE.BufferAttribute;
    line: THREE.Line;
    material: THREE.Material;
    baseColor: string;
  };
  head: { mesh: THREE.Mesh; material: THREE.Material; baseColor: string } | null;
  label: THREE.Sprite | null;
}

/** The subset of renderer state edge construction operates on. */
export interface EdgeContext {
  scene: THREE.Scene | null;
  graph: SceneGraph | null;
  trackDisposable(d: { dispose(): void }): void;
  edges: RuntimeEdge[];
  pickEdges: Map<THREE.Object3D, string>;
}

/**
 * Build a derived graph edge: shaft line from → to, arrowhead cone at the
 * DESTINATION (or a `—|` bar for inhibits), and the relationship label
 * mid-edge. All materials are per-edge clones so dim/highlight never touch
 * the shared cache.
 */
export function buildGraphEdge(
  ctx: EdgeContext,
  from: RuntimeNode,
  to: RuntimeNode,
  plan: GraphEdgePlan
): void {
  const group = new THREE.Group();
  group.name = `edge:${plan.id}`;

  const geo = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(new Float32Array(6), 3);
  attribute.setXYZ(0, from.graph.position.x, from.graph.position.y, from.graph.position.z);
  attribute.setXYZ(1, to.graph.position.x, to.graph.position.y, to.graph.position.z);
  geo.setAttribute("position", attribute);
  const lineMaterial = materialFor("line", from.graph.color).clone();
  lineMaterial.transparent = true;
  const line = new THREE.Line(geo, lineMaterial);
  group.add(line);
  ctx.trackDisposable(geo);

  const toColor = to.graph.color;
  let head: RuntimeEdge["head"] = null;
  if (plan.inhibits) {
    const barGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 8);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(toColor),
    });
    material.transparent = true;
    const bar = new THREE.Mesh(barGeo, material);
    group.add(bar);
    head = { mesh: bar, material, baseColor: toColor };
    ctx.trackDisposable(barGeo);
  } else {
    const tipGeo = new THREE.ConeGeometry(0.15, 0.36, 10);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(toColor),
    });
    material.transparent = true;
    const tip = new THREE.Mesh(tipGeo, material);
    group.add(tip);
    head = { mesh: tip, material, baseColor: toColor };
    ctx.trackDisposable(tipGeo);
  }

  let label: THREE.Sprite | null = null;
  const labelText = plan.label;
  if (labelText) {
    const texture = makeLabelTexture(labelText, {
      dark: ctx.graph?.background === "dark",
    });
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.9, 0.42, 1);
    group.add(sprite);
    ctx.trackDisposable(texture);
    label = sprite;
  }

  ctx.scene?.add(group);
  ctx.edges.push({
    plan,
    from,
    to,
    group,
    shaft: {
      geometry: geo,
      attribute,
      line,
      material: lineMaterial,
      baseColor: from.graph.color,
    },
    head,
    label,
  });
  ctx.pickEdges.set(group, plan.id);
}

/** Legacy plain edge (flows_to / transfers_to only, non-graph scenes). */
export function buildFlowEdge(
  ctx: EdgeContext,
  from: RuntimeNode,
  to: RuntimeNode,
  rel: SceneGraphRelationship
): void {
  const group = new THREE.Group();
  group.name = `edge:${rel.id}`;
  const geo = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(new Float32Array(6), 3);
  attribute.setXYZ(0, from.graph.position.x, from.graph.position.y, from.graph.position.z);
  attribute.setXYZ(1, to.graph.position.x, to.graph.position.y, to.graph.position.z);
  geo.setAttribute("position", attribute);
  const line = new THREE.Line(geo, materialFor("line", from.graph.color));
  group.add(line);
  ctx.scene?.add(group);
  ctx.trackDisposable(geo);
  ctx.edges.push({
    plan: {
      id: rel.id,
      type: rel.type,
      label: rel.label ?? rel.type,
      fromId: rel.from,
      toId: rel.to,
      from: from.graph.position,
      to: to.graph.position,
      inhibits: false,
    },
    from,
    to,
    group,
    shaft: {
      geometry: geo,
      attribute,
      line,
      material: materialFor("line", from.graph.color),
      baseColor: from.graph.color,
    },
    head: null,
    label: null,
  });
}

/** Per-frame world-space edge update (shaft, head, label). */
export function updateEdge(edge: RuntimeEdge): void {
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  edge.from.group.getWorldPosition(from);
  edge.to.group.getWorldPosition(to);
  edge.shaft.attribute.setXYZ(0, from.x, from.y, from.z);
  edge.shaft.attribute.setXYZ(1, to.x, to.y, to.z);
  edge.shaft.attribute.needsUpdate = true;

  const head = edge.head;
  if (!head) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  // Head anchors at the DESTINATION node, just outside its radius.
  const nodeRadius = Math.max(0.25, edge.to.graph.size * 0.5);
  const inset = nodeRadius + 0.22;
  head.mesh.position.set(
    to.x - ux * inset,
    to.y - uy * inset,
    to.z - uz * inset
  );
  if (edge.plan.inhibits) {
    // `—|` bar: perpendicular to the edge direction at the destination.
    let px = -uy;
    let py = ux;
    let pz = 0;
    const plen = Math.hypot(px, py, pz);
    if (plen < 1e-6) {
      // Edge runs along z (no in-plane perpendicular): fall back to x-z.
      px = 0;
      py = -uz;
      pz = uy;
    } else {
      px /= plen;
      py /= plen;
      pz /= plen;
    }
    head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(px, py, pz));
  } else {
    head.mesh.quaternion.setFromUnitVectors(Y_UP, new THREE.Vector3(ux, uy, uz));
  }
  if (edge.label) {
    edge.label.position.set(
      (from.x + to.x) / 2,
      (from.y + to.y) / 2 + 0.5,
      (from.z + to.z) / 2
    );
  }
}

/**
 * Record the holder's world position into the trail ring buffer. The recorded
 * points are WORLD space (the trail Line lives in the scene, not the moving
 * holder), so the history stays truthful when the body moves.
 */
export function pushTrailPoint(rn: RuntimeNode): void {
  const t = rn.trail;
  if (!t) return;
  const world = new THREE.Vector3();
  rn.group.getWorldPosition(world);
  const x = world.x;
  const y = world.y;
  const z = world.z;
  if (
    t.last &&
    Math.abs(t.last.x - x) < 1e-6 &&
    Math.abs(t.last.y - y) < 1e-6 &&
    Math.abs(t.last.z - z) < 1e-6
  ) {
    return; // stationary: do not duplicate points
  }
  if (t.written < t.capacity) {
    t.buffer[t.written * 3] = x;
    t.buffer[t.written * 3 + 1] = y;
    t.buffer[t.written * 3 + 2] = z;
    t.written++;
  } else {
    t.buffer.copyWithin(0, 3, t.capacity * 3);
    t.buffer[(t.capacity - 1) * 3] = x;
    t.buffer[(t.capacity - 1) * 3 + 1] = y;
    t.buffer[(t.capacity - 1) * 3 + 2] = z;
  }
  t.last = { x, y, z };
  t.geometry.setDrawRange(0, t.written);
  t.attribute.needsUpdate = true;
}
