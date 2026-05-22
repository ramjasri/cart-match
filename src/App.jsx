// CAR-T Match — Standalone CAR-T & Cell Therapy Eligibility Screener
// 6 FDA-approved products: Yescarta, Kymriah, Breyanzi, Tecartus, Abecma, Carvykti

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ExternalLink, Dna, X, Download, FileText, Link2, Check, Zap, BarChart3, Flame, Clock } from "lucide-react";
import { useUser, SignInButton, UserButton } from "@clerk/clerk-react";

// Safe hook — returns sensible defaults if Clerk isn't configured
function useAuth() {
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useUser();
  } catch {
    return { isSignedIn: false, isLoaded: false };
  }
}
import { generatePdf } from "./utils/generatePdf.js";
import { generateBoardPdf } from "./utils/generateBoardPdf.js";
import { findAction, getPathToEligibility, getReferralSteps } from "./utils/actions.js";
import { calculateUrgency } from "./utils/urgency.js";
import { evaluatePathway, getDiseaseFields, DISEASE_FIELD_LABELS, PATHWAY_CATALOG } from "./utils/pathways.js";
import { BLOCK_ACTIONS, WARNING_ACTIONS } from "./utils/actions.js";
import { URGENCY_RUBRIC } from "./utils/urgency.js";
import { TRIAL_SCORING_RULES } from "./utils/trialMatcher.js";
import { calculateReferralDecision } from "./utils/earlyReferral.js";
import TrialsPanel from "./components/TrialsPanel.jsx";
import TrialMatcher from "./components/TrialMatcher.jsx";

// Replace with your Formspree endpoint after signing up at formspree.io
const FORMSPREE_URL = "https://formspree.io/f/xwvydwjb";

// ── Case URL encoding ──────────────────────────────────────────────────────
function encodeCase(pt) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(pt))));
  } catch { return null; }
}

function decodeCase(str) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
  } catch { return null; }
}

// ── Product database ───────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: "yescarta",
    name: "Yescarta",
    generic: "axicabtagene ciloleucel",
    target: "CD19",
    sponsor: "Kite / Gilead",
    color: "#b54a2c",
    indications: [
      "Large B-cell lymphoma (LBCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
      "Primary mediastinal B-cell lymphoma (PMBCL)",
    ],
    cancerKeys: ["lbcl", "dlbcl", "lymphoma", "fl", "follicular", "pmbcl", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "axicabtagene+ciloleucel",
    organThresholds: { altMax: 200, astMax: 200, creatMax: 1.8, crclMin: 30, bilMax: 2.0, lvefMin: 50, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 5× ULN (≤ 200 U/L)",
      "Creatinine ≤ 1.5× ULN (≤ 1.8 mg/dL) or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN (≤ 2.0 mg/dL)",
      "LVEF ≥ 50% (echo or MUGA)",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active or prior CNS lymphoma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Prior CAR-T or gene therapy",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
    ],
  },
  {
    id: "kymriah",
    name: "Kymriah",
    generic: "tisagenlecleucel",
    target: "CD19",
    sponsor: "Novartis",
    color: "#4c6b8c",
    indications: [
      "ALL (≤25 yr, R/R B-cell)",
      "Large B-cell lymphoma (LBCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
    ],
    cancerKeys: ["all", "leukemia", "lbcl", "dlbcl", "lymphoma", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "tisagenlecleucel",
    organThresholds: { altMax: 200, astMax: 200, creatMax: 1.8, crclMin: 30, bilMax: 2.0, lvefMin: 45, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 5× ULN (≤ 200 U/L)",
      "Creatinine ≤ 1.5× ULN (≤ 1.8 mg/dL)",
      "Bilirubin ≤ 2× ULN (≤ 2.0 mg/dL)",
      "LVEF ≥ 45% (LBCL); no restriction (ALL)",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS disease (CNS-3 for ALL)",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection including HIV, HBV, HCV",
      "Prior CD19-targeted therapy",
      "Allo-SCT < 6 months or active GVHD",
    ],
  },
  {
    id: "breyanzi",
    name: "Breyanzi",
    generic: "lisocabtagene maraleucel",
    target: "CD19",
    sponsor: "Bristol Myers Squibb",
    color: "#5a7a4a",
    indications: [
      "Large B-cell lymphoma (LBCL) — 2L+",
      "CLL / SLL — 3L+",
      "Mantle cell lymphoma (MCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
    ],
    cancerKeys: ["lbcl", "dlbcl", "lymphoma", "cll", "sll", "mcl", "mantle", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "lisocabtagene+maraleucel",
    organThresholds: { altMax: 200, astMax: 200, creatMax: 1.8, crclMin: 30, bilMax: 2.0, lvefMin: 40, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 5× ULN (≤ 200 U/L)",
      "Creatinine ≤ 1.5× ULN (≤ 1.8 mg/dL) or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN (≤ 2.0 mg/dL; ≤ 3× if Gilbert's)",
      "LVEF ≥ 40%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS lymphoma",
      "Active autoimmune disease requiring systemic immunosuppression",
      "Active uncontrolled infection",
      "Prior CAR-T within 3 months",
      "Allo-SCT within 6 months or active GVHD",
    ],
  },
  {
    id: "tecartus",
    name: "Tecartus",
    generic: "brexucabtagene autoleucel",
    target: "CD19",
    sponsor: "Kite / Gilead",
    color: "#8a4a7a",
    indications: [
      "Mantle cell lymphoma (MCL) — R/R",
      "ALL (adult, R/R B-cell)",
    ],
    cancerKeys: ["mcl", "mantle", "all", "leukemia", "b-cell", "lymphoma"],
    minPriorLines: 1,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "brexucabtagene+autoleucel",
    organThresholds: { altMax: 200, astMax: 200, creatMax: 1.8, crclMin: 30, bilMax: 2.0, lvefMin: 50, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 5× ULN (≤ 200 U/L)",
      "Creatinine ≤ 1.5× ULN (≤ 1.8 mg/dL)",
      "Bilirubin ≤ 2× ULN (≤ 2.0 mg/dL)",
      "LVEF ≥ 50%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS disease",
      "Active autoimmune disease requiring systemic immunosuppression",
      "Active uncontrolled infection",
      "Prior CD19-targeted CAR-T",
      "Allo-SCT within 6 months or active GVHD",
    ],
  },
  {
    id: "abecma",
    name: "Abecma",
    generic: "idecabtagene vicleucel",
    target: "BCMA",
    sponsor: "Bristol Myers Squibb",
    color: "#c4a661",
    indications: [
      "Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38, anti-BCMA)",
    ],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 4,
    ecogMax: 2,
    targetMarker: "BCMA",
    mmReqs: true,
    nctSearch: "idecabtagene+vicleucel",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 2.4, crclMin: 40, bilMax: 1.5, lvefMin: 45, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 2× ULN (≤ 2.4 mg/dL) or CrCl ≥ 40 mL/min",
      "Bilirubin ≤ 1.5× ULN (≤ 1.5 mg/dL)",
      "LVEF ≥ 45%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Prior BCMA-targeted therapy (antibody-drug conjugate or CAR-T)",
      "Active CNS myeloma",
      "Active autoimmune disease",
      "Active uncontrolled infection",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
    ],
  },
  {
    id: "carvykti",
    name: "Carvykti",
    generic: "ciltacabtagene autoleucel",
    target: "BCMA",
    sponsor: "J&J / Legend Biotech",
    color: "#6b5a8c",
    indications: [
      "Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38)",
      "Multiple myeloma — 1L+ lenalidomide-refractory (2024)",
    ],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 1,
    ecogMax: 2,
    targetMarker: "BCMA",
    mmReqs: true,
    nctSearch: "ciltacabtagene+autoleucel",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 2.4, crclMin: 30, bilMax: 1.5, lvefMin: 45, spo2Min: 92 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 2× ULN (≤ 2.4 mg/dL) or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 1.5× ULN (≤ 1.5 mg/dL)",
      "LVEF ≥ 45%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Prior BCMA-targeted therapy",
      "Active CNS myeloma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
      "Prior CAR-T within 6 months",
    ],
  },
];

// ── Bispecific antibody database ───────────────────────────────────────────
const BISPECIFICS = [
  {
    id: "tecvayli",
    name: "Tecvayli",
    generic: "teclistamab",
    target: "BCMA×CD3",
    targetMarker: "BCMA",
    type: "bispecific",
    sponsor: "J&J / Janssen",
    color: "#c4a661",
    indications: ["Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38)"],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 4,
    ecogMax: 2,
    targetMarker: "BCMA",
    mmReqs: true,
    requiresObinutuzumab: false,
    nctSearch: "teclistamab",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 3.0, crclMin: 30, bilMax: 1.5, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 3.0 mg/dL or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 1.5× ULN (≤ 1.5 mg/dL)",
      "No specific LVEF or SpO₂ requirement",
    ],
    exclusions: [
      "Active CNS myeloma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Hospitalization required for step-up dosing (first 2 doses)",
    ],
    advantages: [
      "Off-the-shelf — no manufacturing wait",
      "No leukapheresis required",
      "Subcutaneous weekly dosing (then Q2W)",
    ],
    notes: ["Step-up dosing: 0.06 → 0.3 → 1.5 mg/kg SC", "CRS monitoring required for first doses"],
  },
  {
    id: "talvey",
    name: "Talvey",
    generic: "talquetamab",
    target: "GPRC5D×CD3",
    targetMarker: "GPRC5D",
    type: "bispecific",
    sponsor: "J&J / Janssen",
    color: "#8a4a7a",
    indications: ["Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38)"],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 4,
    ecogMax: 2,
    mmReqs: true,
    requiresObinutuzumab: false,
    nctSearch: "talquetamab",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 3.0, crclMin: 30, bilMax: 1.5, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 3.0 mg/dL or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 1.5× ULN (≤ 1.5 mg/dL)",
    ],
    exclusions: [
      "Active CNS myeloma",
      "Active autoimmune disease",
      "Active uncontrolled infection",
      "Hospitalization for step-up dosing required",
    ],
    advantages: [
      "Targets GPRC5D — usable after BCMA-directed therapy failure",
      "No leukapheresis required",
      "Two dosing schedules: QW or Q2W",
    ],
    notes: ["Step-up dosing required", "Unique SEs: dysgeusia, nail/skin changes, weight loss"],
  },
  {
    id: "elrexfio",
    name: "Elrexfio",
    generic: "elranatamab",
    target: "BCMA×CD3",
    targetMarker: "BCMA",
    type: "bispecific",
    sponsor: "Pfizer",
    color: "#4c6b8c",
    indications: ["Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38)"],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 4,
    ecogMax: 2,
    mmReqs: true,
    requiresObinutuzumab: false,
    nctSearch: "elranatamab",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 3.0, crclMin: 30, bilMax: 1.5, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 3.0 mg/dL or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 1.5× ULN (≤ 1.5 mg/dL)",
    ],
    exclusions: [
      "Active CNS myeloma",
      "Active autoimmune disease",
      "Active uncontrolled infection",
      "Step-up dosing hospitalization required",
    ],
    advantages: [
      "Off-the-shelf — immediate availability",
      "No leukapheresis required",
      "Sequential use after GPRC5D-targeted therapy possible",
    ],
    notes: ["Step-up dosing: 12 → 32 → 76 mg SC", "Q2W after confirmed response"],
  },
  {
    id: "epkinly",
    name: "Epkinly",
    generic: "epcoritamab",
    target: "CD20×CD3",
    targetMarker: "CD20",
    type: "bispecific",
    sponsor: "AbbVie / Genmab",
    color: "#5a7a4a",
    indications: [
      "R/R DLBCL — 3L+ (after ≥2 prior lines incl. CD20 + alkylator)",
      "R/R Follicular lymphoma (FL grade 1–3A) — 3L+",
    ],
    cancerKeys: ["dlbcl", "lbcl", "lymphoma", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    mmReqs: false,
    requiresObinutuzumab: false,
    nctSearch: "epcoritamab",
    organThresholds: { altMax: 200, astMax: 200, creatMax: 2.0, crclMin: 30, bilMax: 2.0, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 5× ULN (≤ 200 U/L)",
      "Creatinine ≤ 2× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN (≤ 2.0 mg/dL)",
    ],
    exclusions: [
      "Active CNS lymphoma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Hospitalization for step-up dosing required",
    ],
    advantages: [
      "Off-the-shelf subcutaneous injection",
      "No leukapheresis required",
      "Can bridge to or follow CAR-T",
    ],
    notes: ["Step-up dosing: 0.16 → 0.8 → 48 mg SC", "CRS prophylaxis required for first doses"],
  },
  {
    id: "columvi",
    name: "Columvi",
    generic: "glofitamab",
    target: "CD20×CD3",
    targetMarker: "CD20",
    type: "bispecific",
    sponsor: "Roche / Genentech",
    color: "#b54a2c",
    indications: [
      "R/R DLBCL — 2L+",
      "R/R Follicular lymphoma (FL) — 2L+",
    ],
    cancerKeys: ["dlbcl", "lbcl", "lymphoma", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    mmReqs: false,
    requiresObinutuzumab: true,
    nctSearch: "glofitamab",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 2.0, crclMin: 30, bilMax: 2.0, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 2× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN",
    ],
    exclusions: [
      "Requires obinutuzumab (Gazyva) pretreatment 7 days before cycle 1",
      "Active CNS lymphoma",
      "Active autoimmune disease",
      "Active uncontrolled infection",
    ],
    advantages: [
      "Fixed duration — 12 cycles total (not lifelong)",
      "Off-the-shelf IV infusion",
      "Durable complete responses documented",
    ],
    notes: ["Obinutuzumab pretreatment mandatory — plan 7 days ahead", "Step-up dosing cycles 1–2"],
  },
  {
    id: "lunsumio",
    name: "Lunsumio",
    generic: "mosunetuzumab",
    target: "CD20×CD3",
    targetMarker: "CD20",
    type: "bispecific",
    sponsor: "Roche / Genentech",
    color: "#6b5a8c",
    indications: ["R/R Follicular lymphoma (FL grade 1–3A) — 2L+"],
    cancerKeys: ["fl", "follicular", "lymphoma"],
    minPriorLines: 2,
    ecogMax: 2,
    mmReqs: false,
    requiresObinutuzumab: false,
    nctSearch: "mosunetuzumab",
    organThresholds: { altMax: 120, astMax: 120, creatMax: 2.0, crclMin: 30, bilMax: 2.0, lvefMin: 0, spo2Min: 0 },
    organ: [
      "ALT / AST ≤ 3× ULN (≤ 120 U/L)",
      "Creatinine ≤ 2× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN",
    ],
    exclusions: [
      "Active CNS lymphoma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
    ],
    advantages: [
      "Fixed duration — 8 cycles (not lifelong)",
      "Off-the-shelf IV then subcutaneous",
      "Established durable remissions in FL",
    ],
    notes: ["Step-up dosing cycle 1", "Fixed-duration therapy — re-treatment possible at relapse"],
  },
];

const ALL_PRODUCTS = [...PRODUCTS, ...BISPECIFICS];

// ── Eligibility engine ─────────────────────────────────────────────────────
function score(product, pt) {
  const blocks = [], warnings = [], passes = [];
  const cancerLow = (pt.cancerType || "").toLowerCase();

  // Indication
  const indicationMatch = product.cancerKeys.some(k => cancerLow.includes(k));
  if (!indicationMatch) blocks.push("Cancer type not in approved indications");
  else passes.push("Indication matches an approved indication");

  // Target marker
  if (indicationMatch) {
    const markerMap = { CD19: pt.cd19, BCMA: pt.bcma, CD20: pt.cd20, GPRC5D: pt.gprc5d };
    const markerVal = markerMap[product.targetMarker] ?? "unknown";
    if (markerVal === "negative") blocks.push(`${product.targetMarker}-negative — product requires ${product.targetMarker} expression`);
    else if (markerVal === "positive") passes.push(`${product.targetMarker} expression: confirmed positive`);
    else warnings.push(`${product.targetMarker} status unknown — confirm before proceeding`);
  }

  // Obinutuzumab pretreatment requirement (glofitamab)
  if (product.requiresObinutuzumab) {
    warnings.push("Requires obinutuzumab (Gazyva) pretreatment 7 days before cycle 1 — schedule accordingly");
  }

  // Prior lines
  const lines = parseInt(pt.priorLines, 10);
  if (!isNaN(lines)) {
    if (lines < product.minPriorLines) blocks.push(`Requires ≥${product.minPriorLines} prior lines; patient has ${lines}`);
    else passes.push(`Prior lines: ${lines} (threshold of ${product.minPriorLines} met)`);
  }

  // ECOG
  const ecog = parseInt(pt.ecog, 10);
  if (!isNaN(ecog)) {
    if (ecog > product.ecogMax) blocks.push(`ECOG ${ecog} exceeds maximum of ${product.ecogMax}`);
    else passes.push(`ECOG ${ecog}: within acceptable range`);
  }

  // MM prior therapy
  if (product.mmReqs && indicationMatch) {
    if (pt.priorImid) passes.push("Prior IMiD: confirmed");
    else warnings.push("Prior IMiD required (lenalidomide / pomalidomide) — confirm exposure");
    if (pt.priorPi) passes.push("Prior proteasome inhibitor: confirmed");
    else warnings.push("Prior PI required (bortezomib / carfilzomib) — confirm exposure");
    if (pt.priorAntiCd38) passes.push("Prior anti-CD38: confirmed");
    else warnings.push("Prior anti-CD38 required (daratumumab) — confirm exposure");
  }

  // Exclusions
  if (pt.activeCns) blocks.push("Active CNS disease: absolute exclusion for all products");
  else passes.push("No active CNS disease");

  if (pt.activeAutoimmune) blocks.push("Active autoimmune disease requiring systemic treatment");
  else passes.push("No active autoimmune disease");

  if (pt.alloSct) {
    const months = parseInt(pt.alloSctMonths, 10);
    if (!isNaN(months) && months < 6) blocks.push(`Allo-SCT only ${months} months ago (minimum 6 months required)`);
    else if (!isNaN(months)) warnings.push("Prior allo-SCT — screen carefully for active GVHD");
    else warnings.push("Prior allo-SCT reported — confirm timing and GVHD status");
  }

  // Organ function — only evaluate if values are entered
  const t = product.organThresholds;
  const lab = (key) => pt[key] !== "" ? parseFloat(pt[key]) : null;

  const alt  = lab("labAlt"),  ast  = lab("labAst");
  const creat = lab("labCreat"), crcl = lab("labCrcl");
  const bil  = lab("labBil"),  lvef = lab("labLvef"), spo2 = lab("labSpo2");

  if (alt !== null) {
    if (alt > t.altMax) blocks.push(`ALT ${alt} U/L exceeds limit of ${t.altMax} U/L for this product`);
    else passes.push(`ALT ${alt} U/L: within range (≤ ${t.altMax} U/L)`);
  }
  if (ast !== null) {
    if (ast > t.astMax) blocks.push(`AST ${ast} U/L exceeds limit of ${t.astMax} U/L for this product`);
    else passes.push(`AST ${ast} U/L: within range (≤ ${t.astMax} U/L)`);
  }
  if (creat !== null || crcl !== null) {
    const creatOk  = creat !== null && creat <= t.creatMax;
    const crclOk   = crcl  !== null && crcl  >= t.crclMin;
    if (creatOk || crclOk) {
      const detail = creatOk ? `Creatinine ${creat} mg/dL` : `CrCl ${crcl} mL/min`;
      passes.push(`Renal function: ${detail} meets threshold`);
    } else {
      const detail = creat !== null ? `Creatinine ${creat} mg/dL (limit ${t.creatMax})` : `CrCl ${crcl} mL/min (minimum ${t.crclMin})`;
      blocks.push(`Renal function: ${detail} — does not meet threshold`);
    }
  }
  if (bil !== null) {
    if (bil > t.bilMax) blocks.push(`Bilirubin ${bil} mg/dL exceeds limit of ${t.bilMax} mg/dL for this product`);
    else passes.push(`Bilirubin ${bil} mg/dL: within range (≤ ${t.bilMax} mg/dL)`);
  }
  if (lvef !== null && t.lvefMin > 0) {
    if (lvef < t.lvefMin) blocks.push(`LVEF ${lvef}% is below minimum of ${t.lvefMin}% for this product`);
    else passes.push(`LVEF ${lvef}%: meets threshold (≥ ${t.lvefMin}%)`);
  }
  if (spo2 !== null && t.spo2Min > 0) {
    if (spo2 < t.spo2Min) blocks.push(`SpO₂ ${spo2}% is below minimum of ${t.spo2Min}%`);
    else passes.push(`SpO₂ ${spo2}%: meets threshold (≥ ${t.spo2Min}%)`);
  }

  return {
    eligible: blocks.length === 0,
    hasWarning: blocks.length === 0 && warnings.length > 0,
    blocks, warnings, passes,
  };
}

// ── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
  .app {
    background: #f4f1ea; min-height: 100vh; position: relative;
    font-family: 'Inter Tight', sans-serif; color: #1a1815;
    letter-spacing: -0.005em;
  }
  .app::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(circle at 20% 10%, rgba(181,74,44,0.04), transparent 40%),
      radial-gradient(circle at 80% 90%, rgba(76,107,140,0.04), transparent 40%);
  }
  .app > * { position: relative; z-index: 1; }

  /* HEADER */
  .hdr { border-bottom: 1px solid #1a1815; background: #f4f1ea; }
  .hdr-rule { height: 4px; background: #1a1815; position: relative; }
  .hdr-rule::after {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 30%; background: #b54a2c;
  }
  .hdr-inner {
    max-width: 1200px; margin: 0 auto; padding: 20px 40px;
    display: flex; align-items: center; justify-content: space-between; gap: 24px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-glyph {
    width: 38px; height: 38px; background: #1a1815; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .brand-name {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    letter-spacing: 0.1em; line-height: 1;
  }
  .brand-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a; margin-top: 4px;
  }
  .hdr-meta {
    display: flex; align-items: center; gap: 24px;
  }
  .hdr-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: flex; align-items: center; gap: 6px;
  }
  .hdr-badge-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #5a7a4a;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
  }

  /* HERO */
  .hero {
    max-width: 1200px; margin: 0 auto; padding: 52px 40px 40px;
    border-bottom: 1px solid #1a181520;
  }
  .hero-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  }
  .hero-tag::before {
    content: ''; width: 20px; height: 1px; background: #6b645a;
  }
  .hero-h1 {
    font-family: 'Fraunces', serif; font-size: 42px; font-weight: 400;
    line-height: 1.1; letter-spacing: -0.025em; color: #1a1815;
    margin: 0 0 14px;
  }
  .hero-h1 em { font-style: italic; color: #b54a2c; }
  .hero-sub {
    font-size: 15px; color: #6b645a; line-height: 1.6; max-width: 580px;
  }
  .hero-pills {
    display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap;
  }
  .hero-pill {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #3a352e;
    border: 1px solid #1a181530; padding: 5px 12px; background: #ebe6dc;
  }

  /* LAYOUT */
  .layout {
    max-width: 1200px; margin: 0 auto; padding: 36px 40px 80px;
    display: grid; grid-template-columns: 300px 1fr; gap: 32px; align-items: start;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; padding: 24px 20px 60px; }
    .hero { padding: 36px 20px 32px; }
    .hdr-inner { padding: 16px 20px; }
    .hero-h1 { font-size: 30px; }
  }

  /* FORM PANEL */
  .form-panel {
    background: #ebe6dc; border: 1px solid #1a1815; padding: 24px;
    position: sticky; top: 24px;
  }
  .form-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500;
    letter-spacing: -0.01em; margin: 0 0 20px; color: #1a1815;
    border-bottom: 1px solid #1a181525; padding-bottom: 12px;
  }
  .field { margin-bottom: 16px; }
  .lbl {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: block; margin-bottom: 6px;
  }
  .inp, .sel {
    width: 100%; padding: 9px 12px; background: #f4f1ea;
    border: 1px solid #1a181545; font-family: 'Inter Tight', sans-serif;
    font-size: 13px; color: #1a1815; appearance: none; border-radius: 0;
  }
  .inp:focus, .sel:focus { outline: none; border-color: #1a1815; }
  .radio-row { display: flex; gap: 6px; }
  .radio-btn {
    flex: 1; padding: 7px 4px; text-align: center; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181535; background: #f4f1ea; color: #6b645a;
    transition: all 0.1s;
  }
  .radio-btn.on { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .sec-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin: 18px 0 10px; border-top: 1px solid #1a181818; padding-top: 14px;
  }
  .chk-row {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 0; border-bottom: 1px solid #1a181510; cursor: pointer;
  }
  .chk-row:last-of-type { border-bottom: none; }
  .chk-box {
    width: 16px; height: 16px; border: 1px solid #1a181550;
    background: #f4f1ea; display: grid; place-items: center; flex-shrink: 0;
  }
  .chk-box.on { background: #1a1815; border-color: #1a1815; }
  .chk-lbl { font-size: 12.5px; color: #3a352e; line-height: 1.35; }
  .run-btn {
    width: 100%; padding: 12px; margin-top: 20px;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; transition: background 0.12s;
  }
  .run-btn:hover { background: #b54a2c; }
  .run-btn:disabled { background: #98908380; cursor: default; }

  /* RESULTS */
  .results-hdr {
    display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px;
  }
  .results-title {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400; color: #1a1815;
  }
  .results-count {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; text-transform: uppercase; letter-spacing: 0.15em;
  }
  .empty {
    background: #ebe6dc; border: 1px solid #1a181520;
    padding: 52px 32px; text-align: center;
  }
  .empty-glyph {
    font-family: 'Fraunces', serif; font-size: 48px; color: #1a181530;
    margin-bottom: 16px; line-height: 1;
  }
  .empty-text { font-size: 14px; color: #6b645a; line-height: 1.6; }

  /* CARDS */
  .card { border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 10px; overflow: hidden; }
  .card-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 20px; cursor: pointer; transition: background 0.1s; user-select: none;
  }
  .card-hdr:hover { background: #ebe6dc; }
  .card-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .card-name-wrap { flex: 1; min-width: 0; }
  .card-name {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 500;
    color: #1a1815; line-height: 1;
  }
  .card-generic {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; margin-top: 3px;
  }
  .card-target {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    padding: 3px 8px; border: 1px solid currentColor; flex-shrink: 0;
  }
  .badge {
    display: flex; align-items: center; gap: 5px; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px;
  }
  .badge.eligible { background: #5a7a4a18; color: #5a7a4a; border: 1px solid #5a7a4a35; }
  .badge.review   { background: #c4a66118; color: #7a5e10; border: 1px solid #c4a66135; }
  .badge.blocked  { background: #b54a2c15; color: #b54a2c; border: 1px solid #b54a2c35; }
  .chevron { color: #6b645a; flex-shrink: 0; transition: transform 0.18s; }
  .chevron.open { transform: rotate(180deg); }

  .card-body {
    border-top: 1px solid #1a181520; padding: 22px 20px 18px; background: #faf8f4;
  }
  .body-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 18px;
  }
  @media (max-width: 700px) { .body-grid { grid-template-columns: 1fr; } }
  .body-section-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a; margin-bottom: 8px;
  }
  .crit-item {
    display: flex; align-items: flex-start; gap: 7px;
    font-size: 12px; color: #3a352e; margin-bottom: 5px; line-height: 1.45;
  }
  .crit-item svg { flex-shrink: 0; margin-top: 1px; }
  .plain-list { list-style: none; }
  .plain-li {
    font-size: 11.5px; color: #3a352e; padding: 3px 0;
    border-bottom: 1px solid #1a181510; line-height: 1.4;
  }
  .plain-li:last-child { border-bottom: none; }
  .plain-li::before { content: '— '; color: #6b645a; }
  .trial-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #4c6b8c; text-decoration: none; text-transform: uppercase;
    letter-spacing: 0.12em; border: 1px solid #4c6b8c40; padding: 7px 14px;
    transition: background 0.1s;
  }
  .trial-link:hover { background: #4c6b8c0d; }

  /* DISCLAIMER */
  .disclaimer {
    max-width: 1200px; margin: 0 auto 0; padding: 0 40px 48px;
  }
  .disclaimer-inner {
    border: 1px solid #1a181520; background: #ebe6dc;
    padding: 16px 20px; font-size: 12px; color: #6b645a; line-height: 1.65;
  }
  .disclaimer-inner strong {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #3a352e;
  }
  @media (max-width: 860px) { .disclaimer { padding: 0 20px 40px; } }

  /* CTA BANNER */
  .cta-banner {
    max-width: 1200px; margin: 0 auto; padding: 0 40px 32px;
  }
  .cta-inner {
    background: #1a1815; color: #f4f1ea;
    padding: 28px 32px; display: flex; align-items: center;
    justify-content: space-between; gap: 24px; flex-wrap: wrap;
  }
  .cta-text {}
  .cta-title {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400;
    line-height: 1.2; margin-bottom: 6px; letter-spacing: -0.01em;
  }
  .cta-title em { font-style: italic; color: #c4a661; }
  .cta-sub {
    font-family: 'Inter Tight', sans-serif; font-size: 13px;
    color: #f4f1ea99; line-height: 1.5;
  }
  .cta-btn {
    padding: 12px 24px; background: #b54a2c; color: #f4f1ea; border: none;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; cursor: pointer;
    transition: background 0.12s; white-space: nowrap; flex-shrink: 0;
  }
  .cta-btn:hover { background: #c4a661; color: #1a1815; }
  @media (max-width: 860px) { .cta-banner { padding: 0 20px 28px; } }

  /* MODAL OVERLAY */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(26,24,21,0.7);
    display: grid; place-items: center; z-index: 100; padding: 20px;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: #f4f1ea; border: 1px solid #1a1815;
    width: 100%; max-width: 480px; position: relative;
  }
  .modal-rule { height: 4px; background: #1a1815; position: relative; }
  .modal-rule::after {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 40%; background: #b54a2c;
  }
  .modal-body { padding: 28px 28px 24px; }
  .modal-close {
    position: absolute; top: 16px; right: 16px; background: none;
    border: none; cursor: pointer; color: #6b645a; padding: 4px;
  }
  .modal-close:hover { color: #1a1815; }
  .modal-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 400;
    letter-spacing: -0.015em; margin: 0 0 6px; color: #1a1815;
  }
  .modal-sub {
    font-size: 13px; color: #6b645a; line-height: 1.55; margin-bottom: 22px;
  }
  .modal-field { margin-bottom: 14px; }
  .modal-lbl {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: block; margin-bottom: 5px;
  }
  .modal-inp {
    width: 100%; padding: 9px 12px; background: #ebe6dc;
    border: 1px solid #1a181540; font-family: 'Inter Tight', sans-serif;
    font-size: 13px; color: #1a1815; border-radius: 0; box-sizing: border-box;
  }
  .modal-inp:focus { outline: none; border-color: #1a1815; }
  .modal-submit {
    width: 100%; padding: 12px; margin-top: 6px;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; transition: background 0.12s;
  }
  .modal-submit:hover { background: #b54a2c; }
  .modal-submit:disabled { background: #98908380; cursor: default; }
  .modal-success {
    padding: 28px; text-align: center;
  }
  .modal-success-icon { font-size: 36px; margin-bottom: 14px; }
  .modal-success-title {
    font-family: 'Fraunces', serif; font-size: 20px; color: #1a1815; margin-bottom: 8px;
  }
  .modal-success-text { font-size: 13px; color: #6b645a; line-height: 1.6; }

  /* LAB VALUES SECTION */
  .lab-toggle {
    display: flex; align-items: center; justify-content: space-between;
    cursor: pointer; padding: 8px 0; margin-top: 4px;
  }
  .lab-toggle-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
  }
  .lab-toggle-hint {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    color: #98908380; text-transform: uppercase; letter-spacing: 0.1em;
  }
  .lab-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px;
    margin-top: 10px;
  }
  .lab-field {}
  .lab-lbl {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #6b645a;
    display: block; margin-bottom: 4px;
  }
  .lab-unit {
    font-size: 8px; color: #98908380; margin-left: 3px;
  }
  .lab-inp {
    width: 100%; padding: 7px 10px; background: #f4f1ea;
    border: 1px solid #1a181535; font-family: 'JetBrains Mono', monospace;
    font-size: 12px; color: #1a1815; border-radius: 0; box-sizing: border-box;
  }
  .lab-inp:focus { outline: none; border-color: #1a1815; }
  .lab-inp::placeholder { color: #98908380; }
  .lab-note {
    font-family: 'Inter Tight', sans-serif; font-size: 11px; color: #6b645a;
    margin-top: 8px; line-height: 1.5; font-style: italic;
  }

  /* PDF EXPORT BUTTON */
  .export-bar {
    max-width: 1200px; margin: 0 auto; padding: 0 40px 24px;
    display: flex; align-items: center; justify-content: flex-end; gap: 12px;
  }
  @media (max-width: 860px) { .export-bar { padding: 0 20px 20px; } }
  .export-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px; background: #1a1815; color: #f4f1ea;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em;
    border: none; cursor: pointer; transition: background 0.12s;
  }
  .export-btn:hover { background: #b54a2c; }
  .export-btn.secondary {
    background: transparent; color: #4c6b8c;
    border: 1px solid #4c6b8c40;
  }
  .export-btn.secondary:hover { background: #4c6b8c0d; }
  .export-signin-hint {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; text-transform: uppercase; letter-spacing: 0.12em;
  }

  /* CLERK USER BUTTON AREA */
  .hdr-auth { display: flex; align-items: center; gap: 12px; }
  .hdr-signin-btn {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em;
    padding: 7px 16px; background: transparent; color: #f4f1ea;
    border: 1px solid #f4f1ea40; cursor: pointer; transition: all 0.12s;
  }
  .hdr-signin-btn:hover { background: #f4f1ea15; }

  /* TAB BAR */
  .tab-bar {
    display: flex; gap: 2px; margin-bottom: 16px;
  }
  .tab-btn {
    padding: 7px 16px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    border: 1px solid #1a181530; background: #f4f1ea; color: #6b645a;
    transition: all 0.12s;
  }
  .tab-btn:hover { background: #ebe6dc; color: #1a1815; }
  .tab-btn.active { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .tab-count {
    display: inline-block; margin-left: 5px;
    font-size: 9px; color: inherit; opacity: 0.7;
  }

  /* COMPARISON PANEL */
  .compare-panel {
    display: grid; grid-template-columns: 1fr auto 1fr;
    border: 1px solid #1a181525; background: #ebe6dc; margin-bottom: 20px;
  }
  .compare-col { padding: 18px 20px; }
  .compare-vs {
    display: grid; place-items: center; padding: 0 18px;
    font-family: 'Fraunces', serif; font-size: 16px; font-style: italic; color: #6b645a;
    border-left: 1px solid #1a181518; border-right: 1px solid #1a181518;
  }
  .compare-type {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a; margin-bottom: 6px;
    display: flex; align-items: center; gap: 6px;
  }
  .compare-count {
    font-family: 'Fraunces', serif; font-size: 26px; font-weight: 400;
    margin-bottom: 10px; line-height: 1;
  }
  .compare-count em { font-style: normal; color: #5a7a4a; }
  .compare-count span { font-size: 13px; color: #6b645a; font-family: 'Inter Tight', sans-serif; }
  .compare-pro {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 11.5px; color: #3a352e; padding: 2px 0; line-height: 1.4;
  }
  .compare-pro::before { content: '✓'; color: #5a7a4a; flex-shrink: 0; font-size: 10px; margin-top: 1px; }
  .compare-con {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 11.5px; color: #6b645a; padding: 2px 0; line-height: 1.4; font-style: italic;
  }
  .compare-con::before { content: '⚠'; flex-shrink: 0; font-size: 9px; margin-top: 1px; }
  @media (max-width: 700px) {
    .compare-panel { grid-template-columns: 1fr; }
    .compare-vs { border: none; border-top: 1px solid #1a181518; border-bottom: 1px solid #1a181518; padding: 10px 20px; }
  }

  /* PRODUCT TYPE TAG */
  .product-type-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 8px;
    text-transform: uppercase; letter-spacing: 0.15em;
    border: 1px solid #1a181525; padding: 2px 6px; flex-shrink: 0; color: #6b645a;
  }
  .product-type-tag.bispecific {
    color: #4c6b8c; border-color: #4c6b8c40; background: #4c6b8c08;
  }
  .product-type-tag.cart {
    color: #b54a2c; border-color: #b54a2c40; background: #b54a2c06;
  }

  /* ADVANTAGES SECTION */
  .adv-item {
    display: flex; align-items: flex-start; gap: 7px;
    font-size: 12px; color: #3a352e; margin-bottom: 5px; line-height: 1.45;
  }
  .adv-item::before { content: '→'; color: #5a7a4a; flex-shrink: 0; font-size: 11px; }
  .note-item {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; padding: 2px 0; line-height: 1.5;
  }
  .note-item::before { content: '· '; }

  /* SHARE BUTTON */
  .share-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px; background: transparent; color: #5a7a4a;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em;
    border: 1px solid #5a7a4a50; cursor: pointer; transition: all 0.12s;
  }
  .share-btn:hover { background: #5a7a4a10; }
  .share-btn.copied { color: #5a7a4a; border-color: #5a7a4a; background: #5a7a4a12; }

  /* CASE LOADED BANNER */
  .case-banner {
    max-width: 1200px; margin: 0 auto; padding: 12px 40px 0;
  }
  .case-banner-inner {
    background: #5a7a4a15; border: 1px solid #5a7a4a40;
    padding: 10px 16px; display: flex; align-items: center; gap: 10px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #3a5a2a;
  }
  @media (max-width: 860px) { .case-banner { padding: 12px 20px 0; } }

  /* DISEASE PATHWAY INTELLIGENCE */
  .pathway-panel {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 20px;
    overflow: hidden;
  }
  .pathway-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #1a1815; color: #f4f1ea;
  }
  .pathway-icon-bg {
    width: 30px; height: 30px; background: #4c6b8c; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .pathway-hdr-text { flex: 1; }
  .pathway-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; line-height: 1;
  }
  .pathway-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: #c4a661; margin-top: 4px;
  }
  .pathway-body { padding: 18px 20px; }
  .pathway-section { margin-bottom: 16px; }
  .pathway-section:last-child { margin-bottom: 0; }
  .pathway-section-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 8px;
  }
  .pathway-nccn {
    display: flex; align-items: flex-start; gap: 9px;
    font-size: 12.5px; color: #1a1815; padding: 6px 0 6px 12px;
    border-left: 2px solid #4c6b8c; line-height: 1.55; margin-bottom: 6px;
  }
  .pathway-nccn::before {
    content: 'NCCN'; flex-shrink: 0; font-family: 'JetBrains Mono', monospace;
    font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em;
    color: #4c6b8c; padding: 1px 5px; border: 1px solid #4c6b8c45;
    margin-top: 1px; height: fit-content;
  }
  .pathway-pref {
    display: flex; align-items: flex-start; gap: 10px;
    font-size: 12px; color: #3a352e; padding: 6px 0;
    border-bottom: 1px solid #1a181510; line-height: 1.5;
  }
  .pathway-pref:last-child { border-bottom: none; }
  .pathway-pref-name {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em; color: #1a1815;
    min-width: 80px; flex-shrink: 0;
  }
  .pathway-caveat {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: 12px; color: #7a5e10; padding: 6px 0;
    line-height: 1.5; font-style: italic;
  }
  .pathway-caveat::before { content: '⚠'; flex-shrink: 0; }

  /* URGENCY BANNER */
  .urgency-banner {
    border: 2px solid; padding: 18px 22px; margin-bottom: 20px;
    display: flex; align-items: flex-start; gap: 18px;
  }
  .urgency-banner.high   { border-color: #b54a2c; background: #b54a2c0c; }
  .urgency-banner.medium { border-color: #c4a661; background: #c4a66114; }
  .urgency-banner.low    { border-color: #5a7a4a; background: #5a7a4a0d; }

  .urgency-icon-wrap {
    width: 52px; height: 52px; flex-shrink: 0;
    display: grid; place-items: center;
    border: 2px solid currentColor;
  }
  .urgency-banner.high   .urgency-icon-wrap { color: #b54a2c; }
  .urgency-banner.medium .urgency-icon-wrap { color: #c4a661; }
  .urgency-banner.low    .urgency-icon-wrap { color: #5a7a4a; }

  .urgency-content { flex: 1; min-width: 0; }
  .urgency-level {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.2em;
    margin-bottom: 3px; font-weight: 700;
  }
  .urgency-banner.high   .urgency-level { color: #b54a2c; }
  .urgency-banner.medium .urgency-level { color: #7a5e10; }
  .urgency-banner.low    .urgency-level { color: #4a6a3a; }

  .urgency-title {
    font-family: 'Fraunces', serif; font-size: 21px; font-weight: 500;
    color: #1a1815; line-height: 1.2; margin-bottom: 12px;
    letter-spacing: -0.012em;
  }
  .urgency-factors {
    list-style: none; padding: 0; margin: 0 0 12px;
  }
  .urgency-factor {
    font-size: 12.5px; color: #3a352e; padding: 3px 0 3px 14px;
    line-height: 1.5; position: relative;
  }
  .urgency-factor::before {
    content: '·'; position: absolute; left: 4px; font-weight: 700;
  }
  .urgency-banner.high   .urgency-factor::before { color: #b54a2c; }
  .urgency-banner.medium .urgency-factor::before { color: #c4a661; }
  .urgency-banner.low    .urgency-factor::before { color: #5a7a4a; }

  .urgency-timeline {
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.12em;
    padding-top: 12px; line-height: 1.55;
    color: #1a1815; font-weight: 600;
    border-top: 1px solid;
  }
  .urgency-banner.high   .urgency-timeline { border-top-color: #b54a2c30; }
  .urgency-banner.medium .urgency-timeline { border-top-color: #c4a66135; }
  .urgency-banner.low    .urgency-timeline { border-top-color: #5a7a4a30; }
  .urgency-timeline-label {
    display: block; font-size: 9px; letter-spacing: 0.2em;
    margin-bottom: 4px; opacity: 0.6;
  }

  @media (max-width: 600px) {
    .urgency-banner { flex-direction: column; gap: 12px; }
    .urgency-icon-wrap { width: 40px; height: 40px; }
    .urgency-title { font-size: 18px; }
  }

  /* ACTION-AWARE RESULTS */
  .result-section { margin-bottom: 18px; }
  .result-section-head {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.18em;
    padding-bottom: 8px; margin-bottom: 10px;
    border-bottom: 1px solid currentColor;
  }
  .result-section-head.blocked { color: #b54a2c; border-bottom-color: #b54a2c30; }
  .result-section-head.review  { color: #7a5e10; border-bottom-color: #c4a66135; }
  .result-section-head.passed  { color: #5a7a4a; border-bottom-color: #5a7a4a30; }

  .crit-block, .crit-warn { margin-bottom: 10px; }
  .crit-text {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: 12.5px; color: #1a1815; line-height: 1.45;
  }
  .crit-text svg { flex-shrink: 0; margin-top: 1.5px; }
  .crit-action {
    font-size: 11.5px; color: #3a352e; line-height: 1.55;
    margin-left: 20px; margin-top: 5px;
    padding: 7px 10px; background: #c4a66110;
    border-left: 2px solid #c4a66180;
  }
  .crit-action::before {
    content: '→ '; color: #c4a661; font-weight: 600; margin-right: 2px;
  }
  .crit-action strong {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #7a5e10;
    display: block; margin-bottom: 3px;
  }

  /* Path to eligibility / referral steps panels */
  .next-steps-panel {
    margin: 14px 0 16px;
    padding: 14px 16px;
    background: #c4a66110; border-left: 3px solid #c4a661;
  }
  .next-steps-panel.referral {
    background: #5a7a4a10; border-left-color: #5a7a4a;
  }
  .next-steps-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.2em;
    margin-bottom: 10px; color: #7a5e10;
    display: flex; align-items: center; gap: 7px;
  }
  .next-steps-panel.referral .next-steps-head { color: #4a6a3a; }
  .next-step {
    font-size: 12.5px; color: #1a1815; padding: 3px 0 3px 18px;
    position: relative; line-height: 1.55;
  }
  .next-step::before {
    content: '→'; position: absolute; left: 0; color: #c4a661; font-weight: 600;
  }
  .next-steps-panel.referral .next-step::before { color: #5a7a4a; }

  /* Passes shown as compact 2-column grid */
  .passes-grid {
    columns: 2; column-gap: 18px; margin-top: 4px;
  }
  @media (max-width: 700px) { .passes-grid { columns: 1; } }
  .pass-item {
    display: flex; align-items: flex-start; gap: 6px;
    font-size: 12px; color: #3a352e; line-height: 1.45;
    padding: 3px 0; break-inside: avoid;
  }
  .pass-item svg { flex-shrink: 0; margin-top: 1px; }

  /* COMMUNITY EARLY REFERRAL — /refer */
  .refer-view {
    max-width: 1100px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .refer-view { padding: 36px 20px 60px; } }

  .refer-hero { margin-bottom: 36px; text-align: center; }
  .refer-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #b54a2c;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .refer-tag::before, .refer-tag::after {
    content: ''; width: 24px; height: 1px; background: #b54a2c;
  }
  .refer-h1 {
    font-family: 'Fraunces', serif; font-size: 40px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .refer-h1 em { font-style: italic; color: #b54a2c; }
  .refer-sub {
    font-size: 15px; color: #6b645a; max-width: 620px;
    margin: 16px auto 0; line-height: 1.65;
  }

  .refer-grid {
    display: grid; grid-template-columns: 380px 1fr; gap: 28px;
    margin-top: 36px; align-items: start;
  }
  @media (max-width: 860px) { .refer-grid { grid-template-columns: 1fr; gap: 20px; } }

  .refer-form {
    background: #ebe6dc; border: 1px solid #1a1815;
    padding: 24px; position: sticky; top: 24px;
  }
  @media (max-width: 860px) { .refer-form { position: static; } }
  .refer-form-title {
    font-family: 'Fraunces', serif; font-size: 17px; font-weight: 500;
    color: #1a1815; margin: 0 0 18px;
    border-bottom: 1px solid #1a181520; padding-bottom: 12px;
  }

  .refer-decision {
    min-height: 320px;
  }
  .refer-empty {
    border: 1px dashed #1a181540; padding: 60px 32px; text-align: center;
    background: #f4f1ea;
  }
  .refer-empty-icon {
    font-family: 'Fraunces', serif; font-size: 56px; color: #1a181530;
    margin-bottom: 18px; line-height: 1;
  }
  .refer-empty-text {
    font-size: 14px; color: #6b645a; line-height: 1.65;
  }

  .verdict {
    border: 3px solid; padding: 28px 30px;
  }
  .verdict.refer-now           { border-color: #b54a2c; background: #b54a2c0a; }
  .verdict.refer-at-progression { border-color: #c4a661; background: #c4a66110; }
  .verdict.monitor             { border-color: #4c6b8c; background: #4c6b8c0c; }
  .verdict.not-indicated       { border-color: #5a7a4a; background: #5a7a4a0c; }

  .verdict-level {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.22em; font-weight: 700;
    margin-bottom: 6px;
  }
  .verdict.refer-now            .verdict-level { color: #b54a2c; }
  .verdict.refer-at-progression .verdict-level { color: #7a5e10; }
  .verdict.monitor              .verdict-level { color: #4c6b8c; }
  .verdict.not-indicated        .verdict-level { color: #4a6a3a; }

  .verdict-headline {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 500;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.02em;
    margin-bottom: 14px;
  }
  .verdict-sub {
    font-size: 14.5px; color: #1a1815; line-height: 1.55; margin-bottom: 22px;
  }

  .verdict-block {
    margin-bottom: 20px; padding-top: 18px; border-top: 1px solid currentColor;
    border-top-color: #1a181520;
  }
  .verdict-block-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 10px;
  }
  .verdict-trigger {
    font-size: 13px; color: #1a1815; padding: 4px 0 4px 16px;
    line-height: 1.55; position: relative;
  }
  .verdict-trigger::before {
    content: '·'; position: absolute; left: 4px; font-weight: 700;
  }
  .verdict-trigger.missed {
    background: #b54a2c10; padding: 8px 12px 8px 28px; margin: 6px 0;
    border-left: 3px solid #b54a2c;
  }
  .verdict-trigger.missed::before {
    content: '⚠'; left: 8px; color: #b54a2c;
  }

  .verdict-action {
    font-size: 13px; color: #1a1815; padding: 6px 0 6px 22px;
    line-height: 1.55; position: relative; font-weight: 500;
  }
  .verdict-action::before {
    content: '→'; position: absolute; left: 4px; color: #b54a2c;
    font-weight: 700;
  }

  .verdict-cta-row {
    display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px;
    padding-top: 18px; border-top: 1px solid #1a181525;
  }
  .verdict-cta {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 10px 18px; font-family: 'JetBrains Mono', monospace;
    font-size: 10px; text-transform: uppercase; letter-spacing: 0.15em;
    cursor: pointer; border: 1px solid #1a1815; background: transparent;
    color: #1a1815; text-decoration: none; transition: all 0.12s;
  }
  .verdict-cta:hover { background: #1a1815; color: #f4f1ea; }
  .verdict-cta.primary {
    background: #b54a2c; color: #f4f1ea; border-color: #b54a2c;
  }
  .verdict-cta.primary:hover { background: #c4a661; border-color: #c4a661; color: #1a1815; }

  /* Why this product exists box */
  .refer-why {
    background: #1a1815; color: #f4f1ea;
    padding: 22px 26px; margin: 36px 0;
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px;
  }
  @media (max-width: 700px) { .refer-why { grid-template-columns: 1fr; } }
  .refer-why-stat {}
  .refer-why-num {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 400;
    color: #c4a661; line-height: 1; margin-bottom: 4px;
  }
  .refer-why-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #f4f1ea99;
    line-height: 1.55;
  }

  /* CRITERIA CATALOG */
  .crit-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .crit-view { padding: 36px 20px 60px; } }

  .crit-hero { margin-bottom: 36px; }
  .crit-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 12px; display: inline-flex; align-items: center; gap: 10px;
  }
  .crit-tag::before { content: ''; width: 24px; height: 1px; background: #6b645a; }
  .crit-h1 {
    font-family: 'Fraunces', serif; font-size: 38px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .crit-h1 em { font-style: italic; color: #b54a2c; }
  .crit-sub {
    font-size: 14.5px; color: #6b645a; max-width: 680px;
    margin: 14px 0 0; line-height: 1.65;
  }

  .crit-stats {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
    border: 1px solid #1a1815; margin: 30px 0 0;
  }
  @media (max-width: 700px) { .crit-stats { grid-template-columns: repeat(2, 1fr); } }
  .crit-stat {
    padding: 16px 18px;
    border-right: 1px solid #1a181520;
  }
  .crit-stat:last-child { border-right: none; }
  @media (max-width: 700px) {
    .crit-stat:nth-child(2n) { border-right: none; }
    .crit-stat:nth-child(-n+2) { border-bottom: 1px solid #1a181520; }
  }
  .crit-stat-num {
    font-family: 'Fraunces', serif; font-size: 30px; font-weight: 400;
    color: #1a1815; line-height: 1;
  }
  .crit-stat-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #6b645a;
    margin-top: 6px;
  }

  /* Sticky section nav */
  .crit-nav {
    position: sticky; top: 0; z-index: 10;
    background: #f4f1ea; border-bottom: 1px solid #1a181530;
    padding: 14px 0; margin: 36px 0 0;
    display: flex; gap: 2px; flex-wrap: wrap;
  }
  .crit-nav-btn {
    padding: 7px 14px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.13em;
    border: 1px solid #1a181530; background: transparent; color: #6b645a;
    text-decoration: none; transition: all 0.12s;
  }
  .crit-nav-btn:hover { color: #1a1815; background: #1a181508; }

  .crit-section { margin-top: 40px; scroll-margin-top: 80px; }
  .crit-section-hdr {
    border-top: 1px solid #1a1815; padding-top: 22px; margin-bottom: 22px;
    display: flex; align-items: baseline; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  }
  .crit-section-title {
    font-family: 'Fraunces', serif; font-size: 26px; font-weight: 400;
    color: #1a1815; letter-spacing: -0.018em; margin: 0;
  }
  .crit-section-meta {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; text-transform: uppercase; letter-spacing: 0.15em;
  }

  /* Rule card (used for products + pathways) */
  .rule-card {
    border: 1px solid #1a1815; background: #f4f1ea;
    margin-bottom: 14px; overflow: hidden;
  }
  .rule-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #ebe6dc;
    border-bottom: 1px solid #1a181520;
  }
  .rule-hdr-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .rule-hdr-name {
    font-family: 'Fraunces', serif; font-size: 19px; font-weight: 500;
    color: #1a1815; line-height: 1;
  }
  .rule-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; margin-top: 4px;
  }
  .rule-hdr-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em;
    padding: 3px 8px; border: 1px solid currentColor; flex-shrink: 0;
  }
  .rule-body { padding: 18px 20px; }
  .rule-sub-section { margin-bottom: 18px; }
  .rule-sub-section:last-child { margin-bottom: 0; }
  .rule-sub-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin-bottom: 8px;
  }

  /* Rule table */
  .rule-table {
    width: 100%; border-collapse: collapse; font-size: 12.5px;
  }
  .rule-table tr { border-bottom: 1px solid #1a181515; }
  .rule-table tr:last-child { border-bottom: none; }
  .rule-table td {
    padding: 8px 10px; color: #1a1815; line-height: 1.5;
    vertical-align: top;
  }
  .rule-table td:first-child {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; text-transform: uppercase; letter-spacing: 0.12em;
    width: 38%; padding-left: 0;
  }
  .rule-table td:last-child {
    font-family: 'Inter Tight', sans-serif; font-weight: 500;
  }

  /* Rule list */
  .rule-list {
    list-style: none; padding: 0; margin: 0;
  }
  .rule-list li {
    font-size: 12.5px; color: #3a352e; line-height: 1.55;
    padding: 5px 0 5px 14px; border-bottom: 1px solid #1a181510;
    position: relative;
  }
  .rule-list li:last-child { border-bottom: none; }
  .rule-list li::before {
    content: '·'; position: absolute; left: 0; font-weight: 700; color: #1a1815;
  }
  .rule-list.nccn li::before { content: ''; }
  .rule-list.nccn li {
    padding-left: 50px;
  }
  .rule-list.nccn li::after {
    content: 'NCCN'; position: absolute; left: 0; top: 5px;
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    font-weight: 700; letter-spacing: 0.1em; color: #4c6b8c;
    padding: 1px 5px; border: 1px solid #4c6b8c45;
  }

  /* Product preference row */
  .pref-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 6px 0; border-bottom: 1px solid #1a181510;
    font-size: 12.5px; line-height: 1.5; color: #3a352e;
  }
  .pref-row:last-child { border-bottom: none; }
  .pref-name {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.1em;
    min-width: 84px; flex-shrink: 0;
  }
  .pref-trial {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; flex-shrink: 0; min-width: 110px;
  }

  /* Action rule row */
  .action-row {
    border-bottom: 1px solid #1a181515;
    padding: 10px 0;
  }
  .action-row:last-child { border-bottom: none; }
  .action-trigger {
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    font-weight: 700; color: #1a1815;
    background: #ebe6dc; padding: 3px 8px; display: inline-block;
    margin-bottom: 6px;
  }
  .action-text {
    font-size: 12.5px; color: #3a352e; line-height: 1.55;
    padding-left: 18px; position: relative;
  }
  .action-text::before {
    content: '→'; position: absolute; left: 0; color: #c4a661; font-weight: 600;
  }

  /* Source citation */
  .rule-source {
    margin-top: 12px; padding-top: 12px;
    border-top: 1px solid #1a181520;
    display: flex; align-items: center; gap: 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; flex-wrap: wrap;
  }
  .rule-source-label {
    text-transform: uppercase; letter-spacing: 0.16em;
  }
  .rule-source a {
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
  }
  .rule-source a:hover { color: #1a1815; }

  /* Score factor table */
  .score-table {
    width: 100%; border-collapse: collapse;
    background: #f4f1ea; border: 1px solid #1a181530;
  }
  .score-table th, .score-table td {
    padding: 8px 12px; text-align: left;
    border-bottom: 1px solid #1a181515; font-size: 12px;
  }
  .score-table th {
    background: #1a1815; color: #f4f1ea;
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.16em; font-weight: 600;
  }
  .score-table td.weight {
    font-family: 'JetBrains Mono', monospace; font-weight: 700;
    text-align: right; width: 80px;
  }
  .score-table td.weight.neg { color: #b54a2c; }
  .score-table td.weight.pos { color: #5a7a4a; }

  /* PRICING PAGE */
  .pricing-view {
    max-width: 1200px; margin: 0 auto; padding: 60px 40px 80px;
  }
  @media (max-width: 860px) { .pricing-view { padding: 40px 20px 60px; } }
  .pricing-hdr { text-align: center; margin-bottom: 48px; }
  .pricing-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 14px;
    display: inline-flex; align-items: center; gap: 10px;
  }
  .pricing-tag::before { content: ''; width: 24px; height: 1px; background: #6b645a; }
  .pricing-tag::after { content: ''; width: 24px; height: 1px; background: #6b645a; }
  .pricing-h1 {
    font-family: 'Fraunces', serif; font-size: 44px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .pricing-h1 em { font-style: italic; color: #b54a2c; }
  .pricing-sub {
    font-size: 15px; color: #6b645a; margin: 14px auto 0;
    max-width: 580px; line-height: 1.65;
  }
  .pricing-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
    margin-bottom: 56px;
  }
  @media (max-width: 860px) { .pricing-grid { grid-template-columns: 1fr; } }

  .pricing-card {
    border: 1px solid #1a1815; background: #f4f1ea; padding: 32px 26px;
    display: flex; flex-direction: column; position: relative;
  }
  .pricing-card.featured {
    background: #1a1815; color: #f4f1ea; transform: translateY(-8px);
    box-shadow: 0 12px 40px -10px rgba(26,24,21,0.25);
  }
  @media (max-width: 860px) { .pricing-card.featured { transform: none; } }
  .pricing-badge {
    position: absolute; top: -11px; right: 22px;
    background: #b54a2c; color: #f4f1ea;
    padding: 5px 11px; font-family: 'JetBrains Mono', monospace;
    font-size: 9px; text-transform: uppercase; letter-spacing: 0.18em;
  }
  .pricing-tier {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 10px;
  }
  .featured .pricing-tier { color: #c4a661; }
  .pricing-name {
    font-family: 'Fraunces', serif; font-size: 26px; font-weight: 500;
    margin-bottom: 14px; letter-spacing: -0.015em; line-height: 1;
  }
  .pricing-price {
    font-family: 'Fraunces', serif; font-size: 40px; font-weight: 400;
    line-height: 1; margin-bottom: 6px;
  }
  .pricing-price .currency {
    font-size: 18px; vertical-align: top; margin-right: 2px; opacity: 0.6;
    position: relative; top: 6px;
  }
  .pricing-per {
    font-size: 12px; color: #6b645a; font-style: italic; margin-bottom: 18px;
  }
  .featured .pricing-per { color: #98908399; }
  .pricing-best {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid #1a181520;
  }
  .featured .pricing-best { color: #c4a661; border-bottom-color: #f4f1ea1f; }
  .pricing-features {
    list-style: none; padding: 0; margin: 0 0 24px; flex: 1;
  }
  .pricing-feature {
    display: flex; align-items: flex-start; gap: 9px;
    font-size: 12.5px; color: #3a352e; line-height: 1.5;
    padding: 5px 0;
  }
  .featured .pricing-feature { color: #f4f1ea; }
  .pricing-feature svg { flex-shrink: 0; margin-top: 1px; color: #5a7a4a; }
  .featured .pricing-feature svg { color: #c4a661; }
  .pricing-cta {
    padding: 13px 16px; cursor: pointer; text-align: center;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.18em;
    border: 1px solid #1a1815; background: transparent; color: #1a1815;
    transition: all 0.12s; text-decoration: none;
  }
  .pricing-cta:hover { background: #1a1815; color: #f4f1ea; }
  .featured .pricing-cta {
    background: #b54a2c; color: #f4f1ea; border-color: #b54a2c;
  }
  .featured .pricing-cta:hover {
    background: #c4a661; color: #1a1815; border-color: #c4a661;
  }

  /* FAQ */
  .pricing-faq {
    max-width: 720px; margin: 0 auto; padding-top: 32px;
    border-top: 1px solid #1a181520;
  }
  .pricing-faq-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 400;
    text-align: center; color: #1a1815; margin-bottom: 24px;
    letter-spacing: -0.01em;
  }
  .faq-item { margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid #1a181515; }
  .faq-item:last-child { border-bottom: none; }
  .faq-q {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500;
    color: #1a1815; margin-bottom: 6px; letter-spacing: -0.005em;
  }
  .faq-a { font-size: 13px; color: #6b645a; line-height: 1.65; }

  /* SCREEN COUNTER BADGE */
  .screen-counter {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #5a7a4a;
    display: flex; align-items: center; gap: 6px;
  }
  .counter-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #5a7a4a;
    animation: pulse 2s ease-in-out infinite;
  }

  /* MOBILE FORM COLLAPSE */
  .form-title-bar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 20px;
  }
  .form-title { margin: 0; }
  .form-collapse-toggle {
    display: none;
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
  }
  @media (max-width: 860px) {
    .form-title-bar { cursor: pointer; border-bottom: 1px solid #1a181520; padding-bottom: 12px; margin-bottom: 0; }
    .form-collapse-toggle { display: block; }
    .form-fields-wrap { overflow: hidden; }
    .form-fields-wrap.collapsed { display: none; }
  }

  /* BRIDGING THERAPY PANEL */
  .bridging-panel {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 10px; overflow: hidden;
  }
  .bridging-hdr {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 18px; cursor: pointer; transition: background 0.1s; user-select: none;
    background: #ebe6dc;
  }
  .bridging-hdr:hover { background: #e2ddd4; }
  .bridging-icon {
    width: 28px; height: 28px; background: #c4a661; color: #1a1815;
    display: grid; place-items: center; flex-shrink: 0; font-size: 14px;
  }
  .bridging-hdr-text { flex: 1; }
  .bridging-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; color: #1a1815; line-height: 1;
  }
  .bridging-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a; margin-top: 3px;
  }
  .bridging-body { padding: 18px 20px; }
  .bridging-section { margin-bottom: 16px; }
  .bridging-section:last-child { margin-bottom: 0; }
  .bridging-section-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 8px;
  }
  .bridging-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
  @media (max-width: 700px) { .bridging-grid { grid-template-columns: 1fr; } }
  .bridging-regimen {
    background: #ebe6dc; border: 1px solid #1a181520; padding: 8px 10px;
  }
  .bridging-regimen-name {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    color: #1a1815; margin-bottom: 2px;
  }
  .bridging-regimen-full {
    font-size: 11px; color: #6b645a; line-height: 1.4;
  }
  .bridging-regimen.preferred { border-left: 3px solid #5a7a4a; }
  .bridging-regimen.novel { border-left: 3px solid #4c6b8c; }
  .bridging-regimen.control { border-left: 3px solid #c4a661; }
  .bridging-warning {
    background: #c4a66115; border: 1px solid #c4a66140; padding: 10px 12px;
    font-size: 12px; color: #3a352e; line-height: 1.55; margin-top: 12px;
  }
  .bridging-warning strong {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.1em; color: #7a5e10;
  }

  /* ACCURACY MODAL */
  .acc-check {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: 12.5px; color: #3a352e; margin-bottom: 7px; line-height: 1.45;
  }
  .acc-check svg { flex-shrink: 0; margin-top: 1px; }
  .acc-limit {
    display: flex; align-items: flex-start; gap: 8px;
    font-size: 12px; color: #6b645a; margin-bottom: 6px; line-height: 1.45; font-style: italic;
  }
  .acc-pi-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 8px;
  }
  .acc-pi-link {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em; color: #4c6b8c;
    text-decoration: none; border: 1px solid #4c6b8c40;
    padding: 5px 8px; text-align: center; display: block; transition: background 0.1s;
  }
  .acc-pi-link:hover { background: #4c6b8c0d; }

  /* HEADER NAV TABS */
  .hdr-nav { display: flex; gap: 2px; }
  .hdr-nav-btn {
    padding: 6px 14px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    border: 1px solid #1a181530; background: transparent; color: #6b645a;
    transition: all 0.12s;
  }
  .hdr-nav-btn:hover { color: #1a1815; background: #1a181508; }
  .hdr-nav-btn.active { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .hdr-nav-count { margin-left: 5px; font-size: 9px; opacity: 0.75; }

  /* BOARD VIEW */
  .board-view {
    max-width: 1200px; margin: 0 auto; padding: 36px 40px 80px;
  }
  @media (max-width: 860px) { .board-view { padding: 24px 20px 60px; } }
  .board-hdr {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 20px; margin-bottom: 28px; flex-wrap: wrap;
  }
  .board-title-block {}
  .board-title {
    font-family: 'Fraunces', serif; font-size: 28px; font-weight: 400;
    color: #1a1815; letter-spacing: -0.02em; margin: 0 0 5px;
  }
  .board-meta {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
  }
  .board-hdr-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .board-empty {
    background: #ebe6dc; border: 1px solid #1a181520;
    padding: 52px 32px; text-align: center;
  }
  .board-empty-glyph {
    font-family: 'Fraunces', serif; font-size: 48px; color: #1a181530;
    margin-bottom: 16px; line-height: 1;
  }
  .board-empty-text { font-size: 14px; color: #6b645a; line-height: 1.65; }
  .board-empty-cta {
    display: inline-block; margin-top: 16px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em;
    padding: 9px 20px; background: #1a1815; color: #f4f1ea;
    border: none; cursor: pointer;
  }

  /* BOARD CASE CARD */
  .board-case {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 10px;
    overflow: hidden;
  }
  .board-case-hdr {
    display: flex; align-items: center; gap: 10px; padding: 12px 16px;
    background: #ebe6dc; border-bottom: 1px solid #1a181518;
  }
  .board-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .board-case-label-input {
    font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500;
    color: #1a1815; flex: 1; min-width: 0; background: none; border: none;
    border-bottom: 1px dashed transparent; padding: 0; cursor: text;
  }
  .board-case-label-input:hover { border-bottom-color: #1a181540; }
  .board-case-label-input:focus { outline: none; border-bottom-color: #1a1815; }
  .board-case-summary {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b645a; flex-shrink: 0;
  }
  .board-case-body { padding: 14px 16px; }
  .board-elig-row {
    display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 12px;
  }
  .board-elig-chip {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.1em; padding: 3px 8px; border: 1px solid;
  }
  .board-elig-chip.elig { color: #5a7a4a; border-color: #5a7a4a45; background: #5a7a4a10; }
  .board-elig-chip.none { color: #b54a2c; border-color: #b54a2c30; background: #b54a2c07; }
  .board-controls {
    display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap;
  }
  .board-status-sel {
    padding: 8px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; border: 1px solid #1a181540;
    background: #ebe6dc; color: #1a1815; border-radius: 0; cursor: pointer;
    appearance: none; min-width: 168px; flex-shrink: 0;
  }
  .board-status-sel:focus { outline: none; border-color: #1a1815; }
  .board-notes-inp {
    flex: 1; min-width: 180px; padding: 8px 12px; resize: vertical; min-height: 38px;
    font-family: 'Inter Tight', sans-serif; font-size: 12.5px; color: #1a1815;
    border: 1px solid #1a181535; background: #f4f1ea; border-radius: 0; line-height: 1.4;
  }
  .board-notes-inp:focus { outline: none; border-color: #1a1815; }
  .board-notes-inp::placeholder { color: #98908360; }
  .board-btn-row { display: flex; gap: 6px; flex-shrink: 0; }
  .board-btn {
    padding: 8px 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; border: 1px solid #1a181535;
    background: transparent; color: #1a1815; cursor: pointer; transition: all 0.1s; white-space: nowrap;
  }
  .board-btn:hover { background: #1a181510; }
  .board-btn.danger { color: #b54a2c; border-color: #b54a2c35; }
  .board-btn.danger:hover { background: #b54a2c0d; }
  .board-btn.primary { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .board-btn.primary:hover { background: #b54a2c; border-color: #b54a2c; }

  /* ADD TO BOARD BUTTON */
  .add-board-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 20px; background: transparent; color: #1a1815;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em;
    border: 1px solid #1a181540; cursor: pointer; transition: all 0.12s;
  }
  .add-board-btn:hover { background: #1a181510; }
  .add-board-btn.added { color: #5a7a4a; border-color: #5a7a4a50; background: #5a7a4a0a; }

  /* FOOTER */
  .footer {
    border-top: 1px solid #1a181820; padding: 20px 40px;
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .footer-brand {
    font-family: 'Fraunces', serif; font-size: 14px; color: #6b645a; letter-spacing: 0.05em;
  }
  .footer-links { display: flex; gap: 20px; }
  .footer-link {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a; text-decoration: none;
  }
  .footer-link:hover { color: #1a1815; }
`;

// ── Small components ───────────────────────────────────────────────────────
function Checkbox({ checked, onChange, label }) {
  return (
    <label className="chk-row" onClick={onChange}>
      <div className={`chk-box${checked ? " on" : ""}`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="#f4f1ea" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className="chk-lbl">{label}</span>
    </label>
  );
}

function RadioGroup({ value, options, onChange }) {
  return (
    <div className="radio-row">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`radio-btn${value === o.value ? " on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProductCard({ product, result }) {
  const [open, setOpen] = useState(false);
  const trialsUrl = `https://clinicaltrials.gov/search?term=${product.nctSearch}&recrs=a`;
  const isBispecific = product.type === "bispecific";

  const badgeClass = !result ? "" : result.blocks.length > 0 ? "blocked" : result.hasWarning ? "review" : "eligible";
  const badgeLabel = !result ? "" : result.blocks.length > 0 ? "Ineligible" : result.hasWarning ? "Review" : "Eligible";

  return (
    <div className="card">
      <div className="card-hdr" onClick={() => setOpen(x => !x)}>
        <div className="card-dot" style={{ background: product.color }} />
        <div className="card-name-wrap">
          <div className="card-name">{product.name}</div>
          <div className="card-generic">{product.generic} · {product.sponsor}</div>
        </div>
        <span className={`product-type-tag ${isBispecific ? "bispecific" : "cart"}`}>
          {isBispecific ? "Bispecific" : "CAR-T"}
        </span>
        <span className="card-target" style={{ color: product.color }}>{product.target}</span>
        {result && (
          <div className={`badge ${badgeClass}`}>
            {result.blocks.length > 0 ? <XCircle size={11} /> : result.hasWarning ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}
            {badgeLabel}
          </div>
        )}
        <div className={`chevron${open ? " open" : ""}`}><ChevronDown size={16} /></div>
      </div>

      {open && (
        <div className="card-body">
          {result && (() => {
            const pathSteps = !result.eligible ? getPathToEligibility(result) : [];
            const referralSteps = result.eligible ? getReferralSteps(product) : [];
            return (
              <>
                {/* Blockers + per-item actions */}
                {result.blocks.length > 0 && (
                  <div className="result-section">
                    <div className="result-section-head blocked">
                      Not currently eligible — {result.blocks.length} blocker{result.blocks.length === 1 ? "" : "s"}
                    </div>
                    {result.blocks.map((b, i) => {
                      const action = findAction(b, "block");
                      return (
                        <div key={i} className="crit-block">
                          <div className="crit-text"><XCircle size={13} color="#b54a2c" />{b}</div>
                          {action && (
                            <div className="crit-action">
                              <strong>Action</strong>
                              {action}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Warnings (missing data / soft issues) + actions */}
                {result.warnings.length > 0 && (
                  <div className="result-section">
                    <div className="result-section-head review">
                      Action needed before referral — {result.warnings.length} item{result.warnings.length === 1 ? "" : "s"}
                    </div>
                    {result.warnings.map((w, i) => {
                      const action = findAction(w, "warning");
                      return (
                        <div key={i} className="crit-warn">
                          <div className="crit-text"><AlertTriangle size={13} color="#c4a661" />{w}</div>
                          {action && (
                            <div className="crit-action">
                              <strong>Action</strong>
                              {action}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Path to eligibility (for ineligible) */}
                {pathSteps.length > 0 && (
                  <div className="next-steps-panel">
                    <div className="next-steps-head">
                      <AlertTriangle size={11} />
                      Path to potential eligibility
                    </div>
                    {pathSteps.map((s, i) => (
                      <div key={i} className="next-step">{s}</div>
                    ))}
                  </div>
                )}

                {/* Referral steps (for eligible) */}
                {referralSteps.length > 0 && (
                  <div className="next-steps-panel referral">
                    <div className="next-steps-head">
                      <CheckCircle size={11} />
                      Recommended referral steps
                    </div>
                    {referralSteps.map((s, i) => (
                      <div key={i} className="next-step">{s}</div>
                    ))}
                  </div>
                )}

                {/* Passes — compact 2-column */}
                {result.passes.length > 0 && (
                  <div className="result-section">
                    <div className="result-section-head passed">
                      Meets criteria ({result.passes.length})
                    </div>
                    <div className="passes-grid">
                      {result.passes.map((p, i) => (
                        <div key={i} className="pass-item">
                          <CheckCircle size={11} color="#5a7a4a" />{p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          <div className="body-grid">
            <div>
              <div className="body-section-head">Organ function thresholds</div>
              <ul className="plain-list">
                {product.organ.map((o, i) => <li key={i} className="plain-li">{o}</li>)}
              </ul>
            </div>
            <div>
              <div className="body-section-head">Key exclusions</div>
              <ul className="plain-list">
                {product.exclusions.map((e, i) => <li key={i} className="plain-li">{e}</li>)}
              </ul>
            </div>
            <div>
              <div className="body-section-head">Approved indications</div>
              <ul className="plain-list">
                {product.indications.map((ind, i) => <li key={i} className="plain-li">{ind}</li>)}
              </ul>
            </div>
          </div>

          {/* Advantages + notes for bispecifics */}
          {isBispecific && product.advantages && (
            <div style={{ borderTop: "1px solid #1a181515", paddingTop: 14, marginTop: 4 }}>
              <div className="body-section-head" style={{ color: "#5a7a4a", marginBottom: 8 }}>
                vs CAR-T — key advantages
              </div>
              <div style={{ marginBottom: 10 }}>
                {product.advantages.map((a, i) => <div key={i} className="adv-item">{a}</div>)}
              </div>
              {product.notes && (
                <>
                  <div className="body-section-head" style={{ marginBottom: 6 }}>Administration notes</div>
                  {product.notes.map((n, i) => <div key={i} className="note-item">{n}</div>)}
                </>
              )}
            </div>
          )}

          <TrialsPanel genericName={product.generic} nctSearch={product.nctSearch} />
        </div>
      )}
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────
const CANCER_OPTIONS = [
  { value: "", label: "Select cancer type…" },
  { value: "DLBCL (Large B-cell lymphoma)", label: "DLBCL / Large B-cell lymphoma" },
  { value: "Follicular lymphoma", label: "Follicular lymphoma" },
  { value: "Mantle cell lymphoma", label: "Mantle cell lymphoma (MCL)" },
  { value: "CLL/SLL", label: "CLL / SLL" },
  { value: "ALL (acute lymphoblastic leukemia)", label: "ALL — acute lymphoblastic leukemia" },
  { value: "Multiple myeloma", label: "Multiple myeloma" },
  { value: "PMBCL (Primary mediastinal B-cell lymphoma)", label: "Primary mediastinal B-cell lymphoma" },
  { value: "Other B-cell lymphoma", label: "Other B-cell lymphoma" },
  { value: "Other (not in scope)", label: "Other (not currently in scope)" },
];

const INIT = {
  cancerType: "", priorLines: "", ecog: "",
  cd19: "unknown", bcma: "unknown", cd20: "unknown", gprc5d: "unknown",
  activeCns: false, activeAutoimmune: false,
  alloSct: false, alloSctMonths: "",
  priorImid: false, priorPi: false, priorAntiCd38: false,
  // Disease activity — drives urgency score
  diseaseTempo: "", primaryRefractory: false, bSymptoms: false, elevatedLdh: false,
  // Response to most recent line — drives community referral decision
  latestResponse: "",
  // Disease-specific pathway factors — drive NCCN-aware logic
  earlyRelapse: false, doubleHit: false, transformedFromIndolent: false,
  pod24: false, flGrade3b: false, transformedToDlbcl: false,
  btkiExposed: false, btkiRefractory: false, blastoidVariant: false, tp53Mutated: false,
  btkiVenetoclaxExposed: false, richtersTransformation: false,
  age25OrYounger: false, phPositive: false,
  lenalidomideRefractory: false, extramedullaryDisease: false, highRiskCytogenetics: false,
  // Lab values — all optional
  labAlt: "", labAst: "", labCreat: "", labCrcl: "",
  labBil: "", labLvef: "", labSpo2: "",
};

// ── Tumor board status config ──────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "pending",       label: "Pending",              dot: "#6b645a" },
  { value: "discussed",     label: "Discussed",            dot: "#4c6b8c" },
  { value: "approved",      label: "Approved for referral", dot: "#5a7a4a" },
  { value: "deferred",      label: "Deferred",             dot: "#c4a661" },
  { value: "not-indicated", label: "Not indicated",        dot: "#b54a2c" },
];

function TumorBoardView({ board, onUpdateCase, onRemoveCase, onLoadCase, onGoToScreener, onExport }) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const approvedCount = board.filter(c => c.status === "approved").length;

  return (
    <div className="board-view">
      <div className="board-hdr">
        <div className="board-title-block">
          <div className="board-title">Tumor Board</div>
          <div className="board-meta">
            {dateStr} · {board.length} case{board.length !== 1 ? "s" : ""}
            {approvedCount > 0 && ` · ${approvedCount} approved for referral`}
          </div>
        </div>
        <div className="board-hdr-actions">
          {board.length > 0 && (
            <button className="board-btn primary" onClick={onExport}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <Download size={12} />
                Export Board Packet (PDF)
              </span>
            </button>
          )}
          <button className="board-btn" onClick={onGoToScreener}>
            ← Back to screener
          </button>
        </div>
      </div>

      {board.length === 0 ? (
        <div className="board-empty">
          <div className="board-empty-glyph">⊞</div>
          <p className="board-empty-text">
            No cases in the tumor board yet.<br />
            Screen a patient and click <strong>Add to tumor board</strong> to queue them here.
          </p>
          <button className="board-empty-cta" onClick={onGoToScreener}>
            Start screening →
          </button>
        </div>
      ) : (
        board.map(c => {
          const eligible = c.results ? Object.values(c.results).filter(r => r.eligible) : [];
          const blocked  = c.results ? Object.values(c.results).filter(r => r.blocks.length > 0) : [];
          const statusMeta = STATUS_OPTIONS.find(s => s.value === c.status) || STATUS_OPTIONS[0];

          return (
            <div key={c.id} className="board-case">
              <div className="board-case-hdr">
                <div className="board-status-dot" style={{ background: statusMeta.dot }} />
                <input
                  className="board-case-label-input"
                  value={c.patientLabel}
                  onChange={e => onUpdateCase(c.id, { patientLabel: e.target.value })}
                />
                <div className="board-case-summary">
                  {[
                    c.patient.cancerType ? c.patient.cancerType.split("(")[0].trim() : null,
                    c.patient.priorLines ? `${c.patient.priorLines}L` : null,
                    c.patient.ecog !== "" ? `ECOG ${c.patient.ecog}` : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>

              <div className="board-case-body">
                {/* Eligible product chips */}
                <div className="board-elig-row">
                  {eligible.length === 0 ? (
                    <span className="board-elig-chip none">No eligible products</span>
                  ) : (
                    eligible.map((r, i) => {
                      const prod = ALL_PRODUCTS.find(p => c.results && c.results[p.id] === r);
                      return (
                        <span key={i} className="board-elig-chip elig">
                          {prod ? prod.name : "—"}
                        </span>
                      );
                    })
                  )}
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#6b645a", alignSelf: "center" }}>
                    {eligible.length}/{Object.keys(c.results || {}).length} eligible
                  </span>
                </div>

                {/* Controls */}
                <div className="board-controls">
                  <select
                    className="board-status-sel"
                    value={c.status}
                    onChange={e => onUpdateCase(c.id, { status: e.target.value })}
                    style={{ borderLeft: `3px solid ${statusMeta.dot}` }}
                  >
                    {STATUS_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                  <textarea
                    className="board-notes-inp"
                    placeholder="Add notes (attending comments, referral details, pending labs…)"
                    value={c.notes}
                    onChange={e => onUpdateCase(c.id, { notes: e.target.value })}
                    rows={2}
                  />
                  <div className="board-btn-row">
                    <button className="board-btn" onClick={() => onLoadCase(c)}>Re-screen</button>
                    <button className="board-btn danger" onClick={() => onRemoveCase(c.id)}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Bridging therapy data ──────────────────────────────────────────────────
const BRIDGING_DATA = {
  dlbcl: {
    title: "Bridging for DLBCL / Large B-cell lymphoma",
    preferred: [
      { name: "Pola-BR", full: "Polatuzumab vedotin + bendamustine + rituximab — most widely used bridge" },
      { name: "R-GemOx", full: "Rituximab + gemcitabine + oxaliplatin — good for renal-impaired patients" },
    ],
    standard: [
      { name: "R-DHAP", full: "Rituximab + dexamethasone + cytarabine + cisplatin" },
      { name: "R-ICE",  full: "Rituximab + ifosfamide + carboplatin + etoposide" },
      { name: "Loncastuximab", full: "Zynlonta (CD19-directed ADC) — for heavily pretreated" },
    ],
    control: [
      { name: "Steroids", full: "Dexamethasone or prednisone — rapid disease control only, short course" },
    ],
  },
  fl: {
    title: "Bridging for Follicular lymphoma",
    preferred: [
      { name: "Obinutuzumab-based", full: "G-bendamustine or G-CHOP — standard re-treatment" },
      { name: "R-CHOP / R-CVP",    full: "Rituximab-based chemoimmunotherapy for bulky disease" },
    ],
    standard: [
      { name: "Copanlisib", full: "Aliqopa — PI3K inhibitor, 3L+ approved" },
      { name: "Rituximab mono", full: "Single agent rituximab for indolent/low-burden FL" },
    ],
    control: [],
  },
  mcl: {
    title: "Bridging for Mantle cell lymphoma",
    preferred: [
      { name: "BTKi", full: "Ibrutinib (Imbruvica), acalabrutinib (Calquence), or zanubrutinib (Brukinsa)" },
      { name: "VR-CAP", full: "Bortezomib + rituximab + cyclophosphamide + doxorubicin + prednisone" },
    ],
    standard: [
      { name: "Venetoclax ± ibrutinib", full: "For BTKi-refractory MCL, venetoclax-based combinations" },
      { name: "R-DHAP / R-CHOP",       full: "Salvage chemoimmunotherapy for fit patients" },
    ],
    control: [],
  },
  cll: {
    title: "Bridging for CLL / SLL",
    preferred: [
      { name: "Zanubrutinib", full: "Brukinsa — BTK inhibitor, preferred for tolerability" },
      { name: "Venetoclax + obinutuzumab", full: "Fixed-duration option for treatment-naïve or relapsed" },
    ],
    standard: [
      { name: "Ibrutinib / acalabrutinib", full: "Alternative BTK inhibitors" },
      { name: "Steroids", full: "Methylprednisolone for autoimmune cytopenias / disease control" },
    ],
    control: [],
  },
  all: {
    title: "Bridging for ALL (acute lymphoblastic leukemia)",
    preferred: [
      { name: "Inotuzumab ozogamicin", full: "Besylta (CD22-directed ADC) — highly effective CAR-T bridge" },
      { name: "Blinatumomab", full: "Blincyto (CD19×CD3 bispecific) — also for MRD-positive disease" },
    ],
    standard: [
      { name: "Steroids + VCR", full: "Corticosteroids + vincristine for rapid blast control" },
      { name: "TKI (Ph+ ALL)",  full: "Dasatinib or ponatinib for Philadelphia chromosome-positive ALL" },
    ],
    control: [
      { name: "Hydrea", full: "Hydroxyurea for urgent cytoreduction — temporary measure only" },
    ],
  },
  mm: {
    title: "Bridging for Multiple myeloma",
    preferred: [
      { name: "DVd", full: "Daratumumab + bortezomib + dexamethasone — if not daratumumab-refractory" },
      { name: "Kd",  full: "Carfilzomib + dexamethasone — effective, manageable toxicity" },
    ],
    standard: [
      { name: "Pd",    full: "Pomalidomide + dexamethasone — for IMiD-sensitive relapse" },
      { name: "CyBorD", full: "Cyclophosphamide + bortezomib + dex — debulking, low myelosuppression" },
      { name: "Xd",    full: "Selinexor (Xpovio) + dex — for triple-class refractory" },
    ],
    control: [
      { name: "Low-dose dex", full: "Dexamethasone alone for rapid symptom control while planning" },
    ],
  },
};

function getBridgingKey(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return "mm";
  if (c.includes("all") || c.includes("leukemia")) return "all";
  if (c.includes("mantle") || c.includes("mcl")) return "mcl";
  if (c.includes("cll") || c.includes("sll")) return "cll";
  if (c.includes("follicular") || c.includes(" fl")) return "fl";
  if (c.includes("lymphoma") || c.includes("lbcl") || c.includes("dlbcl")) return "dlbcl";
  return null;
}

function BridgingPanel({ cancerType }) {
  const [open, setOpen] = useState(false);
  const key = getBridgingKey(cancerType);
  if (!key) return null;
  const data = BRIDGING_DATA[key];

  return (
    <div className="bridging-panel">
      <div className="bridging-hdr" onClick={() => setOpen(o => !o)}>
        <div className="bridging-icon">⏱</div>
        <div className="bridging-hdr-text">
          <div className="bridging-hdr-title">Bridging therapy options</div>
          <div className="bridging-hdr-sub">While awaiting CAR-T manufacturing (4–6 weeks)</div>
        </div>
        <div className={`chevron${open ? " open" : ""}`}><ChevronDown size={16} /></div>
      </div>

      {open && (
        <div className="bridging-body">
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, marginBottom: 14, color: "#1a1815" }}>
            {data.title}
          </div>

          {data.preferred.length > 0 && (
            <div className="bridging-section">
              <div className="bridging-section-head">Preferred — most commonly used bridges</div>
              <div className="bridging-grid">
                {data.preferred.map((r, i) => (
                  <div key={i} className="bridging-regimen preferred">
                    <div className="bridging-regimen-name">{r.name}</div>
                    <div className="bridging-regimen-full">{r.full}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.standard.length > 0 && (
            <div className="bridging-section">
              <div className="bridging-section-head">Additional options</div>
              <div className="bridging-grid">
                {data.standard.map((r, i) => (
                  <div key={i} className="bridging-regimen novel">
                    <div className="bridging-regimen-name">{r.name}</div>
                    <div className="bridging-regimen-full">{r.full}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.control.length > 0 && (
            <div className="bridging-section">
              <div className="bridging-section-head">Disease control (short-term only)</div>
              <div className="bridging-grid">
                {data.control.map((r, i) => (
                  <div key={i} className="bridging-regimen control">
                    <div className="bridging-regimen-name">{r.name}</div>
                    <div className="bridging-regimen-full">{r.full}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bridging-warning">
            <strong>⚠ Key considerations</strong><br />
            Avoid myelosuppressive agents ≤ 4 weeks before apheresis — adequate T-cell recovery is required for successful CAR-T manufacturing. Prolonged corticosteroids impair T-cell function; taper before collection. Coordinate with the CAR-T center before starting any bridging.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Accuracy modal ─────────────────────────────────────────────────────────
const PI_LINKS = [
  { name: "Yescarta",   url: "https://www.gilead.com/-/media/files/pdfs/medicines/other/yescarta/yescarta-us-prescribing-information.pdf" },
  { name: "Kymriah",    url: "https://www.novartis.com/us-en/sites/novartis_us/files/kymriah.pdf" },
  { name: "Breyanzi",   url: "https://packageinserts.bms.com/pi/pi_breyanzi.pdf" },
  { name: "Tecartus",   url: "https://www.gilead.com/-/media/files/pdfs/medicines/other/tecartus/tecartus-us-prescribing-information.pdf" },
  { name: "Abecma",     url: "https://packageinserts.bms.com/pi/pi_abecma.pdf" },
  { name: "Carvykti",   url: "https://www.janssenlabels.com/package-insert/product-monograph/prescribing-information/CARVYKTI-pi.pdf" },
  { name: "Tecvayli",   url: "https://www.janssenlabels.com/package-insert/product-monograph/prescribing-information/TECVAYLI-pi.pdf" },
  { name: "Talvey",     url: "https://www.janssenlabels.com/package-insert/product-monograph/prescribing-information/TALVEY-pi.pdf" },
  { name: "Elrexfio",   url: "https://labeling.pfizer.com/ShowLabeling.aspx?id=23905" },
  { name: "Epkinly",    url: "https://www.ema.europa.eu/en/medicines/human/EPAR/epkinly" },
  { name: "Columvi",    url: "https://www.gene.com/download/pdf/columvi_prescribing.pdf" },
  { name: "Lunsumio",   url: "https://www.gene.com/download/pdf/lunsumio_prescribing.pdf" },
];

function AccuracyModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="modal-rule" />
        <button className="modal-close" onClick={onClose}><X size={16} /></button>
        <div className="modal-body">
          <div className="modal-title">How accurate is this?</div>
          <p className="modal-sub">
            Eligibility criteria are derived directly from current FDA-approved prescribing information for each product, last reviewed May 2026.
          </p>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b645a", marginBottom: 8 }}>What we check</div>
            {[
              "Approved indications — cancer type and required line of therapy",
              "Target marker expression — CD19, BCMA, CD20, GPRC5D",
              "Performance status — ECOG threshold per product label",
              "Organ function — ALT, AST, creatinine/CrCl, bilirubin, LVEF, SpO₂",
              "MM prior therapy requirements — IMiD, PI, anti-CD38",
              "Absolute exclusions — CNS disease, active autoimmune, allo-SCT timing",
            ].map((t, i) => (
              <div key={i} className="acc-check">
                <CheckCircle size={13} color="#5a7a4a" />
                {t}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b645a", marginBottom: 8 }}>Limitations — always verify</div>
            {[
              "Insurance coverage and prior authorization not assessed",
              "Apheresis scheduling and manufacturing slot availability not assessed",
              "Full contraindication list — review the complete PI before prescribing",
              "Off-label or expanded-access use not reflected",
              "Product-specific REMS requirements not evaluated",
            ].map((t, i) => (
              <div key={i} className="acc-limit">
                <AlertTriangle size={12} color="#c4a661" style={{ flexShrink: 0, marginTop: 1 }} />
                {t}
              </div>
            ))}
          </div>

          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.2em", color: "#6b645a", marginBottom: 8 }}>FDA Prescribing Information</div>
            <div className="acc-pi-grid">
              {PI_LINKS.map(({ name, url }) => (
                <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="acc-pi-link">
                  {name} →
                </a>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: "10px 12px", background: "#ebe6dc", fontSize: 11, color: "#6b645a", lineHeight: 1.6 }}>
            <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "#3a352e" }}>Disclaimer</strong>
            {" "}— CellTx Match is for educational and research purposes only. Always confirm eligibility against current labeling, institutional protocols, and individual clinical assessment.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Community Early Referral page ──────────────────────────────────────────
const RESPONSE_OPTIONS = [
  { value: "cr",  label: "Complete response (CR)" },
  { value: "pr",  label: "Partial response (PR)" },
  { value: "sd",  label: "Stable disease (SD)" },
  { value: "pd",  label: "Progressive disease (PD)" },
  { value: "primary_refractory", label: "Primary refractory (no response)" },
];

function CommunityReferralView({ pt, setPt, set, tog, onSeeFullAnalysis, onLoadIntoScreener }) {
  const [ran, setRan] = useState(false);
  const decision = ran ? calculateReferralDecision(pt) : null;

  const isMM = pt.cancerType.toLowerCase().includes("myeloma");
  const isLymphoma = !isMM && pt.cancerType !== "" && !pt.cancerType.toLowerCase().includes("not in scope");
  const diseaseFields = getDiseaseFields(pt.cancerType);

  const verdictClass = !decision ? "" :
    decision.decision === "REFER_NOW" ? "refer-now" :
    decision.decision === "REFER_AT_PROGRESSION" ? "refer-at-progression" :
    decision.decision === "MONITOR" ? "monitor" :
    decision.decision === "NOT_INDICATED" ? "not-indicated" : "";

  return (
    <div className="refer-view">
      <div className="refer-hero">
        <div className="refer-tag">Early Referral Intelligence</div>
        <h1 className="refer-h1">
          Should you refer this patient<br />for <em>cell therapy?</em>
        </h1>
        <p className="refer-sub">
          A 60-second decision tool for community oncology. Built around the question every
          generalist asks: <em>"Is this the right time to involve a CAR-T specialist?"</em>
        </p>
      </div>

      <div className="refer-why">
        <div className="refer-why-stat">
          <div className="refer-why-num">~60%</div>
          <div className="refer-why-label">of CAR-T-eligible patients are referred late or never</div>
        </div>
        <div className="refer-why-stat">
          <div className="refer-why-num">4–6 wk</div>
          <div className="refer-why-label">manufacturing wait means delayed referral = missed window</div>
        </div>
        <div className="refer-why-stat">
          <div className="refer-why-num">80%</div>
          <div className="refer-why-label">of cancer care happens in community settings — not academic centers</div>
        </div>
      </div>

      <div className="refer-grid">
        {/* FORM — left */}
        <div className="refer-form">
          <h2 className="refer-form-title">Patient snapshot</h2>

          <div className="field">
            <label className="lbl">Cancer type</label>
            <select className="sel" value={pt.cancerType} onChange={e => set("cancerType", e.target.value)}>
              {CANCER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="lbl">Number of prior therapies</label>
            <input className="inp" type="number" min="0" max="20" placeholder="e.g. 2"
              value={pt.priorLines} onChange={e => set("priorLines", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl">Response to most recent therapy</label>
            <select className="sel" value={pt.latestResponse} onChange={e => set("latestResponse", e.target.value)}>
              <option value="">Select response…</option>
              {RESPONSE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="lbl">Performance status (ECOG)</label>
            <RadioGroup value={pt.ecog}
              options={["0","1","2","3","4"].map(v => ({ value: v, label: v }))}
              onChange={v => set("ecog", v)} />
          </div>

          {pt.cancerType && (
            <>
              <div className="sec-head">Early signals</div>
              <Checkbox checked={pt.primaryRefractory} onChange={() => tog("primaryRefractory")}
                label="No response to first-line therapy" />
              {pt.cancerType && diseaseFields.length > 0 && diseaseFields.map(f => (
                <Checkbox
                  key={f}
                  checked={pt[f]}
                  onChange={() => tog(f)}
                  label={DISEASE_FIELD_LABELS[f]}
                />
              ))}
              {isLymphoma && (
                <Checkbox checked={pt.bSymptoms} onChange={() => tog("bSymptoms")}
                  label="B symptoms (fever, night sweats, weight loss)" />
              )}
            </>
          )}

          <button
            className="run-btn"
            onClick={() => setRan(true)}
            disabled={!pt.cancerType || pt.priorLines === ""}
          >
            Check referral decision →
          </button>
        </div>

        {/* DECISION — right */}
        <div className="refer-decision">
          {!decision || decision.decision === "INSUFFICIENT_DATA" ? (
            <div className="refer-empty">
              <div className="refer-empty-icon">?</div>
              <p className="refer-empty-text">
                Fill the snapshot on the left and click<br />
                <strong>Check referral decision →</strong> to get a community-oncology-focused verdict.
              </p>
            </div>
          ) : (
            <div className={`verdict ${verdictClass}`}>
              <div className="verdict-level">
                {decision.decision === "REFER_NOW"            && "⚠ Refer immediately"}
                {decision.decision === "REFER_AT_PROGRESSION" && "⏱ Refer at next progression"}
                {decision.decision === "MONITOR"              && "○ Monitor"}
                {decision.decision === "NOT_INDICATED"        && "✓ Not yet indicated"}
              </div>
              <div className="verdict-headline">{decision.headline}</div>
              <div className="verdict-sub">{decision.sub}</div>

              {decision.triggers.length > 0 && (
                <div className="verdict-block">
                  <div className="verdict-block-head">Why this decision</div>
                  {decision.triggers.map((t, i) => (
                    <div key={i} className={`verdict-trigger${t.includes("MISSED WINDOW") ? " missed" : ""}`}>
                      {t.replace(/^⚠ /, "")}
                    </div>
                  ))}
                </div>
              )}

              {decision.actions.length > 0 && (
                <div className="verdict-block">
                  <div className="verdict-block-head">What to do today</div>
                  {decision.actions.map((a, i) => (
                    <div key={i} className="verdict-action">{a}</div>
                  ))}
                </div>
              )}

              <div className="verdict-cta-row">
                {(decision.decision === "REFER_NOW" || decision.decision === "REFER_AT_PROGRESSION") && (
                  <a
                    className="verdict-cta primary"
                    href="https://www.factwebsite.org/SearchAccrOrgs.aspx"
                    target="_blank" rel="noopener noreferrer"
                  >
                    Find FACT-accredited CAR-T center →
                  </a>
                )}
                <button className="verdict-cta" onClick={onSeeFullAnalysis}>
                  See full eligibility analysis →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Criteria catalog page ──────────────────────────────────────────────────
function CriteriaView({ products, bispecifics, onBackToScreener }) {
  // Counts for stat header
  const totalProducts = products.length + bispecifics.length;
  const pathwayCount  = PATHWAY_CATALOG.length;
  const actionCount   = BLOCK_ACTIONS.length + WARNING_ACTIONS.length;
  const urgencyCount  = URGENCY_RUBRIC.factors.length;

  // Helper: format organ thresholds
  const fmtOrgan = (t) => [
    { label: "ALT / AST",  val: t.altMax === t.astMax ? `≤ ${t.altMax} U/L` : `ALT ≤ ${t.altMax} · AST ≤ ${t.astMax} U/L` },
    { label: "Creatinine", val: `≤ ${t.creatMax} mg/dL` + (t.crclMin ? `  OR  CrCl ≥ ${t.crclMin} mL/min` : "") },
    { label: "Bilirubin",  val: `≤ ${t.bilMax} mg/dL` },
    t.lvefMin > 0 ? { label: "LVEF", val: `≥ ${t.lvefMin}%` } : null,
    t.spo2Min > 0 ? { label: "SpO₂", val: `≥ ${t.spo2Min}% on room air` } : null,
  ].filter(Boolean);

  // PI URL lookup
  const piUrl = (name) => PI_LINKS.find(p => p.name === name)?.url;

  // Find product by id (for pathway preference rows)
  const findProd = (id) => [...products, ...bispecifics].find(p => p.id === id);

  return (
    <div className="crit-view">
      {/* Hero */}
      <div className="crit-hero">
        <div className="crit-tag">Criteria Library · May 2026</div>
        <h1 className="crit-h1">
          The <em>structured rule library</em><br />
          that powers every analysis
        </h1>
        <p className="crit-sub">
          Every eligibility rule in CellTx Match — derived directly from FDA prescribing information,
          NCCN guidelines, and pivotal trial entry criteria. Browse, audit, and verify the logic
          before it ever runs on a patient.
        </p>

        <div className="crit-stats">
          <div className="crit-stat">
            <div className="crit-stat-num">{totalProducts}</div>
            <div className="crit-stat-label">Approved products</div>
          </div>
          <div className="crit-stat">
            <div className="crit-stat-num">{pathwayCount}</div>
            <div className="crit-stat-label">Disease pathways</div>
          </div>
          <div className="crit-stat">
            <div className="crit-stat-num">{actionCount}</div>
            <div className="crit-stat-label">Action rules</div>
          </div>
          <div className="crit-stat">
            <div className="crit-stat-num">{urgencyCount}</div>
            <div className="crit-stat-label">Urgency factors</div>
          </div>
        </div>
      </div>

      {/* Sticky section nav */}
      <div className="crit-nav">
        <a href="#products" className="crit-nav-btn">Products</a>
        <a href="#pathways" className="crit-nav-btn">Disease Pathways</a>
        <a href="#actions" className="crit-nav-btn">Action Engine</a>
        <a href="#urgency" className="crit-nav-btn">Urgency Rubric</a>
        <a href="#trials" className="crit-nav-btn">Trial Matching</a>
        <button className="crit-nav-btn" onClick={onBackToScreener}>← Screener</button>
      </div>

      {/* ── Products ────────────────────────────────────────────────────── */}
      <section id="products" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">FDA-Approved Products</h2>
          <span className="crit-section-meta">{totalProducts} products · sourced from FDA prescribing information</span>
        </div>

        {[...products, ...bispecifics].map(p => {
          const isBispecific = p.type === "bispecific";
          return (
            <div key={p.id} className="rule-card">
              <div className="rule-hdr">
                <div className="rule-hdr-dot" style={{ background: p.color }} />
                <div style={{ flex: 1 }}>
                  <div className="rule-hdr-name">{p.name}</div>
                  <div className="rule-hdr-sub">{p.generic} · {p.sponsor}</div>
                </div>
                <span className="rule-hdr-tag" style={{ color: isBispecific ? "#4c6b8c" : "#b54a2c" }}>
                  {isBispecific ? "Bispecific" : "CAR-T"}
                </span>
                <span className="rule-hdr-tag" style={{ color: p.color }}>{p.target}</span>
              </div>

              <div className="rule-body">
                <div className="rule-sub-section">
                  <div className="rule-sub-head">Approved indications</div>
                  <ul className="rule-list">
                    {p.indications.map((ind, i) => <li key={i}>{ind}</li>)}
                  </ul>
                </div>

                <div className="rule-sub-section">
                  <div className="rule-sub-head">Computable eligibility rules</div>
                  <table className="rule-table">
                    <tbody>
                      <tr>
                        <td>Required marker</td>
                        <td>{p.targetMarker} expression</td>
                      </tr>
                      <tr>
                        <td>Minimum prior lines</td>
                        <td>≥ {p.minPriorLines}</td>
                      </tr>
                      <tr>
                        <td>Maximum ECOG</td>
                        <td>≤ {p.ecogMax}</td>
                      </tr>
                      {fmtOrgan(p.organThresholds).map((row, i) => (
                        <tr key={i}>
                          <td>{row.label}</td>
                          <td>{row.val}</td>
                        </tr>
                      ))}
                      {p.mmReqs && (
                        <tr>
                          <td>MM prior therapy</td>
                          <td>Prior IMiD + PI + anti-CD38 required</td>
                        </tr>
                      )}
                      {p.requiresObinutuzumab && (
                        <tr>
                          <td>Pretreatment</td>
                          <td>Obinutuzumab 1000 mg IV 7 days before cycle 1 — required</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="rule-sub-section">
                  <div className="rule-sub-head">Key exclusions</div>
                  <ul className="rule-list">
                    {p.exclusions.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>

                <div className="rule-source">
                  <span className="rule-source-label">Source:</span>
                  {piUrl(p.name) ? (
                    <a href={piUrl(p.name)} target="_blank" rel="noopener noreferrer">
                      FDA {p.name} Prescribing Information →
                    </a>
                  ) : (
                    <span>FDA {p.name} Prescribing Information</span>
                  )}
                  <span>· Reviewed May 2026</span>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Disease Pathways ────────────────────────────────────────────── */}
      <section id="pathways" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">Disease Pathways (NCCN-aware)</h2>
          <span className="crit-section-meta">{pathwayCount} pathways · NCCN + pivotal trial citations</span>
        </div>

        {PATHWAY_CATALOG.map(pw => (
          <div key={pw.id} className="rule-card">
            <div className="rule-hdr">
              <div style={{ flex: 1 }}>
                <div className="rule-hdr-name">{pw.name}</div>
                <div className="rule-hdr-sub">Computable pathway · {pw.preferredProducts.length} preferred products</div>
              </div>
              <span className="rule-hdr-tag" style={{ color: "#4c6b8c" }}>NCCN-aware</span>
            </div>

            <div className="rule-body">
              <div className="rule-sub-section">
                <div className="rule-sub-head">High-risk modifiers (boost urgency score by +2 each)</div>
                <ul className="rule-list">
                  {pw.highRiskModifiers.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </div>

              <div className="rule-sub-section">
                <div className="rule-sub-head">NCCN-aligned clinical context</div>
                <ul className="rule-list nccn">
                  {pw.nccnRules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>

              <div className="rule-sub-section">
                <div className="rule-sub-head">Preferred products with pivotal trial citations</div>
                {pw.preferredProducts.map((p, i) => {
                  const prod = findProd(p.id);
                  return (
                    <div key={i} className="pref-row">
                      <span className="pref-name" style={{ color: prod?.color || "#1a1815" }}>
                        {prod?.name || p.id}
                      </span>
                      <span className="pref-trial">{p.trial}</span>
                      <span>{p.line}</span>
                    </div>
                  );
                })}
              </div>

              <div className="rule-source">
                <span className="rule-source-label">Source:</span>
                <a href={pw.sourceUrl} target="_blank" rel="noopener noreferrer">{pw.source} →</a>
                <span>· Reviewed May 2026</span>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* ── Action Engine ───────────────────────────────────────────────── */}
      <section id="actions" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">Clinical Action Engine</h2>
          <span className="crit-section-meta">{actionCount} pattern → action rules · pattern-matched against engine output</span>
        </div>

        <div className="rule-card">
          <div className="rule-hdr">
            <div style={{ flex: 1 }}>
              <div className="rule-hdr-name">Blocking criteria → recommended actions</div>
              <div className="rule-hdr-sub">{BLOCK_ACTIONS.length} rules · matched against block text returned by the eligibility engine</div>
            </div>
            <span className="rule-hdr-tag" style={{ color: "#b54a2c" }}>Block patterns</span>
          </div>
          <div className="rule-body">
            {BLOCK_ACTIONS.map((r, i) => (
              <div key={i} className="action-row">
                <span className="action-trigger">{String(r.match).replace(/^\/|\/i$/g, "")}</span>
                <div className="action-text">{r.action}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rule-card">
          <div className="rule-hdr">
            <div style={{ flex: 1 }}>
              <div className="rule-hdr-name">Warning / missing-data → recommended actions</div>
              <div className="rule-hdr-sub">{WARNING_ACTIONS.length} rules · matched against warning text from the engine</div>
            </div>
            <span className="rule-hdr-tag" style={{ color: "#7a5e10" }}>Warning patterns</span>
          </div>
          <div className="rule-body">
            {WARNING_ACTIONS.map((r, i) => (
              <div key={i} className="action-row">
                <span className="action-trigger">{String(r.match).replace(/^\/|\/i$/g, "")}</span>
                <div className="action-text">{r.action}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Urgency Rubric ─────────────────────────────────────────────── */}
      <section id="urgency" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">Urgency Scoring Rubric</h2>
          <span className="crit-section-meta">{URGENCY_RUBRIC.factors.length} weighted factors · 3-tier triage thresholds</span>
        </div>

        <div className="rule-card">
          <div className="rule-body">
            <div className="rule-sub-section">
              <div className="rule-sub-head">Weighted factors</div>
              <table className="score-table">
                <thead>
                  <tr><th>Clinical factor</th><th style={{ textAlign: "right" }}>Weight</th></tr>
                </thead>
                <tbody>
                  {URGENCY_RUBRIC.factors.map((f, i) => (
                    <tr key={i}>
                      <td>{f.factor}</td>
                      <td className="weight pos">+{f.weight}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rule-sub-section">
              <div className="rule-sub-head">Triage thresholds</div>
              <table className="score-table">
                <thead>
                  <tr><th>Level</th><th>Score</th><th>Recommended timeline</th></tr>
                </thead>
                <tbody>
                  {URGENCY_RUBRIC.thresholds.map((t, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{t.level}</td>
                      <td>{t.score}</td>
                      <td>{t.timeline}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rule-source">
              <span className="rule-source-label">Source:</span>
              <span>{URGENCY_RUBRIC.source}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trial Matching ─────────────────────────────────────────────── */}
      <section id="trials" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">Trial Match Scoring</h2>
          <span className="crit-section-meta">ClinicalTrials.gov v2 · client-side relevance ranking</span>
        </div>

        <div className="rule-card">
          <div className="rule-body">
            {[
              ["Modality matches",   TRIAL_SCORING_RULES.modality],
              ["Target marker matches", TRIAL_SCORING_RULES.targetMarkers],
              ["Setting + phase",    TRIAL_SCORING_RULES.setting],
              ["Penalties (off-topic)", TRIAL_SCORING_RULES.penalties],
            ].map(([title, rows], idx) => (
              <div key={idx} className="rule-sub-section">
                <div className="rule-sub-head">{title}</div>
                <table className="score-table">
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.pattern}{r.note ? <span style={{ color: "#6b645a", fontStyle: "italic" }}> — {r.note}</span> : ""}</td>
                        <td className={`weight ${r.weight < 0 ? "neg" : "pos"}`}>
                          {r.weight > 0 ? "+" : ""}{r.weight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div className="rule-source">
              <span className="rule-source-label">Source:</span>
              <span>{TRIAL_SCORING_RULES.source}</span>
              <a href="https://clinicaltrials.gov/data-api/api" target="_blank" rel="noopener noreferrer">CT.gov API v2 →</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Pricing page ───────────────────────────────────────────────────────────
const TIERS = [
  {
    id: "free",
    tier: "Free",
    name: "Solo Clinician",
    price: "0",
    per: "forever · no card required",
    best: "For individual oncologists & trainees",
    featured: false,
    features: [
      "Unlimited referral analyses",
      "All 12 FDA-approved products (CAR-T + Bispecific)",
      "CAR-T vs Bispecific candidate comparison",
      "Live ClinicalTrials.gov integration",
      "Shareable case URLs",
      "Bridging therapy guidance",
      "PDF referral reports (color + B&W)",
      "Mobile-optimized for phone use",
    ],
    cta: "Start analysis →",
    action: "screener",
  },
  {
    id: "institution",
    tier: "Institution",
    name: "Cancer Center",
    price: "500",
    per: "per month · 14-day free trial",
    best: "For CAR-T programs & tumor boards",
    featured: true,
    features: [
      "Everything in Free",
      "Up to 25 named users",
      "Shared tumor board across team",
      "Tumor board packet PDF exports",
      "Custom institution branding on reports",
      "Cross-device shared case retention",
      "Quarterly criteria update alerts",
      "Priority email support · 1 business day SLA",
    ],
    cta: "Request access →",
    action: "waitlist",
  },
  {
    id: "enterprise",
    tier: "Enterprise",
    name: "Health System",
    price: "2,000",
    per: "per month · annual contract",
    best: "For multi-site networks & systems",
    featured: false,
    features: [
      "Everything in Institution",
      "Unlimited users",
      "SSO (SAML · Okta · Azure AD)",
      "HIPAA Business Associate Agreement",
      "Audit log + compliance reports",
      "Institution-specific criteria overrides",
      "Dedicated account manager",
      "99.9% uptime SLA · white-glove onboarding",
    ],
    cta: "Contact sales →",
    action: "waitlist",
  },
];

const FAQS = [
  {
    q: "Is patient data ever stored on your servers?",
    a: "No. Cases live entirely in your browser (localStorage) and shareable URLs are encoded client-side as base64 in the URL hash. We never see patient data on the Free or Institution tiers. Enterprise customers with a BAA can opt into encrypted server-side sync.",
  },
  {
    q: "Can we try Institution before committing?",
    a: "Yes — every Institution plan comes with a 14-day free trial, no credit card required upfront. You get full access including the shared tumor board, custom branding, and packet exports. Cancel anytime during the trial.",
  },
  {
    q: "How quickly do you add new FDA approvals?",
    a: "Within 30 days of approval. Criteria are reviewed against the published prescribing information and added to all tiers simultaneously. Institution and Enterprise customers receive an email notification with a change summary.",
  },
  {
    q: "Do you offer a HIPAA Business Associate Agreement?",
    a: "Yes, with Enterprise. Because no patient data leaves the browser on Free and Institution tiers, a BAA is technically not required at those levels — but Enterprise customers using server-side sync, SSO, or audit logging receive a signed BAA as standard.",
  },
];

function PricingView({ onBackToScreener, onRequestAccess }) {
  return (
    <div className="pricing-view">
      <div className="pricing-hdr">
        <div className="pricing-tag">Pricing</div>
        <h1 className="pricing-h1">
          Built for <em>oncology teams</em>,<br />priced for institutions
        </h1>
        <p className="pricing-sub">
          Start free for individual referral analysis. Upgrade when your tumor board
          needs shared workflows, custom branding, or institutional security.
        </p>
      </div>

      <div className="pricing-grid">
        {TIERS.map(t => (
          <div key={t.id} className={`pricing-card${t.featured ? " featured" : ""}`}>
            {t.featured && <div className="pricing-badge">Most popular</div>}
            <div className="pricing-tier">{t.tier}</div>
            <div className="pricing-name">{t.name}</div>
            <div className="pricing-price">
              <span className="currency">$</span>{t.price}
            </div>
            <div className="pricing-per">{t.per}</div>
            <div className="pricing-best">{t.best}</div>
            <ul className="pricing-features">
              {t.features.map((f, i) => (
                <li key={i} className="pricing-feature">
                  <CheckCircle size={13} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="pricing-cta"
              onClick={t.action === "screener" ? onBackToScreener : onRequestAccess}
            >
              {t.cta}
            </button>
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <div className="pricing-faq-title">Frequently asked</div>
        {FAQS.map((f, i) => (
          <div key={i} className="faq-item">
            <div className="faq-q">{f.q}</div>
            <div className="faq-a">{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Waitlist modal ─────────────────────────────────────────────────────────
function WaitlistModal({ onClose }) {
  const [form, setForm] = useState({ name: "", email: "", institution: "", role: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = form.name && form.email && form.institution && status === "idle";

  const submit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setStatus("done");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-rule" />
        <button className="modal-close" onClick={onClose}><X size={16} /></button>

        {status === "done" ? (
          <div className="modal-success">
            <div className="modal-success-icon">✓</div>
            <div className="modal-success-title">You're on the list</div>
            <p className="modal-success-text">
              We'll be in touch when institutional access opens.<br />
              In the meantime, the platform is fully free to use.
            </p>
          </div>
        ) : (
          <div className="modal-body">
            <div className="modal-title">Request institutional access</div>
            <p className="modal-sub">
              Cell therapy referral intelligence for cancer centers and oncology practices.
              Includes multi-user accounts, shared tumor board, custom branding on referral reports, and audit-ready exports.
            </p>
            <form onSubmit={submit}>
              <div className="modal-field">
                <label className="modal-lbl">Full name *</label>
                <input className="modal-inp" type="text" placeholder="Dr. Jane Smith"
                  value={form.name} onChange={e => setF("name", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Work email *</label>
                <input className="modal-inp" type="email" placeholder="jsmith@cancercenter.org"
                  value={form.email} onChange={e => setF("email", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Institution *</label>
                <input className="modal-inp" type="text" placeholder="Memorial Sloan Kettering"
                  value={form.institution} onChange={e => setF("institution", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Role</label>
                <input className="modal-inp" type="text" placeholder="Oncologist / Pharmacist / APP"
                  value={form.role} onChange={e => setF("role", e.target.value)} />
              </div>
              {status === "error" && (
                <p style={{ fontSize: 12, color: "#b54a2c", marginBottom: 8 }}>
                  Something went wrong — email sri.ramya003@gmail.com directly.
                </p>
              )}
              <button className="modal-submit" type="submit" disabled={!canSubmit}>
                {status === "sending" ? "Sending…" : "Request access →"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [pt, setPt] = useState(INIT);
  const [results, setResults] = useState(null);
  const [ran, setRan] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [caseLoaded, setCaseLoaded] = useState(false);
  const [viewMode, setViewMode] = useState("all"); // "all" | "cart" | "bispecific"
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return "screener";
    const p = window.location.pathname;
    if (p === "/pricing") return "pricing";
    if (p === "/board") return "board";
    if (p === "/criteria") return "criteria";
    if (p === "/refer") return "refer";
    return "screener";
  }); // "screener" | "board" | "pricing" | "criteria" | "refer"
  const [boardAdded, setBoardAdded] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [formOpen, setFormOpen] = useState(true); // mobile form collapse

  // Usage counter — seeds at 1247, increments with each real screen run
  const [screenCount, setScreenCount] = useState(() => {
    const base = 1247;
    try { return base + parseInt(localStorage.getItem("celltx-run-count") || "0", 10); }
    catch { return base; }
  });

  // Tumor board — persisted to localStorage
  const [board, setBoard] = useState(() => {
    try { return JSON.parse(localStorage.getItem("celltx-board") || "[]"); }
    catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("celltx-board", JSON.stringify(board)); }
    catch { /* storage full — ignore */ }
  }, [board]);

  // Sync view → URL path (preserves hash for shared cases)
  useEffect(() => {
    const target = view === "pricing" ? "/pricing"
      : view === "board" ? "/board"
      : view === "criteria" ? "/criteria"
      : view === "refer" ? "/refer"
      : "/";
    if (window.location.pathname !== target) {
      window.history.pushState({}, "", target + window.location.hash);
    }
  }, [view]);

  // Sync URL → view on back/forward
  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname;
      if (p === "/pricing") setView("pricing");
      else if (p === "/board") setView("board");
      else if (p === "/criteria") setView("criteria");
      else if (p === "/refer") setView("refer");
      else setView("screener");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const { isSignedIn, isLoaded } = useAuth();

  const set = (k, v) => setPt(p => ({ ...p, [k]: v }));
  const tog = k => setPt(p => ({ ...p, [k]: !p[k] }));

  // ── Load case from URL hash on mount ──────────────────────────────────────
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#case=")) {
      const decoded = decodeCase(hash.slice(6));
      if (decoded) {
        const merged = { ...INIT, ...decoded };
        setPt(merged);
        // Compute results immediately with the decoded state
        const res = {};
        ALL_PRODUCTS.forEach(p => { res[p.id] = score(p, merged); });
        setResults(res);
        setRan(true);
        setCaseLoaded(true);
        // Show lab section if any lab values were saved
        if (Object.keys(merged).some(k => k.startsWith("lab") && merged[k] !== "")) {
          setShowLab(true);
        }
      }
    }
  }, []);

  // ── Tumor board helpers ───────────────────────────────────────────────────
  const addToBoard = () => {
    const labels = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P"];
    const patientLabel = `Patient ${labels[board.length] ?? board.length + 1}`;
    const newCase = {
      id: Date.now().toString(),
      addedAt: new Date().toISOString(),
      patientLabel,
      patient: { ...pt },
      results: { ...results },
      status: "pending",
      notes: "",
    };
    setBoard(b => [...b, newCase]);
    setBoardAdded(true);
    setTimeout(() => setBoardAdded(false), 2500);
  };

  const updateBoardCase = (id, patch) =>
    setBoard(b => b.map(c => c.id === id ? { ...c, ...patch } : c));

  const removeBoardCase = (id) =>
    setBoard(b => b.filter(c => c.id !== id));

  const loadBoardCase = (c) => {
    setPt({ ...INIT, ...c.patient });
    const res = {};
    ALL_PRODUCTS.forEach(p => { res[p.id] = score(p, { ...INIT, ...c.patient }); });
    setResults(res);
    setRan(true);
    setView("screener");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const isMM = pt.cancerType.toLowerCase().includes("myeloma");
  const isLymphoma = !isMM && pt.cancerType !== "" && !pt.cancerType.toLowerCase().includes("not in scope");
  const canRun = pt.cancerType && pt.priorLines !== "" && pt.ecog !== "";

  const run = () => {
    const res = {};
    ALL_PRODUCTS.forEach(p => { res[p.id] = score(p, pt); });
    setResults(res);
    setRan(true);
    setViewMode("all");
    setCaseLoaded(false);
    setFormOpen(false); // auto-collapse form on mobile after screening
    // Increment usage counter
    try {
      const prev = parseInt(localStorage.getItem("celltx-run-count") || "0", 10);
      localStorage.setItem("celltx-run-count", String(prev + 1));
      setScreenCount(1247 + prev + 1);
    } catch { /* ignore */ }
    // Write case to URL hash so it's shareable immediately
    const encoded = encodeCase(pt);
    if (encoded) window.history.replaceState(null, "", `#case=${encoded}`);
  };

  const copyShareLink = () => {
    // Make sure hash is up to date
    const encoded = encodeCase(pt);
    if (encoded) window.history.replaceState(null, "", `#case=${encoded}`);
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    }).catch(() => {
      // Fallback for browsers that block clipboard
      prompt("Copy this link to share the case:", url);
    });
  };

  const cartEligible  = results ? PRODUCTS.filter(p => results[p.id]?.eligible).length : 0;
  const bispEligible  = results ? BISPECIFICS.filter(p => results[p.id]?.eligible).length : 0;
  const eligible = cartEligible + bispEligible;

  const displayProducts = viewMode === "cart" ? PRODUCTS
    : viewMode === "bispecific" ? BISPECIFICS
    : ALL_PRODUCTS;

  const sorted = results
    ? [...displayProducts].sort((a, b) => {
        const rank = r => r.blocks.length > 0 ? 2 : r.hasWarning ? 1 : 0;
        return rank(results[a.id]) - rank(results[b.id]);
      })
    : displayProducts;

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-rule" />
        <div className="hdr-inner">
          <div className="brand">
            <div className="brand-glyph"><Dna size={18} strokeWidth={1.4} /></div>
            <div>
              <div className="brand-name">CELLTX MATCH</div>
              <div className="brand-sub">Cell Therapy Referral Intelligence Platform</div>
            </div>
          </div>
          <div className="hdr-meta">
            <div className="hdr-badge">
              <div className="hdr-badge-dot" />
              6 CAR-T · 6 Bispecific
            </div>
            <div className="screen-counter">
              <div className="counter-dot" />
              {screenCount.toLocaleString()} cases analyzed
            </div>
            <nav className="hdr-nav">
              <button
                className={`hdr-nav-btn${view === "refer" ? " active" : ""}`}
                onClick={() => setView("refer")}
                style={{ borderColor: "#b54a2c", color: view === "refer" ? "#f4f1ea" : "#b54a2c", background: view === "refer" ? "#b54a2c" : "transparent" }}
                title="Community-oncology quick decision tool"
              >
                Early Referral
              </button>
              <button
                className={`hdr-nav-btn${view === "screener" ? " active" : ""}`}
                onClick={() => setView("screener")}
              >
                Screener
              </button>
              {isSignedIn && (
                <button
                  className={`hdr-nav-btn${view === "board" ? " active" : ""}`}
                  onClick={() => setView("board")}
                >
                  Tumor Board
                  {board.length > 0 && <span className="hdr-nav-count">({board.length})</span>}
                </button>
              )}
              <button
                className={`hdr-nav-btn${view === "criteria" ? " active" : ""}`}
                onClick={() => setView("criteria")}
              >
                Criteria
              </button>
              <button
                className={`hdr-nav-btn${view === "pricing" ? " active" : ""}`}
                onClick={() => setView("pricing")}
              >
                Pricing
              </button>
            </nav>
            <div className="hdr-auth">
              {isLoaded && (
                isSignedIn
                  ? <UserButton afterSignOutUrl="/" />
                  : <SignInButton mode="modal">
                      <button className="hdr-signin-btn">Sign in</button>
                    </SignInButton>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-tag">Cell Therapy Referral Intelligence · May 2026</div>
        <h1 className="hero-h1">
          Identify <em>cell therapy</em> candidates,<br />ready for tumor board
        </h1>
        <p className="hero-sub">
          Evaluate any patient against all 12 FDA-approved CAR-T and bispecific antibody
          products simultaneously. Generate referral-ready intelligence in seconds — with the
          criteria, recruiting trials, and bridging pathways your tumor board needs.
        </p>
        <div className="hero-pills">
          {ALL_PRODUCTS.map(p => (
            <span key={p.id} className="hero-pill" style={{ borderColor: p.color + "60", color: p.color }}>
              {p.name}
            </span>
          ))}
        </div>
      </section>

      {/* TUMOR BOARD VIEW */}
      {view === "board" && (
        <TumorBoardView
          board={board}
          onUpdateCase={updateBoardCase}
          onRemoveCase={removeBoardCase}
          onLoadCase={loadBoardCase}
          onGoToScreener={() => setView("screener")}
          onExport={() => generateBoardPdf(board)}
        />
      )}

      {/* PRICING VIEW */}
      {view === "pricing" && (
        <PricingView
          onBackToScreener={() => setView("screener")}
          onRequestAccess={() => setShowWaitlist(true)}
        />
      )}

      {/* COMMUNITY EARLY REFERRAL VIEW */}
      {view === "refer" && (
        <CommunityReferralView
          pt={pt}
          setPt={setPt}
          set={set}
          tog={tog}
          onSeeFullAnalysis={() => { run(); setView("screener"); }}
          onLoadIntoScreener={() => setView("screener")}
        />
      )}

      {/* CRITERIA CATALOG VIEW */}
      {view === "criteria" && (
        <CriteriaView
          products={PRODUCTS}
          bispecifics={BISPECIFICS}
          onBackToScreener={() => setView("screener")}
        />
      )}

      {view === "screener" && <>

      {/* CASE LOADED BANNER */}
      {caseLoaded && (
        <div className="case-banner">
          <div className="case-banner-inner">
            <Check size={12} />
            Shared case loaded — review the analysis below. Edit the form and re-run to update.
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="layout">

        {/* FORM */}
        <div className="form-panel">
          <div className="form-title-bar" onClick={() => ran && setFormOpen(o => !o)}>
            <div className="form-title">Patient Profile</div>
            {ran && (
              <span className="form-collapse-toggle">
                {formOpen ? "▲ hide" : "▼ edit"}
              </span>
            )}
          </div>
          <div className={`form-fields-wrap${(!formOpen && ran) ? " collapsed" : ""}`}>

          <div className="field">
            <label className="lbl">Cancer type</label>
            <select className="sel" value={pt.cancerType} onChange={e => set("cancerType", e.target.value)}>
              {CANCER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="lbl">Prior lines of therapy</label>
            <input className="inp" type="number" min="0" max="20" placeholder="e.g. 3"
              value={pt.priorLines} onChange={e => set("priorLines", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl">ECOG performance status</label>
            <RadioGroup value={pt.ecog}
              options={["0","1","2","3","4"].map(v => ({ value: v, label: v }))}
              onChange={v => set("ecog", v)} />
          </div>

          <div className="sec-head">Biomarker expression</div>

          {/* CD19 — CAR-T for B-cell lymphomas */}
          {!isMM && (
            <div className="field">
              <label className="lbl">CD19 status <span style={{ fontSize: 9, color: "#6b645a", fontStyle: "italic" }}>CAR-T</span></label>
              <RadioGroup value={pt.cd19}
                options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
                onChange={v => set("cd19", v)} />
            </div>
          )}

          {/* CD20 — bispecifics for B-cell lymphomas */}
          {isLymphoma && (
            <div className="field">
              <label className="lbl">CD20 status <span style={{ fontSize: 9, color: "#4c6b8c", fontStyle: "italic" }}>Bispecific</span></label>
              <RadioGroup value={pt.cd20}
                options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
                onChange={v => set("cd20", v)} />
            </div>
          )}

          {/* BCMA — CAR-T + bispecifics for MM */}
          {(isMM || !pt.cancerType) && (
            <div className="field">
              <label className="lbl">BCMA status <span style={{ fontSize: 9, color: "#6b645a", fontStyle: "italic" }}>CAR-T + Bispecific</span></label>
              <RadioGroup value={pt.bcma}
                options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
                onChange={v => set("bcma", v)} />
            </div>
          )}

          {/* GPRC5D — talquetamab only */}
          {isMM && (
            <div className="field">
              <label className="lbl">GPRC5D status <span style={{ fontSize: 9, color: "#8a4a7a", fontStyle: "italic" }}>Talvey</span></label>
              <RadioGroup value={pt.gprc5d}
                options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
                onChange={v => set("gprc5d", v)} />
            </div>
          )}

          <div className="sec-head">Clinical flags</div>

          <Checkbox checked={pt.activeCns} onChange={() => tog("activeCns")}
            label="Active CNS disease / CNS lymphoma" />
          <Checkbox checked={pt.activeAutoimmune} onChange={() => tog("activeAutoimmune")}
            label="Active autoimmune disease (systemic treatment)" />
          <Checkbox checked={pt.alloSct} onChange={() => tog("alloSct")}
            label="Prior allogeneic SCT" />
          {pt.alloSct && (
            <div className="field" style={{ paddingLeft: 26, marginTop: 8 }}>
              <label className="lbl">Months since allo-SCT</label>
              <input className="inp" type="number" min="0" placeholder="e.g. 8"
                value={pt.alloSctMonths} onChange={e => set("alloSctMonths", e.target.value)} />
            </div>
          )}

          {isMM && (
            <>
              <div className="sec-head">MM prior therapy (required for BCMA products)</div>
              <Checkbox checked={pt.priorImid} onChange={() => tog("priorImid")}
                label="Prior IMiD (lenalidomide / pomalidomide)" />
              <Checkbox checked={pt.priorPi} onChange={() => tog("priorPi")}
                label="Prior PI (bortezomib / carfilzomib)" />
              <Checkbox checked={pt.priorAntiCd38} onChange={() => tog("priorAntiCd38")}
                label="Prior anti-CD38 (daratumumab)" />
            </>
          )}

          {/* DISEASE ACTIVITY — drives urgency score */}
          <div className="sec-head">Disease activity <span style={{ fontSize: 8.5, color: "#98908380", letterSpacing: "0.1em" }}>· drives urgency</span></div>

          <div className="field">
            <label className="lbl">Disease tempo</label>
            <RadioGroup value={pt.diseaseTempo}
              options={[
                { value: "indolent", label: "Indolent" },
                { value: "stable", label: "Stable" },
                { value: "rapid", label: "Rapid" },
              ]}
              onChange={v => set("diseaseTempo", v)} />
          </div>

          <Checkbox checked={pt.primaryRefractory} onChange={() => tog("primaryRefractory")}
            label="Primary refractory disease (no response to 1L)" />
          {isLymphoma && (
            <>
              <Checkbox checked={pt.bSymptoms} onChange={() => tog("bSymptoms")}
                label="B symptoms (fever, night sweats, weight loss)" />
              <Checkbox checked={pt.elevatedLdh} onChange={() => tog("elevatedLdh")}
                label="Elevated LDH" />
            </>
          )}

          {/* DISEASE-SPECIFIC PATHWAY FACTORS — conditional on cancer type */}
          {(() => {
            const fields = getDiseaseFields(pt.cancerType);
            if (fields.length === 0) return null;
            return (
              <>
                <div className="sec-head">
                  Disease-specific factors
                  <span style={{ fontSize: 8.5, color: "#4c6b8c", letterSpacing: "0.1em", marginLeft: 6 }}>
                    · NCCN-aware
                  </span>
                </div>
                {fields.map(f => (
                  <Checkbox
                    key={f}
                    checked={pt[f]}
                    onChange={() => tog(f)}
                    label={DISEASE_FIELD_LABELS[f]}
                  />
                ))}
              </>
            );
          })()}

          {/* LAB VALUES */}
          <div className="sec-head" style={{ cursor: "pointer", borderTop: "1px solid #1a181818", paddingTop: 14, marginTop: 18 }}
            onClick={() => setShowLab(x => !x)}>
            <div className="lab-toggle">
              <span className="lab-toggle-label">Lab values (optional)</span>
              <span className="lab-toggle-hint">{showLab ? "▲ hide" : "▼ enter"}</span>
            </div>
          </div>
          {showLab && (
            <>
              <div className="lab-grid">
                <div className="lab-field">
                  <label className="lab-lbl">ALT <span className="lab-unit">U/L</span></label>
                  <input className="lab-inp" type="number" min="0" placeholder="e.g. 32"
                    value={pt.labAlt} onChange={e => set("labAlt", e.target.value)} />
                </div>
                <div className="lab-field">
                  <label className="lab-lbl">AST <span className="lab-unit">U/L</span></label>
                  <input className="lab-inp" type="number" min="0" placeholder="e.g. 28"
                    value={pt.labAst} onChange={e => set("labAst", e.target.value)} />
                </div>
                <div className="lab-field">
                  <label className="lab-lbl">Creatinine <span className="lab-unit">mg/dL</span></label>
                  <input className="lab-inp" type="number" min="0" step="0.1" placeholder="e.g. 1.1"
                    value={pt.labCreat} onChange={e => set("labCreat", e.target.value)} />
                </div>
                <div className="lab-field">
                  <label className="lab-lbl">CrCl <span className="lab-unit">mL/min</span></label>
                  <input className="lab-inp" type="number" min="0" placeholder="e.g. 65"
                    value={pt.labCrcl} onChange={e => set("labCrcl", e.target.value)} />
                </div>
                <div className="lab-field">
                  <label className="lab-lbl">Bilirubin <span className="lab-unit">mg/dL</span></label>
                  <input className="lab-inp" type="number" min="0" step="0.1" placeholder="e.g. 0.8"
                    value={pt.labBil} onChange={e => set("labBil", e.target.value)} />
                </div>
                <div className="lab-field">
                  <label className="lab-lbl">LVEF <span className="lab-unit">%</span></label>
                  <input className="lab-inp" type="number" min="0" max="100" placeholder="e.g. 58"
                    value={pt.labLvef} onChange={e => set("labLvef", e.target.value)} />
                </div>
                <div className="lab-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="lab-lbl">SpO₂ <span className="lab-unit">%</span></label>
                  <input className="lab-inp" type="number" min="0" max="100" placeholder="e.g. 96"
                    value={pt.labSpo2} onChange={e => set("labSpo2", e.target.value)} />
                </div>
              </div>
              <p className="lab-note">
                Enter any available values — the engine will auto-flag organ function criteria per product. Leave blank to skip.
              </p>
            </>
          )}

          <button className="run-btn" onClick={run} disabled={!canRun}>
            Run referral analysis →
          </button>
          </div>{/* end form-fields-wrap */}
        </div>

        {/* RESULTS */}
        <div>
          {!ran ? (
            <div className="empty">
              <div className="empty-glyph">⬤</div>
              <p className="empty-text">
                Fill in the patient profile on the left<br />
                and click <strong>Run referral analysis</strong> to identify candidate products.
              </p>
            </div>
          ) : (
            <>
              {/* Urgency banner — drives referral triage */}
              {(() => {
                const urgency = calculateUrgency(pt);
                if (!urgency) return null;
                const IconComp = urgency.level === "high" ? Flame : urgency.level === "medium" ? Clock : Clock;
                return (
                  <div className={`urgency-banner ${urgency.level}`}>
                    <div className="urgency-icon-wrap">
                      <IconComp size={24} strokeWidth={1.8} />
                    </div>
                    <div className="urgency-content">
                      <div className="urgency-level">{urgency.label}</div>
                      <div className="urgency-title">{urgency.sub}</div>
                      {urgency.factors.length > 0 && (
                        <ul className="urgency-factors">
                          {urgency.factors.map((f, i) => <li key={i} className="urgency-factor">{f}</li>)}
                        </ul>
                      )}
                      <div className="urgency-timeline">
                        <span className="urgency-timeline-label">Recommended timeline</span>
                        {urgency.timeline}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Disease pathway intelligence — NCCN-aware */}
              {(() => {
                const pathway = evaluatePathway(pt);
                if (!pathway) return null;
                const hasContent = pathway.nccnContext.length > 0
                  || pathway.productPreferences.length > 0
                  || pathway.caveats.length > 0;
                if (!hasContent) return null;
                return (
                  <div className="pathway-panel">
                    <div className="pathway-hdr">
                      <div className="pathway-icon-bg">
                        <Dna size={16} strokeWidth={1.6} />
                      </div>
                      <div className="pathway-hdr-text">
                        <div className="pathway-hdr-title">{pathway.disease} pathway</div>
                        <div className="pathway-hdr-sub">NCCN-aware · label-aware intelligence</div>
                      </div>
                    </div>
                    <div className="pathway-body">
                      {pathway.nccnContext.length > 0 && (
                        <div className="pathway-section">
                          <div className="pathway-section-head">Clinical context</div>
                          {pathway.nccnContext.map((c, i) => (
                            <div key={i} className="pathway-nccn">{c}</div>
                          ))}
                        </div>
                      )}

                      {pathway.productPreferences.length > 0 && (
                        <div className="pathway-section">
                          <div className="pathway-section-head">Preferred products for this presentation</div>
                          {pathway.productPreferences.map((p, i) => {
                            const prod = ALL_PRODUCTS.find(x => x.id === p.id);
                            return (
                              <div key={i} className="pathway-pref">
                                <span className="pathway-pref-name" style={{ color: prod?.color || "#1a1815" }}>
                                  {prod?.name || p.id}
                                </span>
                                <span>{p.reason}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {pathway.caveats.length > 0 && (
                        <div className="pathway-section">
                          <div className="pathway-section-head">Pathway caveats</div>
                          {pathway.caveats.map((c, i) => (
                            <div key={i} className="pathway-caveat">{c}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Comparison summary */}
              <div className="compare-panel">
                <div className="compare-col">
                  <div className="compare-type">
                    <Dna size={11} /> CAR-T therapy
                  </div>
                  <div className="compare-count">
                    <em>{cartEligible}</em> <span>/ {PRODUCTS.length} eligible</span>
                  </div>
                  <div className="compare-pro">One-time infusion — potentially curative</div>
                  <div className="compare-pro">Deepest, most durable responses</div>
                  <div className="compare-con">4–6 week manufacturing wait</div>
                  <div className="compare-con">Leukapheresis + specialized center required</div>
                </div>
                <div className="compare-vs">vs</div>
                <div className="compare-col">
                  <div className="compare-type">
                    <Zap size={11} /> Bispecific antibody
                  </div>
                  <div className="compare-count">
                    <em>{bispEligible}</em> <span>/ {BISPECIFICS.length} eligible</span>
                  </div>
                  <div className="compare-pro">Off-the-shelf — no manufacturing wait</div>
                  <div className="compare-pro">No leukapheresis · bridge to CAR-T possible</div>
                  <div className="compare-con">Ongoing dosing (not one-time)</div>
                  <div className="compare-con">Step-up hospitalization required</div>
                </div>
              </div>

              {/* Patient-level trial matcher — surfaces recruiting trials when products are ineligible or in addition to them */}
              <TrialMatcher
                pt={pt}
                ineligibleCount={ALL_PRODUCTS.length - eligible}
                totalProducts={ALL_PRODUCTS.length}
              />

              {/* Bridging therapy */}
              <BridgingPanel cancerType={pt.cancerType} />

              {/* Tab bar */}
              <div className="tab-bar">
                <button className={`tab-btn${viewMode === "all" ? " active" : ""}`} onClick={() => setViewMode("all")}>
                  All <span className="tab-count">({eligible}/{ALL_PRODUCTS.length})</span>
                </button>
                <button className={`tab-btn${viewMode === "cart" ? " active" : ""}`} onClick={() => setViewMode("cart")}>
                  CAR-T <span className="tab-count">({cartEligible}/{PRODUCTS.length})</span>
                </button>
                <button className={`tab-btn${viewMode === "bispecific" ? " active" : ""}`} onClick={() => setViewMode("bispecific")}>
                  Bispecific <span className="tab-count">({bispEligible}/{BISPECIFICS.length})</span>
                </button>
              </div>

              <div className="results-hdr">
                <div className="results-title">
                  {viewMode === "cart" ? "CAR-T candidates" : viewMode === "bispecific" ? "Bispecific candidates" : "Referral analysis"}
                </div>
                <div className="results-count">{eligible} of {ALL_PRODUCTS.length} candidate products</div>
              </div>
              {sorted.map(p => (
                <ProductCard key={p.id} product={p} result={results[p.id]} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* PDF EXPORT BAR — shown after screening */}
      {ran && (
        <div className="export-bar">
          {/* Share link button — always visible */}
          <button
            className={`share-btn${shareCopied ? " copied" : ""}`}
            onClick={copyShareLink}
          >
            {shareCopied ? <Check size={13} /> : <Link2 size={13} />}
            {shareCopied ? "Link copied!" : "Copy shareable link"}
          </button>

          {/* Add to tumor board — only when signed in */}
          {isSignedIn && (
            <button
              className={`add-board-btn${boardAdded ? " added" : ""}`}
              onClick={boardAdded ? undefined : addToBoard}
            >
              {boardAdded ? <Check size={13} /> : <BarChart3 size={13} />}
              {boardAdded ? "Added to board!" : "Add to tumor board"}
            </button>
          )}

          {isSignedIn ? (
            <>
              <button
                className="export-btn"
                onClick={() => generatePdf({ patient: pt, results, products: ALL_PRODUCTS })}
              >
                <Download size={13} />
                Export Referral Report (PDF)
              </button>
              <button
                className="export-btn secondary"
                title="Grayscale version for fax/B&W printing"
                onClick={() => generatePdf({ patient: pt, results, products: ALL_PRODUCTS, grayscale: true })}
              >
                <FileText size={13} />
                B&amp;W version
              </button>
            </>
          ) : (
            <>
              <span className="export-signin-hint">Sign in to export referral report</span>
              <SignInButton mode="modal">
                <button className="export-btn secondary">
                  <FileText size={13} />
                  Sign in &amp; Export Report
                </button>
              </SignInButton>
            </>
          )}
        </div>
      )}

      {/* CTA BANNER */}
      <div className="cta-banner">
        <div className="cta-inner">
          <div className="cta-text">
            <div className="cta-title">Bring referral intelligence to your <em>tumor board</em></div>
            <div className="cta-sub">
              Institutional access includes multi-user accounts, shared tumor board packets, custom institution branding, audit-ready reports, and SSO + HIPAA BAA on Enterprise.
            </div>
          </div>
          <button className="cta-btn" onClick={() => setShowWaitlist(true)}>
            Request access →
          </button>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div className="disclaimer">
        <div className="disclaimer-inner">
          <strong>Clinical disclaimer</strong> — This tool is for educational and research purposes only.
          Eligibility must be confirmed against current FDA prescribing information, institutional
          protocols, and individual clinical assessment by a qualified oncologist. Criteria reflect
          approved labeling as of May 2026 and may not capture the most recent updates or off-label use.
        </div>
      </div>

      </>}{/* end screener view */}

      {/* MODALS — available on all views */}
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}
      {showAccuracy && <AccuracyModal onClose={() => setShowAccuracy(false)} />}

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand">CellTx Match</div>
        <div className="footer-links">
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("criteria")}
          >
            Criteria Library →
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setShowAccuracy(true)}
          >
            How accurate is this?
          </button>
          <a href="https://biomarker-database.vercel.app" target="_blank" rel="noopener noreferrer" className="footer-link">
            OncoMarker →
          </a>
          <a href="https://clinicaltrials.gov" target="_blank" rel="noopener noreferrer" className="footer-link">
            ClinicalTrials.gov
          </a>
        </div>
      </footer>
    </div>
  );
}
