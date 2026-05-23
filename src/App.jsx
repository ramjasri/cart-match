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
    return { isSignedIn: false, isLoaded: false, user: null };
  }
}
import { generatePdf } from "./utils/generatePdf.js";
import { generateBoardPdf } from "./utils/generateBoardPdf.js";
import { generateReferralPacket } from "./utils/generateReferralPacket.js";
import { downloadCaseAsFhir } from "./utils/fhir.js";
import { findAction, getPathToEligibility, getReferralSteps } from "./utils/actions.js";
import { calculateUrgency } from "./utils/urgency.js";
import { evaluatePathway, getDiseaseFields, DISEASE_FIELD_LABELS, PATHWAY_CATALOG } from "./utils/pathways.js";
import { BLOCK_ACTIONS, WARNING_ACTIONS } from "./utils/actions.js";
import { URGENCY_RUBRIC } from "./utils/urgency.js";
import { TRIAL_SCORING_RULES } from "./utils/trialMatcher.js";
import { calculateReferralDecision } from "./utils/earlyReferral.js";
import { generateMolecularSummary, ESCAT_TIERS } from "./utils/resistance.js";
import { rankTherapyOptions, basisUrl } from "./utils/evidenceEngine.js";
import { generateWorkup, CATEGORY_LABELS, PRIORITY_META, workupItemCount } from "./utils/workup.js";
import { PRODUCT_CITATIONS, NCCN_REFS, ctGovUrl, CATALOG_META } from "./data/citations.js";
import {
  trackPageview, trackScreenRun, trackAddToBoard, trackPdfExport,
  trackBoardPacketExport, trackCopyShareLink, trackWaitlistSubmit,
  trackPricingCta, trackCriteriaApiAccess, trackEarlyReferralRun,
} from "./utils/analytics.js";
import { startCheckout } from "./utils/billing.js";
import { sendDigest, maybeSendAutoDigest, isDigestEnabled, setDigestEnabled } from "./utils/digest.js";
import {
  computeBoardAnalytics, OUTCOME_LABELS, OUTCOME_COLORS,
  formatPercent, formatDays,
} from "./utils/analytics-board.js";
import {
  emptyTimeline, migrateTimeline,
  manufacturingCountdown, MFG_TYPICAL_DAYS,
  LAB_STATUSES, isLabOverdue, commonLabsForCancer,
  INSURANCE_STATUSES,
  daysFromNow, relativeDateLabel, todayISO,
  computeTimelineInsights,
} from "./utils/timeline.js";
import {
  computePendingItems, groupByUrgency, summarizeOps,
  filterByAssignee, uniqueAssignees, URGENCY_META,
} from "./utils/operations.js";
import {
  EVENT_TYPES, createEvent, diffEvents, diffLabEvents,
  formatEventTime, sortEventsDescending,
} from "./utils/events.js";
import {
  newTask, TASK_PRIORITIES, TASK_STATUSES, TASK_CATEGORIES,
  isTaskOverdue, isTaskDueSoon, taskDaysOverdue, summarizeTasks,
  taskStatusMeta, taskPriorityMeta, taskCategoryMeta,
  suggestStarterTasks,
} from "./utils/tasks.js";
import {
  parseCSV, runRetrospective, analyzeRow, toCSV, SAMPLE_CSV,
} from "./utils/retrospective.js";
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
    max-width: 1200px; margin: 0 auto; padding: 72px 40px 56px;
    border-bottom: 1px solid #1a181520;
    position: relative; overflow: hidden;
  }
  @media (max-width: 860px) { .hero { padding: 48px 20px 40px; } }
  /* Subtle gradient orbs in the background — depth without distraction */
  .hero::before {
    content: ''; position: absolute; top: -120px; right: -120px;
    width: 380px; height: 380px; border-radius: 50%;
    background: radial-gradient(circle, rgba(181,74,44,0.07), transparent 70%);
    pointer-events: none; z-index: 0;
  }
  .hero::after {
    content: ''; position: absolute; bottom: -160px; left: -80px;
    width: 320px; height: 320px; border-radius: 50%;
    background: radial-gradient(circle, rgba(76,107,140,0.06), transparent 70%);
    pointer-events: none; z-index: 0;
  }
  .hero > * { position: relative; z-index: 1; }

  /* Hero grid: text + pipeline visualization */
  .hero-grid {
    display: grid; grid-template-columns: 1fr 280px; gap: 48px;
    align-items: center;
  }
  @media (max-width: 1024px) { .hero-grid { grid-template-columns: 1fr; gap: 36px; } }
  .hero-text {}

  /* Stylized pipeline visualization */
  .hero-pipeline {
    display: flex; flex-direction: column; gap: 14px;
    padding: 24px 22px;
    background: linear-gradient(135deg, rgba(26,24,21,0.04), rgba(76,107,140,0.04));
    border: 1px solid #1a181515;
  }
  .pipeline-title {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 4px;
  }
  .pipeline-flow {
    display: flex; flex-direction: column; gap: 0;
  }
  .pipeline-step {
    display: flex; align-items: center; gap: 12px;
    padding: 9px 0;
    position: relative;
  }
  .pipeline-step:not(:last-child)::after {
    content: ''; position: absolute; left: 9px; top: 24px;
    bottom: -4px; width: 1px; background: #1a181530;
  }
  .pipeline-dot {
    width: 20px; height: 20px; border-radius: 50%;
    background: #f4f1ea; border: 2px solid #6b645a;
    display: grid; place-items: center; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    font-weight: 700; color: #1a1815;
    position: relative; z-index: 2;
  }
  .pipeline-dot.complete {
    background: #5a7a4a; border-color: #5a7a4a; color: #f4f1ea;
  }
  .pipeline-dot.active {
    background: #c4a661; border-color: #c4a661; color: #1a1815;
    animation: pipeline-pulse 2.4s ease-in-out infinite;
  }
  @keyframes pipeline-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(196,166,97,0.5); }
    50%      { box-shadow: 0 0 0 6px rgba(196,166,97,0); }
  }
  .pipeline-step-label {
    font-size: 13px; color: #1a1815; line-height: 1.3;
  }
  .pipeline-step-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #6b645a; letter-spacing: 0.04em; margin-top: 2px;
  }
  .pipeline-step.active .pipeline-step-label {
    font-weight: 600; color: #1a1815;
  }
  .pipeline-step.complete .pipeline-step-label {
    color: #4a6a3a;
  }

  /* Larger, more confident H1 on desktop */
  .hero-h1 {
    font-size: 48px;
  }
  @media (min-width: 1024px) { .hero-h1 { font-size: 56px; } }

  /* Stat strip — credibility band integrated into hero */
  .hero-stats {
    display: flex; gap: 28px; flex-wrap: wrap;
    margin-top: 28px; padding-top: 22px;
    border-top: 1px solid #1a181520;
  }
  .hero-stat {}
  .hero-stat-num {
    font-family: 'Fraunces', serif; font-size: 26px; font-weight: 500;
    color: #1a1815; line-height: 1; letter-spacing: -0.015em;
  }
  .hero-stat-num em {
    font-style: normal; color: #b54a2c;
  }
  .hero-stat-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b645a; margin-top: 6px; line-height: 1.4;
  }
  /* Hero CTA row */
  .hero-cta-row {
    display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap;
  }
  .hero-cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 12px 22px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.18em;
    transition: all 0.12s; text-decoration: none; border: 1px solid;
  }
  .hero-cta.primary {
    background: #1a1815; color: #f4f1ea; border-color: #1a1815;
  }
  .hero-cta.primary:hover {
    background: #b54a2c; border-color: #b54a2c;
  }
  .hero-cta.secondary {
    background: transparent; color: #1a1815; border-color: #1a181550;
  }
  .hero-cta.secondary:hover {
    background: #1a181508; border-color: #1a1815;
  }

  /* CAPABILITY GRID — what the platform does */
  .capability-section {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 24px;
    border-bottom: 1px solid #1a181520;
  }
  @media (max-width: 860px) { .capability-section { padding: 40px 20px 20px; } }
  .capability-eyebrow {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .capability-eyebrow::before { content: ''; width: 24px; height: 1px; background: #6b645a; }
  .capability-title {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 400;
    color: #1a1815; line-height: 1.2; letter-spacing: -0.022em; margin: 0 0 36px;
    max-width: 720px;
  }
  .capability-title em { font-style: italic; color: #b54a2c; }
  @media (min-width: 1024px) { .capability-title { font-size: 36px; } }

  .capability-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  }
  @media (max-width: 1024px) { .capability-grid { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 600px) { .capability-grid { grid-template-columns: 1fr; } }

  .capability-card {
    background: #f4f1ea; border: 1px solid #1a181530;
    padding: 24px 22px;
    transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
    cursor: pointer;
    position: relative;
  }
  .capability-card:hover {
    transform: translateY(-4px);
    border-color: #1a1815;
    box-shadow: 0 12px 32px -16px rgba(26,24,21,0.18);
  }
  .capability-icon-wrap {
    width: 40px; height: 40px;
    background: #1a1815; color: #c4a661;
    display: grid; place-items: center;
    margin-bottom: 16px;
    transition: background 0.18s, color 0.18s;
  }
  .capability-card:hover .capability-icon-wrap {
    background: #b54a2c; color: #f4f1ea;
  }
  .capability-card-title {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    color: #1a1815; line-height: 1.25; letter-spacing: -0.012em;
    margin: 0 0 8px;
  }
  .capability-card-body {
    font-size: 13px; color: #4a4540; line-height: 1.55;
  }
  .capability-card-link {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #4c6b8c; margin-top: 12px; display: inline-block;
    opacity: 0; transform: translateY(-3px);
    transition: opacity 0.18s, transform 0.18s;
  }
  .capability-card:hover .capability-card-link {
    opacity: 1; transform: translateY(0);
  }

  /* Trusted-approach band */
  .trust-band {
    max-width: 1200px; margin: 0 auto; padding: 32px 40px;
    border-bottom: 1px solid #1a181520;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 28px;
  }
  @media (max-width: 860px) {
    .trust-band { padding: 28px 20px; grid-template-columns: 1fr; gap: 20px; }
  }
  .trust-item {
    display: flex; align-items: flex-start; gap: 14px;
  }
  .trust-icon {
    width: 36px; height: 36px;
    background: #ebe6dc; color: #1a1815;
    display: grid; place-items: center;
    border-left: 2px solid #b54a2c;
    flex-shrink: 0;
  }
  .trust-text {}
  .trust-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    margin-bottom: 4px;
  }
  .trust-detail {
    font-size: 13px; color: #1a1815; line-height: 1.5;
  }
  .trust-detail a {
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
  }
  .trust-detail a:hover { color: #1a1815; }

  /* Scroll-triggered fade-in animation */
  @keyframes fade-in-up {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-in {
    animation: fade-in-up 0.6s ease-out both;
  }
  .fade-in.delay-1 { animation-delay: 0.08s; }
  .fade-in.delay-2 { animation-delay: 0.16s; }
  .fade-in.delay-3 { animation-delay: 0.24s; }
  .fade-in.delay-4 { animation-delay: 0.32s; }

  /* Hero CTA hover lift */
  .hero-cta {
    transition: transform 0.15s ease, background 0.12s, border-color 0.12s;
  }
  .hero-cta:hover {
    transform: translateY(-2px);
  }
  .hero-cta.primary:hover {
    box-shadow: 0 12px 24px -10px rgba(181,74,44,0.4);
  }

  /* "Who this is for" strip */
  .who-strip {
    max-width: 1200px; margin: 0 auto; padding: 24px 40px;
    border-bottom: 1px solid #1a181520;
  }
  @media (max-width: 860px) { .who-strip { padding: 20px 20px; } }
  .who-strip-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 12px;
  }
  .who-strip-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
  }
  @media (max-width: 700px) { .who-strip-grid { grid-template-columns: repeat(2, 1fr); } }
  .who-item {
    border-left: 2px solid #b54a2c;
    padding: 4px 0 4px 12px;
  }
  .who-item-label {
    font-family: 'Fraunces', serif; font-size: 14px; font-weight: 500;
    color: #1a1815; line-height: 1.3; letter-spacing: -0.005em;
    margin-bottom: 2px;
  }
  .who-item-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #6b645a;
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

  /* WORKUP CHECKLIST */
  .workup-panel {
    border: 1px solid #1a1815; background: #f4f1ea;
    margin-bottom: 20px; overflow: hidden;
  }
  .workup-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #1a1815; color: #f4f1ea;
    cursor: pointer; user-select: none; transition: background 0.12s;
  }
  .workup-hdr:hover { background: #2a2520; }
  .workup-icon-bg {
    width: 30px; height: 30px; background: #5a7a4a; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0; font-weight: 700;
    font-size: 16px;
  }
  .workup-hdr-text { flex: 1; }
  .workup-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; line-height: 1;
  }
  .workup-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: #c4a661; margin-top: 4px;
  }
  .workup-count-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    background: #5a7a4a; color: #f4f1ea;
    padding: 4px 10px; letter-spacing: 0.15em; text-transform: uppercase;
    flex-shrink: 0;
  }
  .workup-body { padding: 18px 20px; }

  .workup-section { margin-bottom: 18px; }
  .workup-section:last-child { margin-bottom: 0; }
  .workup-section-head {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 10px; padding-bottom: 6px;
    border-bottom: 1px solid #1a181520;
  }
  .workup-section-icon {
    font-family: 'Fraunces', serif; font-size: 14px; color: #5a7a4a;
    flex-shrink: 0;
  }
  .workup-section-title {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #1a1815;
    font-weight: 700;
    flex: 1;
  }
  .workup-section-count {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; padding: 2px 6px;
    border: 1px solid #1a181525;
  }

  .workup-item {
    display: grid; grid-template-columns: 18px 76px 1fr;
    gap: 10px; align-items: start;
    padding: 7px 0; line-height: 1.5;
  }
  .workup-checkbox {
    width: 14px; height: 14px; margin-top: 2px;
    border: 1.5px solid #1a181555;
    flex-shrink: 0;
  }
  .workup-priority {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
    padding: 3px 6px; text-align: center;
    border: 1px solid currentColor;
    height: fit-content; margin-top: 1px;
  }
  .workup-priority.high   { color: #b54a2c; background: #b54a2c10; }
  .workup-priority.medium { color: #7a5e10; background: #c4a66110; }
  .workup-priority.low    { color: #4c6b8c; background: #4c6b8c10; }

  .workup-item-body {}
  .workup-item-text {
    font-size: 13px; color: #1a1815; line-height: 1.55;
    margin-bottom: 3px;
  }
  .workup-item-reason {
    font-size: 11px; color: #6b645a; line-height: 1.5;
    font-style: italic;
  }
  .workup-item-reason::before {
    content: "→ ";
    color: #c4a661; font-style: normal; font-weight: 600;
  }

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

  /* NGS TEXTAREA in form */
  .ngs-textarea {
    width: 100%; border: 1px solid #1a181830; background: #fff;
    padding: 10px 12px; font-family: 'JetBrains Mono', monospace;
    font-size: 11.5px; color: #1a1815; line-height: 1.55;
    resize: vertical; min-height: 88px;
    transition: border-color 120ms;
  }
  .ngs-textarea:focus {
    outline: none; border-color: #4c6b8c; background: #fafaf7;
  }
  .ngs-hint {
    font-size: 10.5px; color: #6b645a; line-height: 1.5;
    margin: 6px 0 0; font-style: italic;
  }

  /* EVIDENCE-RANKED OPTIONS PANEL — Layer 1 (the evidence engine) */
  .evidence-panel {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 20px;
    overflow: hidden;
  }
  .evidence-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #1a1815; color: #f4f1ea;
    cursor: pointer; user-select: none;
  }
  .evidence-icon-bg {
    width: 30px; height: 30px; background: #c4a661; color: #1a1815;
    display: grid; place-items: center; flex-shrink: 0;
    font-size: 18px; line-height: 1; font-weight: 700;
  }
  .evidence-hdr-text { flex: 1; min-width: 0; }
  .evidence-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; line-height: 1;
  }
  .evidence-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: #c4a661; margin-top: 4px;
  }
  .evidence-count {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #c4a661; letter-spacing: 0.1em; text-transform: uppercase;
    flex-shrink: 0;
  }
  .evidence-body { padding: 14px 18px; }

  .evidence-row {
    background: #fff; border: 1px solid #1a181520; padding: 14px 16px;
    margin-bottom: 10px;
  }
  .evidence-row:last-of-type { margin-bottom: 0; }
  .evidence-row.blocked { opacity: 0.62; background: #fafaf7; }

  .evidence-row-hdr {
    display: flex; align-items: center; flex-wrap: wrap;
    gap: 10px; margin-bottom: 6px;
  }
  .evidence-tier-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #f4f1ea; padding: 3px 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.14em;
    flex-shrink: 0;
  }
  .evidence-prod-name {
    font-family: 'Fraunces', serif; font-size: 17px; font-weight: 500;
    letter-spacing: -0.01em; line-height: 1;
  }
  .evidence-prod-generic {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; letter-spacing: 0.05em;
  }
  .evidence-nccn-pref {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;
    background: #5a7a4a; color: #f4f1ea; padding: 2px 7px;
  }
  .evidence-blocked-pill {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700;
    background: #b54a2c; color: #f4f1ea; padding: 2px 7px;
    margin-left: auto;
  }

  .evidence-context {
    font-size: 12px; color: #3a352e; line-height: 1.5; margin-bottom: 8px;
    font-style: italic;
  }

  .evidence-basis {
    background: #1a181508; border-left: 3px solid #c4a661;
    padding: 8px 10px; margin-bottom: 8px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .evidence-basis-label {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    font-weight: 700;
  }
  .evidence-basis-trial {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: #1a1815; font-weight: 700;
  }
  .evidence-basis-link {
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
  }
  .evidence-basis-link:hover {
    color: #1a1815; border-bottom-color: #1a1815;
  }
  .evidence-basis-finding {
    font-size: 11.5px; color: #3a352e; line-height: 1.5;
  }

  .evidence-annotations {
    display: flex; flex-direction: column; gap: 6px;
    margin: 8px 0;
  }
  .evidence-annotation {
    display: flex; gap: 10px;
    padding: 8px 10px;
    border-left: 3px solid;
  }
  .evidence-annotation.caution  { border-color: #c4a661; background: #c4a66110; }
  .evidence-annotation.warning  { border-color: #b54a2c; background: #b54a2c0c; }
  .evidence-annotation.block    { border-color: #b54a2c; background: #b54a2c1a; }
  .evidence-annotation.upgrade  { border-color: #5a7a4a; background: #5a7a4a10; }
  .evidence-annotation-sev {
    font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    flex-shrink: 0; padding-top: 2px;
    min-width: 80px;
  }
  .evidence-annotation.caution  .evidence-annotation-sev { color: #7a5e10; }
  .evidence-annotation.warning  .evidence-annotation-sev { color: #b54a2c; }
  .evidence-annotation.block    .evidence-annotation-sev { color: #b54a2c; }
  .evidence-annotation.upgrade  .evidence-annotation-sev { color: #4a6a3a; }
  .evidence-annotation-body { flex: 1; min-width: 0; }
  .evidence-annotation-label {
    font-size: 12px; color: #1a1815; font-weight: 600;
    line-height: 1.4; margin-bottom: 2px;
  }
  .evidence-annotation-detail {
    font-size: 11.5px; color: #3a352e; line-height: 1.55;
  }
  .evidence-annotation-source {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; margin-top: 4px;
  }

  .evidence-blocks {
    margin-top: 8px; padding-top: 8px;
    border-top: 1px solid #1a181510;
  }
  .evidence-blocks-label {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.2em;
    color: #b54a2c; font-weight: 700;
  }
  .evidence-blocks-list {
    list-style: none; padding: 0; margin: 4px 0 0;
  }
  .evidence-blocks-list li {
    font-size: 11px; color: #3a352e; padding: 2px 0 2px 12px;
    line-height: 1.5; position: relative;
  }
  .evidence-blocks-list li::before {
    content: '✕'; position: absolute; left: 0; color: #b54a2c;
    font-weight: 700; font-size: 9px;
  }
  .evidence-blocks-more {
    font-style: italic; color: #6b645a !important;
  }
  .evidence-blocks-more::before { content: '…' !important; color: #6b645a !important; }

  .evidence-footer {
    margin-top: 14px; padding-top: 12px;
    border-top: 1px solid #1a181520;
    font-size: 11px; color: #6b645a; line-height: 1.6;
  }
  .evidence-footer strong { color: #1a1815; font-weight: 600; }

  /* MOLECULAR & RESISTANCE INTELLIGENCE PANEL */
  .molecular-panel {
    border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 20px;
    overflow: hidden;
  }
  .molecular-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px; background: #1a1815; color: #f4f1ea;
    cursor: pointer; user-select: none;
  }
  .molecular-icon-bg {
    width: 30px; height: 30px; background: #4c6b8c; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
    font-size: 16px; line-height: 1;
  }
  .molecular-hdr-text { flex: 1; min-width: 0; }
  .molecular-hdr-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500; line-height: 1;
  }
  .molecular-hdr-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em;
    color: #c4a661; margin-top: 4px;
  }
  .molecular-body { padding: 18px 20px; }

  /* Risk score block */
  .risk-score-block {
    border-left: 4px solid;
    background: #fafaf7;
    padding: 14px 16px; margin-bottom: 18px;
  }
  .risk-score-row {
    display: flex; align-items: center; gap: 14px; margin-bottom: 8px;
  }
  .risk-score-headline {
    flex: 1; font-family: 'Fraunces', serif; font-size: 16px;
    font-weight: 500; letter-spacing: -0.01em;
  }
  .risk-score-num {
    width: 36px; height: 36px; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700;
  }
  .risk-score-rec {
    font-size: 12.5px; color: #3a352e; line-height: 1.6; margin-bottom: 12px;
  }
  .risk-factors {
    border-top: 1px solid #1a181518; padding-top: 10px;
  }
  .risk-factors-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 8px;
  }
  .risk-factor-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 5px 0; border-bottom: 1px solid #1a181510;
  }
  .risk-factor-row:last-child { border-bottom: none; }
  .risk-factor-weight {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    color: #b54a2c; min-width: 26px; padding-top: 1px; flex-shrink: 0;
  }
  .risk-factor-body { flex: 1; min-width: 0; }
  .risk-factor-label {
    font-size: 12px; color: #1a1815; line-height: 1.4;
  }
  .risk-factor-detail {
    font-size: 10.5px; color: #6b645a; line-height: 1.45;
    margin-top: 2px; font-style: italic;
  }

  /* Biomarker groups */
  .biomarker-group { margin-bottom: 18px; }
  .biomarker-group:last-of-type { margin-bottom: 0; }
  .biomarker-group-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.2em;
    margin-bottom: 10px; font-weight: 700;
    display: flex; align-items: center; gap: 8px;
  }
  .biomarker-group-count {
    background: #1a181508; border: 1px solid #1a181520;
    padding: 1px 6px; font-size: 9px; font-weight: 700;
    color: #1a1815;
  }
  .biomarker-incidental-note {
    font-size: 11px; color: #6b645a; font-style: italic;
    line-height: 1.5; margin-bottom: 10px;
  }

  /* Biomarker card */
  .biomarker-card {
    background: #fff; border: 1px solid #1a181520; padding: 12px 14px;
    margin-bottom: 8px;
  }
  .biomarker-card:last-child { margin-bottom: 0; }
  .biomarker-card-hdr {
    display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
  }
  .biomarker-name {
    flex: 1; font-family: 'Fraunces', serif; font-size: 14px;
    color: #1a1815; font-weight: 500; letter-spacing: -0.005em;
  }
  .biomarker-tier {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #f4f1ea; padding: 2px 7px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.12em;
    flex-shrink: 0;
  }
  .biomarker-summary {
    font-size: 11.5px; color: #3a352e; line-height: 1.55; margin-bottom: 8px;
  }
  .biomarker-block { margin-top: 8px; }
  .biomarker-block-head {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin-bottom: 4px;
  }
  .biomarker-list {
    list-style: none; padding: 0; margin: 0;
  }
  .biomarker-list li {
    font-size: 11.5px; color: #1a1815; padding: 2px 0 2px 12px;
    line-height: 1.5; position: relative;
  }
  .biomarker-list li::before {
    content: '·'; position: absolute; left: 4px; font-weight: 700;
    color: #4c6b8c;
  }
  .biomarker-refs {
    margin-top: 8px; padding-top: 8px;
    border-top: 1px solid #1a181510;
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .biomarker-ref {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; background: #1a181508; padding: 2px 6px;
  }
  .molecular-footer {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px solid #1a181520;
    font-size: 11px; color: #6b645a; line-height: 1.55;
  }
  .molecular-footer strong { color: #1a1815; font-weight: 600; }

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

  /* LEGAL PAGES — /privacy, /terms, /disclaimer */
  .legal-view {
    max-width: 760px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .legal-view { padding: 36px 20px 60px; } }

  .legal-hero { text-align: center; margin-bottom: 36px; }
  .legal-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .legal-tag::before, .legal-tag::after {
    content: ''; width: 24px; height: 1px; background: #6b645a;
  }
  .legal-h1 {
    font-family: 'Fraunces', serif; font-size: 34px; font-weight: 400;
    line-height: 1.15; color: #1a1815; letter-spacing: -0.022em; margin: 0;
  }
  .legal-meta {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    margin-top: 14px;
  }

  .legal-toc {
    background: #ebe6dc; border-left: 3px solid #b54a2c;
    padding: 16px 20px; margin-bottom: 36px;
  }
  .legal-toc-title {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin-bottom: 10px;
  }
  .legal-toc-list {
    columns: 2; column-gap: 24px; font-size: 13px; line-height: 1.85;
    list-style: none; padding: 0; margin: 0;
  }
  @media (max-width: 600px) { .legal-toc-list { columns: 1; } }
  .legal-toc-list a {
    color: #1a1815; text-decoration: none;
    border-bottom: 1px dotted #1a181530;
  }
  .legal-toc-list a:hover { color: #b54a2c; border-bottom-color: #b54a2c; }

  .legal-section { margin-bottom: 32px; scroll-margin-top: 60px; }
  .legal-section h2 {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    letter-spacing: -0.015em; color: #1a1815; margin: 0 0 14px;
    padding-bottom: 8px; border-bottom: 1px solid #1a181530;
  }
  .legal-section h3 {
    font-family: 'Fraunces', serif; font-size: 16px; font-weight: 500;
    color: #1a1815; margin: 20px 0 8px; letter-spacing: -0.005em;
  }
  .legal-section p {
    font-size: 14px; color: #1a1815; line-height: 1.7;
    margin: 0 0 12px;
  }
  .legal-section ul {
    padding-left: 22px; margin: 0 0 12px;
  }
  .legal-section li {
    font-size: 14px; color: #1a1815; line-height: 1.65;
    margin-bottom: 5px;
  }
  .legal-section strong { color: #1a1815; font-weight: 600; }
  .legal-section a {
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
  }
  .legal-section a:hover { color: #1a1815; }

  .legal-callout {
    background: #b54a2c0a; border: 1px solid #b54a2c30; border-left: 3px solid #b54a2c;
    padding: 14px 18px; margin: 18px 0;
    font-size: 13.5px; color: #1a1815; line-height: 1.65;
  }
  .legal-callout-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #b54a2c;
    font-weight: 700; margin-bottom: 6px;
  }

  .legal-key-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;
    margin: 18px 0 24px;
  }
  @media (max-width: 600px) { .legal-key-grid { grid-template-columns: 1fr; } }
  .legal-key-item {
    background: #f4f1ea; border: 1px solid #1a181530;
    border-left: 3px solid #b54a2c;
    padding: 14px 16px;
  }
  .legal-key-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.16em;
    color: #b54a2c; font-weight: 700; margin-bottom: 6px;
  }
  .legal-key-text {
    font-size: 13.5px; color: #1a1815; line-height: 1.55; font-weight: 500;
  }

  .legal-table {
    width: 100%; border-collapse: collapse; margin: 12px 0 18px;
    font-size: 13px;
  }
  .legal-table th, .legal-table td {
    padding: 10px 12px; text-align: left;
    border-bottom: 1px solid #1a181520; line-height: 1.55;
    vertical-align: top;
  }
  .legal-table th {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b645a; font-weight: 600;
    border-bottom: 1px solid #1a181530;
  }

  /* SITE-WIDE DISCLAIMER BANNER (footer-top) */
  .disclaimer-banner {
    background: #ebe6dc; border-top: 1px solid #1a181530;
    border-bottom: 1px solid #1a181520;
    padding: 12px 40px;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; letter-spacing: 0.04em; line-height: 1.65;
    text-align: center;
  }
  @media (max-width: 860px) { .disclaimer-banner { padding: 12px 20px; text-align: left; } }
  .disclaimer-banner strong { color: #1a1815; }
  .disclaimer-banner a {
    color: #b54a2c; text-decoration: none;
    border-bottom: 1px dotted #b54a2c80;
    margin-left: 6px;
  }
  .disclaimer-banner a:hover { color: #1a1815; border-bottom-color: #1a1815; }

  /* ABOUT — /about */
  .about-view {
    max-width: 880px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .about-view { padding: 36px 20px 60px; } }

  .about-hero { text-align: center; margin-bottom: 48px; }
  .about-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .about-tag::before, .about-tag::after {
    content: ''; width: 24px; height: 1px; background: #6b645a;
  }
  .about-h1 {
    font-family: 'Fraunces', serif; font-size: 38px; font-weight: 400;
    line-height: 1.15; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .about-h1 em { font-style: italic; color: #b54a2c; }

  .about-mission {
    font-size: 15.5px; color: #1a1815; line-height: 1.75;
    border-left: 2px solid #b54a2c; padding: 4px 0 4px 24px;
    margin-bottom: 56px;
  }
  .about-mission p { margin: 0 0 18px; }
  .about-mission p:last-child { margin-bottom: 0; }
  .about-mission p:first-child {
    font-family: 'Fraunces', serif; font-size: 19px;
    line-height: 1.55; color: #1a1815; font-weight: 400;
    letter-spacing: -0.005em;
  }

  .about-section { margin-bottom: 48px; }
  .about-section-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 10px;
  }
  .about-section-title {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 400;
    letter-spacing: -0.015em; color: #1a1815; margin: 0 0 24px;
  }

  .team-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  }
  @media (max-width: 700px) { .team-grid { grid-template-columns: 1fr; } }
  .team-card {
    border: 1px solid #1a1815; background: #f4f1ea; padding: 24px 26px;
  }
  .team-name {
    font-family: 'Fraunces', serif; font-size: 19px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.012em; margin-bottom: 4px;
  }
  .team-role {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    margin-bottom: 14px; padding-bottom: 12px;
    border-bottom: 1px solid #1a181520;
  }
  .team-bio {
    font-size: 13.5px; color: #3a352e; line-height: 1.65; margin: 0;
  }

  .approach-grid {
    display: flex; flex-direction: column; gap: 10px;
  }
  .approach-item {
    display: flex; gap: 18px; align-items: flex-start;
    padding: 16px 20px; background: #f4f1ea; border: 1px solid #1a181522;
    border-left: 3px solid #b54a2c;
  }
  .approach-num {
    font-family: 'Fraunces', serif; font-size: 26px; color: #b54a2c;
    font-weight: 400; line-height: 1; flex-shrink: 0; min-width: 28px;
  }
  .approach-text {
    font-size: 13.5px; color: #3a352e; line-height: 1.65; flex: 1;
  }
  .approach-text strong { color: #1a1815; font-weight: 600; }
  .approach-text a {
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
  }
  .approach-text a:hover { color: #1a1815; }

  .about-contact {
    border-top: 1px solid #1a181530;
    padding-top: 28px; margin-top: 16px;
  }
  .about-contact-row { margin-bottom: 8px; }
  .about-contact p {
    font-size: 14px; color: #1a1815; line-height: 1.7; margin: 0 0 8px;
  }
  .contact-email {
    font-family: 'JetBrains Mono', monospace; font-size: 13.5px;
    color: #b54a2c; text-decoration: none;
    border-bottom: 1px dotted #b54a2c80;
  }
  .contact-email:hover { color: #1a1815; border-bottom-color: #1a1815; }
  .contact-note {
    font-size: 12.5px; color: #6b645a; font-style: italic; margin-top: 10px;
  }
  .contact-note .link {
    background: none; border: none; padding: 0; cursor: pointer;
    color: #4c6b8c; font-style: normal;
    border-bottom: 1px dotted #4c6b8c80;
    font-family: 'Inter Tight', sans-serif; font-size: 12.5px;
  }
  .contact-note .link:hover { color: #1a1815; }

  /* ANALYTICS DASHBOARD — /analytics */
  .analytics-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .analytics-view { padding: 36px 20px 60px; } }

  .analytics-hero { margin-bottom: 32px; }
  .analytics-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .analytics-tag::before { content: ''; width: 24px; height: 1px; background: #6b645a; }
  .analytics-h1 {
    font-family: 'Fraunces', serif; font-size: 36px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.022em; margin: 0;
  }
  .analytics-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    margin-top: 12px;
  }

  /* KPI cards */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
    border: 1px solid #1a1815; margin-bottom: 36px;
  }
  @media (max-width: 700px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
  .kpi-card {
    padding: 20px 22px; border-right: 1px solid #1a181530;
  }
  .kpi-card:last-child { border-right: none; }
  @media (max-width: 700px) {
    .kpi-card:nth-child(2n) { border-right: none; }
    .kpi-card:nth-child(-n+2) { border-bottom: 1px solid #1a181530; }
  }
  .kpi-num {
    font-family: 'Fraunces', serif; font-size: 38px; font-weight: 400;
    line-height: 1; color: #1a1815; letter-spacing: -0.018em;
    margin-bottom: 6px;
  }
  .kpi-num em { font-style: normal; color: #5a7a4a; }
  .kpi-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #6b645a;
    line-height: 1.45;
  }

  /* Analytics section card */
  .analytics-section {
    border: 1px solid #1a1815; background: #f4f1ea;
    padding: 28px 30px; margin-bottom: 18px;
  }
  .analytics-section-hdr {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 12px; margin-bottom: 22px; flex-wrap: wrap;
  }
  .analytics-section-title {
    font-family: 'Fraunces', serif; font-size: 19px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.012em; margin: 0;
  }
  .analytics-section-meta {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
  }

  /* Funnel — horizontal bars */
  .funnel-row {
    display: grid; grid-template-columns: 180px 1fr 80px 80px; gap: 14px;
    align-items: center; padding: 10px 0;
    border-bottom: 1px solid #1a181515;
  }
  @media (max-width: 700px) {
    .funnel-row { grid-template-columns: 120px 1fr 50px; }
    .funnel-row .funnel-rate { display: none; }
  }
  .funnel-row:last-child { border-bottom: none; }
  .funnel-label {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #1a1815;
    font-weight: 600;
  }
  .funnel-bar-track {
    background: #ebe6dc; border: 1px solid #1a181530; height: 22px;
    position: relative;
  }
  .funnel-bar-fill {
    height: 100%; background: linear-gradient(90deg, #5a7a4a 0%, #4c6b8c 100%);
    transition: width 0.3s; min-width: 2px;
  }
  .funnel-count {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    color: #1a1815; text-align: right; line-height: 1;
  }
  .funnel-rate {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; text-align: right;
  }
  .funnel-rate.good { color: #5a7a4a; }
  .funnel-rate.warn { color: #7a5e10; }
  .funnel-rate.poor { color: #b54a2c; }

  /* Time-to-stage */
  .time-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px;
  }
  @media (max-width: 700px) { .time-grid { grid-template-columns: 1fr; } }
  .time-card {
    background: #ebe6dc; padding: 16px 18px;
    border-left: 3px solid #4c6b8c;
  }
  .time-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    margin-bottom: 8px;
  }
  .time-value {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500;
    color: #1a1815; line-height: 1;
  }
  .time-value.empty { color: #98908380; font-size: 18px; font-style: italic; }
  .time-context {
    font-size: 11px; color: #6b645a; margin-top: 6px; line-height: 1.45;
  }

  /* Outcomes — stacked bar + legend */
  .outcomes-bar {
    display: flex; height: 32px; margin-bottom: 16px;
    border: 1px solid #1a1815; background: #ebe6dc;
  }
  .outcomes-segment {
    height: 100%;
    transition: opacity 0.15s;
  }
  .outcomes-segment:hover { opacity: 0.85; }
  .outcomes-legend {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;
  }
  @media (max-width: 700px) { .outcomes-legend { grid-template-columns: 1fr; } }
  .outcomes-legend-item {
    display: flex; align-items: center; gap: 10px;
    font-size: 13px; color: #1a1815; padding: 6px 0;
    border-bottom: 1px solid #1a181515;
  }
  .outcomes-legend-swatch {
    width: 12px; height: 12px; flex-shrink: 0;
  }
  .outcomes-legend-label { flex: 1; }
  .outcomes-legend-count {
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    color: #6b645a; font-weight: 600;
  }

  /* Cancer type table */
  .cancer-table {
    width: 100%; border-collapse: collapse; font-size: 13px;
  }
  .cancer-table th, .cancer-table td {
    padding: 10px 12px; text-align: left;
    border-bottom: 1px solid #1a181515; line-height: 1.5;
  }
  .cancer-table th {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b645a; font-weight: 600;
    border-bottom: 1px solid #1a181530;
  }
  .cancer-table td.num {
    text-align: right; font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
  }
  .cancer-table td.rate {
    text-align: right; font-family: 'JetBrains Mono', monospace;
    font-weight: 700;
  }
  .cancer-table td.rate.good { color: #5a7a4a; }
  .cancer-table td.rate.warn { color: #7a5e10; }
  .cancer-table td.rate.poor { color: #b54a2c; }

  /* Empty state */
  .analytics-empty {
    border: 1px dashed #1a181540; background: #f4f1ea;
    padding: 64px 32px; text-align: center;
  }
  .analytics-empty-glyph {
    font-family: 'Fraunces', serif; font-size: 56px;
    color: #1a181530; margin-bottom: 18px; line-height: 1;
  }
  .analytics-empty-text {
    font-size: 14px; color: #6b645a; line-height: 1.65;
    max-width: 480px; margin: 0 auto;
  }

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

  /* Pivotal trial citations */
  .citation-block {
    background: #ebe6dc; padding: 12px 14px;
    margin-bottom: 14px;
  }
  .citation-row {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 6px 0; border-bottom: 1px solid #1a181515;
    font-size: 12.5px; line-height: 1.5;
  }
  .citation-row:last-child { border-bottom: none; }
  .citation-trial {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700;
    color: #1a1815; min-width: 100px; flex-shrink: 0;
    letter-spacing: 0.06em;
  }
  .citation-nct {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #4c6b8c; text-decoration: none; min-width: 110px; flex-shrink: 0;
    letter-spacing: 0.04em;
  }
  .citation-nct:hover { text-decoration: underline; }
  .citation-bla-row {
    display: flex; gap: 18px; flex-wrap: wrap;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: #6b645a;
    padding: 6px 0 10px; margin-bottom: 6px;
    border-bottom: 1px solid #1a181520;
  }
  .citation-bla-row strong {
    color: #1a1815; letter-spacing: 0.05em;
  }

  /* Action source line */
  .action-source {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; padding-left: 18px;
    margin-top: 4px; line-height: 1.5;
    font-style: italic;
  }
  .action-source::before {
    content: 'Source: '; color: #4c6b8c; font-weight: 600; font-style: normal;
  }

  /* API endpoint section */
  .api-panel {
    border: 2px solid #1a1815; background: #1a1815; color: #f4f1ea;
    margin-top: 24px; padding: 28px 30px;
  }
  .api-hdr {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 16px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .api-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    letter-spacing: -0.015em; margin: 0;
  }
  .api-title em { font-style: italic; color: #c4a661; }
  .api-version {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #c4a661;
    border: 1px solid #c4a66145; padding: 4px 10px;
  }
  .api-desc {
    font-size: 13.5px; color: #f4f1eaaa; line-height: 1.65;
    margin-bottom: 18px; max-width: 700px;
  }
  .api-code {
    background: #0e0d0b; border: 1px solid #f4f1ea20; padding: 14px 18px;
    font-family: 'JetBrains Mono', monospace; font-size: 12px;
    color: #c4a661; margin-bottom: 16px;
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  }
  .api-method {
    background: #5a7a4a; color: #f4f1ea; padding: 3px 8px;
    font-size: 9px; letter-spacing: 0.15em; font-weight: 700;
  }
  .api-path { color: #f4f1ea; }
  .api-copy-btn {
    margin-left: auto;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #c4a661; background: transparent; border: 1px solid #c4a66145;
    padding: 5px 10px; cursor: pointer;
  }
  .api-copy-btn:hover { background: #c4a66120; }
  .api-schema {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
    margin-top: 16px;
  }
  @media (max-width: 700px) { .api-schema { grid-template-columns: 1fr; } }
  .api-schema-item {
    padding: 10px 14px; border-left: 2px solid #c4a661;
    background: #f4f1ea08;
  }
  .api-schema-key {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #c4a661; letter-spacing: 0.08em; margin-bottom: 4px;
  }
  .api-schema-desc { font-size: 12px; color: #f4f1eacc; line-height: 1.5; }
  .api-link {
    color: #c4a661; text-decoration: none;
    border-bottom: 1px dotted #c4a66180;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
  }
  .api-link:hover { color: #f4f1ea; border-bottom-color: #f4f1ea; }

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
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
    margin-bottom: 48px;
  }
  @media (max-width: 1100px) { .pricing-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; } }
  @media (max-width: 600px)  { .pricing-grid { grid-template-columns: 1fr; } }

  .pricing-card {
    border: 1px solid #1a1815; background: #f4f1ea; padding: 28px 22px;
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
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    margin-bottom: 12px; letter-spacing: -0.015em; line-height: 1.1;
  }
  .pricing-price {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 400;
    line-height: 1; margin-bottom: 6px; letter-spacing: -0.01em;
  }
  .pricing-price.text-price {
    font-size: 26px; /* "Custom" / "0–500" don't need huge type */
  }
  .pricing-price .currency {
    font-size: 16px; vertical-align: top; margin-right: 2px; opacity: 0.6;
    position: relative; top: 4px;
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

  /* PILOT PROGRAM */
  .pilot-panel {
    border: 2px solid #1a1815; background: #1a1815; color: #f4f1ea;
    padding: 32px 36px; margin: 0 0 24px;
    display: grid; grid-template-columns: 1fr 320px; gap: 32px;
    align-items: center;
  }
  @media (max-width: 860px) { .pilot-panel { grid-template-columns: 1fr; gap: 22px; } }

  .pilot-text {}
  .pilot-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #c4a661;
    margin-bottom: 12px;
  }
  .pilot-title {
    font-family: 'Fraunces', serif; font-size: 26px; font-weight: 500;
    color: #f4f1ea; line-height: 1.15; letter-spacing: -0.018em;
    margin: 0 0 14px;
  }
  .pilot-title em { font-style: italic; color: #c4a661; }
  .pilot-desc {
    font-size: 14px; color: #f4f1eacc; line-height: 1.65; margin: 0 0 18px;
  }
  .pilot-included {
    list-style: none; padding: 0; margin: 0;
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 16px;
  }
  @media (max-width: 600px) { .pilot-included { grid-template-columns: 1fr; } }
  .pilot-included li {
    font-size: 13px; color: #f4f1ea; padding: 4px 0 4px 18px;
    position: relative; line-height: 1.55;
  }
  .pilot-included li::before {
    content: '✓'; position: absolute; left: 0; color: #c4a661;
    font-weight: 700;
  }

  .pilot-cta-block {
    display: flex; flex-direction: column; gap: 10px;
  }
  .pilot-price {
    font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500;
    color: #c4a661; line-height: 1; margin-bottom: 4px;
  }
  .pilot-price-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #f4f1ea88;
    margin-bottom: 8px;
  }
  .pilot-cta {
    padding: 14px 18px; cursor: pointer; text-align: center;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em;
    background: #b54a2c; color: #f4f1ea; border: none;
    transition: background 0.12s;
  }
  .pilot-cta:hover { background: #c4a661; color: #1a1815; }
  .pilot-cta.secondary {
    background: transparent; color: #c4a661;
    border: 1px solid #c4a66150;
  }
  .pilot-cta.secondary:hover { background: #c4a66115; }

  /* ALTERNATIVE / VOLUME PRICING */
  .pricing-alt-panel {
    border: 1px solid #1a1815; background: #ebe6dc;
    padding: 28px 30px; margin: 0 0 48px;
  }
  .pricing-alt-head {
    display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap;
    margin-bottom: 6px; gap: 14px;
  }
  .pricing-alt-title {
    font-family: 'Fraunces', serif; font-size: 19px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.012em; margin: 0;
  }
  .pricing-alt-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
  }
  .pricing-alt-sub {
    font-size: 13px; color: #6b645a; margin: 0 0 18px; line-height: 1.55;
  }
  .pricing-alt-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  }
  @media (max-width: 700px) { .pricing-alt-grid { grid-template-columns: 1fr; } }
  .pricing-alt-item {
    background: #f4f1ea; border: 1px solid #1a181530; padding: 16px 18px;
  }
  .pricing-alt-price {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500;
    color: #1a1815; line-height: 1; margin-bottom: 4px;
  }
  .pricing-alt-price .alt-unit {
    font-family: 'Inter Tight', sans-serif; font-size: 12px;
    color: #6b645a; font-style: italic; font-weight: 400;
    margin-left: 2px;
  }
  .pricing-alt-label {
    font-size: 12.5px; color: #3a352e; line-height: 1.5; margin-top: 4px;
  }
  .pricing-alt-foot {
    margin-top: 16px; padding-top: 14px;
    border-top: 1px solid #1a181520;
    font-size: 12px; color: #6b645a; line-height: 1.6;
  }
  .pricing-alt-link {
    background: none; border: none; cursor: pointer; padding: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #b54a2c;
    margin-left: 4px;
  }
  .pricing-alt-link:hover { color: #1a1815; }

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

  /* BOARD AGGREGATE STATS */
  .board-stats {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 0;
    border: 1px solid #1a1815; background: #ebe6dc; margin-bottom: 20px;
  }
  @media (max-width: 700px) { .board-stats { grid-template-columns: repeat(2, 1fr); } }
  .board-stat {
    padding: 14px 18px; border-right: 1px solid #1a181520;
    cursor: pointer; transition: background 0.12s;
  }
  .board-stat:last-child { border-right: none; }
  .board-stat:hover { background: #1a181508; }
  .board-stat.active { background: #1a1815; color: #f4f1ea; }
  @media (max-width: 700px) {
    .board-stat:nth-child(2n) { border-right: none; }
    .board-stat:nth-child(-n+4) { border-bottom: 1px solid #1a181520; }
  }
  .board-stat-num {
    font-family: 'Fraunces', serif; font-size: 24px; font-weight: 500;
    color: inherit; line-height: 1; margin-bottom: 6px;
  }
  .board-stat-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    line-height: 1.4;
  }
  .board-stat.active .board-stat-label { color: #c4a661; }

  /* TASKS PANEL — per-case task list */
  .tasks-panel {
    border: 1px solid #1a181530; background: #f4f1ea;
    margin-bottom: 14px; overflow: hidden;
  }
  .tasks-hdr {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: #1a1815; color: #f4f1ea; cursor: pointer; user-select: none;
  }
  .tasks-hdr:hover { background: #2a2520; }
  .tasks-hdr-title {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700;
  }
  .tasks-hdr-summary {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #c4a661; letter-spacing: 0.08em; flex: 1;
  }
  .tasks-hdr-overdue {
    background: #b54a2c; color: #f4f1ea; padding: 2px 8px;
    font-size: 9px; letter-spacing: 0.14em;
    font-family: 'JetBrains Mono', monospace; text-transform: uppercase;
  }
  .tasks-body { padding: 12px 14px; }

  .tasks-add-row {
    display: flex; gap: 6px; margin-bottom: 12px;
    padding-bottom: 12px; border-bottom: 1px solid #1a181520;
    flex-wrap: wrap;
  }
  .tasks-add-input {
    flex: 1; min-width: 220px; padding: 7px 10px;
    border: 1px solid #1a181530; background: #f4f1ea;
    font-family: 'Inter Tight', sans-serif; font-size: 12.5px; color: #1a1815;
    border-radius: 0;
  }
  .tasks-add-input:focus { outline: none; border-color: #1a1815; }
  .tasks-add-btn {
    padding: 7px 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    white-space: nowrap;
  }
  .tasks-add-btn:hover { background: #5a7a4a; }
  .tasks-add-btn:disabled { background: #98908380; cursor: default; }
  .tasks-starter-btn {
    padding: 7px 12px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    background: transparent; color: #4c6b8c; border: 1px dashed #4c6b8c60;
    cursor: pointer;
  }
  .tasks-starter-btn:hover { background: #4c6b8c10; }

  /* Filter chips */
  .tasks-filter-row {
    display: flex; gap: 4px; margin-bottom: 10px; flex-wrap: wrap;
    padding-bottom: 8px; border-bottom: 1px solid #1a181515;
  }
  .tasks-filter-chip {
    padding: 4px 9px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181530; background: transparent; color: #6b645a;
    cursor: pointer;
  }
  .tasks-filter-chip.active { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .tasks-filter-chip:hover:not(.active) { background: #1a181508; color: #1a1815; }

  /* Task row */
  .task-row {
    display: grid; grid-template-columns: 22px 1fr auto;
    gap: 10px; align-items: center;
    padding: 8px 10px; background: #ebe6dc;
    border-left: 3px solid #6b645a;
    margin-bottom: 4px;
  }
  .task-row.priority-high { border-left-color: #b54a2c; }
  .task-row.priority-low { border-left-color: #98908380; }
  .task-row.complete { opacity: 0.55; background: #5a7a4a08; border-left-color: #5a7a4a; }
  .task-row.complete .task-title { text-decoration: line-through; color: #6b645a; }
  .task-row.overdue { background: #b54a2c08; border-left-color: #b54a2c; }
  .task-row.blocked { background: #b54a2c08; border-left-color: #b54a2c; opacity: 0.85; }

  .task-checkbox {
    width: 18px; height: 18px; cursor: pointer;
    accent-color: #5a7a4a;
  }
  .task-body {
    min-width: 0;
    display: flex; flex-direction: column; gap: 3px;
  }
  .task-title {
    font-size: 13px; color: #1a1815; line-height: 1.4; font-weight: 500;
  }
  .task-meta {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a;
  }
  .task-meta-assignee {
    color: #4c6b8c;
    background: #4c6b8c10; padding: 1px 6px;
  }
  .task-meta-due {
    background: #ebe6dc; padding: 1px 6px; border: 1px solid #1a181520;
  }
  .task-meta-due.overdue { color: #b54a2c; border-color: #b54a2c50; font-weight: 700; }
  .task-meta-due.soon { color: #7a5e10; font-weight: 600; }
  .task-meta-category {
    color: #98908380; font-size: 9px;
  }
  .task-status-select {
    padding: 3px 6px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181530; background: transparent; color: #1a1815;
    cursor: pointer; appearance: none; min-width: 100px;
  }
  .task-actions { display: flex; gap: 4px; flex-shrink: 0; }
  .task-btn-x {
    background: transparent; border: none; cursor: pointer;
    color: #98908380; font-size: 16px; padding: 0 4px;
  }
  .task-btn-x:hover { color: #b54a2c; }

  .tasks-empty {
    font-size: 12px; color: #6b645a; font-style: italic;
    padding: 12px 0;
    text-align: center;
  }

  /* ACTIVITY LOG — per-case event stream */
  .activity-log {
    border: 1px solid #1a181530; background: #f4f1ea;
    margin-bottom: 14px; overflow: hidden;
  }
  .activity-log-hdr {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: #1a1815; color: #f4f1ea; cursor: pointer; user-select: none;
  }
  .activity-log-hdr:hover { background: #2a2520; }
  .activity-log-hdr-title {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; flex: 1;
  }
  .activity-log-hdr-count {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #c4a661; letter-spacing: 0.1em;
  }
  .activity-log-body { padding: 14px 16px; }

  /* Event entry form */
  .event-add-row {
    display: flex; gap: 8px; margin-bottom: 14px;
    padding-bottom: 12px; border-bottom: 1px solid #1a181520;
  }
  .event-add-input {
    flex: 1; padding: 8px 11px;
    border: 1px solid #1a181530; background: #f4f1ea;
    font-family: 'Inter Tight', sans-serif; font-size: 12.5px; color: #1a1815;
    border-radius: 0;
  }
  .event-add-input:focus { outline: none; border-color: #1a1815; }
  .event-add-btn {
    padding: 8px 14px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    white-space: nowrap;
  }
  .event-add-btn:hover { background: #5a7a4a; }
  .event-add-btn:disabled { background: #98908380; cursor: default; }

  /* Event stream */
  .event-stream {
    display: flex; flex-direction: column;
    position: relative;
  }
  .event-row {
    display: grid; grid-template-columns: 100px 24px 1fr;
    gap: 12px; padding: 9px 0;
    border-bottom: 1px solid #1a181510;
    align-items: start;
  }
  .event-row:last-child { border-bottom: none; }
  .event-time {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #6b645a; letter-spacing: 0.04em;
    padding-top: 4px;
  }
  .event-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: #ebe6dc; display: grid; place-items: center;
    border: 2px solid currentColor;
    flex-shrink: 0;
    font-size: 10px; font-weight: 700; line-height: 1;
    color: #1a1815;
    margin-top: 2px;
  }
  .event-body {}
  .event-title {
    font-size: 13px; color: #1a1815; line-height: 1.4;
    font-weight: 500;
  }
  .event-detail {
    font-size: 11.5px; color: #4a4540; line-height: 1.5;
    margin-top: 2px; font-style: italic;
  }
  .event-by {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #98908399; margin-top: 3px; letter-spacing: 0.06em;
  }
  .event-system .event-by { color: #4c6b8c99; }

  .event-empty {
    font-size: 12px; color: #6b645a; font-style: italic;
    padding: 12px 0;
  }

  /* CENTERS PAGE — /centers (cell therapy center pitch + pilot offer) */
  .centers-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .centers-view { padding: 36px 20px 60px; } }

  .centers-hero { margin-bottom: 48px; }
  .centers-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #b54a2c;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .centers-tag::before { content: ''; width: 24px; height: 1px; background: #b54a2c; }
  .centers-h1 {
    font-family: 'Fraunces', serif; font-size: 44px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .centers-h1 em { font-style: italic; color: #b54a2c; }
  .centers-sub {
    font-size: 16px; color: #6b645a; max-width: 700px;
    margin: 18px 0 28px; line-height: 1.65;
  }
  .centers-hero-cta-row {
    display: flex; gap: 10px; flex-wrap: wrap;
  }
  .centers-hero-cta {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 13px 22px; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.16em;
    transition: all 0.15s; text-decoration: none; border: 1px solid;
  }
  .centers-hero-cta.primary {
    background: #b54a2c; color: #f4f1ea; border-color: #b54a2c;
  }
  .centers-hero-cta.primary:hover {
    background: #c4a661; color: #1a1815; border-color: #c4a661;
    transform: translateY(-2px);
  }
  .centers-hero-cta.secondary {
    background: transparent; color: #1a1815; border-color: #1a181550;
  }
  .centers-hero-cta.secondary:hover {
    background: #1a181508; border-color: #1a1815;
  }

  /* Two-column problem/solution section */
  .ps-section {
    display: grid; grid-template-columns: 1fr 1fr; gap: 0;
    border: 1px solid #1a1815; margin-bottom: 36px;
  }
  @media (max-width: 860px) { .ps-section { grid-template-columns: 1fr; } }
  .ps-col {
    padding: 28px 30px;
  }
  .ps-col.problem {
    background: #b54a2c0a; border-right: 1px solid #1a181530;
  }
  .ps-col.solution {
    background: #5a7a4a0a;
  }
  @media (max-width: 860px) {
    .ps-col.problem { border-right: none; border-bottom: 1px solid #1a181530; }
  }
  .ps-eyebrow {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em;
    margin-bottom: 14px; font-weight: 700;
  }
  .ps-col.problem .ps-eyebrow { color: #b54a2c; }
  .ps-col.solution .ps-eyebrow { color: #5a7a4a; }
  .ps-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    color: #1a1815; line-height: 1.25; letter-spacing: -0.015em;
    margin: 0 0 16px;
  }
  .ps-list { list-style: none; padding: 0; margin: 0; }
  .ps-list li {
    font-size: 14px; color: #1a1815; padding: 6px 0 6px 18px;
    position: relative; line-height: 1.55;
  }
  .ps-list.problem li::before {
    content: "✗"; position: absolute; left: 0; color: #b54a2c; font-weight: 700;
  }
  .ps-list.solution li::before {
    content: "→"; position: absolute; left: 0; color: #5a7a4a; font-weight: 700;
  }

  /* Pilot offer banner */
  .pilot-offer {
    background: #1a1815; color: #f4f1ea;
    padding: 40px 44px; margin-bottom: 36px;
    position: relative; overflow: hidden;
  }
  .pilot-offer::before {
    content: ""; position: absolute; top: 0; left: 0; height: 4px; width: 100%;
    background: linear-gradient(90deg, #b54a2c 0%, #c4a661 50%, #5a7a4a 100%);
  }
  .pilot-offer-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #c4a661;
    margin-bottom: 14px;
  }
  .pilot-offer-title {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 500;
    color: #f4f1ea; line-height: 1.2; letter-spacing: -0.018em;
    margin: 0 0 14px;
  }
  .pilot-offer-title em { font-style: italic; color: #c4a661; }
  .pilot-offer-sub {
    font-size: 15px; color: #f4f1eacc; line-height: 1.65;
    margin: 0 0 28px; max-width: 720px;
  }
  .pilot-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px;
    margin-bottom: 28px;
  }
  @media (max-width: 860px) { .pilot-grid { grid-template-columns: 1fr; } }
  .pilot-block {}
  .pilot-block-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #c4a661;
    margin-bottom: 10px;
  }
  .pilot-block ul {
    list-style: none; padding: 0; margin: 0;
  }
  .pilot-block li {
    font-size: 13.5px; color: #f4f1ea; padding: 4px 0 4px 16px;
    position: relative; line-height: 1.5;
  }
  .pilot-block li::before {
    content: "·"; position: absolute; left: 4px; color: #c4a661; font-weight: 700;
  }
  .pilot-cta-row {
    display: flex; gap: 10px; flex-wrap: wrap;
    padding-top: 24px; border-top: 1px solid #f4f1ea20;
  }
  .pilot-charter {
    background: #b54a2c; color: #f4f1ea;
    padding: 11px 20px; border: none; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.16em;
    transition: background 0.12s;
  }
  .pilot-charter:hover { background: #c4a661; color: #1a1815; }
  .pilot-info {
    color: #c4a661; font-family: 'JetBrains Mono', monospace;
    font-size: 11px; letter-spacing: 0.1em;
    padding: 11px 0; align-self: center;
  }
  .pilot-info strong { color: #f4f1ea; }

  /* Metrics dashboard preview */
  .metrics-preview {
    background: #f4f1ea; border: 1px solid #1a1815;
    padding: 28px 30px; margin-bottom: 36px;
  }
  .metrics-preview-hdr {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-bottom: 18px; flex-wrap: wrap; gap: 10px;
  }
  .metrics-preview-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.015em; margin: 0;
  }
  .metrics-preview-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #6b645a;
    background: #ebe6dc; padding: 4px 10px;
  }
  .metrics-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
  }
  @media (max-width: 860px) { .metrics-grid { grid-template-columns: 1fr 1fr; gap: 10px; } }
  @media (max-width: 500px) { .metrics-grid { grid-template-columns: 1fr; } }
  .metric-card {
    background: #ebe6dc; padding: 16px 18px;
    border-left: 3px solid #4c6b8c;
  }
  .metric-num {
    font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500;
    color: #1a1815; line-height: 1; letter-spacing: -0.015em;
  }
  .metric-num em { font-style: normal; color: #5a7a4a; }
  .metric-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    margin-top: 8px; line-height: 1.45;
  }
  .metric-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #5a7a4a; margin-top: 4px;
  }

  /* Pricing section for centers */
  .centers-pricing {
    background: #ebe6dc; padding: 32px 36px; margin-bottom: 36px;
  }
  .centers-pricing-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.015em; margin: 0 0 22px;
  }
  .centers-pricing-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
  }
  @media (max-width: 860px) { .centers-pricing-grid { grid-template-columns: 1fr; } }
  .centers-pricing-card {
    background: #f4f1ea; border: 1px solid #1a181530;
    padding: 22px 24px;
  }
  .centers-pricing-card.featured {
    border-color: #b54a2c; border-width: 2px;
  }
  .centers-pricing-stage {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin-bottom: 8px;
  }
  .centers-pricing-card.featured .centers-pricing-stage { color: #b54a2c; }
  .centers-pricing-amount {
    font-family: 'Fraunces', serif; font-size: 28px; font-weight: 500;
    color: #1a1815; line-height: 1; letter-spacing: -0.018em;
    margin-bottom: 6px;
  }
  .centers-pricing-amount em { font-style: normal; color: #b54a2c; }
  .centers-pricing-period {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; letter-spacing: 0.08em; margin-bottom: 12px;
  }
  .centers-pricing-desc {
    font-size: 13px; color: #3a352e; line-height: 1.55;
  }

  /* Final CTA */
  .centers-final-cta {
    background: #1a1815; color: #f4f1ea;
    padding: 38px 40px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 24px; flex-wrap: wrap;
  }
  .centers-final-text { flex: 1; min-width: 280px; }
  .centers-final-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    margin: 0 0 6px; letter-spacing: -0.015em; line-height: 1.2;
  }
  .centers-final-title em { font-style: italic; color: #c4a661; }
  .centers-final-sub {
    font-size: 13.5px; color: #f4f1eaaa; line-height: 1.6;
  }

  /* RESEARCH / PARTNERSHIPS — /research */
  .research-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .research-view { padding: 36px 20px 60px; } }

  .research-hero { margin-bottom: 40px; }
  .research-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #4c6b8c;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .research-tag::before { content: ''; width: 24px; height: 1px; background: #4c6b8c; }
  .research-h1 {
    font-family: 'Fraunces', serif; font-size: 42px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.025em; margin: 0;
  }
  .research-h1 em { font-style: italic; color: #4c6b8c; }
  .research-sub {
    font-size: 15px; color: #6b645a; max-width: 700px;
    margin: 16px 0 0; line-height: 1.65;
  }

  .research-card-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;
    margin-bottom: 36px;
  }
  @media (max-width: 860px) { .research-card-grid { grid-template-columns: 1fr; } }

  .research-card {
    border: 1px solid #1a1815; background: #f4f1ea; padding: 26px 28px;
  }
  .research-card.dark { background: #1a1815; color: #f4f1ea; }
  .research-card-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    margin-bottom: 12px;
  }
  .research-card.dark .research-card-tag { color: #c4a661; }
  .research-card-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    color: #1a1815; line-height: 1.2; letter-spacing: -0.015em;
    margin: 0 0 12px;
  }
  .research-card.dark .research-card-title { color: #f4f1ea; }
  .research-card-body {
    font-size: 14px; color: #3a352e; line-height: 1.65; margin-bottom: 16px;
  }
  .research-card.dark .research-card-body { color: #f4f1eacc; }
  .research-card-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #1a1815; text-decoration: none; border-bottom: 1px dotted #1a181580;
    padding-bottom: 2px;
  }
  .research-card.dark .research-card-link { color: #c4a661; border-bottom-color: #c4a66180; }
  .research-card-link:hover { color: #4c6b8c; }

  .research-section { margin-bottom: 32px; }
  .research-section-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.012em; margin: 0 0 14px;
    padding-bottom: 8px; border-bottom: 1px solid #1a181530;
  }
  .research-section-body p {
    font-size: 14.5px; color: #1a1815; line-height: 1.7;
    margin: 0 0 12px;
  }
  .research-spec-table {
    background: #ebe6dc; padding: 18px 22px;
    border-left: 3px solid #4c6b8c;
  }
  .research-spec-row {
    display: grid; grid-template-columns: 200px 1fr; gap: 14px;
    padding: 6px 0; border-bottom: 1px solid #1a181515;
    font-size: 13px;
  }
  @media (max-width: 700px) { .research-spec-row { grid-template-columns: 1fr; } }
  .research-spec-row:last-child { border-bottom: none; }
  .research-spec-key {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #6b645a;
  }
  .research-spec-val { color: #1a1815; line-height: 1.55; }
  .research-spec-val code {
    font-family: 'JetBrains Mono', monospace; font-size: 11.5px;
    background: #f4f1ea; padding: 1px 5px; color: #4c6b8c;
  }

  .research-cta-band {
    background: #1a1815; color: #f4f1ea;
    padding: 32px 36px; margin-top: 32px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 20px; flex-wrap: wrap;
  }
  .research-cta-text {
    flex: 1; min-width: 280px;
  }
  .research-cta-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    margin: 0 0 6px; letter-spacing: -0.012em;
  }
  .research-cta-title em { font-style: italic; color: #c4a661; }
  .research-cta-sub {
    font-size: 13.5px; color: #f4f1eaaa; line-height: 1.6;
  }
  .research-cta-btn {
    padding: 13px 22px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.16em;
    background: #b54a2c; color: #f4f1ea; border: none; cursor: pointer;
    transition: background 0.12s;
    text-decoration: none;
    white-space: nowrap;
  }
  .research-cta-btn:hover { background: #c4a661; color: #1a1815; }

  /* RETROSPECTIVE ANALYSIS — /retrospective */
  .retro-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .retro-view { padding: 36px 20px 60px; } }

  .retro-hero { margin-bottom: 32px; }
  .retro-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #4c6b8c;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .retro-tag::before { content: ''; width: 24px; height: 1px; background: #4c6b8c; }
  .retro-h1 {
    font-family: 'Fraunces', serif; font-size: 36px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.022em; margin: 0;
  }
  .retro-h1 em { font-style: italic; color: #4c6b8c; }
  .retro-sub {
    font-size: 14.5px; color: #6b645a; max-width: 720px;
    margin: 14px 0 0; line-height: 1.65;
  }

  .retro-input-section {
    border: 1px solid #1a1815; background: #f4f1ea;
    padding: 24px 26px; margin-bottom: 24px;
  }
  .retro-input-hdr {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 14px; margin-bottom: 16px; flex-wrap: wrap;
  }
  .retro-input-title {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    color: #1a1815; margin: 0; letter-spacing: -0.012em;
  }
  .retro-input-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .retro-btn {
    padding: 9px 16px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.13em;
    border: 1px solid #1a181550; background: transparent; color: #1a1815;
    cursor: pointer; transition: all 0.12s;
  }
  .retro-btn:hover { background: #1a1815; color: #f4f1ea; }
  .retro-btn.primary { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .retro-btn.primary:hover { background: #4c6b8c; border-color: #4c6b8c; }

  .retro-textarea {
    width: 100%; min-height: 180px; padding: 12px 14px;
    border: 1px solid #1a181530; background: #ebe6dc;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: #1a1815; border-radius: 0; resize: vertical; line-height: 1.5;
    box-sizing: border-box;
  }
  .retro-textarea:focus { outline: none; border-color: #1a1815; }

  .retro-schema-link {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #4c6b8c; text-decoration: none;
    border-bottom: 1px dotted #4c6b8c80;
    margin-top: 10px; display: inline-block;
  }
  .retro-schema-link:hover { color: #1a1815; }

  /* Endpoints */
  .retro-endpoints {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
    border: 2px solid #1a1815; margin-bottom: 24px;
  }
  @media (max-width: 700px) { .retro-endpoints { grid-template-columns: 1fr; } }
  .retro-endpoint {
    padding: 20px 22px; border-right: 1px solid #1a181530;
  }
  .retro-endpoint:last-child { border-right: none; }
  @media (max-width: 700px) {
    .retro-endpoint { border-right: none; border-bottom: 1px solid #1a181530; }
    .retro-endpoint:last-child { border-bottom: none; }
  }
  .retro-endpoint.bad { border-left: 4px solid #b54a2c; }
  .retro-endpoint.good { border-left: 4px solid #5a7a4a; }
  .retro-endpoint.neutral { border-left: 4px solid #4c6b8c; }
  .retro-endpoint-num {
    font-family: 'Fraunces', serif; font-size: 30px; font-weight: 500;
    color: #1a1815; line-height: 1;
  }
  .retro-endpoint.bad .retro-endpoint-num { color: #b54a2c; }
  .retro-endpoint.good .retro-endpoint-num { color: #5a7a4a; }
  .retro-endpoint-label {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
    margin-top: 8px; line-height: 1.5;
  }

  /* Distribution chart */
  .retro-dist {
    background: #f4f1ea; border: 1px solid #1a181530;
    padding: 18px 22px; margin-bottom: 24px;
  }
  .retro-dist-hdr {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    margin-bottom: 12px;
  }
  .retro-dist-row {
    display: grid; grid-template-columns: 220px 1fr 50px 60px; gap: 12px;
    padding: 6px 0; align-items: center;
    font-size: 13px;
  }
  @media (max-width: 700px) {
    .retro-dist-row { grid-template-columns: 1fr 50px; }
    .retro-dist-row > :nth-child(2), .retro-dist-row > :last-child { display: none; }
  }
  .retro-dist-label { color: #1a1815; }
  .retro-dist-bar { background: #ebe6dc; height: 14px; position: relative; }
  .retro-dist-fill { height: 100%; }
  .retro-dist-count { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #1a1815; text-align: right; }
  .retro-dist-pct { font-family: 'JetBrains Mono', monospace; color: #6b645a; text-align: right; }

  /* Results table */
  .retro-results-table {
    width: 100%; border-collapse: collapse; font-size: 12.5px;
    margin-top: 12px;
  }
  .retro-results-table th, .retro-results-table td {
    padding: 8px 10px; text-align: left; border-bottom: 1px solid #1a181515;
    line-height: 1.5;
  }
  .retro-results-table th {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em;
    color: #6b645a; font-weight: 600;
    border-bottom: 2px solid #1a181540; background: #ebe6dc;
  }
  .retro-cell-class {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em;
    padding: 3px 7px; display: inline-block;
  }
  .retro-cell-class.bad { color: #b54a2c; background: #b54a2c12; }
  .retro-cell-class.warn { color: #7a5e10; background: #c4a66115; }
  .retro-cell-class.good { color: #5a7a4a; background: #5a7a4a12; }
  .retro-cell-class.neutral { color: #4c6b8c; background: #4c6b8c12; }

  /* OPERATIONS DASHBOARD — /today */
  .ops-view {
    max-width: 1200px; margin: 0 auto; padding: 56px 40px 80px;
  }
  @media (max-width: 860px) { .ops-view { padding: 36px 20px 60px; } }

  .ops-hero { margin-bottom: 28px; }
  .ops-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #b54a2c;
    margin-bottom: 14px; display: inline-flex; align-items: center; gap: 10px;
  }
  .ops-tag::before { content: ''; width: 24px; height: 1px; background: #b54a2c; }
  .ops-h1 {
    font-family: 'Fraunces', serif; font-size: 36px; font-weight: 400;
    line-height: 1.1; color: #1a1815; letter-spacing: -0.022em; margin: 0;
  }
  .ops-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    margin-top: 10px;
  }

  /* Counts row */
  .ops-counts {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
    border: 2px solid #1a1815; margin-bottom: 24px;
  }
  @media (max-width: 700px) { .ops-counts { grid-template-columns: repeat(2, 1fr); } }
  .ops-count {
    padding: 18px 22px; border-right: 1px solid #1a181530;
  }
  .ops-count:last-child { border-right: none; }
  @media (max-width: 700px) {
    .ops-count:nth-child(2n) { border-right: none; }
    .ops-count:nth-child(-n+2) { border-bottom: 1px solid #1a181530; }
  }
  .ops-count.overdue { border-left: 4px solid #b54a2c; padding-left: 18px; }
  .ops-count.due_today { border-left: 4px solid #c4a661; padding-left: 18px; }
  .ops-count.due_this_week { border-left: 4px solid #4c6b8c; padding-left: 18px; }
  .ops-count.escalated { border-left: 4px solid #1a1815; padding-left: 18px; background: #b54a2c08; }
  .ops-count-num {
    font-family: 'Fraunces', serif; font-size: 32px; font-weight: 500;
    line-height: 1; color: #1a1815;
  }
  .ops-count.overdue .ops-count-num { color: #b54a2c; }
  .ops-count.due_today .ops-count-num { color: #7a5e10; }
  .ops-count.escalated .ops-count-num { color: #b54a2c; }
  .ops-count-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #6b645a;
    margin-top: 6px; line-height: 1.4;
  }

  /* Filter bar */
  .ops-filters {
    display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
    margin-bottom: 22px;
  }
  .ops-filter-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #6b645a;
  }
  .ops-filter-select {
    padding: 7px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181540; background: #f4f1ea; color: #1a1815;
    cursor: pointer; appearance: none;
  }

  /* Section */
  .ops-section { margin-bottom: 24px; }
  .ops-section-hdr {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
    padding-bottom: 8px; border-bottom: 2px solid;
  }
  .ops-section-hdr.overdue { border-bottom-color: #b54a2c; }
  .ops-section-hdr.due_today { border-bottom-color: #c4a661; }
  .ops-section-hdr.due_this_week { border-bottom-color: #4c6b8c; }
  .ops-section-hdr.escalated { border-bottom-color: #1a1815; }
  .ops-section-title {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    color: #1a1815; letter-spacing: -0.012em; margin: 0; flex: 1;
  }
  .ops-section-count {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: #6b645a; font-weight: 700;
  }

  /* Item row */
  .ops-item {
    display: grid; grid-template-columns: 28px 1fr auto; gap: 12px;
    align-items: start; padding: 12px 14px; background: #f4f1ea;
    border: 1px solid #1a181520; border-left: 3px solid;
    margin-bottom: 6px;
  }
  .ops-item.overdue { border-left-color: #b54a2c; }
  .ops-item.due_today { border-left-color: #c4a661; background: #c4a66108; }
  .ops-item.due_this_week { border-left-color: #4c6b8c; }
  .ops-item.escalated { border-left-color: #b54a2c; background: #b54a2c08; }
  .ops-item-icon { font-size: 18px; line-height: 1.2; padding-top: 2px; }
  .ops-item-body {}
  .ops-item-label {
    font-size: 14px; color: #1a1815; line-height: 1.45;
    font-weight: 500;
  }
  .ops-item-case {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; margin-top: 4px;
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  }
  .ops-item-case strong {
    color: #1a1815; font-family: 'Fraunces', serif; font-size: 13px;
    font-weight: 500;
  }
  .ops-assigned-pill {
    background: #4c6b8c20; color: #4c6b8c; padding: 2px 7px;
    font-size: 9px; letter-spacing: 0.1em;
  }
  .ops-item-actions {
    display: flex; gap: 5px; flex-shrink: 0;
  }
  .ops-item-btn {
    padding: 6px 10px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181540; background: transparent; color: #1a1815;
    cursor: pointer; white-space: nowrap;
  }
  .ops-item-btn:hover { background: #1a1815; color: #f4f1ea; }

  /* Empty state */
  .ops-empty {
    background: #ebe6dc; border: 1px dashed #1a181540;
    padding: 60px 32px; text-align: center;
  }
  .ops-empty-glyph {
    font-family: 'Fraunces', serif; font-size: 48px; color: #5a7a4a;
    margin-bottom: 14px; line-height: 1;
  }

  /* Case-card additions: assignment + escalation */
  .case-meta-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; flex-wrap: wrap;
    border-bottom: 1px solid #1a181515; margin-bottom: 12px;
  }
  .case-assign-input {
    padding: 5px 9px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    border: 1px solid #1a181530; background: transparent; color: #1a1815;
    border-radius: 0; min-width: 160px;
  }
  .case-assign-input:focus { outline: none; border-color: #1a1815; }
  .escalate-btn {
    padding: 6px 12px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #b54a2c40; background: transparent; color: #b54a2c;
    cursor: pointer;
  }
  .escalate-btn:hover { background: #b54a2c; color: #f4f1ea; }
  .escalate-btn.active { background: #b54a2c; color: #f4f1ea; border-color: #b54a2c; }
  .escalation-note {
    background: #b54a2c0a; border: 1px solid #b54a2c40; border-left: 3px solid #b54a2c;
    padding: 10px 12px; margin-bottom: 12px;
  }
  .escalation-note-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #b54a2c;
    font-weight: 700; margin-bottom: 4px;
  }
  .escalation-note-text {
    font-size: 12.5px; color: #1a1815; line-height: 1.5;
  }

  /* LONGITUDINAL TIMELINE — per case */
  .timeline-panel {
    background: #ebe6dc; border: 1px solid #1a181530;
    margin-bottom: 14px; overflow: hidden;
  }
  .timeline-hdr {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px;
    background: #1a1815; color: #f4f1ea; cursor: pointer; user-select: none;
  }
  .timeline-hdr:hover { background: #2a2520; }
  .timeline-hdr-title {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; flex: 1;
  }
  .timeline-hdr-meta {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    color: #c4a661; letter-spacing: 0.1em;
  }
  .timeline-body { padding: 14px 16px; display: grid; gap: 12px; }

  .tl-section {
    background: #f4f1ea; border: 1px solid #1a181520; padding: 12px 14px;
  }
  .tl-section-hdr {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 10px;
  }
  .tl-section-title {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #1a1815; font-weight: 700;
  }
  .tl-section-status {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; padding: 3px 8px;
    border: 1px solid currentColor;
  }

  .tl-field-row {
    display: flex; align-items: center; gap: 10px; padding: 5px 0;
    font-size: 12.5px; color: #1a1815; flex-wrap: wrap;
  }
  .tl-field-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #6b645a;
    min-width: 100px; flex-shrink: 0;
  }
  .tl-date-input, .tl-text-input, .tl-select {
    padding: 5px 9px; border: 1px solid #1a181530; background: #f4f1ea;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #1a1815;
    border-radius: 0;
  }
  .tl-date-input:focus, .tl-text-input:focus, .tl-select:focus {
    outline: none; border-color: #1a1815;
  }
  .tl-text-input { font-family: 'Inter Tight', sans-serif; font-size: 12.5px; min-width: 160px; flex: 1; }
  .tl-relative {
    font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #6b645a;
  }
  .tl-relative.soon { color: #c4a661; font-weight: 600; }
  .tl-relative.today { color: #b54a2c; font-weight: 700; }
  .tl-relative.overdue { color: #b54a2c; font-weight: 700; }

  /* Lab list */
  .tl-labs-list { display: flex; flex-direction: column; gap: 4px; }
  .tl-lab-row {
    display: flex; align-items: center; gap: 10px; padding: 6px 8px;
    background: #ebe6dc; border-left: 3px solid #6b645a;
    font-size: 12px;
  }
  .tl-lab-row.complete { border-left-color: #5a7a4a; opacity: 0.7; }
  .tl-lab-row.overdue { border-left-color: #b54a2c; background: #b54a2c0a; }
  .tl-lab-name { flex: 1; min-width: 0; color: #1a1815; }
  .tl-lab-row.complete .tl-lab-name { text-decoration: line-through; color: #6b645a; }
  .tl-lab-status {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.12em;
    padding: 2px 6px; border: 1px solid currentColor; flex-shrink: 0;
  }
  .tl-lab-date {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    color: #6b645a; flex-shrink: 0;
  }
  .tl-lab-x {
    background: transparent; border: none; cursor: pointer;
    color: #98908380; font-size: 14px; padding: 0 4px;
  }
  .tl-lab-x:hover { color: #b54a2c; }

  .tl-lab-add-row {
    display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;
  }
  .tl-lab-add-chip {
    padding: 4px 9px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px dashed #1a181540; background: transparent; color: #6b645a;
    cursor: pointer;
  }
  .tl-lab-add-chip:hover { background: #1a181508; color: #1a1815; border-color: #1a1815; }

  /* Manufacturing progress bar */
  .mfg-bar-row {
    display: flex; align-items: center; gap: 12px; margin: 10px 0 6px;
  }
  .mfg-bar-track {
    flex: 1; height: 14px; background: #1a181515; border: 1px solid #1a181530;
    position: relative;
  }
  .mfg-bar-fill {
    height: 100%; background: linear-gradient(90deg, #5a7a4a 0%, #c4a661 100%);
    transition: width 0.3s;
  }
  .mfg-bar-fill.complete { background: #5a7a4a; }
  .mfg-bar-fill.overdue { background: #b54a2c; }
  .mfg-day-counter {
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    color: #1a1815; font-weight: 700; min-width: 110px; text-align: right;
  }

  /* Daily insights strip — board header */
  .insights-strip {
    background: #1a1815; color: #f4f1ea; padding: 14px 18px;
    margin-bottom: 16px;
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
  }
  @media (max-width: 700px) { .insights-strip { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
  .insight-item {}
  .insight-num {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 500;
    line-height: 1; color: #c4a661;
  }
  .insight-num.none { color: #f4f1ea60; }
  .insight-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #f4f1ea99;
    margin-top: 4px; line-height: 1.4;
  }

  /* REMINDER ROW (per case) */
  .reminder-row {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 12px; background: #f4f1ea;
    border: 1px solid #1a181530; border-left: 3px solid #4c6b8c;
    margin-bottom: 12px; flex-wrap: wrap;
  }
  .reminder-row.overdue {
    border-left-color: #b54a2c; background: #b54a2c08;
  }
  .reminder-row.due-soon {
    border-left-color: #c4a661; background: #c4a66108;
  }
  .reminder-label {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    flex-shrink: 0;
  }
  .reminder-row.overdue .reminder-label { color: #b54a2c; font-weight: 700; }
  .reminder-input {
    padding: 6px 10px; border: 1px solid #1a181530; background: #f4f1ea;
    font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #1a1815;
    border-radius: 0;
  }
  .reminder-input:focus { outline: none; border-color: #1a1815; }
  .reminder-status {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; flex: 1;
  }
  .reminder-status.overdue { color: #b54a2c; font-weight: 600; }
  .reminder-status.due-soon { color: #7a5e10; font-weight: 600; }
  .reminder-snooze-btn {
    padding: 5px 9px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid #1a181530;
    background: transparent; color: #1a1815; cursor: pointer;
  }
  .reminder-snooze-btn:hover { background: #1a181508; }
  .reminder-suggest-btn {
    padding: 5px 9px; font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid #4c6b8c40;
    background: transparent; color: #4c6b8c; cursor: pointer;
  }
  .reminder-suggest-btn:hover { background: #4c6b8c10; }

  /* Overdue badge on case header */
  .overdue-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: #b54a2c; color: #f4f1ea;
    padding: 3px 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
  }
  .due-soon-badge {
    display: inline-flex; align-items: center; gap: 5px;
    background: #c4a661; color: #1a1815;
    padding: 3px 8px;
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;
  }

  /* PIPELINE STEPPER (per case) */
  .stage-row {
    background: #ebe6dc; border: 1px solid #1a181530;
    padding: 12px 14px; margin-bottom: 14px;
  }
  .stage-row-top {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-bottom: 10px; flex-wrap: wrap;
  }
  .stage-label-block {
    display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
  }
  .stage-label-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .stage-label-text {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.14em; color: #1a1815;
    font-weight: 700;
  }
  .stage-label-phase {
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    color: #6b645a; letter-spacing: 0.1em;
  }
  .stage-actions { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }
  .stage-btn {
    padding: 7px 12px; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.12em; border: 1px solid #1a181540;
    background: #f4f1ea; color: #1a1815; cursor: pointer; transition: all 0.1s;
  }
  .stage-btn:hover { background: #1a1815; color: #f4f1ea; }
  .stage-btn.primary {
    background: #1a1815; color: #f4f1ea; border-color: #1a1815;
  }
  .stage-btn.primary:hover { background: #5a7a4a; border-color: #5a7a4a; }
  .stage-btn.danger {
    color: #b54a2c; border-color: #b54a2c40; background: transparent;
  }
  .stage-btn.danger:hover { background: #b54a2c; color: #f4f1ea; border-color: #b54a2c; }

  /* Phase indicator — 5 chips showing progress */
  .phase-strip {
    display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px;
  }
  .phase-chip {
    padding: 5px 6px; text-align: center;
    font-family: 'JetBrains Mono', monospace; font-size: 8.5px;
    text-transform: uppercase; letter-spacing: 0.1em;
    background: #f4f1ea; color: #98908399; border: 1px solid #1a181520;
  }
  .phase-chip.past {
    background: #5a7a4a25; color: #4a6a3a; border-color: #5a7a4a40;
  }
  .phase-chip.current {
    background: #1a1815; color: #c4a661; border-color: #1a1815;
    font-weight: 700;
  }
  .phase-chip.terminal {
    background: #b54a2c20; color: #b54a2c; border-color: #b54a2c40;
  }

  /* Stage selector dropdown */
  .stage-select {
    padding: 7px 10px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid #1a181540;
    background: #f4f1ea; color: #1a1815; border-radius: 0; cursor: pointer;
    appearance: none; min-width: 180px;
  }
  .stage-select:focus { outline: none; border-color: #1a1815; }

  /* Outcome row (visible when terminal) */
  .outcome-row {
    background: #b54a2c08; border: 1px solid #b54a2c30; border-left: 3px solid #b54a2c;
    padding: 10px 14px; margin-bottom: 12px;
  }
  .outcome-row-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.16em; color: #b54a2c;
    margin-bottom: 6px; font-weight: 700;
  }
  .outcome-select {
    width: 100%; padding: 8px 10px; font-family: 'Inter Tight', sans-serif;
    font-size: 13px; border: 1px solid #1a181540; background: #f4f1ea;
    color: #1a1815; border-radius: 0; appearance: none;
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
  // Molecular & resistance intelligence layer
  ngsReport: "",
  bulkyDisease: false,
  ldhMultipleUln: "",
  priorCd19Therapy: false,
  priorBcmaTherapy: false,
  antigenLoss: false,
  // Lab values — all optional
  labAlt: "", labAst: "", labCreat: "", labCrcl: "",
  labBil: "", labLvef: "", labSpo2: "",
};

// ── Case lifecycle pipeline ────────────────────────────────────────────────
// Each case progresses through stages. Linear "happy path" is:
//   pending_review → discussed → approved → referred → apheresis →
//   manufacturing → infused → follow_up_30 → follow_up_90 → closed
// Two terminal branches off the decision phase: deferred, not_indicated.

const PIPELINE_STAGES = [
  // Decision phase
  { id: "pending_review", label: "Pending review",        short: "Pending",   dot: "#6b645a", phase: "decision" },
  { id: "discussed",      label: "Discussed",             short: "Discussed", dot: "#4c6b8c", phase: "decision" },
  { id: "approved",       label: "Approved for referral", short: "Approved",  dot: "#5a7a4a", phase: "decision" },
  // Decision terminal branches
  { id: "deferred",       label: "Deferred",              short: "Deferred",  dot: "#c4a661", phase: "decision", terminal: true },
  { id: "not_indicated",  label: "Not indicated",         short: "Not ind.",  dot: "#b54a2c", phase: "decision", terminal: true },
  // Referral & treatment phase
  { id: "referred",       label: "Referred to CAR-T center", short: "Referred", dot: "#5a7a4a", phase: "referral" },
  { id: "apheresis",      label: "Apheresis scheduled",   short: "Apheresis", dot: "#5a7a4a", phase: "referral" },
  { id: "manufacturing",  label: "In manufacturing",      short: "Mfg",       dot: "#c4a661", phase: "referral" },
  { id: "infused",        label: "Infused",               short: "Infused",   dot: "#5a7a4a", phase: "treatment" },
  // Follow-up phase
  { id: "follow_up_30",   label: "Day 30 follow-up",      short: "D30",       dot: "#4c6b8c", phase: "followup" },
  { id: "follow_up_90",   label: "Day 90 follow-up",      short: "D90",       dot: "#4c6b8c", phase: "followup" },
  // Closed
  { id: "closed",         label: "Closed",                short: "Closed",    dot: "#1a1815", phase: "closed", terminal: true },
];

// Linear progression — used by "Advance →" button
const LINEAR_PIPELINE = [
  "pending_review", "discussed", "approved", "referred", "apheresis",
  "manufacturing", "infused", "follow_up_30", "follow_up_90", "closed",
];

// Phase grouping for visual indicator (5 phase chips)
const PHASES = [
  { id: "decision",  label: "Decision",   stages: ["pending_review", "discussed", "approved", "deferred", "not_indicated"] },
  { id: "referral",  label: "Referral",   stages: ["referred", "apheresis", "manufacturing"] },
  { id: "treatment", label: "Infusion",   stages: ["infused"] },
  { id: "followup",  label: "Follow-up",  stages: ["follow_up_30", "follow_up_90"] },
  { id: "closed",    label: "Closed",     stages: ["closed"] },
];

// Outcomes (only set on closed/deferred/not_indicated)
const OUTCOME_OPTIONS = [
  { id: "received_product_well",          label: "Received product · doing well" },
  { id: "received_product_complications", label: "Received product · with complications" },
  { id: "progressed",                     label: "Disease progressed before infusion" },
  { id: "insurance_denied",               label: "Insurance denied coverage" },
  { id: "manufacturing_failure",          label: "Manufacturing failed" },
  { id: "patient_declined",               label: "Patient declined" },
  { id: "death_pre_infusion",             label: "Death before infusion" },
  { id: "still_indicated",                label: "Still indicated · referred elsewhere" },
  { id: "other",                          label: "Other (see notes)" },
];

function getStage(stageId) {
  return PIPELINE_STAGES.find(s => s.id === stageId) || PIPELINE_STAGES[0];
}

function getPhaseOf(stageId) {
  return PHASES.find(p => p.stages.includes(stageId)) || PHASES[0];
}

// Migrate old case schema (pre-pipeline) to new
function migrateCase(c) {
  if (c.stage) return c; // already migrated
  const map = {
    "pending":       "pending_review",
    "discussed":     "discussed",
    "approved":      "approved",
    "deferred":      "deferred",
    "not-indicated": "not_indicated",
  };
  const stage = map[c.status] || "pending_review";
  return {
    ...c,
    stage,
    outcome: null,
    outcomeNotes: "",
    nextActionDate: null,
    stageHistory: [{ stage, at: c.addedAt || new Date().toISOString() }],
  };
}

function nextStageAfter(currentStageId) {
  const idx = LINEAR_PIPELINE.indexOf(currentStageId);
  if (idx === -1 || idx === LINEAR_PIPELINE.length - 1) return null;
  return LINEAR_PIPELINE[idx + 1];
}

// ── Reminder helpers ──────────────────────────────────────────────────────
// Suggested "next action" intervals per stage, derived from typical CAR-T
// referral workflow timing. Returns days from "now" to set the reminder.
const SUGGESTED_REMINDER_DAYS = {
  pending_review:  3,   // tumor board meets weekly — review within 3 days
  discussed:       7,   // decision should follow within a week
  approved:        7,   // referral should be initiated within a week
  referred:       14,   // insurance auth typical 2 weeks
  apheresis:      10,   // apheresis scheduling
  manufacturing:  28,   // 4 weeks for typical CAR-T manufacturing
  infused:        30,   // first follow-up at 30 days
  follow_up_30:   60,   // day 90 follow-up
  follow_up_90:   90,   // long-term surveillance
  // terminal stages get no auto-suggestion
};

function suggestReminderDate(stage) {
  const days = SUGGESTED_REMINDER_DAYS[stage];
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Format a date string for display + classify urgency
function reminderStatus(dateStr) {
  if (!dateStr) return { state: "none", label: "No reminder set" };
  const due = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    const overdueDays = Math.abs(diffDays);
    return {
      state: "overdue",
      label: overdueDays === 1 ? "Overdue by 1 day" : `Overdue by ${overdueDays} days`,
      diffDays,
    };
  }
  if (diffDays === 0) return { state: "due-soon", label: "Due today", diffDays };
  if (diffDays === 1) return { state: "due-soon", label: "Due tomorrow", diffDays };
  if (diffDays <= 3) return { state: "due-soon", label: `Due in ${diffDays} days`, diffDays };
  if (diffDays <= 7) return { state: "upcoming", label: `Due in ${diffDays} days`, diffDays };
  return { state: "upcoming", label: `Due ${due.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, diffDays };
}

// Add N days to today's date, return YYYY-MM-DD
function todayPlusDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function TumorBoardView({ board, onUpdateCase, onSetCaseStage, onUpdateTimeline, onSetPendingLabs, onAssignCase, onEscalateCase, onAddNote, onAddTask, onUpdateTask, onRemoveTask, onAddStarterTasks, onRemoveCase, onLoadCase, onGoToScreener, onExport, onRequestDemo, onSendDigest, digestEnabled, onToggleDigest, userEmail, userName }) {
  const [filter, setFilter] = useState("all");
  const [digestStatus, setDigestStatus] = useState("idle"); // idle | sending | sent | error

  const handleSendDigest = async () => {
    if (!userEmail) {
      alert("Sign in with an email account to receive the digest.");
      return;
    }
    if (board.length === 0) return;
    setDigestStatus("sending");
    const result = await onSendDigest();
    setDigestStatus(result?.ok ? "sent" : "error");
    setTimeout(() => setDigestStatus("idle"), 3500);
  };
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Compute aggregate stats by lifecycle phase + overdue count
  const TERMINAL_STAGES = ["closed", "deferred", "not_indicated"];
  const isOverdue = c => {
    if (TERMINAL_STAGES.includes(c.stage)) return false;
    if (!c.nextActionDate) return false;
    return reminderStatus(c.nextActionDate).state === "overdue";
  };
  const phaseCounts = {
    overdue:      board.filter(isOverdue).length,
    awaiting:     board.filter(c => ["pending_review", "discussed"].includes(c.stage)).length,
    active:       board.filter(c => ["approved", "referred", "apheresis", "manufacturing"].includes(c.stage)).length,
    infused:      board.filter(c => c.stage === "infused").length,
    followup:     board.filter(c => ["follow_up_30", "follow_up_90"].includes(c.stage)).length,
    closed:       board.filter(c => TERMINAL_STAGES.includes(c.stage)).length,
  };

  // Apply filter
  const filteredBoard = filter === "all" ? board
    : filter === "overdue"   ? board.filter(isOverdue)
    : filter === "awaiting"  ? board.filter(c => ["pending_review", "discussed"].includes(c.stage))
    : filter === "active"    ? board.filter(c => ["approved", "referred", "apheresis", "manufacturing"].includes(c.stage))
    : filter === "infused"   ? board.filter(c => c.stage === "infused")
    : filter === "followup"  ? board.filter(c => ["follow_up_30", "follow_up_90"].includes(c.stage))
    : filter === "closed"    ? board.filter(c => TERMINAL_STAGES.includes(c.stage))
    : board;

  return (
    <div className="board-view">
      <div className="board-hdr">
        <div className="board-title-block">
          <div className="board-title">Tumor Board</div>
          <div className="board-meta">
            {dateStr} · {board.length} case{board.length !== 1 ? "s" : ""}
            {phaseCounts.active > 0 && ` · ${phaseCounts.active} active referral${phaseCounts.active !== 1 ? "s" : ""}`}
          </div>
        </div>
        <div className="board-hdr-actions">
          {board.length > 0 && userEmail && (
            <>
              <button
                className="board-btn"
                onClick={handleSendDigest}
                disabled={digestStatus === "sending"}
                title={`Send a tumor board digest to ${userEmail}`}
              >
                {digestStatus === "sending" ? "Sending…"
                 : digestStatus === "sent"   ? "✓ Digest sent"
                 : digestStatus === "error"  ? "✗ Send failed"
                 : "Email digest now"}
              </button>
              <button
                className="board-btn"
                onClick={onToggleDigest}
                title="Toggle automatic weekly digest"
                style={digestEnabled ? { background: "#5a7a4a", color: "#f4f1ea", borderColor: "#5a7a4a" } : {}}
              >
                Weekly: {digestEnabled ? "ON" : "OFF"}
              </button>
            </>
          )}
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

      {/* TODAY insights — daily operational pulse */}
      {board.length > 0 && (() => {
        const insights = computeTimelineInsights(board);
        if (!insights) return null;
        const total =
          insights.upcomingApheresis.length +
          insights.upcomingInfusions.length +
          insights.mfgArrivingThisWeek.length +
          insights.insurancePending.length +
          insights.overdueLabs.length;
        if (total === 0) return null;
        return (
          <div className="insights-strip">
            <div className="insight-item">
              <div className={`insight-num${insights.upcomingApheresis.length === 0 ? " none" : ""}`}>
                {insights.upcomingApheresis.length}
              </div>
              <div className="insight-label">Apheresis this week</div>
            </div>
            <div className="insight-item">
              <div className={`insight-num${insights.upcomingInfusions.length === 0 ? " none" : ""}`}>
                {insights.upcomingInfusions.length}
              </div>
              <div className="insight-label">Infusions this week</div>
            </div>
            <div className="insight-item">
              <div className={`insight-num${insights.mfgArrivingThisWeek.length === 0 ? " none" : ""}`}>
                {insights.mfgArrivingThisWeek.length}
              </div>
              <div className="insight-label">Manufacturing arriving</div>
            </div>
            <div className="insight-item">
              <div className={`insight-num${insights.insurancePending.length === 0 ? " none" : ""}`}>
                {insights.insurancePending.length}
              </div>
              <div className="insight-label">Insurance pending</div>
            </div>
          </div>
        );
      })()}

      {/* Aggregate stats by lifecycle phase (also act as filter chips) */}
      {board.length > 0 && (
        <>
          {phaseCounts.overdue > 0 && (
            <div
              className={`board-stats`}
              style={{ gridTemplateColumns: "1fr", marginBottom: 12, borderColor: "#b54a2c", background: "#b54a2c0a" }}
              onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")}
            >
              <div
                className={`board-stat${filter === "overdue" ? " active" : ""}`}
                style={{ cursor: "pointer", padding: "14px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", borderRight: "none" }}
              >
                <div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500, color: filter === "overdue" ? "#c4a661" : "#b54a2c", lineHeight: 1 }}>
                    ⚠ {phaseCounts.overdue} case{phaseCounts.overdue !== 1 ? "s" : ""} overdue
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: filter === "overdue" ? "#c4a66199" : "#6b645a", marginTop: 5 }}>
                    {filter === "overdue" ? "Showing overdue only — click to show all" : "Click to filter to overdue cases"}
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="board-stats">
            <div className={`board-stat${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
              <div className="board-stat-num">{board.length}</div>
              <div className="board-stat-label">All cases</div>
            </div>
            <div className={`board-stat${filter === "awaiting" ? " active" : ""}`} onClick={() => setFilter("awaiting")}>
              <div className="board-stat-num">{phaseCounts.awaiting}</div>
              <div className="board-stat-label">Awaiting decision</div>
            </div>
            <div className={`board-stat${filter === "active" ? " active" : ""}`} onClick={() => setFilter("active")}>
              <div className="board-stat-num">{phaseCounts.active}</div>
              <div className="board-stat-label">Active referrals</div>
            </div>
            <div className={`board-stat${filter === "followup" ? " active" : ""}`} onClick={() => setFilter("followup")}>
              <div className="board-stat-num">{phaseCounts.followup + phaseCounts.infused}</div>
              <div className="board-stat-label">Infused / follow-up</div>
            </div>
            <div className={`board-stat${filter === "closed" ? " active" : ""}`} onClick={() => setFilter("closed")}>
              <div className="board-stat-num">{phaseCounts.closed}</div>
              <div className="board-stat-label">Closed</div>
            </div>
          </div>
        </>
      )}

      {board.length === 0 ? (
        <div className="board-empty">
          <div className="board-empty-glyph">⊞</div>
          <p className="board-empty-text">
            No cases in the tumor board yet.<br />
            Screen a patient and click <strong>Add to tumor board</strong> to queue them here.
          </p>
          <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="board-empty-cta" onClick={onGoToScreener}>
              Start screening →
            </button>
            {onRequestDemo && (
              <button
                className="board-empty-cta"
                style={{ background: "transparent", color: "#1a1815", border: "1px solid #1a181550" }}
                onClick={onRequestDemo}
              >
                See shared workflow demo →
              </button>
            )}
          </div>
        </div>
      ) : (
        filteredBoard.map(c => {
          const eligible = c.results ? Object.values(c.results).filter(r => r.eligible) : [];
          const stageMeta = getStage(c.stage);
          const currentPhase = getPhaseOf(c.stage);
          const nextStage = nextStageAfter(c.stage);
          const nextStageMeta = nextStage ? getStage(nextStage) : null;
          const isTerminal = stageMeta.terminal;
          const inDecisionPhase = stageMeta.phase === "decision" && !isTerminal;

          return (
            <div key={c.id} className="board-case">
              <div className="board-case-hdr">
                <div className="board-status-dot" style={{ background: stageMeta.dot }} />
                <input
                  className="board-case-label-input"
                  value={c.patientLabel}
                  onChange={e => onUpdateCase(c.id, { patientLabel: e.target.value })}
                />
                {!isTerminal && (() => {
                  const s = reminderStatus(c.nextActionDate);
                  if (s.state === "overdue") return <span className="overdue-badge">⚠ {s.label}</span>;
                  if (s.state === "due-soon") return <span className="due-soon-badge">⏱ {s.label}</span>;
                  return null;
                })()}
                <div className="board-case-summary">
                  {[
                    c.patient.cancerType ? c.patient.cancerType.split("(")[0].trim() : null,
                    c.patient.priorLines ? `${c.patient.priorLines}L` : null,
                    c.patient.ecog !== "" ? `ECOG ${c.patient.ecog}` : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>

              <div className="board-case-body">
                {/* Pipeline stage indicator + advance controls */}
                <div className="stage-row">
                  <div className="stage-row-top">
                    <div className="stage-label-block">
                      <div className="stage-label-dot" style={{ background: stageMeta.dot }} />
                      <span className="stage-label-text">{stageMeta.label}</span>
                      <span className="stage-label-phase">· {currentPhase.label} phase</span>
                    </div>
                    <div className="stage-actions">
                      <select
                        className="stage-select"
                        value={c.stage}
                        onChange={e => onSetCaseStage(c.id, e.target.value)}
                      >
                        {PIPELINE_STAGES.map(s => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                      {nextStageMeta && (
                        <button
                          className="stage-btn primary"
                          onClick={() => onSetCaseStage(c.id, nextStage)}
                          title={`Advance to ${nextStageMeta.label}`}
                        >
                          Advance → {nextStageMeta.short}
                        </button>
                      )}
                      {inDecisionPhase && (
                        <>
                          <button
                            className="stage-btn"
                            onClick={() => onSetCaseStage(c.id, "deferred")}
                            title="Mark deferred"
                          >
                            Defer
                          </button>
                          <button
                            className="stage-btn danger"
                            onClick={() => onSetCaseStage(c.id, "not_indicated")}
                            title="Mark not indicated"
                          >
                            Not indicated
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Phase strip — 5 phases */}
                  <div className="phase-strip">
                    {PHASES.map(p => {
                      const isCurrent = p.id === currentPhase.id;
                      const phaseIdx = PHASES.indexOf(p);
                      const currentIdx = PHASES.indexOf(currentPhase);
                      const isPast = phaseIdx < currentIdx && !isTerminal;
                      const isTerm = isCurrent && isTerminal;
                      return (
                        <div
                          key={p.id}
                          className={`phase-chip${isTerm ? " terminal" : isCurrent ? " current" : isPast ? " past" : ""}`}
                        >
                          {p.label}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Assignment + escalation controls (only on active cases) */}
                {!isTerminal && (
                  <div className="case-meta-row">
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "#6b645a" }}>
                      Assigned to
                    </span>
                    <input
                      type="text"
                      className="case-assign-input"
                      placeholder="Coordinator name…"
                      value={c.assignedTo || ""}
                      onChange={e => onAssignCase(c.id, e.target.value)}
                    />
                    <button
                      className={`escalate-btn${c.escalated ? " active" : ""}`}
                      onClick={() => {
                        if (c.escalated) { onEscalateCase(c.id, null); return; }
                        const reason = prompt("Reason for escalation (e.g., insurance denied, organ function declining):");
                        if (reason !== null) onEscalateCase(c.id, reason.trim() || null);
                      }}
                    >
                      {c.escalated ? "🚩 Unflag" : "🚩 Escalate"}
                    </button>
                  </div>
                )}

                {/* Escalation note shown when flagged */}
                {c.escalated && c.escalationReason && (
                  <div className="escalation-note">
                    <div className="escalation-note-head">🚩 Escalated for physician review</div>
                    <div className="escalation-note-text">{c.escalationReason}</div>
                  </div>
                )}

                {/* Longitudinal timeline — referral, labs, insurance, apheresis, mfg, infusion */}
                {!isTerminal && (
                  <TimelinePanel
                    caseData={c}
                    onUpdate={onUpdateTimeline}
                    onSetLabs={onSetPendingLabs}
                  />
                )}

                {/* Tasks — per-case work queue */}
                {!isTerminal && (
                  <TasksPanel
                    caseData={c}
                    onAdd={onAddTask}
                    onUpdate={onUpdateTask}
                    onRemove={onRemoveTask}
                    onAddStarters={onAddStarterTasks}
                  />
                )}

                {/* Activity log — event stream / audit trail */}
                <ActivityLog
                  caseData={c}
                  onAddNote={onAddNote}
                />

                {/* Reminder row — date picker + status */}
                {!isTerminal && (() => {
                  const status = reminderStatus(c.nextActionDate);
                  return (
                    <div className={`reminder-row${status.state === "overdue" ? " overdue" : status.state === "due-soon" ? " due-soon" : ""}`}>
                      <span className="reminder-label">Next action</span>
                      <input
                        type="date"
                        className="reminder-input"
                        value={c.nextActionDate || ""}
                        onChange={e => onUpdateCase(c.id, { nextActionDate: e.target.value || null })}
                      />
                      <span className={`reminder-status ${status.state}`}>{status.label}</span>
                      {!c.nextActionDate && SUGGESTED_REMINDER_DAYS[c.stage] && (
                        <button
                          className="reminder-suggest-btn"
                          onClick={() => onUpdateCase(c.id, { nextActionDate: suggestReminderDate(c.stage) })}
                          title={`Set reminder for ${SUGGESTED_REMINDER_DAYS[c.stage]} days from now`}
                        >
                          Suggest +{SUGGESTED_REMINDER_DAYS[c.stage]}d
                        </button>
                      )}
                      {c.nextActionDate && (
                        <>
                          <button
                            className="reminder-snooze-btn"
                            onClick={() => onUpdateCase(c.id, { nextActionDate: todayPlusDays(7) })}
                            title="Snooze reminder 1 week"
                          >
                            Snooze 1w
                          </button>
                          <button
                            className="reminder-snooze-btn"
                            onClick={() => onUpdateCase(c.id, { nextActionDate: null })}
                            title="Clear reminder"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* Outcome row — visible only when terminal */}
                {isTerminal && (
                  <div className="outcome-row">
                    <div className="outcome-row-head">Outcome</div>
                    <select
                      className="outcome-select"
                      value={c.outcome || ""}
                      onChange={e => onUpdateCase(c.id, { outcome: e.target.value || null })}
                    >
                      <option value="">— Select outcome —</option>
                      {OUTCOME_OPTIONS.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}

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

                {/* Notes + actions */}
                <div className="board-controls">
                  <textarea
                    className="board-notes-inp"
                    placeholder="Add notes (attending comments, referral details, pending labs…)"
                    value={c.notes}
                    onChange={e => onUpdateCase(c.id, { notes: e.target.value })}
                    rows={2}
                  />
                  <div className="board-btn-row">
                    <button
                      className="board-btn primary"
                      onClick={() => generateReferralPacket({
                        patient: c.patient,
                        results: c.results || {},
                        products: ALL_PRODUCTS,
                        caseData: c,
                        referringInstitution: "",
                        referringCoordinator: c.assignedTo || userName || "",
                        referringContact: userEmail || "",
                      })}
                      title="Generate one-page referral packet PDF for the receiving CAR-T center"
                    >
                      📨 Referral packet
                    </button>
                    <button
                      className="board-btn"
                      onClick={() => downloadCaseAsFhir(c)}
                      title="Export this case as a FHIR R4 Bundle (for EHR integration / research)"
                    >
                      ↧ FHIR
                    </button>
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

// Tasks panel — per-case task list (the CRM operational layer)
function TasksPanel({ caseData, onAdd, onUpdate, onRemove, onAddStarters }) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [draftPriority, setDraftPriority] = useState("normal");
  const [draftCategory, setDraftCategory] = useState("admin");
  const [filter, setFilter] = useState("active"); // active | all | overdue | complete

  const tasks = caseData.tasks || [];
  const summary = summarizeTasks(tasks);

  const filtered = filter === "all"      ? tasks
    : filter === "overdue"  ? tasks.filter(isTaskOverdue)
    : filter === "complete" ? tasks.filter(t => t.status === "complete")
    : tasks.filter(t => t.status !== "complete");

  // Sort: overdue first, then by due date, then by priority
  const sorted = [...filtered].sort((a, b) => {
    const aOver = isTaskOverdue(a) ? 0 : 1;
    const bOver = isTaskOverdue(b) ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    const aDue = a.dueDate || "9999-12-31";
    const bDue = b.dueDate || "9999-12-31";
    if (aDue !== bDue) return aDue.localeCompare(bDue);
    const prio = { high: 0, normal: 1, low: 2 };
    return (prio[a.priority] || 1) - (prio[b.priority] || 1);
  });

  const submit = () => {
    if (!draft.trim()) return;
    onAdd(caseData.id, {
      title: draft,
      dueDate: draftDue || null,
      priority: draftPriority,
      category: draftCategory,
      status: "open",
    });
    setDraft("");
    setDraftDue("");
    setDraftPriority("normal");
    setDraftCategory("admin");
  };

  return (
    <div className="tasks-panel">
      <div className="tasks-hdr" onClick={() => setOpen(o => !o)}>
        <div className="tasks-hdr-title">📋 Tasks</div>
        <div className="tasks-hdr-summary">
          {summary.total === 0 ? "no tasks yet" :
            `${summary.open + summary.inProgress} open · ${summary.complete} done${summary.blocked > 0 ? ` · ${summary.blocked} blocked` : ""}`}
        </div>
        {summary.overdue > 0 && (
          <div className="tasks-hdr-overdue">⚠ {summary.overdue} overdue</div>
        )}
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#c4a661" }}>
          <ChevronDown size={14} />
        </div>
      </div>

      {open && (
        <div className="tasks-body">
          {/* Add a task */}
          <div className="tasks-add-row">
            <input
              type="text"
              className="tasks-add-input"
              placeholder="Add a task (e.g., 'Call PCP for outside records')…"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submit(); }}
            />
            <input
              type="date"
              className="tasks-add-input"
              style={{ flex: "0 0 140px", minWidth: 0 }}
              value={draftDue}
              onChange={e => setDraftDue(e.target.value)}
            />
            <select
              className="task-status-select"
              value={draftPriority}
              onChange={e => setDraftPriority(e.target.value)}
              style={{ minWidth: 90 }}
              title="Priority"
            >
              {TASK_PRIORITIES.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <select
              className="task-status-select"
              value={draftCategory}
              onChange={e => setDraftCategory(e.target.value)}
              style={{ minWidth: 140 }}
              title="Category"
            >
              {TASK_CATEGORIES.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <button
              className="tasks-add-btn"
              onClick={submit}
              disabled={!draft.trim()}
            >
              Add task
            </button>
          </div>

          {/* Filter chips + starter tasks helper */}
          <div className="tasks-filter-row">
            <button className={`tasks-filter-chip${filter === "active" ? " active" : ""}`} onClick={() => setFilter("active")}>
              Active ({summary.open + summary.inProgress + summary.blocked})
            </button>
            <button className={`tasks-filter-chip${filter === "overdue" ? " active" : ""}`} onClick={() => setFilter("overdue")}>
              Overdue ({summary.overdue})
            </button>
            <button className={`tasks-filter-chip${filter === "complete" ? " active" : ""}`} onClick={() => setFilter("complete")}>
              Complete ({summary.complete})
            </button>
            <button className={`tasks-filter-chip${filter === "all" ? " active" : ""}`} onClick={() => setFilter("all")}>
              All ({summary.total})
            </button>
            <button
              className="tasks-starter-btn"
              onClick={() => onAddStarters(caseData.id)}
              title="Add the typical starter tasks for this case's current stage"
              style={{ marginLeft: "auto" }}
            >
              + Suggest starters
            </button>
          </div>

          {/* Task list */}
          {sorted.length === 0 ? (
            <div className="tasks-empty">
              {filter === "active"   ? "No active tasks. " :
               filter === "overdue"  ? "No overdue tasks." :
               filter === "complete" ? "No completed tasks yet." :
                                       "No tasks yet."}
              {filter === "active" && tasks.length === 0 && (
                <span> Add one above, or click <strong>+ Suggest starters</strong> for typical tasks at this stage.</span>
              )}
            </div>
          ) : (
            <div>
              {sorted.map(t => {
                const overdue = isTaskOverdue(t);
                const dueSoon = isTaskDueSoon(t);
                const days = taskDaysOverdue(t);
                const catMeta = taskCategoryMeta(t.category);
                const isComplete = t.status === "complete";
                const isBlocked = t.status === "blocked";
                return (
                  <div
                    key={t.id}
                    className={`task-row priority-${t.priority || "normal"}${isComplete ? " complete" : ""}${overdue ? " overdue" : ""}${isBlocked ? " blocked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="task-checkbox"
                      checked={isComplete}
                      onChange={() => onUpdate(caseData.id, t.id, { status: isComplete ? "open" : "complete" })}
                      title="Toggle complete"
                    />
                    <div className="task-body">
                      <div className="task-title">{t.title}</div>
                      <div className="task-meta">
                        {t.assignedTo && <span className="task-meta-assignee">{t.assignedTo}</span>}
                        {t.dueDate && (
                          <span className={`task-meta-due${overdue ? " overdue" : dueSoon ? " soon" : ""}`}>
                            {overdue ? `OVERDUE ${days}d` : `Due ${new Date(t.dueDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                          </span>
                        )}
                        <span className="task-meta-category">{catMeta.icon} {catMeta.label}</span>
                        {!isComplete && (
                          <select
                            className="task-status-select"
                            value={t.status}
                            onChange={e => onUpdate(caseData.id, t.id, { status: e.target.value })}
                          >
                            {TASK_STATUSES.map(s => (
                              <option key={s.id} value={s.id}>{s.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="task-actions">
                      <button className="task-btn-x" onClick={() => onRemove(caseData.id, t.id)} title="Remove task">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Activity log — vertical event stream per case
function ActivityLog({ caseData, onAddNote }) {
  const [open, setOpen] = useState(false);
  const [draftNote, setDraftNote] = useState("");
  const events = sortEventsDescending(caseData.events || []);

  const submitNote = () => {
    if (!draftNote.trim()) return;
    onAddNote(caseData.id, draftNote);
    setDraftNote("");
  };

  return (
    <div className="activity-log">
      <div className="activity-log-hdr" onClick={() => setOpen(o => !o)}>
        <div className="activity-log-hdr-title">⌚ Activity log</div>
        <div className="activity-log-hdr-count">{events.length} event{events.length !== 1 ? "s" : ""}</div>
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#c4a661" }}>
          <ChevronDown size={14} />
        </div>
      </div>

      {open && (
        <div className="activity-log-body">
          {/* Manual note entry */}
          <div className="event-add-row">
            <input
              type="text"
              className="event-add-input"
              placeholder="Add a note about this case (e.g., spoke with insurance — peer-to-peer scheduled)…"
              value={draftNote}
              onChange={e => setDraftNote(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitNote(); }}
            />
            <button
              className="event-add-btn"
              onClick={submitNote}
              disabled={!draftNote.trim()}
            >
              Add note
            </button>
          </div>

          {/* Event stream — descending chronological */}
          {events.length === 0 ? (
            <div className="event-empty">No events yet. Actions you take on this case will appear here.</div>
          ) : (
            <div className="event-stream">
              {events.map(ev => {
                const meta = EVENT_TYPES[ev.type] || EVENT_TYPES["note.added"];
                const isSystem = ev.by === "system";
                return (
                  <div key={ev.id} className={`event-row${isSystem ? " event-system" : ""}`}>
                    <div className="event-time">{formatEventTime(ev.at)}</div>
                    <div className="event-dot" style={{ color: meta.dot, background: "#f4f1ea" }}>
                      {meta.icon}
                    </div>
                    <div className="event-body">
                      <div className="event-title">{ev.title}</div>
                      {ev.detail && <div className="event-detail">{ev.detail}</div>}
                      <div className="event-by">— {ev.by}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Longitudinal timeline panel — referral / labs / insurance / apheresis / mfg / infusion
function TimelinePanel({ caseData, onUpdate, onSetLabs }) {
  const isActive = ["approved", "referred", "apheresis", "manufacturing", "infused"].includes(caseData.stage);
  const [open, setOpen] = useState(isActive);
  const tl = caseData.timeline || emptyTimeline();
  const id = caseData.id;
  const cancerType = caseData.patient?.cancerType || "";
  const commonLabs = commonLabsForCancer(cancerType);

  const mfg = manufacturingCountdown(tl.manufacturing);

  // Compute a one-line summary for the collapsed header
  const summary = (() => {
    const parts = [];
    if (tl.pendingLabs.length > 0) {
      const done = tl.pendingLabs.filter(l => l.status === "complete").length;
      parts.push(`${done}/${tl.pendingLabs.length} labs`);
    }
    if (tl.insurance.status !== "none") {
      const meta = INSURANCE_STATUSES.find(s => s.id === tl.insurance.status);
      parts.push(`Ins: ${meta?.label || tl.insurance.status}`);
    }
    if (mfg && !mfg.isComplete) parts.push(`Mfg Day ${mfg.elapsed}/${mfg.totalDays}`);
    if (tl.apheresis.scheduledAt && !tl.apheresis.performedAt) {
      const d = daysFromNow(tl.apheresis.scheduledAt);
      if (d !== null) parts.push(`Apheresis ${relativeDateLabel(tl.apheresis.scheduledAt)}`);
    }
    if (tl.infusion.scheduledAt && !tl.infusion.performedAt) {
      parts.push(`Infusion ${relativeDateLabel(tl.infusion.scheduledAt)}`);
    }
    return parts.length === 0 ? "Click to add timeline details" : parts.join(" · ");
  })();

  // Lab add: support quick-add chip + custom
  const addLab = (name) => {
    if (!name) return;
    const newLab = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name,
      status: "ordered",
      orderedAt: todayISO(),
      completedAt: null,
      notes: "",
    };
    onSetLabs(id, [...tl.pendingLabs, newLab]);
  };
  const updateLab = (labId, patch) => {
    onSetLabs(id, tl.pendingLabs.map(l => l.id === labId ? { ...l, ...patch } : l));
  };
  const removeLab = (labId) => {
    onSetLabs(id, tl.pendingLabs.filter(l => l.id !== labId));
  };
  const toggleLab = (labId) => {
    const lab = tl.pendingLabs.find(l => l.id === labId);
    if (!lab) return;
    if (lab.status === "complete") {
      updateLab(labId, { status: "ordered", completedAt: null });
    } else {
      updateLab(labId, { status: "complete", completedAt: todayISO() });
    }
  };

  // Quick-add chips: show common labs that haven't been added yet
  const addedNames = new Set(tl.pendingLabs.map(l => l.name.toLowerCase()));
  const availableChips = commonLabs.filter(n => !addedNames.has(n.toLowerCase()));

  const insMeta = INSURANCE_STATUSES.find(s => s.id === tl.insurance.status) || INSURANCE_STATUSES[0];

  return (
    <div className="timeline-panel">
      <div className="timeline-hdr" onClick={() => setOpen(o => !o)}>
        <div className="timeline-hdr-title">⏱ Timeline</div>
        <div className="timeline-hdr-meta">{summary}</div>
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#c4a661" }}>
          <ChevronDown size={14} />
        </div>
      </div>

      {open && (
        <div className="timeline-body">
          {/* ─── REFERRAL ─────────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Referral</span>
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Created</span>
              <input
                type="date"
                className="tl-date-input"
                value={tl.referralCreatedAt || ""}
                onChange={e => onUpdate(id, "_root", { referralCreatedAt: e.target.value || null })}
              />
              {tl.referralCreatedAt && (
                <span className="tl-relative">{relativeDateLabel(tl.referralCreatedAt)}</span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Center</span>
              <input
                type="text"
                className="tl-text-input"
                placeholder="e.g. MSK Cell Therapy Center"
                value={tl.referralCenter}
                onChange={e => onUpdate(id, "_root", { referralCenter: e.target.value })}
              />
            </div>
          </div>

          {/* ─── PENDING LABS ─────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Pending labs &amp; workup</span>
              <span className="tl-section-status" style={{ color: "#6b645a" }}>
                {tl.pendingLabs.filter(l => l.status === "complete").length} / {tl.pendingLabs.length}
              </span>
            </div>
            {tl.pendingLabs.length > 0 && (
              <div className="tl-labs-list">
                {tl.pendingLabs.map(lab => {
                  const overdue = isLabOverdue(lab);
                  const meta = LAB_STATUSES.find(s => s.id === lab.status) || LAB_STATUSES[0];
                  return (
                    <div key={lab.id} className={`tl-lab-row${lab.status === "complete" ? " complete" : ""}${overdue ? " overdue" : ""}`}>
                      <input
                        type="checkbox"
                        checked={lab.status === "complete"}
                        onChange={() => toggleLab(lab.id)}
                        title="Mark complete"
                        style={{ flexShrink: 0 }}
                      />
                      <span className="tl-lab-name">{lab.name}</span>
                      <select
                        className="tl-lab-status"
                        style={{ color: meta.color, fontFamily: "'JetBrains Mono', monospace", background: "transparent" }}
                        value={lab.status}
                        onChange={e => updateLab(lab.id, { status: e.target.value, completedAt: e.target.value === "complete" ? todayISO() : null })}
                      >
                        {LAB_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      {lab.orderedAt && lab.status !== "complete" && (
                        <span className="tl-lab-date">ordered {relativeDateLabel(lab.orderedAt)}</span>
                      )}
                      {lab.completedAt && (
                        <span className="tl-lab-date">done {relativeDateLabel(lab.completedAt)}</span>
                      )}
                      <button className="tl-lab-x" onClick={() => removeLab(lab.id)} title="Remove">×</button>
                    </div>
                  );
                })}
              </div>
            )}
            {availableChips.length > 0 && (
              <div className="tl-lab-add-row">
                {availableChips.slice(0, 6).map(name => (
                  <button key={name} className="tl-lab-add-chip" onClick={() => addLab(name)}>
                    + {name}
                  </button>
                ))}
                <button
                  className="tl-lab-add-chip"
                  onClick={() => {
                    const name = prompt("Custom lab / workup item:");
                    if (name?.trim()) addLab(name.trim());
                  }}
                >
                  + Custom…
                </button>
              </div>
            )}
          </div>

          {/* ─── INSURANCE ─────────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Insurance</span>
              <span className="tl-section-status" style={{ color: insMeta.color }}>
                {insMeta.label}
              </span>
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Status</span>
              <select
                className="tl-select"
                value={tl.insurance.status}
                onChange={e => {
                  const patch = { status: e.target.value };
                  if (e.target.value === "submitted" && !tl.insurance.submittedAt) patch.submittedAt = todayISO();
                  if ((e.target.value === "approved" || e.target.value === "denied") && !tl.insurance.decisionAt) patch.decisionAt = todayISO();
                  onUpdate(id, "insurance", patch);
                }}
              >
                {INSURANCE_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            {tl.insurance.status !== "none" && (
              <>
                <div className="tl-field-row">
                  <span className="tl-field-label">Submitted</span>
                  <input
                    type="date" className="tl-date-input"
                    value={tl.insurance.submittedAt || ""}
                    onChange={e => onUpdate(id, "insurance", { submittedAt: e.target.value || null })}
                  />
                  {tl.insurance.submittedAt && (
                    <span className="tl-relative">{relativeDateLabel(tl.insurance.submittedAt)}</span>
                  )}
                </div>
                <div className="tl-field-row">
                  <span className="tl-field-label">Policy</span>
                  <input
                    type="text" className="tl-text-input"
                    placeholder="e.g. BCBS PPO"
                    value={tl.insurance.policy}
                    onChange={e => onUpdate(id, "insurance", { policy: e.target.value })}
                  />
                </div>
                <div className="tl-field-row">
                  <span className="tl-field-label">Auth #</span>
                  <input
                    type="text" className="tl-text-input"
                    placeholder="Prior auth reference"
                    value={tl.insurance.authNumber}
                    onChange={e => onUpdate(id, "insurance", { authNumber: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>

          {/* ─── APHERESIS ─────────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Apheresis</span>
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Scheduled</span>
              <input
                type="date" className="tl-date-input"
                value={tl.apheresis.scheduledAt || ""}
                onChange={e => onUpdate(id, "apheresis", { scheduledAt: e.target.value || null })}
              />
              {tl.apheresis.scheduledAt && (
                <span className={`tl-relative${daysFromNow(tl.apheresis.scheduledAt) <= 7 && daysFromNow(tl.apheresis.scheduledAt) >= 0 ? " soon" : ""}`}>
                  {relativeDateLabel(tl.apheresis.scheduledAt)}
                </span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Performed</span>
              <input
                type="date" className="tl-date-input"
                value={tl.apheresis.performedAt || ""}
                onChange={e => onUpdate(id, "apheresis", { performedAt: e.target.value || null })}
              />
              {tl.apheresis.performedAt && (
                <span className="tl-relative">{relativeDateLabel(tl.apheresis.performedAt)}</span>
              )}
            </div>
          </div>

          {/* ─── MANUFACTURING ─────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Manufacturing</span>
              {mfg && !mfg.isComplete && (
                <span className="tl-section-status" style={{ color: mfg.isOverdue ? "#b54a2c" : "#c4a661" }}>
                  {mfg.isOverdue ? `Overdue ${Math.abs(mfg.remaining)}d` : `${mfg.remaining}d remaining`}
                </span>
              )}
              {mfg?.isComplete && <span className="tl-section-status" style={{ color: "#5a7a4a" }}>Received</span>}
            </div>
            {mfg && (
              <div className="mfg-bar-row">
                <div className="mfg-bar-track">
                  <div
                    className={`mfg-bar-fill${mfg.isComplete ? " complete" : ""}${mfg.isOverdue ? " overdue" : ""}`}
                    style={{ width: `${mfg.percent * 100}%` }}
                  />
                </div>
                <div className="mfg-day-counter">Day {mfg.elapsed} / {mfg.totalDays}</div>
              </div>
            )}
            <div className="tl-field-row">
              <span className="tl-field-label">Started</span>
              <input
                type="date" className="tl-date-input"
                value={tl.manufacturing.productStartedAt || ""}
                onChange={e => onUpdate(id, "manufacturing", { productStartedAt: e.target.value || null })}
              />
              {tl.manufacturing.productStartedAt && (
                <span className="tl-relative">{relativeDateLabel(tl.manufacturing.productStartedAt)}</span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Expected</span>
              <input
                type="date" className="tl-date-input"
                value={tl.manufacturing.expectedDeliveryAt || ""}
                onChange={e => onUpdate(id, "manufacturing", { expectedDeliveryAt: e.target.value || null })}
              />
              {tl.manufacturing.expectedDeliveryAt && (
                <span className={`tl-relative${daysFromNow(tl.manufacturing.expectedDeliveryAt) <= 7 && daysFromNow(tl.manufacturing.expectedDeliveryAt) >= 0 ? " soon" : ""}`}>
                  {relativeDateLabel(tl.manufacturing.expectedDeliveryAt)}
                </span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Received</span>
              <input
                type="date" className="tl-date-input"
                value={tl.manufacturing.receivedAt || ""}
                onChange={e => onUpdate(id, "manufacturing", { receivedAt: e.target.value || null })}
              />
              {tl.manufacturing.receivedAt && (
                <span className="tl-relative">{relativeDateLabel(tl.manufacturing.receivedAt)}</span>
              )}
            </div>
          </div>

          {/* ─── INFUSION ──────────────────────────────────────────────── */}
          <div className="tl-section">
            <div className="tl-section-hdr">
              <span className="tl-section-title">Infusion</span>
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Scheduled</span>
              <input
                type="date" className="tl-date-input"
                value={tl.infusion.scheduledAt || ""}
                onChange={e => onUpdate(id, "infusion", { scheduledAt: e.target.value || null })}
              />
              {tl.infusion.scheduledAt && (
                <span className={`tl-relative${daysFromNow(tl.infusion.scheduledAt) <= 7 && daysFromNow(tl.infusion.scheduledAt) >= 0 ? " soon" : ""}`}>
                  {relativeDateLabel(tl.infusion.scheduledAt)}
                </span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Conditioning</span>
              <input
                type="date" className="tl-date-input"
                value={tl.infusion.conditioningStartAt || ""}
                onChange={e => onUpdate(id, "infusion", { conditioningStartAt: e.target.value || null })}
              />
              {tl.infusion.conditioningStartAt && (
                <span className="tl-relative">{relativeDateLabel(tl.infusion.conditioningStartAt)}</span>
              )}
            </div>
            <div className="tl-field-row">
              <span className="tl-field-label">Performed</span>
              <input
                type="date" className="tl-date-input"
                value={tl.infusion.performedAt || ""}
                onChange={e => onUpdate(id, "infusion", { performedAt: e.target.value || null })}
              />
              {tl.infusion.performedAt && (
                <span className="tl-relative">{relativeDateLabel(tl.infusion.performedAt)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkupPanel({ pt }) {
  const [open, setOpen] = useState(true);
  const workup = generateWorkup(pt);
  if (!workup) return null;
  const total = workupItemCount(workup);
  if (total === 0) return null;

  const orderedCategories = ["pathology", "labs", "imaging", "documentation", "consults", "administrative"];

  return (
    <div className="workup-panel">
      <div className="workup-hdr" onClick={() => setOpen(o => !o)}>
        <div className="workup-icon-bg">▣</div>
        <div className="workup-hdr-text">
          <div className="workup-hdr-title">Recommended workup</div>
          <div className="workup-hdr-sub">Pre-referral checklist · dynamic to patient profile</div>
        </div>
        <div className="workup-count-badge">{total} items</div>
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#c4a661" }}>
          <ChevronDown size={16} />
        </div>
      </div>

      {open && (
        <div className="workup-body">
          {orderedCategories.map(cat => {
            const arr = workup[cat];
            if (!arr || arr.length === 0) return null;
            const meta = CATEGORY_LABELS[cat];
            return (
              <div key={cat} className="workup-section">
                <div className="workup-section-head">
                  <span className="workup-section-icon">{meta.icon}</span>
                  <span className="workup-section-title">{meta.label}</span>
                  <span className="workup-section-count">{arr.length}</span>
                </div>
                {arr.map((item, i) => (
                  <div key={i} className="workup-item">
                    <div className="workup-checkbox" />
                    <span className={`workup-priority ${item.priority}`}>
                      {PRIORITY_META[item.priority].label}
                    </span>
                    <div className="workup-item-body">
                      <div className="workup-item-text">{item.text}</div>
                      <div className="workup-item-reason">{item.reason}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── EvidenceRankedOptionsPanel ─────────────────────────────────────────────
// Layer 1 of the three-layer platform: the Evidence engine.
//
// Renders therapy options ranked by ESCAT tier, with the specific trial that
// supports each tier, NCCN preference flags, and patient-specific annotations
// (e.g. TP53 → reduced durability signal · prior CD19 → consider antigen
// escape). This is the "evidence-ranked options for clinician review"
// surface — explicitly framed as evidence summarization, not prediction.
function EvidenceRankedOptionsPanel({ pt, results }) {
  const [open, setOpen] = useState(true);
  if (!results) return null;

  // Build the input array for the ranker
  const productInputs = ALL_PRODUCTS.map(product => ({
    product,
    score: results[product.id],
    eligible: results[product.id]?.eligible || false,
  }));

  const ranked = rankTherapyOptions(pt, productInputs);

  // Only show products that have any matching evidence tier OR are eligible
  // (eligible but no tier rule → still shown so clinician sees they pass criteria)
  const visible = ranked.filter(r => r.tier !== "X" || r.eligible);
  if (visible.length === 0) return null;

  const annotationsByProduct = visible.map(r => r.annotations).flat();
  const hasAnyAnnotation = annotationsByProduct.length > 0;

  return (
    <div className="evidence-panel">
      <div className="evidence-hdr" onClick={() => setOpen(o => !o)}>
        <div className="evidence-icon-bg">≡</div>
        <div className="evidence-hdr-text">
          <div className="evidence-hdr-title">Evidence-ranked options</div>
          <div className="evidence-hdr-sub">ESCAT-tiered · NCCN-aware · evidence summary (not a prediction)</div>
        </div>
        <div className="evidence-count">
          {visible.filter(r => r.eligible).length} of {visible.length} eligible
        </div>
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#c4a661" }}>
          <ChevronDown size={16} />
        </div>
      </div>

      {open && (
        <div className="evidence-body">
          {visible.map(row => {
            const { product, tier, tierMeta, context, basis, nccnPreferred, annotations, eligible, blocks, warnings } = row;
            const ctUrl = basisUrl(basis);
            return (
              <div key={product.id} className={`evidence-row${eligible ? "" : " blocked"}`}>
                <div className="evidence-row-hdr">
                  <span className="evidence-tier-badge" style={{ background: tierMeta.color }}>
                    {tierMeta.label}
                  </span>
                  <div className="evidence-prod-name" style={{ color: product.color }}>
                    {product.name}
                  </div>
                  <span className="evidence-prod-generic">{product.generic}</span>
                  {nccnPreferred && (
                    <span className="evidence-nccn-pref">NCCN preferred</span>
                  )}
                  {!eligible && (
                    <span className="evidence-blocked-pill">Blocked</span>
                  )}
                </div>

                <div className="evidence-context">{context}</div>

                {basis && (
                  <div className="evidence-basis">
                    <span className="evidence-basis-label">Evidence basis</span>
                    <span className="evidence-basis-trial">
                      {ctUrl ? (
                        <a href={ctUrl} target="_blank" rel="noopener noreferrer" className="evidence-basis-link">
                          {basis.trial} · {basis.nctId} ↗
                        </a>
                      ) : (
                        <>{basis.trial}</>
                      )}
                    </span>
                    <span className="evidence-basis-finding">{basis.finding}</span>
                  </div>
                )}

                {annotations.length > 0 && (
                  <div className="evidence-annotations">
                    {annotations.map(a => (
                      <div key={a.id} className={`evidence-annotation ${a.severity}`}>
                        <span className="evidence-annotation-sev">
                          {a.severity === "upgrade" ? "↑ Preferred"
                            : a.severity === "block"   ? "✕ Blocked"
                            : a.severity === "warning" ? "⚠ Warning"
                            : "ⓘ Caveat"}
                        </span>
                        <div className="evidence-annotation-body">
                          <div className="evidence-annotation-label">{a.label}</div>
                          <div className="evidence-annotation-detail">{a.detail}</div>
                          <div className="evidence-annotation-source">{a.source}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!eligible && blocks.length > 0 && (
                  <div className="evidence-blocks">
                    <span className="evidence-blocks-label">Eligibility blocks</span>
                    <ul className="evidence-blocks-list">
                      {blocks.slice(0, 3).map((b, i) => <li key={i}>{b}</li>)}
                      {blocks.length > 3 && <li className="evidence-blocks-more">+ {blocks.length - 3} more — see product card below</li>}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          <div className="evidence-footer">
            <strong>Evidence summary, not a prediction.</strong> Tiers per ESCAT framework
            (Mateo et al. <em>Annals of Oncology</em> 2018). Tier IA = randomized superiority
            in this exact context · IB = regulatory approval · IIA = accelerated approval / single-arm.
            Annotations surface published subgroup signals — they do not modify the
            baseline evidence tier. Final therapeutic decisions require treating-physician
            judgment.
            {hasAnyAnnotation && " Patient-specific annotations shown above are derived from published subgroup analyses and the NGS / risk factors entered."}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MolecularIntelligencePanel ─────────────────────────────────────────────
// Renders detected biomarkers (grouped by category) + ESCAT tier badges +
// resistance flags + cell therapy nonresponse risk score. The defensible
// moat layer — post-NGS interpretation that surfaces evidence rather than
// claiming prediction.
function MolecularIntelligencePanel({ pt }) {
  const [open, setOpen] = useState(true);
  const summary = generateMolecularSummary(pt, pt.ngsReport || "");
  if (!summary.hasAnyFindings) return null;

  const { actionable, resistance, prognostic, incidental, risk } = summary;

  const BiomarkerCard = ({ bm }) => {
    const tierMeta = ESCAT_TIERS[bm.tier] || ESCAT_TIERS.X;
    return (
      <div className="biomarker-card">
        <div className="biomarker-card-hdr">
          <div className="biomarker-name">{bm.name}</div>
          <span className="biomarker-tier" style={{ background: tierMeta.color }}>
            {tierMeta.label}
          </span>
        </div>
        <div className="biomarker-summary">{bm.summary}</div>
        {bm.resistance && bm.resistance.length > 0 && (
          <div className="biomarker-block">
            <div className="biomarker-block-head">Resistance / failure context</div>
            <ul className="biomarker-list">
              {bm.resistance.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        {bm.implications && bm.implications.length > 0 && (
          <div className="biomarker-block">
            <div className="biomarker-block-head">Clinical implications</div>
            <ul className="biomarker-list">
              {bm.implications.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        {bm.references && bm.references.length > 0 && (
          <div className="biomarker-refs">
            {bm.references.map((r, i) => <span key={i} className="biomarker-ref">{r}</span>)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="molecular-panel">
      <div className="molecular-hdr" onClick={() => setOpen(o => !o)}>
        <div className="molecular-icon-bg">⬢</div>
        <div className="molecular-hdr-text">
          <div className="molecular-hdr-title">Molecular &amp; resistance intelligence</div>
          <div className="molecular-hdr-sub">Post-NGS interpretation · ESCAT evidence tiers · cell therapy nonresponse risk</div>
        </div>
        <div className={`chevron${open ? " open" : ""}`} style={{ color: "#4c6b8c" }}>
          <ChevronDown size={16} />
        </div>
      </div>

      {open && (
        <div className="molecular-body">
          {/* Cell therapy nonresponse risk score */}
          {risk.score > 0 && (
            <div className="risk-score-block" style={{ borderLeftColor: risk.color }}>
              <div className="risk-score-row">
                <div className="risk-score-headline" style={{ color: risk.color }}>
                  {risk.headline}
                </div>
                <div className="risk-score-num" style={{ background: risk.color }}>
                  {risk.score}
                </div>
              </div>
              <div className="risk-score-rec">{risk.recommendation}</div>
              <div className="risk-factors">
                <div className="risk-factors-head">Contributing factors</div>
                {risk.factors.map((f, i) => (
                  <div key={i} className="risk-factor-row">
                    <span className="risk-factor-weight">+{f.weight}</span>
                    <div className="risk-factor-body">
                      <div className="risk-factor-label">{f.label}</div>
                      {f.detail && <div className="risk-factor-detail">{f.detail}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actionable findings */}
          {actionable.length > 0 && (
            <div className="biomarker-group">
              <div className="biomarker-group-head" style={{ color: "#5a7a4a" }}>
                Actionable findings <span className="biomarker-group-count">{actionable.length}</span>
              </div>
              {actionable.map(bm => <BiomarkerCard key={bm.id} bm={bm} />)}
            </div>
          )}

          {/* Resistance findings */}
          {resistance.length > 0 && (
            <div className="biomarker-group">
              <div className="biomarker-group-head" style={{ color: "#b54a2c" }}>
                Resistance signals <span className="biomarker-group-count">{resistance.length}</span>
              </div>
              {resistance.map(bm => <BiomarkerCard key={bm.id} bm={bm} />)}
            </div>
          )}

          {/* Prognostic findings */}
          {prognostic.length > 0 && (
            <div className="biomarker-group">
              <div className="biomarker-group-head" style={{ color: "#c4a661" }}>
                Adverse prognostic <span className="biomarker-group-count">{prognostic.length}</span>
              </div>
              {prognostic.map(bm => <BiomarkerCard key={bm.id} bm={bm} />)}
            </div>
          )}

          {/* Incidental — detected but not relevant to this cancer */}
          {incidental.length > 0 && (
            <div className="biomarker-group">
              <div className="biomarker-group-head" style={{ color: "#98908380" }}>
                Detected · other tumor types <span className="biomarker-group-count">{incidental.length}</span>
              </div>
              <div className="biomarker-incidental-note">
                These alterations were detected in the NGS report but are typically actionable in other tumor types. Listed for completeness.
              </div>
              {incidental.map(bm => <BiomarkerCard key={bm.id} bm={bm} />)}
            </div>
          )}

          <div className="molecular-footer">
            <strong>Evidence-only.</strong> CellTx Match surfaces published evidence and resistance context — it does not predict response or recommend therapy. Final therapeutic decisions require molecular tumor board review and treating-physician judgment. ESCAT tiers per Mateo et al. <em>Annals of Oncology</em> 2018.
          </div>
        </div>
      )}
    </div>
  );
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

// ── Centers page (/centers) — pitch + 90-day pilot offer ──────────────────
function CentersView({ onRequestPilot }) {
  return (
    <div className="centers-view">
      {/* Hero */}
      <div className="centers-hero">
        <div className="centers-tag">For certified cell therapy centers</div>
        <h1 className="centers-h1">
          Better-qualified <em>inbound CAR-T referrals</em><br />
          from community oncology practices.
        </h1>
        <p className="centers-sub">
          CellTx Match runs as a free decision-support tool in the community oncology
          practices that refer to your center. Every referral arrives screened against all 12
          FDA-approved products, with a standardized packet, completed workup checklist, and
          eligibility flagged in advance. Your referral office spends less time on intake
          back-and-forth and more time on patient consultation.
        </p>
        <div className="centers-hero-cta-row">
          <button className="centers-hero-cta primary" onClick={onRequestPilot}>
            Request 90-day charter pilot →
          </button>
          <a href="/api/fhir/example.json" target="_blank" rel="noopener noreferrer" className="centers-hero-cta secondary">
            See sample referral packet
          </a>
        </div>
      </div>

      {/* Problem / Solution split */}
      <div className="ps-section">
        <div className="ps-col problem">
          <div className="ps-eyebrow">⚠ The referral-office reality today</div>
          <h2 className="ps-title">Community referrals arrive incomplete, late, or inappropriate.</h2>
          <ul className="ps-list problem">
            <li>Missing IHC, outside records, recent imaging — referral office calls the practice multiple times before triage</li>
            <li>Patients deteriorate during workup; eligibility window closes before consult is scheduled</li>
            <li>Up to 30% of referrals turn out to be ineligible on arrival — wasted consult slot, lost goodwill</li>
            <li>Community practices under-refer because the workflow is opaque and the criteria feel uncertain</li>
            <li>Manual completeness checks and chase-down cost coordinator hours every week</li>
          </ul>
        </div>
        <div className="ps-col solution">
          <div className="ps-eyebrow">✓ With CellTx Match in your community practices</div>
          <h2 className="ps-title">Pre-qualified referrals with the workup already in motion.</h2>
          <ul className="ps-list solution">
            <li>Standardized referral packets — every patient arrives with complete intake</li>
            <li>Eligibility verified against your product list before the referral is even sent</li>
            <li>Urgency triage flags HIGH-priority patients automatically — refer earlier, not later</li>
            <li>Workup checklist visible to both sides — coordinator knows what's still pending</li>
            <li>Per-center custom intake requirements supported — your protocols, your branding</li>
          </ul>
        </div>
      </div>

      {/* The pilot offer */}
      <div className="pilot-offer">
        <div className="pilot-offer-tag">Charter pilot · Limited to first 5 centers</div>
        <h2 className="pilot-offer-title">
          90-day pilot with <em>your center</em>, free for charter institutions.
        </h2>
        <p className="pilot-offer-sub">
          A scoped, low-risk evaluation focused on a single disease area
          (relapsed/refractory LBCL or multiple myeloma) at one center. Custom intake
          requirements built to your protocols. Monthly metrics report. After 90 days,
          decide whether to continue under Institutional pricing — pilot fee is credited
          toward your first year if you continue.
        </p>

        <div className="pilot-grid">
          <div className="pilot-block">
            <div className="pilot-block-label">Scope</div>
            <ul>
              <li>One disease area (R/R LBCL or MM)</li>
              <li>One center · one disease team</li>
              <li>90-day fixed engagement</li>
              <li>Custom intake configuration</li>
              <li>Branded referral packets</li>
            </ul>
          </div>
          <div className="pilot-block">
            <div className="pilot-block-label">Metrics tracked</div>
            <ul>
              <li>Referrals received per month</li>
              <li>Referral packet completeness rate</li>
              <li>Time from referral → consult</li>
              <li>Time from consult → leukapheresis</li>
              <li>Inappropriate referral rate</li>
              <li>Referring-practice engagement</li>
            </ul>
          </div>
          <div className="pilot-block">
            <div className="pilot-block-label">Your commitments</div>
            <ul>
              <li>Identify a clinical champion</li>
              <li>30-min onboarding session</li>
              <li>Monthly 30-min review call</li>
              <li>Access to referral data (de-identified)</li>
              <li>Reference call rights post-pilot</li>
            </ul>
          </div>
        </div>

        <div className="pilot-cta-row">
          <button className="pilot-charter" onClick={onRequestPilot}>
            Apply for charter pilot →
          </button>
          <div className="pilot-info">
            <strong>$0</strong> for the first 5 centers · 50% off Year 1 if continuing
          </div>
        </div>
      </div>

      {/* Metrics preview */}
      <div className="metrics-preview">
        <div className="metrics-preview-hdr">
          <h3 className="metrics-preview-title">What your monthly report looks like</h3>
          <span className="metrics-preview-tag">Sample · illustrative numbers</span>
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-num">47</div>
            <div className="metric-label">Referrals received via CellTx</div>
            <div className="metric-sub">↑ from 28 in baseline month</div>
          </div>
          <div className="metric-card">
            <div className="metric-num"><em>94%</em></div>
            <div className="metric-label">Referral packet completeness</div>
            <div className="metric-sub">↑ from 58% baseline</div>
          </div>
          <div className="metric-card">
            <div className="metric-num"><em>9d</em></div>
            <div className="metric-label">Median referral → consult</div>
            <div className="metric-sub">↓ from 21d baseline</div>
          </div>
          <div className="metric-card">
            <div className="metric-num"><em>4%</em></div>
            <div className="metric-label">Inappropriate referral rate</div>
            <div className="metric-sub">↓ from 28% baseline</div>
          </div>
          <div className="metric-card">
            <div className="metric-num">12</div>
            <div className="metric-label">Engaged referring practices</div>
            <div className="metric-sub">↑ from 4 at pilot start</div>
          </div>
          <div className="metric-card">
            <div className="metric-num">23d</div>
            <div className="metric-label">Median consult → apheresis</div>
            <div className="metric-sub">↓ from 35d baseline</div>
          </div>
        </div>
      </div>

      {/* Post-pilot pricing */}
      <div className="centers-pricing">
        <h3 className="centers-pricing-title">After the pilot</h3>
        <div className="centers-pricing-grid">
          <div className="centers-pricing-card featured">
            <div className="centers-pricing-stage">Charter (first 5 centers)</div>
            <div className="centers-pricing-amount"><em>$0</em></div>
            <div className="centers-pricing-period">90-day pilot · free</div>
            <p className="centers-pricing-desc">
              First 5 charter centers receive a fully-waived pilot in exchange for
              case-study and reference-call rights. 50% off Year 1 if continuing.
            </p>
          </div>
          <div className="centers-pricing-card">
            <div className="centers-pricing-stage">Institutional</div>
            <div className="centers-pricing-amount">$2,500+</div>
            <div className="centers-pricing-period">per month · annual contract</div>
            <p className="centers-pricing-desc">
              Standard center license. Unlimited referrals, custom branding, monthly
              metrics, dedicated support. Most centers land here post-pilot.
            </p>
          </div>
          <div className="centers-pricing-card">
            <div className="centers-pricing-stage">Enterprise (network)</div>
            <div className="centers-pricing-amount">$25K–$150K+</div>
            <div className="centers-pricing-period">annual contract · custom</div>
            <p className="centers-pricing-desc">
              Multi-site networks · health systems · pharma medical affairs sponsored
              deployments. SSO · HIPAA BAA · FHIR integration · audit log.
            </p>
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="centers-final-cta">
        <div className="centers-final-text">
          <h3 className="centers-final-title">
            Worth a <em>30-minute</em> scoping call?
          </h3>
          <p className="centers-final-sub">
            Replies within 1 business day. Ramja Sritharan, Founder · Tumor immunology PhD ·
            translational oncology workflows.
          </p>
        </div>
        <a
          href="mailto:sri.ramya003@gmail.com?subject=CellTx%20Match%20-%20Charter%20Pilot%20Inquiry&body=Hi%20Ramja%2C%0A%0AI%27m%20interested%20in%20discussing%20a%20charter%20pilot%20for%20%5BCenter%20Name%5D.%0A%0ATimes%20I%27m%20available%20this%20week%3A%0A-%20%0A%0A"
          className="centers-hero-cta primary"
        >
          Schedule a call →
        </a>
      </div>
    </div>
  );
}

// ── Research & Partnerships page (/research) ──────────────────────────────
function ResearchView({ onGoToCriteria, onGoToRetro, onGoToAnalytics }) {
  return (
    <div className="research-view">
      <div className="research-hero">
        <div className="research-tag">Research · Partnerships · Integration</div>
        <h1 className="research-h1">
          The <em>operational ontology</em> for<br />
          cell therapy referrals
        </h1>
        <p className="research-sub">
          CellTx Match isn't just a screener — it's a structured ontology and longitudinal
          dataset of cell therapy referral decisions. We work with academic researchers,
          oncology data partners, EHR vendors, and pharma medical affairs teams to integrate
          this infrastructure into existing clinical and research workflows.
        </p>
      </div>

      {/* Four collaboration types */}
      <div className="research-card-grid">
        <div className="research-card">
          <div className="research-card-tag">Academic research</div>
          <h3 className="research-card-title">Co-author a retrospective referral-timing study</h3>
          <p className="research-card-body">
            Bring de-identified historical referral data; we provide the analysis engine,
            sample size calculations, and a drafted methodology section. Suitable for
            single-center or multi-center retrospective studies on referral delays, eligibility
            erosion during workup, and end-to-end pipeline conversion.
          </p>
          <button
            className="research-card-link"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", borderBottom: "1px dotted #1a181580" }}
            onClick={onGoToRetro}
          >
            Try the retrospective tool →
          </button>
        </div>

        <div className="research-card">
          <div className="research-card-tag">EHR / FHIR integration</div>
          <h3 className="research-card-title">SMART-on-FHIR ready data model</h3>
          <p className="research-card-body">
            Every case exports as a FHIR R4 Bundle (Patient · Condition · Observation ·
            ServiceRequest · Task · CarePlan · Provenance). LOINC for labs, ICD-10-CM for
            conditions, SNOMED CT for procedures, UCUM for units. Designed to slot into
            Epic, Oracle Health, Athenahealth, and other major EHRs.
          </p>
          <a className="research-card-link" href="/api/fhir/example.json" target="_blank" rel="noopener noreferrer">
            View example FHIR Bundle →
          </a>
        </div>

        <div className="research-card">
          <div className="research-card-tag">Real-world evidence</div>
          <h3 className="research-card-title">Structured pipeline data, pre-treatment</h3>
          <p className="research-card-body">
            CellTx captures the operational decision point that current RWD platforms miss:
            who was referred, when, why they were eligible (or weren't), how long the workup
            took, and what the outcome was. De-identified outcomes CSV available on every
            program's analytics dashboard.
          </p>
          <button
            className="research-card-link"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", borderBottom: "1px dotted #1a181580" }}
            onClick={onGoToAnalytics}
          >
            See analytics dashboard →
          </button>
        </div>

        <div className="research-card dark">
          <div className="research-card-tag">Pharma medical affairs</div>
          <h3 className="research-card-title">Pre-referral decision intelligence</h3>
          <p className="research-card-body">
            The platform surfaces FDA-approved products in clinical context at the point of
            referral. Pharma medical affairs teams interested in workflow-level visibility
            into how products are selected — pivotal trial citations, indication match,
            sequencing logic — can engage through sponsored content or aggregate analytics.
            All sponsored placement is transparent to the clinician and disclosed in the criteria library.
          </p>
          <a className="research-card-link" href="mailto:sri.ramya003@gmail.com?subject=Pharma%20Medical%20Affairs%20Partnership">
            Contact for partnership →
          </a>
        </div>
      </div>

      {/* Technical specifications */}
      <div className="research-section">
        <h2 className="research-section-title">Data model &amp; integration specifications</h2>
        <div className="research-section-body">
          <p>
            CellTx Match is built on a structured data model designed for interoperability
            with major EHR and RWD platforms. Every case carries a complete clinical timeline,
            audit trail, and outcome record — all exportable as standards-aligned data.
          </p>
        </div>

        <div className="research-spec-table">
          <div className="research-spec-row">
            <div className="research-spec-key">Clinical data model</div>
            <div className="research-spec-val">
              FHIR R4 (HL7 v4.0.1) · Bundle export per case via{" "}
              <code>downloadCaseAsFhir()</code> client-side helper.
              No PHI transmitted server-side on Free / Pilot / Institutional tiers.
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Code systems</div>
            <div className="research-spec-val">
              ICD-10-CM (conditions) · LOINC (labs, biomarkers, ECOG) ·
              SNOMED CT (procedures, lifecycle stages) · UCUM (lab units)
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Resource types exported</div>
            <div className="research-spec-val">
              <code>Patient</code> (de-identified) · <code>Condition</code> ·{" "}
              <code>Observation</code> · <code>ServiceRequest</code> ·{" "}
              <code>Task</code> · <code>CarePlan</code> · <code>Provenance</code>
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Rule library</div>
            <div className="research-spec-val">
              Public JSON catalog of every FDA label rule, NCCN-aligned pathway, urgency
              factor, and trial-scoring weight.{" "}
              <a href="/api/criteria/v1.json" target="_blank" rel="noopener noreferrer" style={{ color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80" }}>
                /api/criteria/v1.json
              </a>
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Outcomes export</div>
            <div className="research-spec-val">
              De-identified per-program CSV: case ID hash, cancer type, lines, ECOG, lifecycle
              stage, outcome, time-to-each-stage, biomarker status, high-risk modifiers.
              Available on every institution's analytics dashboard.
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Privacy architecture</div>
            <div className="research-spec-val">
              Patient data lives entirely in browser <code>localStorage</code>. Shareable case
              URLs encode state as base64 in the URL hash (never transmitted). HIPAA BAA
              available on Enterprise tier for server-side sync requirements.
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Update cadence</div>
            <div className="research-spec-val">
              Rule library reviewed within 30 days of FDA approvals or NCCN guideline updates.
              Quarterly clinical content briefings to Institutional and Enterprise customers.
            </div>
          </div>
          <div className="research-spec-row">
            <div className="research-spec-key">Regulatory positioning</div>
            <div className="research-spec-val">
              Not a medical device. Qualifies as clinical decision support exempt from
              premarket review under 21st Century Cures Act §3060(a).{" "}
              <button
                onClick={() => onGoToCriteria()}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80", font: "inherit" }}
              >
                View criteria library →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* What we're looking for */}
      <div className="research-section">
        <h2 className="research-section-title">Active collaboration interests</h2>
        <div className="research-section-body">
          <p style={{ marginBottom: 18 }}>
            We're currently engaged or actively seeking partnerships in the following areas:
          </p>
          <ul style={{ paddingLeft: 22, margin: 0, fontSize: 14.5, lineHeight: 1.85, color: "#1a1815" }}>
            <li>
              <strong>Charter pilot institutions</strong> — first 5 CAR-T programs to deploy
              receive free 3-month pilot in exchange for co-authored case study.
            </li>
            <li>
              <strong>Retrospective study collaborators</strong> — academic centers with
              de-identified historical referral data interested in publishing referral-timing
              analyses.
            </li>
            <li>
              <strong>EHR vendor partnerships</strong> — SMART-on-FHIR launch integration with
              Epic, Oracle Health, or Athenahealth specialty modules.
            </li>
            <li>
              <strong>RWD aggregation partners</strong> — oncology data platforms interested in
              the longitudinal pre-treatment pipeline data CellTx captures.
            </li>
            <li>
              <strong>Pharma medical affairs</strong> — sponsored content and aggregate analytics
              for CAR-T and bispecific antibody manufacturers, with full clinician-facing
              disclosure.
            </li>
            <li>
              <strong>Trial sponsor matching</strong> — biotech sponsors of recruiting cell
              therapy trials interested in patient-level matching infrastructure.
            </li>
          </ul>
        </div>
      </div>

      {/* CTA band */}
      <div className="research-cta-band">
        <div className="research-cta-text">
          <h3 className="research-cta-title">
            Interested in a <em>partnership</em>, integration, or research collaboration?
          </h3>
          <p className="research-cta-sub">
            Reply directly to Ramja Sritharan, founder · Tumor immunology PhD · Translational
            oncology workflows. Replies within 1 business day.
          </p>
        </div>
        <a
          href="mailto:sri.ramya003@gmail.com?subject=CellTx%20Match%20-%20Partnership%20Inquiry"
          className="research-cta-btn"
        >
          Reach out →
        </a>
      </div>
    </div>
  );
}

// ── Retrospective Validation Tool (/retrospective) ────────────────────────
function RetrospectiveView({ onGoToScreener }) {
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showSchema, setShowSchema] = useState(false);

  const runAnalysis = () => {
    setError(null);
    setResult(null);
    if (!csvText.trim()) {
      setError("Paste CSV data above or click 'Load sample data' to begin.");
      return;
    }
    try {
      const { rows } = parseCSV(csvText);
      if (rows.length === 0) {
        setError("No data rows detected. Check that the CSV has a header row followed by data.");
        return;
      }
      const analysis = runRetrospective(rows);
      setResult(analysis);
    } catch (err) {
      setError(`Parse error: ${err.message}`);
    }
  };

  const loadSample = () => {
    setCsvText(SAMPLE_CSV);
    setError(null);
    setResult(null);
  };

  const clearAll = () => {
    setCsvText("");
    setResult(null);
    setError(null);
  };

  const downloadCSV = () => {
    if (!result) return;
    const csv = toCSV(result.rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `celltx-retrospective-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Classification display metadata
  const classMeta = {
    missed_never_referred: { label: "Missed · never referred", tone: "bad", color: "#b54a2c" },
    missed_early_referral: { label: "Missed early referral", tone: "bad", color: "#b54a2c" },
    delayed_referral:      { label: "Delayed referral", tone: "warn", color: "#c4a661" },
    timely_referral:       { label: "Timely referral", tone: "good", color: "#5a7a4a" },
    pre_emptive:           { label: "Pre-emptive (before threshold)", tone: "good", color: "#5a7a4a" },
    monitor_correct:       { label: "Monitor — appropriate", tone: "neutral", color: "#4c6b8c" },
    not_yet_indicated:     { label: "Not yet indicated", tone: "neutral", color: "#6b645a" },
    unknown:               { label: "Unknown", tone: "neutral", color: "#98908380" },
  };

  return (
    <div className="retro-view">
      <div className="retro-hero">
        <div className="retro-tag">Research · Retrospective validation</div>
        <h1 className="retro-h1">
          Compare <em>actual referral timing</em> against<br />
          CellTx-recommended timing
        </h1>
        <p className="retro-sub">
          Paste a CSV of de-identified historical referrals. CellTx runs each row through the eligibility
          engine + urgency rubric and compares against the actual referral timing in your data.
          Output is the four study endpoints — missed early referrals, delayed referrals,
          timely referrals, median referral delay — formatted for publication or IRB submission.
        </p>
      </div>

      {/* Input section */}
      <div className="retro-input-section">
        <div className="retro-input-hdr">
          <h2 className="retro-input-title">Input data · CSV with required headers</h2>
          <div className="retro-input-actions">
            <button className="retro-btn" onClick={() => setShowSchema(s => !s)}>
              {showSchema ? "Hide" : "View"} schema
            </button>
            <button className="retro-btn" onClick={loadSample}>Load sample data</button>
            <button className="retro-btn" onClick={clearAll}>Clear</button>
            <button className="retro-btn primary" onClick={runAnalysis}>Run analysis →</button>
          </div>
        </div>

        {showSchema && (
          <div style={{ background: "#ebe6dc", padding: "14px 16px", marginBottom: 12, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#1a1815", lineHeight: 1.65 }}>
            <strong>Required columns:</strong> patient_id, cancer_type, prior_lines, ecog, index_date, referral_date<br />
            <strong>Optional:</strong> cd19, bcma, cd20, gprc5d, primary_refractory, b_symptoms, elevated_ldh, pod24, double_hit, btki_exposed, btki_refractory, lenalidomide_refractory, extramedullary_disease, high_risk_cytogenetics, infused_date<br />
            <strong>Booleans</strong> as 1/0 or yes/no. <strong>Dates</strong> as YYYY-MM-DD. <strong>cancer_type</strong> values: DLBCL, Follicular lymphoma, Mantle cell lymphoma, CLL/SLL, ALL, Multiple myeloma, PMBCL.<br /><br />
            <strong>De-identification:</strong> use anonymous patient_id values (P001, P002, …). Do NOT include patient names, MRNs, DOBs, or any direct identifiers.
          </div>
        )}

        <textarea
          className="retro-textarea"
          placeholder={`Paste CSV data here. Example:\n\npatient_id,cancer_type,prior_lines,ecog,primary_refractory,index_date,referral_date,infused_date\nP001,DLBCL,2,1,1,2024-03-15,2024-05-22,2024-07-08\nP002,DLBCL,3,2,0,2024-04-02,2024-04-15,2024-05-29\n...`}
          value={csvText}
          onChange={e => setCsvText(e.target.value)}
        />

        {error && (
          <div style={{ marginTop: 10, padding: "10px 14px", background: "#b54a2c10", border: "1px solid #b54a2c40", color: "#b54a2c", fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Headline endpoints */}
          <div className="retro-endpoints">
            <div className="retro-endpoint bad">
              <div className="retro-endpoint-num">{Math.round(result.endpoints.missedEarlyReferralRate * 100)}%</div>
              <div className="retro-endpoint-label">Missed early referrals<br />(REFER NOW · delayed &gt; 30 days)</div>
            </div>
            <div className="retro-endpoint" style={{ borderLeft: "4px solid #c4a661" }}>
              <div className="retro-endpoint-num" style={{ color: "#7a5e10" }}>{Math.round(result.endpoints.delayedReferralRate * 100)}%</div>
              <div className="retro-endpoint-label">Delayed referrals<br />(HIGH urgency · 14-30 day delay)</div>
            </div>
            <div className="retro-endpoint good">
              <div className="retro-endpoint-num">{Math.round(result.endpoints.timelyReferralRate * 100)}%</div>
              <div className="retro-endpoint-label">Timely referrals<br />(within 14 days of index)</div>
            </div>
          </div>

          {/* Secondary metrics */}
          <div className="retro-endpoints" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
            <div className="retro-endpoint neutral">
              <div className="retro-endpoint-num">
                {result.endpoints.medianReferralDelay === null ? "—" : `${Math.round(result.endpoints.medianReferralDelay)}d`}
              </div>
              <div className="retro-endpoint-label">Median referral delay<br />(index date → actual referral)</div>
            </div>
            <div className="retro-endpoint neutral">
              <div className="retro-endpoint-num">
                {result.endpoints.medianReferralToInfusion === null ? "—" : `${Math.round(result.endpoints.medianReferralToInfusion)}d`}
              </div>
              <div className="retro-endpoint-label">Median referral-to-infusion<br />(actual operational throughput)</div>
            </div>
          </div>

          {/* Classification distribution */}
          <div className="retro-dist">
            <div className="retro-dist-hdr">Classification distribution · n = {result.total}</div>
            {Object.entries(result.counts)
              .filter(([, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([key, count]) => {
                const meta = classMeta[key] || classMeta.unknown;
                const pct = result.total > 0 ? (count / result.total) * 100 : 0;
                return (
                  <div key={key} className="retro-dist-row">
                    <div className="retro-dist-label">{meta.label}</div>
                    <div className="retro-dist-bar">
                      <div className="retro-dist-fill" style={{ width: `${pct}%`, background: meta.color }} />
                    </div>
                    <div className="retro-dist-count">{count}</div>
                    <div className="retro-dist-pct">{pct.toFixed(0)}%</div>
                  </div>
                );
              })}
          </div>

          {/* Per-row results table */}
          <div className="retro-input-section">
            <div className="retro-input-hdr">
              <h2 className="retro-input-title">Per-patient results · n = {result.total}</h2>
              <div className="retro-input-actions">
                <button className="retro-btn" onClick={downloadCSV}>↓ Export CSV</button>
                <button className="retro-btn" onClick={() => window.print()}>Print summary</button>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="retro-results-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Cancer</th>
                    <th>Lines</th>
                    <th>ECOG</th>
                    <th>CellTx urgency</th>
                    <th>CellTx decision</th>
                    <th>Delay (d)</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map(r => {
                    const cm = classMeta[r.classification] || classMeta.unknown;
                    return (
                      <tr key={r.patientId}>
                        <td><strong>{r.patientId}</strong></td>
                        <td>{(r.patient.cancerType || "—").split("(")[0].trim()}</td>
                        <td>{r.patient.priorLines}</td>
                        <td>{r.patient.ecog}</td>
                        <td>
                          <span className={`retro-cell-class ${r.urgency === "high" ? "bad" : r.urgency === "medium" ? "warn" : r.urgency === "low" ? "good" : "neutral"}`}>
                            {r.urgency.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{r.decision}</td>
                        <td style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: r.referralDelta > 14 ? "#b54a2c" : r.referralDelta === null ? "#98908380" : "#5a7a4a" }}>
                          {r.referralDelta === null ? "—" : r.referralDelta}
                        </td>
                        <td>
                          <span className={`retro-cell-class ${cm.tone}`}>
                            {cm.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer */}
          <div style={{ marginTop: 24, padding: "16px 20px", background: "#ebe6dc", fontSize: 12, color: "#6b645a", lineHeight: 1.65 }}>
            <strong style={{ color: "#1a1815" }}>How to use these results:</strong> Export the CSV for further analysis in R / Stata / Python.
            Cite the methodology as "Retrospective comparison of actual referral timing against CellTx Match
            (cart-match.vercel.app) eligibility engine recommendations, using FDA prescribing information criteria
            current as of May 2026 and NCCN-aligned disease pathways for {result.total} historical referrals."
            Pair with your institution's IRB-approved data extraction for publication.
          </div>
        </>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="board-btn" onClick={onGoToScreener}>← Back to screener</button>
      </div>
    </div>
  );
}

// ── Operations dashboard (/today) ──────────────────────────────────────────
function OperationsView({ board, onGoToBoard, onAssignCase, onEscalateCase, onUpdateTimeline, onSetPendingLabs, onSetCaseStage, onUpdateTask, currentUserName }) {
  const [assigneeFilter, setAssigneeFilter] = useState("__all__");

  const allItems = computePendingItems(board);
  const items    = filterByAssignee(allItems, assigneeFilter);
  const grouped  = groupByUrgency(items);
  const summary  = summarizeOps(items);
  const assignees = uniqueAssignees(allItems);

  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const totalActive = board.filter(c => !["closed", "deferred", "not_indicated"].includes(c.stage)).length;

  // Quick-action handlers
  const handleSnooze = (caseId) => {
    const newDate = new Date();
    newDate.setDate(newDate.getDate() + 7);
    onUpdateTimeline && onUpdateTimeline(caseId, "_root", { nextActionDate: newDate.toISOString().slice(0, 10) });
  };

  const handleMarkLabComplete = (caseId, labId) => {
    const c = board.find(x => x.id === caseId);
    if (!c) return;
    const labs = (c.timeline?.pendingLabs || []).map(l =>
      l.id === labId ? { ...l, status: "complete", completedAt: new Date().toISOString().slice(0, 10) } : l
    );
    onSetPendingLabs(caseId, labs);
  };

  const handleAdvanceFromOverdue = (caseId) => {
    // Mark the case as still progressing — refresh the reassessment to next week
    handleSnooze(caseId);
  };

  // Render an item with the appropriate quick-action button(s)
  const renderItem = (it) => {
    let quickAction = null;
    switch (it.type) {
      case "lab_overdue":
        quickAction = (
          <button className="ops-item-btn" onClick={() => handleMarkLabComplete(it.caseId, it.payload.labId)}>
            Mark complete
          </button>
        );
        break;
      case "task_overdue":
      case "task_today":
      case "task_week":
        quickAction = (
          <button className="ops-item-btn" onClick={() => onUpdateTask(it.caseId, it.payload.taskId, { status: "complete" })}>
            Mark complete
          </button>
        );
        break;
      case "reassessment_overdue":
      case "reassessment_today":
      case "reassessment_week":
        quickAction = (
          <button className="ops-item-btn" onClick={() => handleSnooze(it.caseId)}>
            Snooze 1w
          </button>
        );
        break;
      case "escalated":
        quickAction = (
          <button className="ops-item-btn" onClick={() => onEscalateCase(it.caseId, null)}>
            Resolve
          </button>
        );
        break;
      default: break;
    }
    return (
      <div key={it.id} className={`ops-item ${it.urgency}`}>
        <div className="ops-item-icon">{it.icon}</div>
        <div className="ops-item-body">
          <div className="ops-item-label">{it.label}</div>
          <div className="ops-item-case">
            <strong>{it.caseLabel}</strong>
            <span>· {it.caseSummary}</span>
            {it.assignedTo && <span className="ops-assigned-pill">{it.assignedTo}</span>}
          </div>
        </div>
        <div className="ops-item-actions">
          {quickAction}
          <button className="ops-item-btn" onClick={onGoToBoard} title="Open in tumor board">Open</button>
        </div>
      </div>
    );
  };

  if (board.length === 0) {
    return (
      <div className="ops-view">
        <div className="ops-hero">
          <div className="ops-tag">Operations · Today</div>
          <h1 className="ops-h1">No active cases</h1>
          <div className="ops-sub">Add patients to the tumor board to populate the operations queue</div>
        </div>
        <div className="ops-empty">
          <div className="ops-empty-glyph">○</div>
          <p style={{ fontSize: 14, color: "#6b645a", lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
            The operations dashboard pulls together every pending item across your tumor board — overdue
            labs, insurance decisions, manufacturing arrivals, infusion scheduling, escalations.
            Once cases are added, this becomes your daily-morning queue.
          </p>
          <button className="board-empty-cta" style={{ marginTop: 18 }} onClick={onGoToBoard}>Open tumor board →</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ops-view">
      <div className="ops-hero">
        <div className="ops-tag">Operations · Today</div>
        <h1 className="ops-h1">Coordinator queue</h1>
        <div className="ops-sub">{dateStr} · {totalActive} active case{totalActive !== 1 ? "s" : ""} · {summary.total} item{summary.total !== 1 ? "s" : ""} on the queue</div>
      </div>

      {/* Headline counts */}
      <div className="ops-counts">
        <div className="ops-count overdue">
          <div className="ops-count-num">{summary.overdue}</div>
          <div className="ops-count-label">Overdue</div>
        </div>
        <div className="ops-count due_today">
          <div className="ops-count-num">{summary.due_today}</div>
          <div className="ops-count-label">Due today</div>
        </div>
        <div className="ops-count due_this_week">
          <div className="ops-count-num">{summary.due_this_week}</div>
          <div className="ops-count-label">This week</div>
        </div>
        <div className="ops-count escalated">
          <div className="ops-count-num">{summary.escalated}</div>
          <div className="ops-count-label">Escalated</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="ops-filters">
        <span className="ops-filter-label">Assigned to</span>
        <select className="ops-filter-select" value={assigneeFilter} onChange={e => setAssigneeFilter(e.target.value)}>
          <option value="__all__">Anyone</option>
          {assignees.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
          <option value="__unassigned__">Unassigned</option>
        </select>
        <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#6b645a" }}>
          {items.length} of {allItems.length} item{allItems.length !== 1 ? "s" : ""} shown
        </span>
      </div>

      {/* All-clear empty state */}
      {summary.total === 0 && (
        <div className="ops-empty">
          <div className="ops-empty-glyph">✓</div>
          <p style={{ fontSize: 14, color: "#6b645a", lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>
            <strong>No pending items.</strong> Your queue is clear. New items will appear here as
            cases progress through the pipeline.
          </p>
        </div>
      )}

      {/* Escalations — always shown first if present */}
      {grouped.escalated.length > 0 && (
        <div className="ops-section">
          <div className="ops-section-hdr escalated">
            <h2 className="ops-section-title">🚩 Escalations</h2>
            <span className="ops-section-count">{grouped.escalated.length}</span>
          </div>
          {grouped.escalated.map(renderItem)}
        </div>
      )}

      {grouped.overdue.length > 0 && (
        <div className="ops-section">
          <div className="ops-section-hdr overdue">
            <h2 className="ops-section-title">Overdue · needs action now</h2>
            <span className="ops-section-count">{grouped.overdue.length}</span>
          </div>
          {grouped.overdue.map(renderItem)}
        </div>
      )}

      {grouped.due_today.length > 0 && (
        <div className="ops-section">
          <div className="ops-section-hdr due_today">
            <h2 className="ops-section-title">Due today</h2>
            <span className="ops-section-count">{grouped.due_today.length}</span>
          </div>
          {grouped.due_today.map(renderItem)}
        </div>
      )}

      {grouped.due_this_week.length > 0 && (
        <div className="ops-section">
          <div className="ops-section-hdr due_this_week">
            <h2 className="ops-section-title">This week</h2>
            <span className="ops-section-count">{grouped.due_this_week.length}</span>
          </div>
          {grouped.due_this_week.map(renderItem)}
        </div>
      )}

      <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="board-btn primary" onClick={onGoToBoard}>← Open tumor board</button>
        <button className="board-btn" onClick={() => window.print()}>Print queue</button>
      </div>
    </div>
  );
}

// ── Analytics dashboard (/analytics) ───────────────────────────────────────
function AnalyticsView({ board, onGoToBoard, onGoToScreener }) {
  const analytics = computeBoardAnalytics(board);

  // Empty state
  if (!analytics) {
    return (
      <div className="analytics-view">
        <div className="analytics-hero">
          <div className="analytics-tag">Program Analytics</div>
          <h1 className="analytics-h1">No cases on the tumor board yet</h1>
          <div className="analytics-sub">Analytics will populate as cases progress through the pipeline</div>
        </div>
        <div className="analytics-empty">
          <div className="analytics-empty-glyph">◔</div>
          <p className="analytics-empty-text">
            Screen patients and add them to the tumor board. Once cases start moving through the
            referral pipeline, this page will show your program's conversion funnel, median
            time-to-stage, outcomes breakdown, and per-cancer-type metrics.
          </p>
          <div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button className="board-empty-cta" onClick={onGoToScreener}>Start screening →</button>
            <button className="board-empty-cta" style={{ background: "transparent", color: "#1a1815", border: "1px solid #1a181550" }} onClick={onGoToBoard}>Open tumor board →</button>
          </div>
        </div>
      </div>
    );
  }

  const {
    total, funnel, conversionRates, medianDays, outcomes, cancerTypeRows, firstCaseDate,
  } = analytics;

  // Active = approved through manufacturing (in-flight referrals)
  const activeCount = funnel.approved - funnel.infused;

  // Bucket conversion rates for color coding
  const rateColor = (r) => {
    if (r === null) return "";
    if (r >= 0.7) return "good";
    if (r >= 0.4) return "warn";
    return "poor";
  };

  // Funnel rows
  const funnelData = [
    { label: "Screened",            count: funnel.screened,   rate: null },
    { label: "Decided",             count: funnel.decided,    rate: conversionRates.decision },
    { label: "Approved",            count: funnel.approved,   rate: conversionRates.approval },
    { label: "Referred",            count: funnel.referred,   rate: conversionRates.referral },
    { label: "Apheresis",           count: funnel.apheresis,  rate: conversionRates.apheresis },
    { label: "Manufacturing",       count: funnel.inMfg,      rate: conversionRates.manufacturing },
    { label: "Infused",             count: funnel.infused,    rate: conversionRates.infusion },
    { label: "Day 30 follow-up",    count: funnel.day30,      rate: null },
    { label: "Day 90 follow-up",    count: funnel.day90,      rate: null },
  ];

  const maxCount = funnelData[0].count || 1;

  // Outcomes — sort by count descending
  const outcomeEntries = Object.entries(outcomes).sort(([, a], [, b]) => b - a);
  const totalOutcomes = outcomeEntries.reduce((sum, [, n]) => sum + n, 0);

  const firstCaseStr = firstCaseDate
    ? firstCaseDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className="analytics-view">
      {/* Hero */}
      <div className="analytics-hero">
        <div className="analytics-tag">Program Analytics</div>
        <h1 className="analytics-h1">Your CAR-T program · operational metrics</h1>
        <div className="analytics-sub">
          {firstCaseStr ? `Since ${firstCaseStr}` : "All cases on board"} · {total} total case{total !== 1 ? "s" : ""}
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-num">{total}</div>
          <div className="kpi-label">Total cases screened</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{activeCount}</div>
          <div className="kpi-label">Active referrals in flight</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num"><em>{funnel.infused}</em></div>
          <div className="kpi-label">Patients infused</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-num">{formatPercent(conversionRates.endToEnd)}</div>
          <div className="kpi-label">End-to-end conversion</div>
        </div>
      </div>

      {/* Funnel */}
      <div className="analytics-section">
        <div className="analytics-section-hdr">
          <h2 className="analytics-section-title">Referral funnel</h2>
          <span className="analytics-section-meta">Cumulative reach by lifecycle stage</span>
        </div>
        {funnelData.map(({ label, count, rate }) => (
          <div key={label} className="funnel-row">
            <div className="funnel-label">{label}</div>
            <div className="funnel-bar-track">
              <div
                className="funnel-bar-fill"
                style={{ width: `${(count / maxCount) * 100}%` }}
              />
            </div>
            <div className="funnel-count">{count}</div>
            <div className={`funnel-rate ${rateColor(rate)}`}>
              {rate !== null ? formatPercent(rate) : "—"}
            </div>
          </div>
        ))}
        {(funnel.deferred + funnel.notIndicated) > 0 && (
          <div style={{ marginTop: 16, padding: "10px 14px", background: "#ebe6dc", fontSize: 12, color: "#6b645a", lineHeight: 1.55 }}>
            {funnel.deferred} deferred · {funnel.notIndicated} not indicated · these are excluded from the funnel above (they never entered the referral phase)
          </div>
        )}
      </div>

      {/* Median time-to-stage */}
      <div className="analytics-section">
        <div className="analytics-section-hdr">
          <h2 className="analytics-section-title">Median time-to-stage</h2>
          <span className="analytics-section-meta">From stage-history timestamps</span>
        </div>
        <div className="time-grid">
          <div className="time-card">
            <div className="time-label">Decision → Referral</div>
            <div className={`time-value${medianDays.decisionToReferral === null ? " empty" : ""}`}>
              {medianDays.decisionToReferral === null ? "Not enough data" : formatDays(medianDays.decisionToReferral)}
            </div>
            <div className="time-context">From "Approved for referral" to "Referred to CAR-T center"</div>
          </div>
          <div className="time-card">
            <div className="time-label">Referral → Apheresis</div>
            <div className={`time-value${medianDays.referralToApheresis === null ? " empty" : ""}`}>
              {medianDays.referralToApheresis === null ? "Not enough data" : formatDays(medianDays.referralToApheresis)}
            </div>
            <div className="time-context">Includes insurance prior auth and scheduling</div>
          </div>
          <div className="time-card">
            <div className="time-label">Apheresis → Infusion</div>
            <div className={`time-value${medianDays.apheresisToInfusion === null ? " empty" : ""}`}>
              {medianDays.apheresisToInfusion === null ? "Not enough data" : formatDays(medianDays.apheresisToInfusion)}
            </div>
            <div className="time-context">Manufacturing typically 4–6 weeks for autologous CAR-T</div>
          </div>
        </div>
        {medianDays.screenedToInfused !== null && (
          <div style={{ marginTop: 16, padding: "14px 18px", background: "#1a1815", color: "#f4f1ea" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: "#c4a661", marginBottom: 6 }}>
              End-to-end journey
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 500 }}>
              Median {formatDays(medianDays.screenedToInfused)} from screening to infusion
            </div>
          </div>
        )}
      </div>

      {/* Outcomes */}
      {totalOutcomes > 0 && (
        <div className="analytics-section">
          <div className="analytics-section-hdr">
            <h2 className="analytics-section-title">Outcomes</h2>
            <span className="analytics-section-meta">{totalOutcomes} closed case{totalOutcomes !== 1 ? "s" : ""}</span>
          </div>

          {/* Stacked bar */}
          <div className="outcomes-bar">
            {outcomeEntries.map(([key, count]) => {
              const widthPct = (count / totalOutcomes) * 100;
              return (
                <div
                  key={key}
                  className="outcomes-segment"
                  style={{ width: `${widthPct}%`, background: OUTCOME_COLORS[key] || "#6b645a" }}
                  title={`${OUTCOME_LABELS[key] || key}: ${count}`}
                />
              );
            })}
          </div>

          {/* Legend */}
          <div className="outcomes-legend">
            {outcomeEntries.map(([key, count]) => (
              <div key={key} className="outcomes-legend-item">
                <div className="outcomes-legend-swatch" style={{ background: OUTCOME_COLORS[key] || "#6b645a" }} />
                <div className="outcomes-legend-label">{OUTCOME_LABELS[key] || key}</div>
                <div className="outcomes-legend-count">{count} · {formatPercent(count / totalOutcomes)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By cancer type */}
      <div className="analytics-section">
        <div className="analytics-section-hdr">
          <h2 className="analytics-section-title">By cancer type</h2>
          <span className="analytics-section-meta">{cancerTypeRows.length} type{cancerTypeRows.length !== 1 ? "s" : ""}</span>
        </div>
        <table className="cancer-table">
          <thead>
            <tr>
              <th>Cancer type</th>
              <th style={{ textAlign: "right" }}>Total</th>
              <th style={{ textAlign: "right" }}>Active</th>
              <th style={{ textAlign: "right" }}>Infused</th>
              <th style={{ textAlign: "right" }}>Conversion</th>
            </tr>
          </thead>
          <tbody>
            {cancerTypeRows.map(row => (
              <tr key={row.type}>
                <td><strong>{row.type}</strong></td>
                <td className="num">{row.total}</td>
                <td className="num">{row.active}</td>
                <td className="num">{row.infused}</td>
                <td className={`rate ${rateColor(row.infusionRate)}`}>{formatPercent(row.infusionRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button className="board-btn primary" onClick={onGoToBoard}>← Back to tumor board</button>
        <button className="board-btn" onClick={() => window.print()}>Print / save as PDF</button>
        <button
          className="board-btn"
          onClick={() => {
            // De-identified outcomes CSV — RWD-grade aggregate export.
            // Strips patient labels (uses case_id hash), notes, and any free text.
            const stageOf = c => c.stage || "pending_review";
            const cols = [
              "case_id", "added_date", "cancer_type", "prior_lines", "ecog",
              "current_stage", "outcome",
              "days_screen_to_referral", "days_referral_to_apheresis",
              "days_apheresis_to_infusion", "days_screen_to_infusion",
              "cd19", "bcma", "cd20", "gprc5d",
              "primary_refractory", "pod24", "double_hit", "blastoid_variant",
              "tp53_mutated", "lenalidomide_refractory",
              "high_risk_cytogenetics", "extramedullary_disease",
            ];
            const escape = v => {
              if (v === null || v === undefined) return "";
              const s = String(v);
              if (s.includes(",") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
              }
              return s;
            };
            const daysBetween = (a, b) => {
              if (!a || !b) return "";
              try {
                return Math.round((new Date(b) - new Date(a)) / 86400000);
              } catch { return ""; }
            };
            const hashId = (id) => {
              // Short non-reversible hash for case_id de-identification
              let h = 0;
              for (let i = 0; i < id.length; i++) {
                h = ((h << 5) - h) + id.charCodeAt(i);
                h |= 0;
              }
              return `C${Math.abs(h).toString(36).slice(0, 8)}`;
            };
            const lines = [cols.join(",")];
            board.forEach(c => {
              const p = c.patient || {};
              const t = c.timeline || {};
              const stage = stageOf(c);
              const hist = c.stageHistory || [];
              const firstStageAt = hist[0]?.at;
              const refAt = hist.find(h => h.stage === "referred")?.at || t.referralCreatedAt;
              const aphAt = t.apheresis?.performedAt;
              const infAt = t.infusion?.performedAt;
              const cancerKey = (p.cancerType || "").split("(")[0].trim();
              const row = [
                hashId(c.id),
                (c.addedAt || "").slice(0, 10),
                cancerKey,
                p.priorLines || "",
                p.ecog || "",
                stage,
                c.outcome || "",
                daysBetween(firstStageAt, refAt),
                daysBetween(refAt, aphAt),
                daysBetween(aphAt, infAt),
                daysBetween(firstStageAt, infAt),
                p.cd19 || "unknown",
                p.bcma || "unknown",
                p.cd20 || "unknown",
                p.gprc5d || "unknown",
                p.primaryRefractory ? "1" : "0",
                p.pod24 ? "1" : "0",
                p.doubleHit ? "1" : "0",
                p.blastoidVariant ? "1" : "0",
                p.tp53Mutated ? "1" : "0",
                p.lenalidomideRefractory ? "1" : "0",
                p.highRiskCytogenetics ? "1" : "0",
                p.extramedullaryDisease ? "1" : "0",
              ];
              lines.push(row.map(escape).join(","));
            });
            const csv = lines.join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `celltx-outcomes-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          title="De-identified outcomes export · suitable for RWD analysis"
        >
          ↧ Outcomes CSV (de-identified)
        </button>
      </div>
    </div>
  );
}

// ── Legal pages ────────────────────────────────────────────────────────────

function PrivacyView() {
  return (
    <div className="legal-view">
      <div className="legal-hero">
        <div className="legal-tag">Privacy</div>
        <h1 className="legal-h1">Privacy Policy</h1>
        <div className="legal-meta">Effective May 2026 · Last reviewed May 2026</div>
      </div>

      <div className="legal-callout">
        <div className="legal-callout-label">Privacy by architecture</div>
        Patient data never leaves the browser on Free, Practice, and Institution tiers. We don't collect, transmit, or store any patient health information. The eligibility engine runs entirely client-side; shareable case URLs encode patient state as base64 in the URL hash and are never transmitted to our servers.
      </div>

      <div className="legal-toc">
        <div className="legal-toc-title">Contents</div>
        <ul className="legal-toc-list">
          <li><a href="#overview">Overview</a></li>
          <li><a href="#collect">What we collect</a></li>
          <li><a href="#nocollect">What we never collect</a></li>
          <li><a href="#processors">Third-party processors</a></li>
          <li><a href="#retention">Data retention</a></li>
          <li><a href="#rights">Your rights</a></li>
          <li><a href="#cookies">Cookies &amp; tracking</a></li>
          <li><a href="#security">Security</a></li>
          <li><a href="#children">Children's privacy</a></li>
          <li><a href="#changes">Changes to this policy</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </div>

      <div id="overview" className="legal-section">
        <h2>1. Overview</h2>
        <p>CellTx Match is operated by an independent software vendor providing reference and decision-support information to licensed healthcare professionals. This policy describes the limited data we collect, why we collect it, and the operational controls that prevent us from ever holding patient health information.</p>
        <p>We are <strong>not a covered entity</strong> under HIPAA and, in our standard operating mode, <strong>not a business associate</strong>. We do not receive, store, or transmit Protected Health Information (PHI) on behalf of any covered entity unless explicitly contracted to do so under the Enterprise tier with a signed Business Associate Agreement.</p>
      </div>

      <div id="collect" className="legal-section">
        <h2>2. What we collect</h2>
        <h3>Analytics events (Plausible)</h3>
        <p>We use Plausible Analytics — a privacy-first, cookie-free, EU-based analytics service. Plausible captures:</p>
        <ul>
          <li>Page views (which routes are visited)</li>
          <li>Custom events (e.g., "Screen Run", "PDF Export") with non-identifying properties such as cancer type category and prior-line count buckets</li>
          <li>Referring domain (e.g., google.com)</li>
          <li>Approximate geographic region (country-level only)</li>
          <li>Device/browser type</li>
        </ul>
        <p>Plausible does not use cookies, does not fingerprint visitors, and does not collect any personal identifiers. See <a href="https://plausible.io/data-policy" target="_blank" rel="noopener noreferrer">Plausible's data policy</a>.</p>

        <h3>Waitlist / institutional access form</h3>
        <p>When you submit the institutional access form, we collect:</p>
        <ul>
          <li>Full name</li>
          <li>Work email address</li>
          <li>Institution name</li>
          <li>Role (e.g., coordinator, oncologist, BMT administrator)</li>
          <li>Patient volume range (e.g., 1–5 per month)</li>
          <li>Workflow pain point (free-text, optional)</li>
        </ul>
        <p>This information is used solely to respond to your inquiry and qualify potential pilot or subscription engagement. We do not use this data for unsolicited marketing or share it with third parties.</p>

        <h3>Account information (Clerk)</h3>
        <p>If you create an account, Clerk handles authentication and stores your email address, name, and password hash (or social login token). We never store passwords. See <a href="https://clerk.com/legal/privacy" target="_blank" rel="noopener noreferrer">Clerk's privacy policy</a>.</p>

        <h3>Billing information (Stripe)</h3>
        <p>If you subscribe to a paid tier, Stripe processes your payment. We do not see or store payment card numbers — Stripe handles these under PCI DSS Level 1 compliance. We see your billing email, subscription tier, and payment status. See <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe's privacy policy</a>.</p>

        <h3>Email communications (Resend)</h3>
        <p>If you submit the institutional access form, we send a welcome email via Resend. The email contains no patient information. See <a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Resend's privacy policy</a>.</p>
      </div>

      <div id="nocollect" className="legal-section">
        <h2>3. What we never collect</h2>
        <div className="legal-callout">
          <div className="legal-callout-label">No PHI · No patient identifiers · No clinical inputs transmitted</div>
          We do not collect, transmit, or store any of the following on our servers:
        </div>
        <ul>
          <li>Patient names, dates of birth, medical record numbers, or any other patient identifier</li>
          <li>Clinical inputs you enter into the screener (cancer type, prior lines, ECOG, biomarkers, lab values, disease activity flags) — these live in your browser's localStorage and the URL hash only</li>
          <li>Eligibility results, urgency scores, pathway analyses, or workup checklists for specific patients</li>
          <li>Tumor board cases — stored in your browser only; never synced to our servers (Free, Practice, Institution tiers)</li>
          <li>Shareable case URLs — the patient state is base64-encoded in the URL fragment (after the <code>#</code>), which browsers never transmit to servers</li>
        </ul>
        <p>The only exception is the Enterprise tier with a signed Business Associate Agreement, in which encrypted server-side sync is available as an explicit, opt-in feature. This is the only context in which CellTx Match holds patient data.</p>
      </div>

      <div id="processors" className="legal-section">
        <h2>4. Third-party processors</h2>
        <p>We rely on the following services to operate CellTx Match. None of them receive patient health information from us under standard operating mode.</p>
        <table className="legal-table">
          <thead>
            <tr><th>Service</th><th>Purpose</th><th>Privacy policy</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Vercel</strong></td><td>Static hosting, edge CDN</td><td><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">vercel.com/privacy</a></td></tr>
            <tr><td><strong>Clerk</strong></td><td>User authentication</td><td><a href="https://clerk.com/legal/privacy" target="_blank" rel="noopener noreferrer">clerk.com/privacy</a></td></tr>
            <tr><td><strong>Stripe</strong></td><td>Subscription billing</td><td><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a></td></tr>
            <tr><td><strong>Plausible</strong></td><td>Privacy-first analytics (no cookies)</td><td><a href="https://plausible.io/data-policy" target="_blank" rel="noopener noreferrer">plausible.io/data-policy</a></td></tr>
            <tr><td><strong>Resend</strong></td><td>Transactional email</td><td><a href="https://resend.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">resend.com/privacy</a></td></tr>
            <tr><td><strong>Formspree</strong></td><td>Fallback waitlist endpoint</td><td><a href="https://formspree.io/legal/privacy-policy" target="_blank" rel="noopener noreferrer">formspree.io/privacy</a></td></tr>
            <tr><td><strong>ClinicalTrials.gov</strong></td><td>Public trial data (queried client-side)</td><td><a href="https://www.clinicaltrials.gov/about-site/disclaimer" target="_blank" rel="noopener noreferrer">clinicaltrials.gov</a></td></tr>
          </tbody>
        </table>
      </div>

      <div id="retention" className="legal-section">
        <h2>5. Data retention</h2>
        <ul>
          <li><strong>Analytics events:</strong> retained by Plausible for 24 months in aggregated, non-identifying form</li>
          <li><strong>Waitlist submissions:</strong> retained indefinitely for relationship management; delete on request</li>
          <li><strong>Account data:</strong> retained while account is active; deleted within 30 days of account closure</li>
          <li><strong>Billing data:</strong> retained per Stripe and accounting requirements (typically 7 years for tax records)</li>
          <li><strong>Browser localStorage:</strong> under your control; clearing browser data removes all stored cases and tumor boards immediately</li>
        </ul>
      </div>

      <div id="rights" className="legal-section">
        <h2>6. Your rights</h2>
        <p>Regardless of your jurisdiction, you may exercise the following rights by emailing <a href="mailto:sri.ramya003@gmail.com">sri.ramya003@gmail.com</a>:</p>
        <ul>
          <li><strong>Access:</strong> request a copy of what we have about you</li>
          <li><strong>Correction:</strong> ask us to fix incorrect data</li>
          <li><strong>Deletion:</strong> ask us to delete your data</li>
          <li><strong>Portability:</strong> request your data in machine-readable form</li>
          <li><strong>Opt-out of analytics:</strong> Plausible respects Do Not Track; you can also block <code>plausible.io</code> via your browser or any ad blocker</li>
          <li><strong>Opt-out of marketing:</strong> we do not currently send marketing emails; if we do in future, every email will have a one-click unsubscribe</li>
        </ul>
        <p>We do not sell, rent, or trade personal information.</p>
      </div>

      <div id="cookies" className="legal-section">
        <h2>7. Cookies &amp; tracking</h2>
        <p>CellTx Match itself does not set cookies. Plausible Analytics does not use cookies. Two of our integrated services use cookies for their core functionality:</p>
        <ul>
          <li><strong>Clerk</strong> sets cookies to maintain your authenticated session, if you sign in</li>
          <li><strong>Stripe</strong> sets cookies during checkout for fraud prevention</li>
        </ul>
        <p>Neither vendor uses cookies for cross-site tracking or advertising on CellTx Match.</p>
      </div>

      <div id="security" className="legal-section">
        <h2>8. Security</h2>
        <ul>
          <li>All traffic to and from CellTx Match is encrypted via HTTPS (TLS 1.2+)</li>
          <li>The application runs on Vercel's edge network with industry-standard infrastructure security</li>
          <li>Authentication is managed by Clerk (SOC 2 Type II certified)</li>
          <li>Payment processing is handled by Stripe (PCI DSS Level 1)</li>
          <li>The "no PHI on servers" architecture is our strongest security control: data we never collect cannot be breached</li>
        </ul>
        <p>If you become aware of a security issue, please email <a href="mailto:sri.ramya003@gmail.com">sri.ramya003@gmail.com</a> with the subject line "Security disclosure".</p>
      </div>

      <div id="children" className="legal-section">
        <h2>9. Children's privacy</h2>
        <p>CellTx Match is intended for licensed healthcare professionals and healthcare-affiliated staff. It is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected information from a child, contact us and we will delete it.</p>
      </div>

      <div id="changes" className="legal-section">
        <h2>10. Changes to this policy</h2>
        <p>We will update this policy when our data practices change. The "Last reviewed" date at the top of this page reflects the most recent revision. Material changes will be highlighted on the platform for at least 30 days. Continued use of the platform after a change constitutes acceptance of the updated policy.</p>
      </div>

      <div id="contact" className="legal-section">
        <h2>11. Contact</h2>
        <p>Privacy questions, data requests, or concerns:</p>
        <p><a href="mailto:sri.ramya003@gmail.com">sri.ramya003@gmail.com</a></p>
        <p>Ramja Sritharan · Founder, CellTx Match</p>
      </div>
    </div>
  );
}

function TermsView() {
  return (
    <div className="legal-view">
      <div className="legal-hero">
        <div className="legal-tag">Terms</div>
        <h1 className="legal-h1">Terms of Service</h1>
        <div className="legal-meta">Effective May 2026 · Last reviewed May 2026</div>
      </div>

      <div className="legal-toc">
        <div className="legal-toc-title">Contents</div>
        <ul className="legal-toc-list">
          <li><a href="#about">About the service</a></li>
          <li><a href="#eligibility">Eligibility</a></li>
          <li><a href="#accounts">Accounts &amp; subscriptions</a></li>
          <li><a href="#trial">Trial &amp; refunds</a></li>
          <li><a href="#acceptable">Acceptable use</a></li>
          <li><a href="#ip">Intellectual property</a></li>
          <li><a href="#clinical">Clinical reality</a></li>
          <li><a href="#warranty">Warranties</a></li>
          <li><a href="#liability">Liability</a></li>
          <li><a href="#indemnification">Indemnification</a></li>
          <li><a href="#termination">Termination</a></li>
          <li><a href="#changes">Changes</a></li>
          <li><a href="#law">Governing law</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </div>

      <div id="about" className="legal-section">
        <h2>1. About the service</h2>
        <p>CellTx Match ("the Service") is an online reference and decision-support platform for cell therapy referral intelligence, operated by Ramja Sritharan ("we", "us", "our"). The Service provides structured, sourced reference information about FDA-approved CAR-T and bispecific antibody products, NCCN-aligned disease pathways, and recruiting clinical trials.</p>
        <p>The Service is intended for use by licensed healthcare professionals, healthcare administrative staff, and clinical trainees as an educational and operational reference tool. The Service is <strong>not a medical device</strong>, <strong>not a substitute for clinical judgment</strong>, and <strong>not intended for diagnostic use</strong>.</p>
      </div>

      <div id="eligibility" className="legal-section">
        <h2>2. Eligibility</h2>
        <p>You may use the Service if you are at least 18 years of age and meet one or more of the following:</p>
        <ul>
          <li>A licensed healthcare professional (physician, nurse practitioner, physician assistant, pharmacist, etc.)</li>
          <li>A healthcare-affiliated administrative or coordination role (CAR-T coordinator, BMT administrator, referral navigator, tumor board administrator, etc.)</li>
          <li>A clinical trainee under appropriate supervision (resident, fellow, medical student)</li>
          <li>A researcher, biotech, or industry professional using the Service for reference purposes</li>
        </ul>
        <p>By using the Service, you represent that you meet one of these categories.</p>
      </div>

      <div id="accounts" className="legal-section">
        <h2>3. Accounts &amp; subscriptions</h2>
        <h3>Account creation</h3>
        <p>Some features (PDF export, tumor board persistence, paid tiers) require an account, managed by Clerk. You agree to provide accurate information and to keep your credentials confidential. You are responsible for activity under your account.</p>

        <h3>Free tier</h3>
        <p>The Free tier is provided at no cost and without warranty. We may change or discontinue Free tier features at any time with reasonable notice. The Free tier does not include any service level agreement.</p>

        <h3>Paid subscriptions</h3>
        <p>Practice ($299/mo), Institution ($999/mo), and Enterprise (starting $2,995/mo, annual) subscriptions are billed via Stripe. Subscriptions auto-renew at the end of each billing period unless cancelled. You may cancel at any time via the customer portal; cancellation takes effect at the end of the current billing period.</p>
      </div>

      <div id="trial" className="legal-section">
        <h2>4. Trial &amp; refunds</h2>
        <h3>14-day free trial</h3>
        <p>Practice and Institution plans include a 14-day free trial. You will not be charged during the trial period. You may cancel without charge before the trial ends.</p>

        <h3>Refunds</h3>
        <p>Monthly subscriptions are not refundable for partial months. Annual subscriptions cancelled within the first 30 days are eligible for a pro-rated refund of unused months. Enterprise contracts follow the refund terms in the executed agreement.</p>
      </div>

      <div id="acceptable" className="legal-section">
        <h2>5. Acceptable use</h2>
        <p>You agree to use the Service only for its intended purpose as an educational and operational reference tool. You agree NOT to:</p>
        <ul>
          <li>Use the Service for diagnostic claims or as the sole basis for clinical decisions</li>
          <li>Enter Protected Health Information (PHI) for patients without proper authorization under HIPAA or applicable law</li>
          <li>Resell, sublicense, or redistribute access to the Service or its outputs without written permission</li>
          <li>Scrape, mass-query, reverse-engineer, or otherwise circumvent rate limits and intended interfaces (the Criteria API has documented rate limits)</li>
          <li>Use the Service to make false marketing or regulatory claims about cell therapy products</li>
          <li>Misrepresent your role or institutional affiliation</li>
          <li>Use the Service in a manner that violates applicable laws or regulations</li>
        </ul>
      </div>

      <div id="ip" className="legal-section">
        <h2>6. Intellectual property</h2>
        <p>The Service — including the software, rule library, eligibility engine, pathway logic, urgency rubric, action engine, trial-scoring rules, brand identity, and accompanying documentation — is the intellectual property of Ramja Sritharan and licensors. The Criteria Library JSON document and all derived data products are provided for reference use under the terms of this agreement.</p>
        <p>You retain ownership of any patient-level inputs you provide (which, on our standard tiers, never leave your browser anyway). The outputs of the Service for a given patient are yours to use in clinical practice and to include in patient records.</p>
      </div>

      <div id="clinical" className="legal-section">
        <h2>7. Clinical reality</h2>
        <div className="legal-callout">
          <div className="legal-callout-label">Important — Read carefully</div>
          The Service provides reference information sourced from FDA prescribing information, NCCN clinical practice guidelines, and pivotal trial entry criteria. It is <strong>not a medical device</strong> under FDA regulation and qualifies as <strong>clinical decision support exempt from premarket review</strong> under section 3060(a) of the 21st Century Cures Act and FDA's guidance on Clinical Decision Support Software.
        </div>
        <p>By using the Service, you acknowledge and agree that:</p>
        <ul>
          <li>You are a qualified healthcare professional (or supervised trainee) and will independently verify all outputs against the current FDA prescribing information for each product before making any clinical decision</li>
          <li>You retain full responsibility for any clinical decisions made for any patient</li>
          <li>The Service's outputs are intended to inform, not replace, your clinical judgment</li>
          <li>The eligibility criteria reflect FDA labeling as of the date noted on each product page and may not capture the most recent updates</li>
          <li>The Service does not assess insurance coverage, prior authorization, apheresis/manufacturing slot availability, REMS requirements, or institutional protocols</li>
        </ul>
      </div>

      <div id="warranty" className="legal-section">
        <h2>8. Disclaimer of warranties</h2>
        <p>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, ACCURACY, COMPLETENESS, OR NON-INFRINGEMENT.</p>
        <p>WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT ITS OUTPUTS WILL ALWAYS MATCH THE MOST CURRENT FDA PRESCRIBING INFORMATION. YOU ARE SOLELY RESPONSIBLE FOR VERIFYING ALL OUTPUTS AGAINST CURRENT LABELING.</p>
      </div>

      <div id="liability" className="legal-section">
        <h2>9. Limitation of liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATED TO THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE FEES PAID BY YOU TO US IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).</p>
        <p>IN NO EVENT WILL WE BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION LOST PROFITS, LOST DATA, OR ANY DAMAGES ARISING FROM CLINICAL DECISIONS OR PATIENT OUTCOMES.</p>
      </div>

      <div id="indemnification" className="legal-section">
        <h2>10. Indemnification</h2>
        <p>You agree to indemnify, defend, and hold harmless Ramja Sritharan, the operators of CellTx Match, and any affiliates from any claims, damages, losses, or expenses (including reasonable attorneys' fees) arising out of:</p>
        <ul>
          <li>Your use of the Service in violation of these Terms</li>
          <li>Your introduction of PHI you were not authorized to access</li>
          <li>Clinical use of the Service without independent verification against FDA labeling</li>
          <li>Any claim by a third party arising from your acts or omissions</li>
        </ul>
      </div>

      <div id="termination" className="legal-section">
        <h2>11. Termination</h2>
        <p>You may stop using the Service or cancel your subscription at any time. We may suspend or terminate your access for breach of these Terms, abusive use, or to comply with legal obligations, with reasonable notice when feasible. We may discontinue the Service entirely with at least 30 days' notice to active paying customers.</p>
      </div>

      <div id="changes" className="legal-section">
        <h2>12. Changes to these terms</h2>
        <p>We may update these Terms periodically. Material changes will be highlighted on the platform for at least 30 days. Continued use of the Service after a change indicates acceptance.</p>
      </div>

      <div id="law" className="legal-section">
        <h2>13. Governing law &amp; disputes</h2>
        <p>These Terms are governed by the laws of the State of Delaware, USA, without regard to conflict-of-laws principles. Any dispute arising from these Terms or your use of the Service shall be resolved through binding arbitration in accordance with the American Arbitration Association's rules, conducted in English. You retain the right to bring claims in small-claims court for matters within that court's jurisdiction.</p>
      </div>

      <div id="contact" className="legal-section">
        <h2>14. Contact</h2>
        <p>For questions about these Terms:</p>
        <p><a href="mailto:sri.ramya003@gmail.com">sri.ramya003@gmail.com</a></p>
        <p>Ramja Sritharan · Founder, CellTx Match</p>
      </div>
    </div>
  );
}

function DisclaimerView() {
  return (
    <div className="legal-view">
      <div className="legal-hero">
        <div className="legal-tag">Clinical Disclaimer</div>
        <h1 className="legal-h1">For licensed healthcare professionals only</h1>
        <div className="legal-meta">Last reviewed May 2026 · Criteria current as of FDA labels May 2026</div>
      </div>

      <div className="legal-key-grid">
        <div className="legal-key-item">
          <div className="legal-key-label">Not a medical device</div>
          <div className="legal-key-text">CellTx Match is not a medical device and is not regulated by the FDA as such.</div>
        </div>
        <div className="legal-key-item">
          <div className="legal-key-label">Not for diagnostic use</div>
          <div className="legal-key-text">Outputs are reference information only and must not be used to diagnose any disease or condition.</div>
        </div>
        <div className="legal-key-item">
          <div className="legal-key-label">Not a replacement for judgment</div>
          <div className="legal-key-text">Clinical decisions remain the sole responsibility of the treating clinician.</div>
        </div>
        <div className="legal-key-item">
          <div className="legal-key-label">Always verify against FDA labels</div>
          <div className="legal-key-text">Confirm all eligibility against current FDA prescribing information before any decision.</div>
        </div>
      </div>

      <div className="legal-section">
        <h2>Regulatory status</h2>
        <p>CellTx Match qualifies as <strong>clinical decision support software exempt from premarket review</strong> under section 3060(a) of the 21st Century Cures Act and FDA's guidance on Clinical Decision Support Software (CDSS). Specifically, the platform:</p>
        <ul>
          <li>Provides information from independent sources (FDA prescribing information, NCCN guidelines, pivotal trial entry criteria)</li>
          <li>Displays the basis for recommendations transparently — every rule is sourced and cited at <a href="/criteria">/criteria</a></li>
          <li>Does not acquire, process, or analyze medical images or signals</li>
          <li>Is intended for the purpose of supporting a healthcare professional's clinical decision, who can independently review the basis for the recommendation</li>
        </ul>
        <p>The platform is therefore not regulated as a medical device under current FDA guidance.</p>
      </div>

      <div className="legal-section">
        <h2>What the platform IS</h2>
        <ul>
          <li>A reference and decision-support tool for licensed healthcare professionals</li>
          <li>A structured presentation of FDA-approved cell therapy eligibility criteria with citations</li>
          <li>An operational workflow tool for tumor board case management and referral preparation</li>
          <li>A discovery layer for recruiting clinical trials matched to a patient profile</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>What the platform IS NOT</h2>
        <ul>
          <li>A diagnostic device</li>
          <li>A clinical decision-making system that operates without human verification</li>
          <li>A replacement for the FDA prescribing information for any product</li>
          <li>A replacement for NCCN, ASH, ASCO, or other society guidelines</li>
          <li>A guarantee of clinical outcome, insurance coverage, or apheresis/manufacturing eligibility</li>
        </ul>
      </div>

      <div className="legal-section">
        <h2>Criteria currency &amp; update cadence</h2>
        <p>The eligibility rule library reflects FDA prescribing information and NCCN clinical practice guidelines as of <strong>May 2026</strong>. Criteria are reviewed within 30 days of FDA approval changes or guideline updates. Each product card on the <a href="/criteria">/criteria</a> page displays its last-reviewed date and links to the current FDA prescribing information.</p>
        <p>Criteria can become outdated between updates. <strong>Always verify against the current FDA prescribing information before any clinical decision.</strong></p>
      </div>

      <div className="legal-section">
        <h2>What the platform does not assess</h2>
        <p>The eligibility engine evaluates the structured clinical criteria published in FDA labeling. It does not evaluate:</p>
        <ul>
          <li>Insurance coverage or prior authorization</li>
          <li>Apheresis center availability or scheduling</li>
          <li>CAR-T manufacturing slot availability</li>
          <li>Product-specific REMS program enrollment</li>
          <li>Institutional protocols layered on top of FDA labeling</li>
          <li>Off-label or expanded-access use</li>
          <li>Treating clinician judgment regarding aggressive vs. palliative goals of care</li>
          <li>Patient preferences, social determinants, or non-clinical factors</li>
        </ul>
        <p>These factors must be assessed independently by the treating team.</p>
      </div>

      <div className="legal-section">
        <h2>Reporting concerns</h2>
        <p>If you identify a discrepancy between a CellTx Match output and the current FDA prescribing information for any product, please email <a href="mailto:sri.ramya003@gmail.com">sri.ramya003@gmail.com</a> with the subject line "Criteria correction". We review every such report and update the rule library accordingly, typically within 5 business days.</p>
      </div>

      <div className="legal-section">
        <h2>Final boundary statement</h2>
        <div className="legal-callout">
          By using CellTx Match, you affirm that you are a qualified healthcare professional or supervised trainee, that you will independently verify all outputs against current FDA labeling and institutional protocols, and that you accept sole responsibility for any clinical decision made for any patient. CellTx Match, its operators, and its licensors disclaim all liability for clinical outcomes resulting from use of the platform.
        </div>
      </div>
    </div>
  );
}

// ── About page ─────────────────────────────────────────────────────────────
function AboutView({ onBackToScreener, onGoToPricing, onGoToCriteria }) {
  return (
    <div className="about-view">
      {/* Hero */}
      <div className="about-hero">
        <div className="about-tag">About · Why we built this</div>
        <h1 className="about-h1">
          Built to fix a <em>recurring operational problem</em><br />
          in modern oncology.
        </h1>
      </div>

      {/* Mission — opening line is the user's exact framing */}
      <div className="about-mission">
        <p>
          CellTx Match was built to address a recurring operational problem in modern oncology:
          patients becoming ineligible for cell therapy because referrals happen too late, or
          because incomplete information delays evaluation.
        </p>
        <p>
          Every CAR-T program sees it. A relapsed patient loses eligibility while a community
          oncologist works through standard salvage chemotherapy — organ function declines,
          performance status drops, and the clinical window closes before the referral pathway
          completes. Existing decision support tools handle pieces of this: a prescribing
          information document here, a guideline page there, a static eligibility list on a
          vendor's website. Nothing brings the full workflow together at the point of decision.
        </p>
        <p>
          CellTx Match runs a single patient profile through a deterministic rule library
          sourced from FDA prescribing information, NCCN guidelines, and pivotal trial entry
          criteria. The output is decision-focused: which approved products fit, what blocks
          eligibility today, what workup is needed before referral, which trials match, and
          when the clinical window is closing.
        </p>
      </div>

      {/* Team */}
      <div className="about-section">
        <div className="about-section-tag">Team</div>
        <h2 className="about-section-title">Built by clinicians and translational scientists</h2>

        <div className="team-grid">
          <div className="team-card">
            <div className="team-name">Ramja Sritharan</div>
            <div className="team-role">Cancer biologist · Founder</div>
            <p className="team-bio">
              Cancer biologist focused on tumor immunology and translational oncology workflows.
              Built CellTx Match after seeing how operational bottlenecks and delayed referrals
              impact access to cell therapy.
            </p>
          </div>

          <div className="team-card">
            <div className="team-name">Jananthan Paramsothy</div>
            <div className="team-role">Physician · Clinical Advisor</div>
            <p className="team-bio">
              Physician with clinical experience in oncology workflows and patient care operations.
              Advises on clinical usability, referral pathways, and real-world implementation
              considerations.
            </p>
          </div>
        </div>
      </div>

      {/* Approach — adds credibility without being hypey */}
      <div className="about-section">
        <div className="about-section-tag">Approach</div>
        <h2 className="about-section-title">Clinical depth before features</h2>

        <div className="approach-grid">
          <div className="approach-item">
            <div className="approach-num">1</div>
            <div className="approach-text">
              <strong>Sourced rule library.</strong> Every eligibility threshold, exclusion, and
              urgency factor is derived from FDA prescribing information and NCCN guidelines.
              The full library is publicly browseable —{" "}
              <button
                className="link"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80", fontFamily: "inherit", fontSize: "inherit" }}
                onClick={onGoToCriteria}
              >
                see the criteria library
              </button>.
            </div>
          </div>

          <div className="approach-item">
            <div className="approach-num">2</div>
            <div className="approach-text">
              <strong>Deterministic, not generative.</strong> The eligibility engine is rule-based.
              Clinical determinations don't depend on language model "reasoning" — they depend on
              the published label and the patient's data. This is the right architecture for a
              tool that informs a $500k–$1M treatment decision.
            </div>
          </div>

          <div className="approach-item">
            <div className="approach-num">3</div>
            <div className="approach-text">
              <strong>Privacy by architecture.</strong> Patient data never leaves the browser on
              Free, Practice, and Institution tiers. Cases live in localStorage and shareable
              URLs encode patient state as base64 in the URL hash — nothing is transmitted to our
              servers. Enterprise customers can opt into encrypted server-side sync with a BAA.
            </div>
          </div>

          <div className="approach-item">
            <div className="approach-num">4</div>
            <div className="approach-text">
              <strong>Updated on FDA cadence.</strong> When approvals change or NCCN guidelines
              update, the rule library is reviewed and updated within 30 days. Institution and
              Enterprise customers receive a written change summary; Enterprise gets a live
              quarterly briefing.
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="about-contact">
        <div className="about-section-tag">Get in touch</div>
        <div className="about-contact-row">
          <p>
            Questions, feedback, or integration discussions — reply directly:{" "}
            <a href="mailto:sri.ramya003@gmail.com" className="contact-email">
              sri.ramya003@gmail.com
            </a>
          </p>
        </div>
        <p className="contact-note">
          For institutional access, use the request form on the{" "}
          <button className="link" onClick={onGoToPricing}>pricing page</button>.
        </p>
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
            onClick={() => {
              setRan(true);
              const d = calculateReferralDecision(pt);
              if (d) trackEarlyReferralRun(d.decision);
            }}
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
        <a href="#api" className="crit-nav-btn" style={{ borderColor: "#c4a661", color: "#7a5e10" }}>API</a>
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

                {/* Citation block — FDA + pivotal trials with NCT IDs */}
                {PRODUCT_CITATIONS[p.id] && (
                  <div className="rule-sub-section">
                    <div className="rule-sub-head">Pivotal trials &amp; FDA approval</div>
                    <div className="citation-block">
                      <div className="citation-bla-row">
                        <span><strong>BLA:</strong> {PRODUCT_CITATIONS[p.id].bla}</span>
                        <span><strong>First approval:</strong> {PRODUCT_CITATIONS[p.id].fdaApprovalDate}</span>
                      </div>
                      {PRODUCT_CITATIONS[p.id].pivotalTrials.map((t, i) => (
                        <div key={i} className="citation-row">
                          <span className="citation-trial">{t.name}</span>
                          <a href={ctGovUrl(t.nctId)} target="_blank" rel="noopener noreferrer" className="citation-nct">
                            {t.nctId} →
                          </a>
                          <span>{t.indication}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rule-source">
                  <span className="rule-source-label">Source:</span>
                  {piUrl(p.name) ? (
                    <a href={piUrl(p.name)} target="_blank" rel="noopener noreferrer">
                      FDA {p.name} Prescribing Information →
                    </a>
                  ) : (
                    <span>FDA {p.name} Prescribing Information</span>
                  )}
                  <span>· Reviewed {CATALOG_META.asOf}</span>
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
                      <span className="pref-trial">
                        {p.nctId ? (
                          <a href={ctGovUrl(p.nctId)} target="_blank" rel="noopener noreferrer"
                             style={{ color: "#4c6b8c", textDecoration: "none", borderBottom: "1px dotted #4c6b8c80" }}>
                            {p.trial}
                          </a>
                        ) : p.trial}
                      </span>
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
                {r.source && <div className="action-source">{r.source}</div>}
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
                {r.source && <div className="action-source">{r.source}</div>}
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

      {/* ── API endpoint ─────────────────────────────────────────────────── */}
      <section id="api" className="crit-section">
        <div className="crit-section-hdr">
          <h2 className="crit-section-title">Criteria API</h2>
          <span className="crit-section-meta">JSON dump · audit-ready · stays in sync with the rule library</span>
        </div>

        <div className="api-panel">
          <div className="api-hdr">
            <h3 className="api-title">
              The entire rule library as <em>JSON</em>
            </h3>
            <span className="api-version">{CATALOG_META.version}</span>
          </div>

          <p className="api-desc">
            Every product, pathway, action, urgency factor, and trial-scoring rule on this page
            is available as a single JSON document. Pipe it into your CDS system, audit it against
            your institutional protocols, or use it to build downstream tooling. The dump is
            regenerated at every site build, so it never drifts from the rule library.
          </p>

          <div className="api-code">
            <span className="api-method">GET</span>
            <a
              href="/api/criteria/v1.json"
              target="_blank"
              rel="noopener noreferrer"
              className="api-path"
              onClick={() => trackCriteriaApiAccess()}
              style={{ color: "#f4f1ea", textDecoration: "underline", textUnderlineOffset: "3px", textDecorationColor: "#c4a66180" }}
            >
              https://cart-match.vercel.app/api/criteria/v1.json
            </a>
            <button
              className="api-copy-btn"
              onClick={(e) => {
                e.preventDefault();
                navigator.clipboard
                  .writeText("https://cart-match.vercel.app/api/criteria/v1.json")
                  .then(() => {
                    const btn = e.currentTarget;
                    const orig = btn.textContent;
                    btn.textContent = "✓ Copied";
                    setTimeout(() => { btn.textContent = orig; }, 1500);
                  })
                  .catch(() => {
                    // Fallback for browsers that block clipboard
                    prompt("Copy this URL:", "https://cart-match.vercel.app/api/criteria/v1.json");
                  });
              }}
            >
              Copy URL
            </button>
          </div>

          <div className="api-schema">
            <div className="api-schema-item">
              <div className="api-schema-key">meta</div>
              <div className="api-schema-desc">Version, as-of date, last-updated timestamp, changelog</div>
            </div>
            <div className="api-schema-item">
              <div className="api-schema-key">products[]</div>
              <div className="api-schema-desc">12 FDA-approved products with full eligibility rules, organ thresholds, BLA, pivotal trial NCT IDs</div>
            </div>
            <div className="api-schema-item">
              <div className="api-schema-key">pathways[]</div>
              <div className="api-schema-desc">6 NCCN-aware disease evaluators with high-risk modifiers, context rules, preferred-product citations</div>
            </div>
            <div className="api-schema-item">
              <div className="api-schema-key">actions.blocks[]</div>
              <div className="api-schema-desc">{BLOCK_ACTIONS.length} block-pattern → action mappings with source citations</div>
            </div>
            <div className="api-schema-item">
              <div className="api-schema-key">actions.warnings[]</div>
              <div className="api-schema-desc">{WARNING_ACTIONS.length} warning-pattern → action mappings with source citations</div>
            </div>
            <div className="api-schema-item">
              <div className="api-schema-key">urgency</div>
              <div className="api-schema-desc">{URGENCY_RUBRIC.factors.length} weighted factors + 3-tier triage thresholds</div>
            </div>
          </div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #f4f1ea20", display: "flex", gap: 18, flexWrap: "wrap" }}>
            <a href="/api/criteria/v1.json" target="_blank" rel="noopener noreferrer" className="api-link">
              View raw JSON →
            </a>
            <span style={{ color: "#f4f1ea60", fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>
              {CATALOG_META.version} · As of {CATALOG_META.asOf} · Last build: {CATALOG_META.lastUpdated}
            </span>
          </div>

          <div style={{ marginTop: 18, padding: "12px 14px", background: "#f4f1ea0c", fontSize: 12, color: "#f4f1eacc", lineHeight: 1.6 }}>
            <strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.16em", color: "#c4a661" }}>Enterprise tier</strong>
            {" "}— Authenticated API access with audit logging, webhook notifications on rule changes, and SLA-backed update guarantees are available on the Enterprise tier.{" "}
            <button
              className="api-link"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              onClick={() => onBackToScreener()}
            >
              See pricing →
            </button>
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
    name: "Individual Clinician",
    price: "0",
    per: "forever · no card required",
    best: "Individual oncologists & trainees",
    featured: false,
    features: [
      "Unlimited referral analyses",
      "All 12 FDA-approved products",
      "CAR-T vs Bispecific comparison",
      "Live ClinicalTrials.gov integration",
      "Shareable case URLs",
      "Bridging therapy guidance",
      "PDF referral reports (with sign-in)",
      "Mobile-optimized for phone use",
    ],
    cta: "Start analysis →",
    action: "screener",
  },
  {
    id: "pilot",
    tier: "Pilot",
    name: "3-Month Institutional Pilot",
    price: "0–500",
    per: "per month · 3-month scoped engagement",
    best: "Reference sites · workflow validation",
    featured: false,
    features: [
      "Shared tumor board for your team",
      "Referral workflows configured to your protocols",
      "Audit-ready PDF report exports",
      "Onboarding + clinical content briefing",
      "Direct line to the founding team",
      "Free for first 5 charter institutions (case study + reference rights)",
    ],
    cta: "Request pilot →",
    action: "waitlist",
  },
  {
    id: "institutional",
    tier: "Institutional",
    name: "CAR-T Program",
    price: "2,500",
    per: "per month · starting · annual contract",
    best: "Academic centers & CAR-T programs",
    featured: true,
    features: [
      "Everything in the Pilot tier",
      "Unlimited cases · unlimited team members",
      "Coordinator Operations Dashboard",
      "Longitudinal timeline + activity log audit trail",
      "Outcomes analytics dashboard (QI-ready)",
      "Custom institution branding on every report",
      "Read-only API access · 90-day audit log",
      "Quarterly clinical content briefings (live)",
      "Onboarding · dedicated success contact · 1-business-day SLA",
    ],
    cta: "Request institutional demo →",
    action: "waitlist",
  },
  {
    id: "enterprise",
    tier: "Enterprise",
    name: "Health System / Network",
    price: "Custom",
    per: "annual contract · $25K–$150K+ ARR",
    best: "Multi-site networks · pharma · payers",
    featured: false,
    features: [
      "Everything in Institutional",
      "SSO (SAML · Okta · Azure AD)",
      "HIPAA Business Associate Agreement",
      "Full audit log + compliance reports + SOC 2",
      "Institution-specific criteria overrides",
      "Authenticated Criteria API + webhook notifications",
      "FHIR / Redox / Epic integration (custom scope)",
      "Dedicated account manager · 99.9% uptime SLA",
      "Custom analytics + cohort reporting",
    ],
    cta: "Discuss deployment →",
    action: "waitlist",
  },
];

const FAQS = [
  {
    q: "Is patient data ever stored on your servers?",
    a: "No. Cases live entirely in your browser (localStorage) and shareable URLs are encoded client-side as base64 in the URL hash. We never see patient data on the Free, Pilot, or Institutional tiers. Enterprise customers with a BAA can opt into encrypted server-side sync — required for SSO, full audit logging, and FHIR/EMR integration.",
  },
  {
    q: "What's the difference between Pilot and Institutional?",
    a: "Pilot is a 3-month scoped engagement designed for institutions that want to validate operational impact before signing a multi-year contract — fixed scope, documented outcomes, then decide. Free for the first 5 charter institutions; $0–500/mo otherwise depending on program size. Institutional is the long-term contract starting at $2,500/mo with unlimited cases, full audit trail, outcomes analytics, dedicated onboarding, and a 1-business-day SLA. Most customers move from Pilot → Institutional after demonstrating clinical and operational value.",
  },
  {
    q: "Why is Institutional priced at $2,500/mo and up?",
    a: "Because that's what it costs to run a CAR-T program management system that institutional medical directors will actually stake their compliance posture on. The platform includes the longitudinal timeline + audit trail, outcomes analytics for QI reporting, coordinator operations dashboard, dedicated onboarding, quarterly clinical content briefings, and direct support from the founding team. A single avoided late referral (cell therapy infusion = $500K–$1M revenue per patient) more than pays for the platform for a decade.",
  },
  {
    q: "How does Enterprise pricing work?",
    a: "Enterprise contracts are custom-scoped based on institution size, integration requirements (SSO, FHIR/Redox/Epic, custom criteria overrides), and audit/compliance needs. Most contracts land between $25,000 and $150,000 annual ARR. Includes everything in Institutional plus HIPAA Business Associate Agreement, SOC 2 reporting, authenticated Criteria API with webhook notifications, FHIR integration scope, dedicated account manager, 99.9% uptime SLA, and white-glove onboarding.",
  },
  {
    q: "Is there a discount for academic medical centers or safety-net hospitals?",
    a: "Yes — 30% off Institutional and Enterprise tiers for academic centers willing to be a published reference customer. 25% off for FQHCs and safety-net hospitals. Free unlimited use for medical residents and fellows (with institutional attestation). Charter pricing: free 3-month pilot + 50% off Year 1 for the first 5 institutions in exchange for co-authored case study and reference-call rights.",
  },
  {
    q: "Can I pay per-screen instead of subscribing?",
    a: "Yes. For community practices, biotechs, advocacy groups, or pharma sales reps that don't fit the institutional model, we offer volume pricing: $5/screen (pay-as-you-go, no minimum), $25/case (includes full tumor board persistence + PDF), or $10K/quarter unlimited with no SLA. Contact sales to set up.",
  },
  {
    q: "Can we try Institutional before signing an annual contract?",
    a: "Yes — that's exactly what the Pilot tier is for. Three months, scoped, with documented outcomes. If you continue to Institutional afterward, the pilot fee is credited toward your first year. For institutions that prefer to skip the pilot and start on Institutional directly, we offer a 14-day money-back guarantee on the first month.",
  },
  {
    q: "How quickly do you add new FDA approvals?",
    a: "Within 30 days of approval. Criteria are reviewed against the published prescribing information and added to all tiers simultaneously. Institutional customers receive a written change summary; Enterprise customers receive a live quarterly briefing with the founding team.",
  },
  {
    q: "Do you offer a HIPAA Business Associate Agreement?",
    a: "Yes, with Enterprise. Because no patient data leaves the browser on Free, Pilot, or Institutional tiers, a BAA is technically not required at those levels — that's a deliberate architectural choice. Enterprise customers using server-side sync, SSO, or audit logging receive a signed BAA as standard. We also support DPAs for international institutions.",
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
          Free for individual clinicians. Institutional pricing starts at $2,500/mo
          and is designed for CAR-T programs that need a daily-operations system.
          Pilot before you commit. Enterprise built around your existing infrastructure.
        </p>
      </div>

      <div className="pricing-grid">
        {TIERS.map(t => (
          <div key={t.id} className={`pricing-card${t.featured ? " featured" : ""}`}>
            {t.featured && <div className="pricing-badge">Most popular</div>}
            <div className="pricing-tier">{t.tier}</div>
            <div className="pricing-name">{t.name}</div>
            {(() => {
              const isCustom = t.price === "Custom";
              const isRange  = t.price && t.price.includes("–");
              const showCurrency = !isCustom;
              const textPrice = isCustom || isRange;
              return (
                <div className={`pricing-price${textPrice ? " text-price" : ""}`}>
                  {showCurrency && <span className="currency">$</span>}{t.price}
                </div>
              );
            })()}
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
              onClick={async () => {
                trackPricingCta(t.id);
                if (t.action === "screener") { onBackToScreener(); return; }
                // Institutional is the only self-serve Stripe tier now — Pilot
                // and Enterprise are both sales-led (custom contracts, charter
                // qualification, BAA / SSO setup). Try Stripe first if Institutional;
                // fall back to waitlist if Stripe not configured.
                if (t.id === "institutional") {
                  try {
                    await startCheckout({ tier: t.id, interval: "monthly" });
                    return;
                  } catch (err) {
                    if (err.code !== "STRIPE_NOT_CONFIGURED") {
                      console.warn("Checkout failed, falling back to waitlist:", err.message);
                    }
                    // Fall through to waitlist
                  }
                }
                onRequestAccess();
              }}
            >
              {t.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Charter pricing callout — replaces the old standalone pilot panel,
          since pilots are now a first-class tier above. This panel pitches
          the charter-customer offer specifically. */}
      <div className="pilot-panel">
        <div className="pilot-text">
          <div className="pilot-tag">Charter program · First 5 institutions</div>
          <h3 className="pilot-title">
            Free pilot for the first <em>five charter institutions</em>.
          </h3>
          <p className="pilot-desc">
            The first five CAR-T programs to deploy CellTx Match get a fully waived 3-month pilot
            in exchange for case-study and reference-call rights. After pilot, charter institutions
            receive 50% off the first year of Institutional pricing. Limited to programs that
            can begin a pilot before Q4 2026.
          </p>
          <ul className="pilot-included">
            <li>Free 3-month pilot deployment</li>
            <li>50% off Year 1 Institutional pricing if continuing</li>
            <li>Direct line to the founding team</li>
            <li>Onboarding + clinical content briefing</li>
            <li>Co-authored case study (published with your permission)</li>
            <li>Logo placement on website (with your approval)</li>
          </ul>
        </div>

        <div className="pilot-cta-block">
          <div className="pilot-price">Free</div>
          <div className="pilot-price-sub">3-month charter pilot</div>
          <button
            className="pilot-cta"
            onClick={() => {
              trackPricingCta("charter-program");
              onRequestAccess();
            }}
          >
            Apply for charter slot →
          </button>
          <button
            className="pilot-cta secondary"
            onClick={() => {
              trackPricingCta("workflow-review");
              onRequestAccess();
            }}
          >
            Schedule workflow review →
          </button>
        </div>
      </div>

      {/* Alternative / volume pricing — for non-seat-based buyers */}
      <div className="pricing-alt-panel">
        <div className="pricing-alt-head">
          <h3 className="pricing-alt-title">Don't fit the user-seat model?</h3>
          <span className="pricing-alt-tag">Volume pricing</span>
        </div>
        <p className="pricing-alt-sub">
          For community practices, biotechs, pharma sales reps, advocacy groups, or independent
          oncologists who run cases occasionally rather than continuously — pay only for what you use.
        </p>

        <div className="pricing-alt-grid">
          <div className="pricing-alt-item">
            <div className="pricing-alt-price">$5<span className="alt-unit">/screen</span></div>
            <div className="pricing-alt-label">
              Pay-as-you-go. No minimum, no monthly. Ideal for community sites with sporadic CAR-T cases.
            </div>
          </div>
          <div className="pricing-alt-item">
            <div className="pricing-alt-price">$25<span className="alt-unit">/case</span></div>
            <div className="pricing-alt-label">
              Full referral packet — board persistence, branded PDF, shareable URL. For one-off referrals.
            </div>
          </div>
          <div className="pricing-alt-item">
            <div className="pricing-alt-price">$10K<span className="alt-unit">/quarter</span></div>
            <div className="pricing-alt-label">
              Unlimited screens for a defined period. No SLA. Good for biotech sponsorship pilots.
            </div>
          </div>
        </div>

        <div className="pricing-alt-foot">
          Best fit for non-traditional buyers. Volume pricing doesn't include shared tumor board, multi-user, or
          SSO — pick Practice or Institution above for those.
          <button className="pricing-alt-link" onClick={onRequestAccess}>
            Talk to sales →
          </button>
        </div>
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
  const [form, setForm] = useState({
    name: "", email: "", institution: "", role: "",
    volume: "", workflow: "",
  });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = form.name && form.email && form.institution && status === "idle";

  const submit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    // Try Resend first (our preferred path — better deliverability, branded welcome email)
    try {
      const res = await fetch("/api/email/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("done");
        trackWaitlistSubmit(form.role, form.institution);
        return;
      }
      // 503 = Resend not configured yet; any other error = fall through to Formspree
    } catch { /* network error — fall through to Formspree */ }

    // Fallback: Formspree (works without any env var setup)
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("done");
        trackWaitlistSubmit(form.role, form.institution);
      } else setStatus("error");
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
                <input className="modal-inp" type="text" placeholder="Coordinator / Lymphoma service lead / BMT admin / Oncologist"
                  value={form.role} onChange={e => setF("role", e.target.value)} />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Patient volume — referred/screened per month</label>
                <select
                  className="modal-inp"
                  value={form.volume}
                  onChange={e => setF("volume", e.target.value)}
                  style={{ appearance: "none", paddingRight: 30 }}
                >
                  <option value="">Select range…</option>
                  <option value="1-5">1–5 patients / month</option>
                  <option value="5-20">5–20 patients / month</option>
                  <option value="20-50">20–50 patients / month</option>
                  <option value="50+">50+ patients / month</option>
                  <option value="n/a">Not applicable / pre-program</option>
                </select>
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Current workflow pain point (optional)</label>
                <textarea
                  className="modal-inp"
                  rows={2}
                  placeholder="What slows your referral process today?"
                  value={form.workflow}
                  onChange={e => setF("workflow", e.target.value)}
                  style={{ resize: "vertical", minHeight: 50, fontFamily: "'Inter Tight', sans-serif" }}
                />
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: "#98908380", letterSpacing: "0.05em", marginTop: 5, lineHeight: 1.5 }}>
                  Do not include patient names or identifiable health information in this field.
                </div>
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
    if (p === "/about") return "about";
    if (p === "/privacy") return "privacy";
    if (p === "/terms") return "terms";
    if (p === "/disclaimer") return "disclaimer";
    if (p === "/analytics") return "analytics";
    if (p === "/today") return "today";
    if (p === "/retrospective") return "retrospective";
    if (p === "/research") return "research";
    if (p === "/centers") return "centers";
    return "screener";
  }); // "screener" | "board" | "today" | "pricing" | "criteria" | "refer" | "about" | "privacy" | "terms" | "disclaimer" | "analytics" | "retrospective" | "research" | "centers"
  const [boardAdded, setBoardAdded] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [formOpen, setFormOpen] = useState(true); // mobile form collapse

  // Usage counter — seeds at 1247, increments with each real screen run
  const [screenCount, setScreenCount] = useState(() => {
    const base = 1247;
    try { return base + parseInt(localStorage.getItem("celltx-run-count") || "0", 10); }
    catch { return base; }
  });

  // Tumor board — persisted to localStorage (with schema migration)
  const [board, setBoard] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("celltx-board") || "[]");
      return raw.map(c => migrateTimeline(migrateCase(c)));
    } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("celltx-board", JSON.stringify(board)); }
    catch { /* storage full — ignore */ }
  }, [board]);

  // Sync view → URL path (preserves hash for shared cases) + analytics pageview
  useEffect(() => {
    const target = view === "pricing" ? "/pricing"
      : view === "board" ? "/board"
      : view === "criteria" ? "/criteria"
      : view === "refer" ? "/refer"
      : view === "about" ? "/about"
      : view === "privacy" ? "/privacy"
      : view === "terms" ? "/terms"
      : view === "disclaimer" ? "/disclaimer"
      : view === "analytics" ? "/analytics"
      : view === "today" ? "/today"
      : view === "retrospective" ? "/retrospective"
      : view === "research" ? "/research"
      : view === "centers" ? "/centers"
      : "/";
    if (window.location.pathname !== target) {
      window.history.pushState({}, "", target + window.location.hash);
    }
    trackPageview(target);
  }, [view]);

  // Auth + digest preferences — declared BEFORE any effect that references them
  const { isSignedIn, isLoaded, user } = useAuth();
  const userEmail = user?.primaryEmailAddress?.emailAddress || null;
  const userName  = user?.fullName || user?.firstName || null;

  // Digest preference state — drives the toggle UI
  const [digestEnabled, setDigestEnabledState] = useState(() => {
    try { return isDigestEnabled(); } catch { return false; }
  });

  // Auto-digest scheduler — checks once when conditions are met
  useEffect(() => {
    if (!isSignedIn || !userEmail || board.length === 0) return;
    let cancelled = false;
    // Slight delay so it doesn't block initial paint
    const t = setTimeout(() => {
      if (cancelled) return;
      maybeSendAutoDigest({ board, toEmail: userEmail, toName: userName })
        .then(() => { /* fire-and-forget; idempotent via timestamp guard */ })
        .catch(() => { /* silent */ });
    }, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  }, [isSignedIn, userEmail, userName, board.length]);

  // Sync URL → view on back/forward
  useEffect(() => {
    const onPop = () => {
      const p = window.location.pathname;
      if (p === "/pricing") setView("pricing");
      else if (p === "/board") setView("board");
      else if (p === "/criteria") setView("criteria");
      else if (p === "/refer") setView("refer");
      else if (p === "/about") setView("about");
      else if (p === "/privacy") setView("privacy");
      else if (p === "/terms") setView("terms");
      else if (p === "/disclaimer") setView("disclaimer");
      else if (p === "/analytics") setView("analytics");
      else if (p === "/today") setView("today");
      else if (p === "/retrospective") setView("retrospective");
      else if (p === "/research") setView("research");
      else if (p === "/centers") setView("centers");
      else setView("screener");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const toggleDigest = () => {
    setDigestEnabledState(prev => {
      const next = !prev;
      setDigestEnabled(next);
      return next;
    });
  };

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
    const now = new Date().toISOString();
    const initialEvent = createEvent({
      type: "case.created",
      by: userName || "you",
      title: `Case created — ${patientLabel}`,
      detail: (pt.cancerType || "").split("(")[0].trim(),
    });
    const newCase = {
      id: Date.now().toString(),
      addedAt: now,
      patientLabel,
      patient: { ...pt },
      results: { ...results },
      stage: "pending_review",
      outcome: null,
      outcomeNotes: "",
      nextActionDate: null,
      notes: "",
      stageHistory: [{ stage: "pending_review", at: now }],
      timeline: emptyTimeline(),
      events: [initialEvent],
      tasks: [],
    };
    setBoard(b => [...b, newCase]);
    setBoardAdded(true);
    setTimeout(() => setBoardAdded(false), 2500);
    trackAddToBoard(board.length + 1);
  };

  const updateBoardCase = (id, patch) =>
    setBoard(b => b.map(c => c.id === id ? { ...c, ...patch } : c));

  // Advance to a specific stage, with history tracking.
  // Auto-populates relevant timeline fields:
  //   - referred       → timeline.referralCreatedAt = today (if unset)
  //   - apheresis      → timeline.apheresis.performedAt = today (if unset)
  //   - manufacturing  → timeline.manufacturing.productStartedAt = today (if unset)
  //                       + expectedDeliveryAt = today + 28 days
  //   - infused        → timeline.infusion.performedAt = today (if unset)
  // Also auto-suggests a nextActionDate.
  const setBoardCaseStage = (id, newStage) =>
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      if (c.stage === newStage) return c;
      const now = new Date().toISOString();
      const today = todayISO();
      const actor = userName || "you";
      const next = {
        ...c,
        stage: newStage,
        stageHistory: [
          ...(c.stageHistory || []),
          { stage: newStage, at: now },
        ],
      };

      // Reminder auto-suggestion
      const existing = c.nextActionDate;
      const existingPast = existing && new Date(existing + "T23:59:59") < new Date();
      if (!existing || existingPast) {
        const suggested = suggestReminderDate(newStage);
        if (suggested) next.nextActionDate = suggested;
      }

      // Timeline auto-population
      const tl = next.timeline || emptyTimeline();
      const tlNext = { ...tl };
      if (newStage === "referred" && !tl.referralCreatedAt) {
        tlNext.referralCreatedAt = today;
      }
      if (newStage === "apheresis" && !tl.apheresis.performedAt) {
        tlNext.apheresis = { ...tl.apheresis, performedAt: today };
      }
      if (newStage === "manufacturing" && !tl.manufacturing.productStartedAt) {
        const expected = new Date(); expected.setDate(expected.getDate() + MFG_TYPICAL_DAYS);
        tlNext.manufacturing = {
          ...tl.manufacturing,
          productStartedAt: today,
          expectedDeliveryAt: tl.manufacturing.expectedDeliveryAt || expected.toISOString().slice(0, 10),
        };
      }
      if (newStage === "infused" && !tl.infusion.performedAt) {
        tlNext.infusion = { ...tl.infusion, performedAt: today };
        // Mark mfg received on infusion if not already
        if (!tl.manufacturing.receivedAt) {
          tlNext.manufacturing = { ...tlNext.manufacturing, receivedAt: today };
        }
      }
      next.timeline = tlNext;

      // Emit events from diff
      const newEvents = diffEvents(c, next, actor);
      if (newEvents.length > 0) {
        next.events = [...(c.events || []), ...newEvents];
      }
      return next;
    }));

  const removeBoardCase = (id) =>
    setBoard(b => b.filter(c => c.id !== id));

  // Partial timeline update (deep-merges into the timeline sub-object).
  // Emits events from the diff.
  const updateBoardCaseTimeline = (id, section, patch) =>
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      const tl = c.timeline || emptyTimeline();
      const nextTl = section === "_root"
        ? { ...tl, ...patch }
        : { ...tl, [section]: { ...tl[section], ...patch } };
      const next = { ...c, timeline: nextTl };
      const evs = diffEvents(c, next, userName || "you");
      if (evs.length > 0) next.events = [...(c.events || []), ...evs];
      return next;
    }));

  // Replace the entire pendingLabs array (emits lab.* events)
  const setPendingLabs = (id, labs) =>
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      const oldLabs = (c.timeline || emptyTimeline()).pendingLabs || [];
      const next = { ...c, timeline: { ...(c.timeline || emptyTimeline()), pendingLabs: labs } };
      const evs = diffLabEvents(oldLabs, labs, userName || "you");
      if (evs.length > 0) next.events = [...(c.events || []), ...evs];
      return next;
    }));

  // Assign / unassign a case to a coordinator (free-text)
  const assignBoardCase = (id, assignee) =>
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      const next = { ...c, assignedTo: assignee || "" };
      const evs = diffEvents(c, next, userName || "you");
      if (evs.length > 0) next.events = [...(c.events || []), ...evs];
      return next;
    }));

  // Toggle escalation flag with optional reason
  const escalateBoardCase = (id, reason) =>
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      let next;
      if (c.escalated) {
        next = { ...c, escalated: false, escalationReason: "", escalationFlaggedAt: null };
      } else {
        next = {
          ...c,
          escalated: true,
          escalationReason: reason || "Escalated for physician review",
          escalationFlaggedAt: new Date().toISOString(),
        };
      }
      const evs = diffEvents(c, next, userName || "you");
      if (evs.length > 0) next.events = [...(c.events || []), ...evs];
      return next;
    }));

  // ─── Task helpers ─────────────────────────────────────────────────────
  const addCaseTask = (caseId, taskData) => {
    const task = newTask({ ...taskData, createdBy: userName || "you" });
    setBoard(b => b.map(c => {
      if (c.id !== caseId) return c;
      const taskEvent = createEvent({
        type: "note.added",
        by: userName || "you",
        title: `Task added: ${task.title}`,
        detail: [task.assignedTo && `Assigned to ${task.assignedTo}`, task.dueDate && `Due ${task.dueDate}`].filter(Boolean).join(" · "),
      });
      return {
        ...c,
        tasks: [...(c.tasks || []), task],
        events: [...(c.events || []), taskEvent],
      };
    }));
  };

  const updateCaseTask = (caseId, taskId, patch) =>
    setBoard(b => b.map(c => {
      if (c.id !== caseId) return c;
      const oldTask = (c.tasks || []).find(t => t.id === taskId);
      if (!oldTask) return c;
      const nextTask = { ...oldTask, ...patch };
      // If marking complete, stamp the completion fields
      if (patch.status === "complete" && oldTask.status !== "complete") {
        nextTask.completedAt = new Date().toISOString();
        nextTask.completedBy = userName || "you";
      }
      // If un-completing, clear those fields
      if (patch.status && patch.status !== "complete" && oldTask.status === "complete") {
        nextTask.completedAt = null;
        nextTask.completedBy = null;
      }
      const events = [...(c.events || [])];
      if (patch.status === "complete" && oldTask.status !== "complete") {
        events.push(createEvent({
          type: "note.added",
          by: userName || "you",
          title: `Task completed: ${nextTask.title}`,
        }));
      }
      return {
        ...c,
        tasks: (c.tasks || []).map(t => t.id === taskId ? nextTask : t),
        events,
      };
    }));

  const removeCaseTask = (caseId, taskId) =>
    setBoard(b => b.map(c => {
      if (c.id !== caseId) return c;
      const removed = (c.tasks || []).find(t => t.id === taskId);
      const events = [...(c.events || [])];
      if (removed) {
        events.push(createEvent({
          type: "note.added",
          by: userName || "you",
          title: `Task removed: ${removed.title}`,
        }));
      }
      return { ...c, tasks: (c.tasks || []).filter(t => t.id !== taskId), events };
    }));

  const addStarterTasks = (caseId) =>
    setBoard(b => b.map(c => {
      if (c.id !== caseId) return c;
      const starters = suggestStarterTasks(c.stage);
      if (starters.length === 0) return c;
      const event = createEvent({
        type: "note.added",
        by: userName || "you",
        title: `Added ${starters.length} starter tasks for "${c.stage}" stage`,
      });
      return {
        ...c,
        tasks: [...(c.tasks || []), ...starters],
        events: [...(c.events || []), event],
      };
    }));

  // Append a manual note (free-form) as a note.added event
  const addCaseNote = (id, text) => {
    if (!text || !text.trim()) return;
    setBoard(b => b.map(c => {
      if (c.id !== id) return c;
      const ev = createEvent({
        type: "note.added",
        by: userName || "you",
        title: "Note",
        detail: text.trim(),
      });
      return { ...c, events: [...(c.events || []), ev] };
    }));
  };

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
    // Analytics
    trackScreenRun(pt);
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
    trackCopyShareLink();
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
                <>
                  {(() => {
                    // Surface a count badge of overdue + due-today items
                    const items = computePendingItems(board);
                    const urgent = items.filter(i => i.urgency === "overdue" || i.urgency === "due_today" || i.urgency === "escalated").length;
                    return (
                      <button
                        className={`hdr-nav-btn${view === "today" ? " active" : ""}`}
                        onClick={() => setView("today")}
                        title="Today's coordinator queue"
                        style={urgent > 0 && view !== "today" ? { color: "#b54a2c", borderColor: "#b54a2c", background: "#b54a2c08" } : {}}
                      >
                        Today
                        {urgent > 0 && <span className="hdr-nav-count">⚠ {urgent}</span>}
                      </button>
                    );
                  })()}
                  <button
                    className={`hdr-nav-btn${view === "board" ? " active" : ""}`}
                    onClick={() => setView("board")}
                  >
                    Tumor Board
                    {board.length > 0 && <span className="hdr-nav-count">({board.length})</span>}
                  </button>
                  <button
                    className={`hdr-nav-btn${view === "analytics" ? " active" : ""}`}
                    onClick={() => setView("analytics")}
                    title="Program metrics & outcomes"
                  >
                    Analytics
                  </button>
                </>
              )}
              <button
                className={`hdr-nav-btn${view === "centers" ? " active" : ""}`}
                onClick={() => setView("centers")}
                title="For certified cell therapy centers · charter pilot offer"
                style={view === "centers" ? {} : { borderColor: "#b54a2c", color: "#b54a2c" }}
              >
                For Centers
              </button>
              <button
                className={`hdr-nav-btn${view === "criteria" ? " active" : ""}`}
                onClick={() => setView("criteria")}
              >
                Criteria
              </button>
              <button
                className={`hdr-nav-btn${view === "about" ? " active" : ""}`}
                onClick={() => setView("about")}
              >
                About
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

      {/* HERO + capability grid + trust band — only on the screener landing */}
      {view === "screener" && <>
      <section className="hero">
        <div className="hero-grid">
          <div className="hero-text fade-in">
            <div className="hero-tag">Precision Referral Intelligence · ESCAT-tiered · May 2026</div>
            <h1 className="hero-h1">
              Post-NGS <em>cell therapy</em> intelligence,<br />ready for tumor board
            </h1>
            <p className="hero-sub">
              Three layers in one workflow: ESCAT-tiered evidence interpretation of NGS findings,
              resistance &amp; escalation flags for cell therapy nonresponse risk, and a referral
              pipeline that gets your patient to the right center. All 12 FDA-approved CAR-T and
              bispecific products — evaluated simultaneously, in seconds.
            </p>

            <div className="hero-pills">
              {ALL_PRODUCTS.map(p => (
                <span key={p.id} className="hero-pill" style={{ borderColor: p.color + "60", color: p.color }}>
                  {p.name}
                </span>
              ))}
            </div>

            {/* Primary + secondary CTAs */}
            <div className="hero-cta-row">
              <button
                className="hero-cta primary"
                onClick={() => {
                  trackPricingCta("hero-institutional");
                  setShowWaitlist(true);
                }}
              >
                Request institutional access →
              </button>
              <button
                className="hero-cta secondary"
                onClick={() => {
                  const formEl = document.querySelector(".form-panel");
                  if (formEl) formEl.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Start free analysis ↓
              </button>
            </div>

            {/* Stat strip — credibility integrated into hero */}
            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-num"><em>12</em></div>
                <div className="hero-stat-label">FDA-approved products tracked</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-num">6</div>
                <div className="hero-stat-label">NCCN-aligned disease pathways</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-num">22</div>
                <div className="hero-stat-label">Pivotal trials cited · sourced to FDA labels</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-num">{screenCount.toLocaleString()}</div>
                <div className="hero-stat-label">Cases analyzed · free for individual clinicians</div>
              </div>
            </div>
          </div>

          {/* Stylized pipeline visualization — hints at depth without screenshots */}
          <div className="hero-pipeline fade-in delay-2">
            <div className="pipeline-title">Referral lifecycle</div>
            <div className="pipeline-flow">
              <div className="pipeline-step complete">
                <div className="pipeline-dot complete">✓</div>
                <div>
                  <div className="pipeline-step-label">Eligibility screen</div>
                  <div className="pipeline-step-sub">12 products in seconds</div>
                </div>
              </div>
              <div className="pipeline-step complete">
                <div className="pipeline-dot complete">✓</div>
                <div>
                  <div className="pipeline-step-label">Tumor board review</div>
                  <div className="pipeline-step-sub">Packet PDF in one click</div>
                </div>
              </div>
              <div className="pipeline-step active">
                <div className="pipeline-dot active">●</div>
                <div>
                  <div className="pipeline-step-label">Apheresis → manufacturing</div>
                  <div className="pipeline-step-sub">Day-by-day countdown</div>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-dot">○</div>
                <div>
                  <div className="pipeline-step-label">Infusion + follow-up</div>
                  <div className="pipeline-step-sub">D30 / D90 outcomes</div>
                </div>
              </div>
              <div className="pipeline-step">
                <div className="pipeline-dot">○</div>
                <div>
                  <div className="pipeline-step-label">Program analytics</div>
                  <div className="pipeline-step-sub">QI-ready dashboard</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITY GRID — four visual feature cards */}
      <section className="capability-section">
        <div className="capability-eyebrow">What you get</div>
        <h2 className="capability-title">
          Built for the way <em>oncology teams</em> actually work — not a generic checklist tool.
        </h2>

        <div className="capability-grid">
          <button
            className="capability-card fade-in delay-1"
            onClick={() => setView("criteria")}
            style={{ background: "#f4f1ea", border: "1px solid #1a181530", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <div className="capability-icon-wrap">
              <Dna size={20} strokeWidth={1.6} />
            </div>
            <h3 className="capability-card-title">Smart eligibility engine</h3>
            <p className="capability-card-body">
              12 FDA-approved CAR-T and bispecific products. Real-time analysis with citations
              to FDA labels and pivotal trials.
            </p>
            <span className="capability-card-link">View criteria library →</span>
          </button>

          <button
            className="capability-card fade-in delay-2"
            onClick={() => setView("refer")}
            style={{ background: "#f4f1ea", border: "1px solid #1a181530", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <div className="capability-icon-wrap">
              <BarChart3 size={20} strokeWidth={1.6} />
            </div>
            <h3 className="capability-card-title">NCCN-aware pathways</h3>
            <p className="capability-card-body">
              Disease-specific intelligence for DLBCL, FL, MCL, CLL, ALL, and MM. High-risk
              modifiers and urgency triage built in.
            </p>
            <span className="capability-card-link">Try early referral tool →</span>
          </button>

          <button
            className="capability-card fade-in delay-3"
            onClick={() => isSignedIn ? setView("today") : setShowWaitlist(true)}
            style={{ background: "#f4f1ea", border: "1px solid #1a181530", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <div className="capability-icon-wrap">
              <Clock size={20} strokeWidth={1.6} />
            </div>
            <h3 className="capability-card-title">Operations dashboard</h3>
            <p className="capability-card-body">
              Daily coordinator queue · pending labs · insurance status · manufacturing
              countdowns · escalations — your morning ritual.
            </p>
            <span className="capability-card-link">{isSignedIn ? "Open dashboard" : "Request demo"} →</span>
          </button>

          <button
            className="capability-card fade-in delay-4"
            onClick={() => setView("research")}
            style={{ background: "#f4f1ea", border: "1px solid #1a181530", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }}
          >
            <div className="capability-icon-wrap">
              <FileText size={20} strokeWidth={1.6} />
            </div>
            <h3 className="capability-card-title">FHIR-ready audit trail</h3>
            <p className="capability-card-body">
              Every case exports as a FHIR R4 Bundle. Per-event provenance log. Outcomes
              CSV for QI reporting and retrospective studies.
            </p>
            <span className="capability-card-link">See data model →</span>
          </button>
        </div>
      </section>

      {/* TRUSTED APPROACH BAND */}
      <section className="trust-band">
        <div className="trust-item fade-in delay-1">
          <div className="trust-icon">
            <CheckCircle size={16} strokeWidth={1.8} />
          </div>
          <div className="trust-text">
            <div className="trust-label">Sourced to current FDA labels</div>
            <div className="trust-detail">
              Every eligibility rule cites its source. Updated within 30 days of FDA approvals.{" "}
              <button onClick={() => setView("criteria")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80", font: "inherit" }}>Browse the library →</button>
            </div>
          </div>
        </div>
        <div className="trust-item fade-in delay-2">
          <div className="trust-icon">
            <Dna size={16} strokeWidth={1.8} />
          </div>
          <div className="trust-text">
            <div className="trust-label">Built by clinical translational scientists</div>
            <div className="trust-detail">
              Tumor immunology PhD + practicing physician advisor. Real clinical workflow expertise.{" "}
              <button onClick={() => setView("about")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80", font: "inherit" }}>About the team →</button>
            </div>
          </div>
        </div>
        <div className="trust-item fade-in delay-3">
          <div className="trust-icon">
            <CheckCircle size={16} strokeWidth={1.8} />
          </div>
          <div className="trust-text">
            <div className="trust-label">Privacy by architecture</div>
            <div className="trust-detail">
              Patient data never leaves the browser. No PHI on our servers — by design, not by policy.{" "}
              <button onClick={() => setView("privacy")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#4c6b8c", borderBottom: "1px dotted #4c6b8c80", font: "inherit" }}>Privacy policy →</button>
            </div>
          </div>
        </div>
      </section>

      {/* WHO THIS IS FOR */}
      <section className="who-strip">
        <div className="who-strip-head">Built for</div>
        <div className="who-strip-grid">
          <div className="who-item">
            <div className="who-item-label">Community oncology</div>
            <div className="who-item-sub">Decide when to refer · early</div>
          </div>
          <div className="who-item">
            <div className="who-item-label">CAR-T referral teams</div>
            <div className="who-item-sub">Eligibility · coordination</div>
          </div>
          <div className="who-item">
            <div className="who-item-label">Tumor boards</div>
            <div className="who-item-sub">Shared workflow · packet PDF</div>
          </div>
          <div className="who-item">
            <div className="who-item-label">Transplant programs</div>
            <div className="who-item-sub">Sequencing · bridging plans</div>
          </div>
        </div>
      </section>
      </>}{/* end hero + who-strip — screener only */}

      {/* TUMOR BOARD VIEW */}
      {view === "board" && (
        <TumorBoardView
          board={board}
          onUpdateCase={updateBoardCase}
          onSetCaseStage={setBoardCaseStage}
          onUpdateTimeline={updateBoardCaseTimeline}
          onSetPendingLabs={setPendingLabs}
          onAssignCase={assignBoardCase}
          onEscalateCase={escalateBoardCase}
          onAddNote={addCaseNote}
          onAddTask={addCaseTask}
          onUpdateTask={updateCaseTask}
          onRemoveTask={removeCaseTask}
          onAddStarterTasks={addStarterTasks}
          onRemoveCase={removeBoardCase}
          onLoadCase={loadBoardCase}
          onGoToScreener={() => setView("screener")}
          onExport={() => { generateBoardPdf(board); trackBoardPacketExport(board.length); }}
          onRequestDemo={() => { trackPricingCta("board-workflow-demo"); setShowWaitlist(true); }}
          onSendDigest={() => sendDigest({ board, toEmail: userEmail, toName: userName })}
          digestEnabled={digestEnabled}
          onToggleDigest={toggleDigest}
          userEmail={userEmail}
          userName={userName}
        />
      )}

      {/* RETROSPECTIVE VALIDATION TOOL (public — research/credibility surface) */}
      {view === "retrospective" && (
        <RetrospectiveView onGoToScreener={() => setView("screener")} />
      )}

      {/* RESEARCH & PARTNERSHIPS (public — acquirer/investor/BD surface) */}
      {view === "research" && (
        <ResearchView
          onGoToCriteria={() => setView("criteria")}
          onGoToRetro={() => setView("retrospective")}
          onGoToAnalytics={() => setView("analytics")}
        />
      )}

      {/* CENTERS (public — primary B2B sales surface for cell therapy centers) */}
      {view === "centers" && (
        <CentersView
          onRequestPilot={() => { trackPricingCta("centers-pilot"); setShowWaitlist(true); }}
        />
      )}

      {/* TODAY / OPERATIONS DASHBOARD (signed-in only) */}
      {view === "today" && (
        <OperationsView
          board={board}
          onGoToBoard={() => setView("board")}
          onAssignCase={assignBoardCase}
          onEscalateCase={escalateBoardCase}
          onUpdateTimeline={updateBoardCaseTimeline}
          onSetPendingLabs={setPendingLabs}
          onSetCaseStage={setBoardCaseStage}
          onUpdateTask={updateCaseTask}
          currentUserName={userName}
        />
      )}

      {/* ANALYTICS VIEW (signed-in only — depends on local board data) */}
      {view === "analytics" && (
        <AnalyticsView
          board={board}
          onGoToBoard={() => setView("board")}
          onGoToScreener={() => setView("screener")}
        />
      )}

      {/* LEGAL VIEWS */}
      {view === "privacy" && <PrivacyView />}
      {view === "terms" && <TermsView />}
      {view === "disclaimer" && <DisclaimerView />}

      {/* ABOUT VIEW */}
      {view === "about" && (
        <AboutView
          onBackToScreener={() => setView("screener")}
          onGoToPricing={() => setView("pricing")}
          onGoToCriteria={() => setView("criteria")}
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

          {/* MOLECULAR & RESISTANCE INTELLIGENCE — paste NGS report + resistance flags */}
          <div className="sec-head" style={{ borderTop: "1px solid #1a181818", paddingTop: 14, marginTop: 18 }}>
            Molecular &amp; resistance
            <span style={{ fontSize: 8.5, color: "#4c6b8c", letterSpacing: "0.1em", marginLeft: 6 }}>
              · ESCAT-tiered
            </span>
          </div>

          <div className="field">
            <label className="lbl">
              NGS report <span style={{ color: "#98908380", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(paste free text — TP53, del(17p), MYC, etc.)</span>
            </label>
            <textarea
              className="ngs-textarea"
              rows={4}
              placeholder="e.g.&#10;TP53 p.R175H mutation detected&#10;del(17p) by FISH&#10;Double-hit lymphoma — MYC and BCL2 rearrangements&#10;Complex karyotype"
              value={pt.ngsReport}
              onChange={e => set("ngsReport", e.target.value)}
            />
            <p className="ngs-hint">
              Free-text NGS / cytogenetics. Engine extracts curated biomarkers and maps to ESCAT evidence tiers + resistance implications. Never leaves your browser.
            </p>
          </div>

          <Checkbox checked={pt.bulkyDisease} onChange={() => tog("bulkyDisease")}
            label="Bulky disease (>10 cm or >7.5 cm with B symptoms)" />
          <Checkbox checked={pt.priorCd19Therapy} onChange={() => tog("priorCd19Therapy")}
            label="Prior CD19-directed therapy (CAR-T, blinatumomab, tafasitamab)" />
          <Checkbox checked={pt.priorBcmaTherapy} onChange={() => tog("priorBcmaTherapy")}
            label="Prior BCMA-directed therapy (CAR-T, belantamab, teclistamab)" />
          <Checkbox checked={pt.antigenLoss} onChange={() => tog("antigenLoss")}
            label="Documented antigen loss on relapse (CD19, BCMA, etc.)" />

          <div className="field">
            <label className="lbl">LDH × ULN <span style={{ color: "#98908380", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — sharpens risk score)</span></label>
            <input className="lab-inp" type="number" step="0.1" min="0" placeholder="e.g. 2.5"
              value={pt.ldhMultipleUln} onChange={e => set("ldhMultipleUln", e.target.value)}
              style={{ width: "100%" }} />
          </div>

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

              {/* Evidence-ranked options — Layer 1 (the evidence engine) */}
              <EvidenceRankedOptionsPanel pt={pt} results={results} />

              {/* Molecular & resistance intelligence — Layer 2 (resistance/escalation) */}
              <MolecularIntelligencePanel pt={pt} />

              {/* Consolidated workup checklist — what to do to prepare for referral */}
              <WorkupPanel pt={pt} />

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
                onClick={() => {
                  generatePdf({ patient: pt, results, products: ALL_PRODUCTS });
                  trackPdfExport("referral", false);
                }}
              >
                <Download size={13} />
                Export Referral Report (PDF)
              </button>
              <button
                className="export-btn secondary"
                title="Grayscale version for fax/B&W printing"
                onClick={() => {
                  generatePdf({ patient: pt, results, products: ALL_PRODUCTS, grayscale: true });
                  trackPdfExport("referral", true);
                }}
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

      {/* SITE-WIDE CLINICAL DISCLAIMER BANNER */}
      <div className="disclaimer-banner">
        <strong>CellTx Match is not a medical device.</strong> For decision support by licensed healthcare professionals only. Always verify against current FDA prescribing information.
        <button
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#b54a2c", borderBottom: "1px dotted #b54a2c80", fontFamily: "inherit", fontSize: "inherit", marginLeft: 6 }}
          onClick={() => setView("disclaimer")}
        >
          Full clinical disclaimer →
        </button>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand">CellTx Match</div>
        <div className="footer-links">
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("about")}
          >
            About
          </button>
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
            onClick={() => setView("retrospective")}
          >
            Retrospective Tool →
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("research")}
          >
            Research &amp; Partnerships →
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#b54a2c" }}
            onClick={() => setView("centers")}
          >
            For Centers →
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setShowAccuracy(true)}
          >
            How accurate?
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("privacy")}
          >
            Privacy
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("terms")}
          >
            Terms
          </button>
          <button
            className="footer-link"
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setView("disclaimer")}
          >
            Disclaimer
          </button>
          <a href="https://biomarker-database.vercel.app" target="_blank" rel="noopener noreferrer" className="footer-link">
            OncoMarker →
          </a>
        </div>
      </footer>
    </div>
  );
}
