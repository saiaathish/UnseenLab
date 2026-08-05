/**
 * Engine registry for the Lumina 2D namespace.
 *
 * createModule(engineId) is the single entry point the runner uses. Unknown
 * engine ids return null — the caller (runner) is expected to fail loudly
 * rather than silently substitute a different engine.
 */
import type { EngineMeta, SimulationModule } from "./types";
import { engineRegistry } from "./engines";

export function createModule(engineId: string): SimulationModule | null {
  const entry = engineRegistry[engineId];
  return entry ? entry.factory() : null;
}

export function getEngineMeta(engineId: string): EngineMeta | null {
  const entry = engineRegistry[engineId];
  return entry ? entry.meta : null;
}

/** All registered engine ids, in catalog order. */
export function listEngineIds(): string[] {
  return Object.keys(engineRegistry);
}

export function listEngineMeta(): EngineMeta[] {
  return Object.values(engineRegistry).map((e) => e.meta);
}
