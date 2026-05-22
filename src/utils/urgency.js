// src/utils/urgency.js
// Calculates a clinical urgency score to drive referral triage.
//
// Inputs: patient state (existing fields + new disease-activity fields)
// Output: { score, level, label, color, timeline, factors } or null if undeterminable

import { evaluatePathway } from "./pathways.js";

export function calculateUrgency(pt) {
  let score = 0;
  const factors = [];

  // ─── Disease tempo (heaviest weight) ──────────────────────────────────────
  if (pt.diseaseTempo === "rapid") {
    score += 4;
    factors.push("Rapidly progressive disease");
  } else if (pt.diseaseTempo === "stable") {
    score += 1;
  }
  // "indolent" or unset → 0

  // ─── Primary refractory ───────────────────────────────────────────────────
  if (pt.primaryRefractory) {
    score += 3;
    factors.push("Primary refractory — no response to first-line therapy");
  }

  // ─── B symptoms (lymphoma signal) ─────────────────────────────────────────
  if (pt.bSymptoms) {
    score += 2;
    factors.push("B symptoms present (fever, night sweats, weight loss)");
  }

  // ─── Elevated LDH (lymphoma signal of aggressive disease) ─────────────────
  if (pt.elevatedLdh) {
    score += 1;
    factors.push("Elevated LDH — aggressive disease marker");
  }

  // ─── Prior lines — running out of options ─────────────────────────────────
  const lines = parseInt(pt.priorLines, 10);
  if (!isNaN(lines)) {
    if (lines >= 4) {
      score += 3;
      factors.push(`${lines} prior lines — limited remaining options`);
    } else if (lines >= 3) {
      score += 2;
      factors.push(`${lines} prior lines of therapy`);
    } else if (lines >= 2) {
      score += 1;
    }
  }

  // ─── Declining ECOG ───────────────────────────────────────────────────────
  const ecog = parseInt(pt.ecog, 10);
  if (!isNaN(ecog)) {
    if (ecog >= 3) {
      score += 3;
      factors.push(`Declining performance status (ECOG ${ecog}) — window closing`);
    } else if (ecog === 2) {
      score += 1;
      factors.push("Borderline performance status (ECOG 2)");
    }
  }

  // ─── Triple-class exposed myeloma ─────────────────────────────────────────
  const isMM = (pt.cancerType || "").toLowerCase().includes("myeloma");
  if (isMM && pt.priorImid && pt.priorPi && pt.priorAntiCd38 && lines >= 3) {
    score += 2;
    factors.push("Triple-class exposed MM (IMiD + PI + anti-CD38)");
  }

  // ─── Disease-specific high-risk features (from pathway evaluator) ─────────
  const pathway = evaluatePathway(pt);
  if (pathway?.highRisk?.length > 0) {
    pathway.highRisk.forEach(r => {
      // Don't double-count if pathway risk overlaps with already-counted factors
      const already = factors.some(f => f.toLowerCase().includes(r.toLowerCase().slice(0, 12)));
      if (!already) {
        score += 2;
        factors.push(`High-risk feature: ${r}`);
      }
    });
  }

  // ─── Organ function deterioration (if lab values given) ───────────────────
  const creat = parseFloat(pt.labCreat);
  if (!isNaN(creat) && creat > 1.5) {
    score += 1;
    factors.push(`Elevated creatinine (${creat} mg/dL) — narrowing eligibility window`);
  }
  const lvef = parseFloat(pt.labLvef);
  if (!isNaN(lvef) && lvef < 50) {
    score += 1;
    factors.push(`Reduced LVEF (${lvef}%) — cardiac reserve declining`);
  }

  // ─── Determine level ──────────────────────────────────────────────────────
  if (score >= 8) {
    return {
      score,
      level: "high",
      label: "HIGH urgency",
      sub: "Refer immediately — clinical window closing",
      color: "#b54a2c",
      timeline: "Apheresis evaluation within 7 days · bridging plan in parallel · expedite insurance prior auth",
      factors,
    };
  }
  if (score >= 4) {
    return {
      score,
      level: "medium",
      label: "MODERATE urgency",
      sub: "Refer within 1–2 weeks",
      color: "#c4a661",
      timeline: "Initiate referral within 1–2 weeks · complete missing biomarker/labs · plan bridging if indicated",
      factors,
    };
  }
  if (score >= 1) {
    return {
      score,
      level: "low",
      label: "LOW urgency",
      sub: "Routine referral pathway",
      color: "#5a7a4a",
      timeline: "Schedule referral at next routine visit · monitor for disease tempo changes",
      factors,
    };
  }
  return null;
}
