/**
 * task-type.mjs — Hook: Task Type Detector
 *
 * Clasifica el prompt como ask | review | plan antes de que llegue al bridge.
 * El resultado se inyecta como contexto para que el bridge no necesite flags.
 *
 * Made by Alejandro Apodaca Cordova (apoapps.com)
 */

// Patrones de detección — sin modelos hardcodeados, solo intención del usuario
const REVIEW_PATTERNS = [
  /git diff/i, /code review/i, /revisa (el|los|la|las|este|estos)/i,
  /review (the|these|this|my)/i, /cambios/i, /pull request/i, /\bpr\b/i,
  /staged/i, /unstaged/i, /diff/i,
];

const PLAN_PATTERNS = [
  /\bplan\b/i, /architect/i, /diseña/i, /diseño/i, /implementa/i,
  /cómo (estructurar|construir|crear|hacer)/i, /roadmap/i,
  /pasos para/i, /step.by.step/i, /scaffold/i, /estructura (de|para)/i,
  /how (should|to) (structure|build|create)/i,
];

/**
 * Detecta el tipo de tarea desde el texto del prompt.
 * @param {string} prompt
 * @returns {"ask" | "review" | "plan"}
 */
export function detectTaskType(prompt) {
  if (!prompt) return "ask";

  for (const re of REVIEW_PATTERNS) {
    if (re.test(prompt)) return "review";
  }

  for (const re of PLAN_PATTERNS) {
    if (re.test(prompt)) return "plan";
  }

  return "ask";
}

/**
 * Hook entry point — PreExecution lifecycle.
 * Inyecta `taskType` en el contexto para que los runners lo lean.
 */
export async function onPreExecution({ prompt, context }) {
  const config = context?.config?.taskType ?? {};
  if (config.autoDetect === false) return null;

  const taskType = detectTaskType(prompt);

  return {
    taskType,
    detectedBy: "task-type-hook",
    confidence: taskType === "ask" ? 0.7 : 0.9,
  };
}

export default {
  lifecycle: "PreExecution",
  onPreExecution,
};
