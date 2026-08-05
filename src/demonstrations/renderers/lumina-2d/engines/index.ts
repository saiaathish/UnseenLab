/**
 * Lumina 2D engine registry — every engine factory keyed by its exact
 * ENGINE_CATALOG id (demo-spec). The registry layer (registry.ts) resolves
 * ids to modules; unknown ids resolve to null, never to a different engine.
 */
import type { EngineMeta, SimulationModule } from "../types";
import { createOrbits, ORBITS_META } from "./orbits";
import { createProjectile, PROJECTILE_META } from "./projectile";
import { createCharges, CHARGES_META } from "./charges";
import { createWaves, WAVES_META } from "./waves";
import { createGas, GAS_META } from "./gas";
import { createPendulum, PENDULUM_META } from "./pendulum";
import { createCircuit, CIRCUIT_META } from "./circuit";
import { createReactionDiffusion, REACTION_META } from "./reaction-diffusion";
import { createCellularAutomaton, CA_META } from "./cellular-automaton";

export interface EngineFactoryEntry {
  factory: () => SimulationModule;
  meta: EngineMeta;
}

export const engineRegistry: Record<string, EngineFactoryEntry> = {
  orbits: { factory: createOrbits, meta: ORBITS_META },
  projectile: { factory: createProjectile, meta: PROJECTILE_META },
  charges: { factory: createCharges, meta: CHARGES_META },
  waves: { factory: createWaves, meta: WAVES_META },
  gas: { factory: createGas, meta: GAS_META },
  pendulum: { factory: createPendulum, meta: PENDULUM_META },
  rc_circuit: { factory: createCircuit, meta: CIRCUIT_META },
  reaction_diffusion: { factory: createReactionDiffusion, meta: REACTION_META },
  cellular_automaton: { factory: createCellularAutomaton, meta: CA_META },
};
