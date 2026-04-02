/**
 * Greek mythology agent name generator.
 * Each agent gets a unique name + a short trait for personality.
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

const AGENTS = [
  // Olympians & major gods
  { name: "Artemis", trait: "precision" },
  { name: "Athena", trait: "strategy" },
  { name: "Apollo", trait: "clarity" },
  { name: "Hermes", trait: "speed" },
  { name: "Hephaestus", trait: "craft" },
  { name: "Demeter", trait: "patience" },
  { name: "Hestia", trait: "thoroughness" },
  // Titans
  { name: "Prometheus", trait: "insight" },
  { name: "Hyperion", trait: "vision" },
  { name: "Themis", trait: "judgment" },
  { name: "Mnemosyne", trait: "memory" },
  { name: "Coeus", trait: "intellect" },
  { name: "Phoebe", trait: "radiance" },
  { name: "Rhea", trait: "flow" },
  { name: "Tethys", trait: "depth" },
  // Heroes
  { name: "Theseus", trait: "courage" },
  { name: "Perseus", trait: "focus" },
  { name: "Odysseus", trait: "resourcefulness" },
  { name: "Atalanta", trait: "swiftness" },
  { name: "Daedalus", trait: "invention" },
  { name: "Orpheus", trait: "harmony" },
  { name: "Achilles", trait: "tenacity" },
  { name: "Penelope", trait: "diligence" },
  { name: "Cassandra", trait: "foresight" },
  { name: "Icarus", trait: "ambition" },
  // Muses
  { name: "Calliope", trait: "eloquence" },
  { name: "Clio", trait: "history" },
  { name: "Thalia", trait: "creativity" },
  { name: "Erato", trait: "expression" },
  { name: "Urania", trait: "analysis" },
  { name: "Melpomene", trait: "depth" },
  { name: "Terpsichore", trait: "rhythm" },
  { name: "Polyhymnia", trait: "reflection" },
  { name: "Euterpe", trait: "joy" },
  // Nymphs & minor deities
  { name: "Callisto", trait: "observation" },
  { name: "Ariadne", trait: "navigation" },
  { name: "Iris", trait: "communication" },
  { name: "Selene", trait: "illumination" },
  { name: "Eos", trait: "freshness" },
  { name: "Echo", trait: "listening" },
  { name: "Psyche", trait: "understanding" },
  { name: "Nike", trait: "determination" },
  { name: "Tyche", trait: "intuition" },
  { name: "Astraea", trait: "precision" },
  // Philosophers (honorary Greeks)
  { name: "Hypatia", trait: "logic" },
  { name: "Archimedes", trait: "mechanics" },
  { name: "Euclid", trait: "proof" },
  { name: "Pythagoras", trait: "patterns" },
  { name: "Heraclitus", trait: "change" },
  { name: "Thales", trait: "foundation" },
  { name: "Zeno", trait: "persistence" },
  { name: "Anaxagoras", trait: "reason" },
  { name: "Democritus", trait: "atoms" },
  { name: "Empedocles", trait: "elements" },
  // Constellations (Greek origin)
  { name: "Andromeda", trait: "scale" },
  { name: "Orion", trait: "hunting" },
  { name: "Lyra", trait: "resonance" },
  { name: "Phoenix", trait: "renewal" },
  { name: "Pegasus", trait: "ascent" },
  { name: "Draco", trait: "vigilance" },
  { name: "Cygnus", trait: "grace" },
  { name: "Hydra", trait: "persistence" },
];

/**
 * Pick N unique agents from the pool.
 * Returns array of { name, trait, id } objects.
 */
export function pickAgents(count) {
  const shuffled = [...AGENTS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, AGENTS.length)).map((a, i) => ({
    ...a,
    id: `agent-${i}`,
    startedAt: null,
    completedAt: null,
    status: "pending",
    result: null,
    model: null,
    task: null,
  }));
}

/**
 * Get a single random agent.
 */
export function pickOne() {
  return pickAgents(1)[0];
}

/**
 * Format agent tag for progress output.
 */
export function agentTag(agent) {
  return `[${agent.name}]`;
}

/**
 * Format agent status line for live progress.
 */
export function agentProgress(agent, message) {
  const modelTag = agent.model ? ` (${agent.model.split("/").pop()})` : "";
  return `${agentTag(agent)} ${message}${modelTag}`;
}

export const AGENT_POOL_SIZE = AGENTS.length;
