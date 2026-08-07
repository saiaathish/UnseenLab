/**
 * Conceptual template builder (Level 2 — conceptual_demonstration) and
 * explanatory timeline builder (Level 3 — explanatory_animation).
 *
 * Level 2: scene3d composed from approved PRIMITIVE_KINDS objects and
 * RELATIONSHIP_OPERATORS. No simulation, no correctIndex — predictions are
 * reasoning questions, never graded.
 *
 * Canonical graph invariant: the scene graph IS the semantic mirror — nodes
 * are scene objects (labels attach to nodes, never standalone floating
 * objects) and edges are `scene3d.relationships` (typed). The templates
 * therefore never emit standalone `arrow` / `process_edge` objects or
 * detached scene-title `label` objects: every surface (2D diagram, 3D stage,
 * lesson rail) resolves the same canonical graph. `energy_packet` objects are
 * kept only when they travel along a relationship edge path.
 *
 * Level 3: a curated timeline of educationally accurate events. No
 * simulation, no readouts anywhere, no correctIndex.
 */

import type { LearnerPreferences } from "@/domain/learner";
import {
  ANIMATION_OPERATORS,
  PRIMITIVE_KINDS,
  RELATIONSHIP_OPERATORS,
  SPEC_LIMITS,
  TRUST_LABELS,
  type AnimationSpec,
  type ConceptualTemplateId,
  type DemoSpecV1,
  type PrimitiveObjectSpec,
  type RelationshipSpec,
  type TimelineEventSpec,
} from "@/demonstrations/spec/demo-spec";
import { hashString } from "./engine-builder";
import type { TimelineTopic } from "../intent/types";

// ---------------------------------------------------------------------------
// Small builders for the spec's compound fields
// ---------------------------------------------------------------------------

function obj(
  id: string,
  kind: (typeof PRIMITIVE_KINDS)[number],
  extra: Partial<PrimitiveObjectSpec> = {},
): PrimitiveObjectSpec {
  return { id, kind, ...extra };
}

function rel(
  id: string,
  type: (typeof RELATIONSHIP_OPERATORS)[number],
  from: string,
  to: string,
  label?: string,
): RelationshipSpec {
  return { id, type, from, to, ...(label ? { label } : {}) };
}

function anim(
  id: string,
  target: string,
  operator: (typeof ANIMATION_OPERATORS)[number],
  extra: Partial<AnimationSpec> = {},
): AnimationSpec {
  return { id, target, operator, ...extra };
}

function buildControls(
  prefs: LearnerPreferences,
  extra: DemoSpecV1["controls"] = [],
): DemoSpecV1["controls"] {
  const controls: DemoSpecV1["controls"] = [
    {
      id: "play_pause",
      type: "play_pause",
      label: "Play / Pause",
      target: { kind: "scene", ref: "play_pause" },
    },
  ];
  if (!prefs.reducedMotion) {
    controls.push({
      id: "speed_control",
      type: "speed_control",
      label: "Speed",
      target: { kind: "scene", ref: "speed" },
      min: 0.25,
      max: 2,
      step: 0.05,
      defaultValue: prefs.animationSpeed,
    });
  }
  controls.push({
    id: "reset",
    type: "reset",
    label: "Reset",
    target: { kind: "scene", ref: "reset" },
  });
  return [...controls, ...extra];
}

// ---------------------------------------------------------------------------
// Level 2 — conceptual template scenes
// ---------------------------------------------------------------------------

interface TemplateScene {
  title: string;
  learningObjective: string;
  objects: PrimitiveObjectSpec[];
  relationships: RelationshipSpec[];
  animations: AnimationSpec[];
  limitations: string[];
  prediction: { prompt: string; options: string[] };
  observationPrompts: string[];
}

const TEMPLATE_SCENES: Record<ConceptualTemplateId, TemplateScene> = {
  process_flow: {
    title: "Process Flow",
    learningObjective: "Trace how a product, signal, or material moves step by step through a process.",
    objects: [
      obj("pn1", "process_node", { label: "Step 1", position: { x: -3, y: 0, z: 0 }, size: 1 }),
      obj("pn2", "process_node", { label: "Step 2", position: { x: 0, y: 0, z: 0 }, size: 1 }),
      obj("pn3", "process_node", { label: "Step 3", position: { x: 3, y: 0, z: 0 }, size: 1 }),
      // Travels along the r1 (pn1 → pn2) edge path; edges themselves derive
      // from relationships (canonical graph), never from objects.
      obj("ep1", "energy_packet", { position: { x: -3, y: 0, z: 0 }, size: 0.3 }),
    ],
    relationships: [
      rel("r1", "flows_to", "pn1", "pn2"),
      rel("r2", "flows_to", "pn2", "pn3"),
    ],
    animations: [
      anim("a1", "ep1", "translate", { axis: "x", speed: 1.5 }),
    ],
    limitations: ["Steps are shown in sequence; in real processes, steps can overlap in time."],
    prediction: {
      prompt: "What do you think happens to the output if Step 2 is blocked?",
      options: [
        "The process stops and no output is produced",
        "Step 3 runs faster to compensate",
        "Nothing changes",
      ],
    },
    observationPrompts: [
      "Trace the flow from the first step to the last and say what carries it forward.",
      "Pause the animation and describe what each step shows.",
    ],
  },
  energy_transfer: {
    title: "Energy Transfer",
    learningObjective: "See how energy moves from a source to a sink and changes form along the way.",
    objects: [
      obj("src", "process_node", { label: "Source", position: { x: -3, y: 0, z: 0 }, size: 1 }),
      obj("sink", "process_node", { label: "Sink", position: { x: 3, y: 0, z: 0 }, size: 1 }),
      // Both packets travel along the r1 (src → sink) edge path.
      obj("ep1", "energy_packet", { position: { x: -1.5, y: 0, z: 0 }, size: 0.3 }),
      obj("ep2", "energy_packet", { position: { x: 1.5, y: 0, z: 0 }, size: 0.3 }),
    ],
    relationships: [rel("r1", "transfers_to", "src", "sink")],
    animations: [
      anim("a1", "ep1", "translate", { axis: "x", speed: 1.2 }),
      anim("a2", "ep2", "translate", { axis: "x", speed: 1.2, delayMs: 800 }),
    ],
    limitations: ["Energy is shown as packets; real energy transfers are continuous."],
    prediction: {
      prompt: "Where does the energy end up after it is transferred?",
      options: [
        "In the sink, where it is stored or used",
        "It disappears",
        "It returns to the source",
      ],
    },
    observationPrompts: [
      "Watch the packets leave the source and arrive at the sink.",
      "Describe what the arrow between source and sink represents.",
    ],
  },
  cause_effect_network: {
    title: "Cause and Effect",
    learningObjective: "Map how one event triggers or suppresses another in a network of causes and effects.",
    objects: [
      obj("a", "process_node", { label: "Cause A", position: { x: -3, y: 1, z: 0 }, size: 1 }),
      obj("b", "process_node", { label: "Effect B", position: { x: 0, y: 1, z: 0 }, size: 1 }),
      obj("c", "process_node", { label: "Effect C", position: { x: 0, y: -1, z: 0 }, size: 1 }),
      obj("d", "process_node", { label: "Inhibited D", position: { x: 3, y: -1, z: 0 }, size: 1 }),
    ],
    relationships: [
      rel("r1", "causes", "a", "b"),
      rel("r2", "activates", "b", "c"),
      rel("r3", "inhibits", "c", "d"),
    ],
    animations: [],
    limitations: ["Real systems usually have many more connections than the few shown here."],
    prediction: {
      prompt: "If Cause A is removed, which effects do you expect to change?",
      options: [
        "B and C (and D through C)",
        "Only D",
        "Nothing changes",
      ],
    },
    observationPrompts: [
      "Follow each arrow to see which events trigger or suppress others.",
      "Describe what 'inhibits' does differently from 'activates'.",
    ],
  },
  particle_population: {
    title: "Particle Population",
    learningObjective: "Watch how birth and death rates shape the growth of a population over time.",
    objects: [
      obj("pf1", "particle_field", { position: { x: 0, y: 0, z: 0 }, size: 2, particleCount: 200 }),
      obj("g1", "group", { children: ["pf1"] }),
    ],
    relationships: [rel("r1", "contains", "g1", "pf1")],
    animations: [anim("a1", "g1", "scale", { amplitude: 0.15 })],
    limitations: ["Simplified dynamics; no resource limits or migration are shown."],
    prediction: {
      prompt: "If the birth rate exceeds the death rate, what happens to the population over time?",
      options: [
        "It grows",
        "It shrinks",
        "It stays constant",
      ],
    },
    observationPrompts: [
      "Watch the particle field grow and shrink as the population changes.",
      "Describe what a growing population looks like in the field.",
    ],
  },
  layered_system: {
    title: "Layered System",
    learningObjective: "See how a system is built from stacked layers that support one another.",
    objects: [
      obj("root", "group", { children: ["l1", "l2", "l3", "l4"] }),
      obj("l1", "box", { label: "Layer 1", position: { x: 0, y: 1.5, z: 0 }, size: 1 }),
      obj("l2", "box", { label: "Layer 2", position: { x: 0, y: 0.5, z: 0 }, size: 1 }),
      obj("l3", "box", { label: "Layer 3", position: { x: 0, y: -0.5, z: 0 }, size: 1 }),
      obj("l4", "box", { label: "Layer 4", position: { x: 0, y: -1.5, z: 0 }, size: 1 }),
    ],
    relationships: [
      rel("r1", "contains", "root", "l1"),
      rel("r2", "contains", "root", "l2"),
      rel("r3", "contains", "root", "l3"),
      rel("r4", "contains", "root", "l4"),
    ],
    animations: [
      anim("a1", "l1", "reveal"),
      anim("a2", "l2", "reveal", { delayMs: 600 }),
      anim("a3", "l3", "reveal", { delayMs: 1200 }),
      anim("a4", "l4", "reveal", { delayMs: 1800 }),
    ],
    limitations: ["Only the layer structure is shown; the materials and forces between layers are simplified."],
    prediction: {
      prompt: "If a lower layer is removed, what do you expect to happen to the layers above?",
      options: [
        "They become unsupported and may collapse",
        "They float in place",
        "Nothing changes",
      ],
    },
    observationPrompts: [
      "Watch the layers reveal one at a time from top to bottom.",
      "Describe how each layer relates to the one below it.",
    ],
  },
  cyclic_process: {
    title: "Cyclic Process",
    learningObjective: "See how a repeating cycle returns to its starting point and runs again.",
    objects: [
      obj("p1", "process_node", { label: "Stage A", position: { x: 0, y: 2, z: 0 }, size: 1 }),
      obj("p2", "process_node", { label: "Stage B", position: { x: 2, y: 0, z: 0 }, size: 1 }),
      obj("p3", "process_node", { label: "Stage C", position: { x: 0, y: -2, z: 0 }, size: 1 }),
      obj("p4", "process_node", { label: "Stage D", position: { x: -2, y: 0, z: 0 }, size: 1 }),
    ],
    relationships: [
      rel("r1", "flows_to", "p1", "p2"),
      rel("r2", "flows_to", "p2", "p3"),
      rel("r3", "flows_to", "p3", "p4"),
      rel("r4", "flows_to", "p4", "p1"),
    ],
    animations: [],
    limitations: ["Real cycles usually have side branches and leak energy; this one is a closed loop."],
    prediction: {
      prompt: "If one stage of a cycle is skipped, what happens to the whole cycle?",
      options: [
        "The cycle breaks and cannot continue",
        "The cycle runs faster",
        "The cycle becomes longer",
      ],
    },
    observationPrompts: [
      "Follow the loop and confirm it returns to the starting stage.",
      "Describe why the last stage must connect back to the first.",
    ],
  },
  before_after_comparison: {
    title: "Before and After",
    learningObjective: "Compare a starting state with its transformed end state to see what changed.",
    objects: [
      obj("before", "group", { children: ["b1", "lbB"] }),
      obj("b1", "box", { label: "Before", position: { x: -2.5, y: 0, z: 0 }, size: 1 }),
      obj("lbB", "label", { label: "Before state", position: { x: -2.5, y: -1.6, z: 0 } }),
      obj("after", "group", { children: ["b2", "lbA"] }),
      obj("b2", "box", { label: "After", position: { x: 2.5, y: 0, z: 0 }, size: 1 }),
      obj("lbA", "label", { label: "After state", position: { x: 2.5, y: -1.6, z: 0 } }),
    ],
    relationships: [rel("r1", "transforms_into", "before", "after")],
    animations: [anim("a1", "after", "reveal", { delayMs: 1500 })],
    limitations: ["The change is simplified; the real process may involve many intermediate steps."],
    prediction: {
      prompt: "What is the most important difference between the before and after states shown?",
      options: [
        "The structure changed from one form into another",
        "Nothing changed",
        "Only the labels changed",
      ],
    },
    observationPrompts: [
      "Compare the before and after groups and list what changed.",
      "Describe what the relationship between the two states represents.",
    ],
  },
  field_relationship: {
    title: "Field Relationship",
    learningObjective: "See how a field connects two objects and how their relationship shapes it.",
    objects: [
      obj("s1", "sphere", { label: "Object A", position: { x: -2, y: 0, z: 0 }, size: 0.6, color: "#ff6b6b" }),
      obj("s2", "sphere", { label: "Object B", position: { x: 2, y: 0, z: 0 }, size: 0.6, color: "#4dabf7" }),
      obj("vf1", "vector_field", { position: { x: 0, y: 0, z: 0 }, size: 3 }),
    ],
    relationships: [rel("r1", "attracts", "s1", "s2")],
    animations: [
      anim("a1", "vf1", "update_vector"),
    ],
    limitations: ["The field is shown in one plane; real fields extend in three dimensions."],
    prediction: {
      prompt: "If the two objects have opposite signs, which relationship do you expect?",
      options: [
        "Attraction",
        "Repulsion",
        "No interaction",
      ],
    },
    observationPrompts: [
      "Watch how the arrows between the two objects change direction and strength.",
      "Describe what the field would look like if the objects repelled each other.",
    ],
  },
  transport_network: {
    title: "Transport Network",
    learningObjective: "See how a hub distributes flow to branches of a network.",
    objects: [
      obj("hub", "process_node", { label: "Hub", position: { x: 0, y: 0, z: 0 }, size: 1.1 }),
      obj("na", "process_node", { label: "Branch A", position: { x: -2.5, y: -1.8, z: 0 }, size: 0.8 }),
      obj("nb", "process_node", { label: "Branch B", position: { x: 2.5, y: -1.8, z: 0 }, size: 0.8 }),
      obj("nc", "process_node", { label: "Branch C", position: { x: 0, y: 2.4, z: 0 }, size: 0.8 }),
    ],
    relationships: [
      rel("r1", "flows_to", "hub", "na"),
      rel("r2", "flows_to", "hub", "nb"),
      rel("r3", "flows_to", "hub", "nc"),
    ],
    animations: [],
    limitations: ["A single hub is shown; real networks often have many hubs and rerouting."],
    prediction: {
      prompt: "If the hub stops working, which parts of the network lose supply?",
      options: [
        "All branches downstream of the hub",
        "Only the nearest branch",
        "Nothing changes",
      ],
    },
    observationPrompts: [
      "Watch flow leave the hub and reach every branch.",
      "Describe what happens to a branch if its edge is missing.",
    ],
  },
  timeline_sequence: {
    title: "Timeline Sequence",
    learningObjective: "See the order of events that build a process from start to finish.",
    objects: [
      obj("t1", "process_node", { label: "First", position: { x: -3, y: 0, z: 0 }, size: 0.9 }),
      obj("t2", "process_node", { label: "Second", position: { x: -1, y: 0, z: 0 }, size: 0.9 }),
      obj("t3", "process_node", { label: "Third", position: { x: 1, y: 0, z: 0 }, size: 0.9 }),
      obj("t4", "process_node", { label: "Fourth", position: { x: 3, y: 0, z: 0 }, size: 0.9 }),
    ],
    relationships: [
      rel("r1", "flows_to", "t1", "t2"),
      rel("r2", "flows_to", "t2", "t3"),
      rel("r3", "flows_to", "t3", "t4"),
    ],
    animations: [
      anim("a1", "t2", "reveal", { delayMs: 800 }),
      anim("a2", "t3", "reveal", { delayMs: 1600 }),
      anim("a3", "t4", "reveal", { delayMs: 2400 }),
    ],
    limitations: ["Events are shown one after another; in real systems they often overlap."],
    prediction: {
      prompt: "Which event must happen before the others in this sequence?",
      options: [
        "The first event",
        "The last event",
        "Any order works",
      ],
    },
    observationPrompts: [
      "Watch the events reveal in order and note what each one enables.",
      "Describe what would break if two events were swapped.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Level 3 — explanatory timelines
// ---------------------------------------------------------------------------

interface TimelineTopicData {
  title: string;
  learningObjective: string;
  limitations: string[];
  events: Array<{ title: string; description: string }>;
  prediction: { prompt: string; options: string[] };
  observationPrompts: string[];
}

export const TIMELINE_TOPICS: Record<TimelineTopic, TimelineTopicData> = {
  mitosis: {
    title: "Mitosis",
    learningObjective: "Follow the stages of mitosis in order, from chromosome condensation to cell division.",
    limitations: ["A simplified sequence; real mitosis is continuous and stages overlap slightly."],
    events: [
      {
        title: "Prophase",
        description: "Chromosomes condense and become visible; the mitotic spindle begins to form.",
      },
      {
        title: "Prometaphase",
        description: "The nuclear envelope breaks down and spindle fibers attach to the chromosomes.",
      },
      {
        title: "Metaphase",
        description: "Chromosomes line up along the equator of the cell.",
      },
      {
        title: "Anaphase",
        description: "Sister chromatids are pulled apart toward opposite ends of the cell.",
      },
      {
        title: "Telophase",
        description: "Chromosomes arrive at the poles and nuclear envelopes begin to reform.",
      },
      {
        title: "Cytokinesis",
        description: "The cytoplasm divides, producing two daughter cells.",
      },
    ],
    prediction: {
      prompt: "Which is the correct order of the main stages of mitosis?",
      options: [
        "Prophase → Metaphase → Anaphase → Telophase",
        "Metaphase → Prophase → Telophase → Anaphase",
        "Anaphase → Telophase → Prophase → Metaphase",
        "Telophase → Anaphase → Metaphase → Prophase",
      ],
    },
    observationPrompts: [
      "Watch the chromosomes as they condense, align, and separate.",
      "Notice when the nuclear envelope breaks down and when it reforms.",
    ],
  },
  dna_transcription: {
    title: "DNA Transcription",
    learningObjective: "See how a gene's DNA sequence is copied into messenger RNA.",
    limitations: ["A simplified three-phase view; transcription involves many molecular details."],
    events: [
      {
        title: "Initiation",
        description: "RNA polymerase binds to the promoter region and the DNA double helix begins to unwind.",
      },
      {
        title: "Elongation",
        description: "RNA polymerase moves along the template strand, building a growing RNA chain from matching nucleotides.",
      },
      {
        title: "Termination",
        description: "RNA polymerase reaches a termination signal; the completed RNA transcript is released and the DNA rewinds.",
      },
    ],
    prediction: {
      prompt: "Which is the correct order of the three phases of DNA transcription?",
      options: [
        "Initiation → Elongation → Termination",
        "Termination → Initiation → Elongation",
        "Elongation → Termination → Initiation",
      ],
    },
    observationPrompts: [
      "Watch the RNA strand grow nucleotide by nucleotide during elongation.",
      "Notice the moment the transcript is released at termination.",
    ],
  },
  water_cycle: {
    title: "The Water Cycle",
    learningObjective: "Follow water as it evaporates, condenses, falls, and collects — over and over.",
    limitations: ["A simplified loop; in reality, water can follow many paths and take very different times."],
    events: [
      {
        title: "Evaporation",
        description: "Sunlight warms water in oceans, lakes, and rivers, turning liquid water into water vapor.",
      },
      {
        title: "Condensation",
        description: "Water vapor rises, cools, and forms clouds as it changes back into tiny liquid droplets.",
      },
      {
        title: "Precipitation",
        description: "Droplets grow heavy and fall as rain, snow, or hail.",
      },
      {
        title: "Collection",
        description: "Water gathers in oceans, lakes, rivers, and groundwater — ready to evaporate again.",
      },
    ],
    prediction: {
      prompt: "Which is the correct order of the main steps of the water cycle?",
      options: [
        "Evaporation → Condensation → Precipitation → Collection",
        "Condensation → Evaporation → Collection → Precipitation",
        "Precipitation → Collection → Evaporation → Condensation",
        "Collection → Precipitation → Condensation → Evaporation",
      ],
    },
    observationPrompts: [
      "Follow one drop of water around the whole loop.",
      "Notice where energy from the sun enters the cycle.",
    ],
  },
  immune_response: {
    title: "Immune Response",
    learningObjective: "Follow how the immune system recognizes a threat, mounts a response, and remembers it.",
    limitations: ["A simplified sequence; the real immune response involves many cell types acting at once."],
    events: [
      {
        title: "Recognition",
        description: "Immune cells detect a foreign invader, such as a pathogen or antigen.",
      },
      {
        title: "Activation",
        description: "Helper cells and B cells become activated; B cells multiply and begin producing antibodies.",
      },
      {
        title: "Response",
        description: "Antibodies and killer cells target and neutralize the invader.",
      },
      {
        title: "Memory",
        description: "Memory cells remain after the infection, enabling a faster response next time.",
      },
    ],
    prediction: {
      prompt: "Which is the correct order of the phases of an immune response?",
      options: [
        "Recognition → Activation → Response → Memory",
        "Response → Recognition → Memory → Activation",
        "Memory → Response → Activation → Recognition",
        "Activation → Memory → Recognition → Response",
      ],
    },
    observationPrompts: [
      "Watch how the response escalates from recognition to full response.",
      "Describe why memory cells make a second infection milder.",
    ],
  },
};

// ---------------------------------------------------------------------------
// Level 2 builder
// ---------------------------------------------------------------------------

export function buildConceptualSpec(
  templateId: ConceptualTemplateId,
  concept: string,
  query: string,
  prefs: LearnerPreferences,
): DemoSpecV1 {
  const scene = TEMPLATE_SCENES[templateId];
  const hash36 = hashString(query.trim().toLowerCase()).toString(36);
  const label = concept.trim() || scene.title;

  const animations = prefs.reducedMotion ? [] : scene.animations;

  return {
    schemaVersion: 1,
    id: `demo-${templateId}-${hash36}`,
    generationId: `gen-${templateId}-${hash36}`,
    userQuery: query,
    normalizedConcept: concept.toLowerCase(),
    title: `${scene.title}: ${label}`,
    learningObjective: scene.learningObjective,

    trust: {
      level: "conceptual_demonstration",
      label: TRUST_LABELS.conceptual_demonstration,
      limitations: [
        ...scene.limitations,
        "Conceptual model — no quantitative simulation is included.",
        ...(prefs.reducedMotion ? ["Motion reduced for comfort."] : []),
      ],
    },

    renderer: {
      kind: "primitive_3d",
      fallbackKind: "accessible_diagram",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },

    scene3d: {
      objects: scene.objects,
      relationships: scene.relationships,
      animations,
    },

    controls: buildControls(prefs),

    prediction: {
      prompt: scene.prediction.prompt,
      options: [...scene.prediction.options],
    },
    observationPrompts: scene.observationPrompts.map((prompt) => ({ prompt })),
    representations: [
      { id: "rep_stage_3d", kind: "stage_3d", label: "3D Model" },
      { id: "rep_diagram", kind: "diagram", label: "Diagram" },
      { id: "rep_text", kind: "text_sequence", label: "Text sequence" },
    ],
    adaptationContext: {
      allowed: true,
      oneVariableMode: prefs.oneVariableMode,
    },

    provenance: {
      source: "template_composition",
      templateIds: [templateId],
      generatedAt: new Date().toISOString(),
    },

    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesMobile,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}

// ---------------------------------------------------------------------------
// Level 3 builder
// ---------------------------------------------------------------------------

export function buildTimelineSpec(
  topic: TimelineTopic,
  query: string,
  prefs: LearnerPreferences,
): DemoSpecV1 {
  const data = TIMELINE_TOPICS[topic];
  const hash36 = hashString(query.trim().toLowerCase()).toString(36);

  const events: TimelineEventSpec[] = data.events.map((event, i) => ({
    title: event.title,
    description: event.description,
    startMs: i * 4000,
    durationMs: 3000,
  }));

  const controls = buildControls(prefs);

  return {
    schemaVersion: 1,
    id: `demo-timeline-${topic}-${hash36}`,
    generationId: `gen-timeline-${topic}-${hash36}`,
    userQuery: query,
    normalizedConcept: topic.replace(/_/g, " "),
    title: data.title,
    learningObjective: data.learningObjective,

    trust: {
      level: "explanatory_animation",
      label: TRUST_LABELS.explanatory_animation,
      limitations: [
        ...data.limitations,
        ...(prefs.reducedMotion ? ["Motion reduced for comfort."] : []),
      ],
    },

    renderer: {
      kind: "lumina_2d",
      fallbackKind: "timeline",
      preferredAspectRatio: 4 / 3,
      background: "dark",
    },

    timeline: { events },

    controls,
    prediction: {
      prompt: data.prediction.prompt,
      options: [...data.prediction.options],
    },
    observationPrompts: data.observationPrompts.map((prompt) => ({ prompt })),
    representations: [
      { id: "rep_timeline", kind: "timeline", label: "Timeline" },
      { id: "rep_text", kind: "text_sequence", label: "Text sequence" },
    ],
    adaptationContext: {
      allowed: true,
      oneVariableMode: prefs.oneVariableMode,
    },

    provenance: {
      source: "template_composition",
      templateIds: ["timeline_sequence"],
      generatedAt: new Date().toISOString(),
    },

    limits: {
      maxObjects: SPEC_LIMITS.maxObjects,
      maxParticles: SPEC_LIMITS.maxParticlesMobile,
      maxTimelineEvents: SPEC_LIMITS.maxTimelineEvents,
      maxControls: SPEC_LIMITS.maxControls,
    },
  };
}
