// src/utils/pathways.js
// Disease-specific pathway intelligence — NCCN-aligned, label-aware.
//
// Each disease has nuances that the generic eligibility engine doesn't capture:
//  - DLBCL: primary refractory vs early relapse vs late relapse drives 2L vs 3L+
//  - FL:    POD24 status, grade 3B (treat as DLBCL), transformation
//  - MCL:   BTKi exposure, blastoid/pleomorphic variant, TP53 status
//  - CLL:   BTKi + venetoclax exposure, Richter's transformation
//  - ALL:   age (Kymriah ≤25, Tecartus adult), Ph status, blinatumomab/ino bridging
//  - MM:    lenalidomide-refractory (drives Carvykti 1L+), EMD, high-risk cytogenetics
//
// Each evaluator returns { disease, highRisk[], nccnContext[], productPreferences[], caveats[] }
// or null if no cancer type selected / not in scope.

function classifyCancer(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return "mm";
  if (c.includes("mantle") || c.includes("mcl")) return "mcl";
  if (c.includes("cll") || c.includes("sll")) return "cll";
  if (c.includes("follicular")) return "fl";
  if (c.includes("all") || c.includes("leukemia")) return "all";
  if (c.includes("dlbcl") || c.includes("lbcl") || c.includes("pmbcl") ||
      c.includes("lymphoma") || c.includes("large b")) return "dlbcl";
  return null;
}

// ── DLBCL / LBCL ────────────────────────────────────────────────────────────
function evaluateDLBCL(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  const lines = parseInt(pt.priorLines, 10) || 0;

  // Primary refractory / early relapse drives 2L+ CAR-T
  if (pt.primaryRefractory || pt.earlyRelapse) {
    highRisk.push(pt.primaryRefractory ? "Primary refractory disease" : "Early relapse (<12 mo from 1L)");
    nccnContext.push("NCCN: Primary refractory or relapse <12 mo from 1L immunochemo → CAR-T preferred over auto-SCT (Category 1)");
    productPreferences.push({ id: "yescarta",  reason: "ZUMA-7 — 2L+ FDA approved for primary refractory / early relapse" });
    productPreferences.push({ id: "breyanzi",  reason: "TRANSFORM — 2L+ FDA approved" });
  } else if (lines >= 2) {
    productPreferences.push({ id: "yescarta",  reason: "ZUMA-1 / ZUMA-7 — 2L+ approved" });
    productPreferences.push({ id: "breyanzi",  reason: "TRANSCEND-NHL-001 — 2L+ approved" });
    productPreferences.push({ id: "kymriah",   reason: "JULIET — 2L+ approved" });
  }

  if (lines === 1 && !pt.primaryRefractory && !pt.earlyRelapse) {
    caveats.push("Late relapse (>12 mo from 1L) with transplant eligibility: NCCN considers auto-SCT vs CAR-T at 2L — discuss with patient");
  }

  // Double-hit / double-expressor
  if (pt.doubleHit) {
    highRisk.push("Double/triple-hit lymphoma (MYC + BCL2 ± BCL6)");
    nccnContext.push("Double-hit lymphoma — CAR-T preferred at 2L due to poor auto-SCT outcomes");
  }

  // Transformed lymphoma
  if (pt.transformedFromIndolent) {
    caveats.push("Transformed lymphoma — treat per DLBCL pathway regardless of prior indolent therapy lines");
    nccnContext.push("Histologic transformation: prior indolent-directed lines don't count toward DLBCL line-of-therapy threshold");
  }

  // Bispecifics positioning
  if (lines >= 2) {
    productPreferences.push({ id: "epkinly",  reason: "EPCORE-NHL-1 — 3L+ approved, off-the-shelf SC option" });
    productPreferences.push({ id: "columvi",  reason: "NP30179 — 2L+ approved, fixed-duration (12 cycles)" });
  }

  return {
    disease: "DLBCL / Large B-cell lymphoma",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── Follicular lymphoma ─────────────────────────────────────────────────────
function evaluateFL(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  if (pt.pod24) {
    highRisk.push("POD24 — progression <24 mo from 1L immunochemo");
    nccnContext.push("POD24 portends inferior survival — consider CAR-T or bispecific at 3L+ rather than re-treatment");
  }

  if (pt.flGrade3b) {
    caveats.push("Grade 3B FL — treat per DLBCL pathway, not FL pathway");
    nccnContext.push("FL grade 3B is biologically aggressive — DLBCL-style CAR-T approach (Yescarta, Breyanzi at 2L+)");
  }

  if (pt.transformedToDlbcl) {
    caveats.push("Transformed FL → DLBCL — treat per DLBCL pathway");
  }

  if (!pt.flGrade3b && !pt.transformedToDlbcl) {
    productPreferences.push({ id: "yescarta",  reason: "ZUMA-5 — 3L+ approved for R/R FL" });
    productPreferences.push({ id: "breyanzi",  reason: "TRANSCEND-FL — 3L+ approved" });
    productPreferences.push({ id: "kymriah",   reason: "ELARA — 3L+ approved" });
    productPreferences.push({ id: "lunsumio",  reason: "GO29781 — 2L+ approved, fixed-duration (8 cycles), no leukapheresis" });
    productPreferences.push({ id: "epkinly",   reason: "EPCORE-NHL-1 — 3L+ approved for FL" });
  }

  return {
    disease: "Follicular lymphoma",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── Mantle cell lymphoma ────────────────────────────────────────────────────
function evaluateMCL(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  if (pt.btkiRefractory) {
    highRisk.push("BTKi-refractory — limited remaining options");
    nccnContext.push("Post-BTKi failure portends short survival without CAR-T — refer urgently");
    productPreferences.push({ id: "tecartus", reason: "ZUMA-2 — FDA approved for R/R MCL after BTKi" });
  } else if (pt.btkiExposed) {
    nccnContext.push("Prior BTKi exposure documented — patient eligible for Tecartus (ZUMA-2)");
    productPreferences.push({ id: "tecartus", reason: "ZUMA-2 — approved for BTKi-exposed MCL" });
  } else {
    caveats.push("BTKi exposure typically required before Tecartus (recent label expansions vary — verify current PI)");
  }

  if (pt.blastoidVariant) {
    highRisk.push("Blastoid / pleomorphic variant — aggressive biology");
    nccnContext.push("Blastoid MCL — high MIPI, short PFS to standard therapy; prioritize CAR-T");
  }

  if (pt.tp53Mutated) {
    highRisk.push("TP53-mutated MCL — poor chemoimmunotherapy response");
    nccnContext.push("TP53 mutation predicts BTKi failure and chemoresistance — CAR-T is the preferred consolidative approach");
  }

  return {
    disease: "Mantle cell lymphoma",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── CLL / SLL ───────────────────────────────────────────────────────────────
function evaluateCLL(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  if (pt.richtersTransformation) {
    highRisk.push("Richter's transformation");
    caveats.push("Richter's transformation — treat per DLBCL pathway, not CLL pathway");
    nccnContext.push("Richter's transformation has poor outcomes — DLBCL-style CAR-T (Yescarta, Breyanzi) is the preferred consolidative approach");
  } else if (pt.btkiVenetoclaxExposed) {
    nccnContext.push("Prior BTKi + venetoclax exposure documented — patient eligible for Breyanzi (TRANSCEND CLL 004)");
    productPreferences.push({ id: "breyanzi", reason: "TRANSCEND CLL 004 — approved for R/R CLL/SLL after BTKi + venetoclax" });
  } else {
    caveats.push("Breyanzi for CLL/SLL requires prior BTKi AND venetoclax exposure — confirm both before referral");
  }

  return {
    disease: "CLL / SLL",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── ALL ─────────────────────────────────────────────────────────────────────
function evaluateALL(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  if (pt.age25OrYounger) {
    productPreferences.push({ id: "kymriah", reason: "ELIANA — FDA approved for R/R B-ALL in patients ≤25 years" });
    nccnContext.push("Pediatric/AYA R/R B-ALL — Kymriah is the preferred CAR-T (only product approved in this age group)");
  } else {
    productPreferences.push({ id: "tecartus", reason: "ZUMA-3 — FDA approved for adult R/R B-cell ALL" });
    nccnContext.push("Adult R/R B-ALL — Tecartus (brexucabtagene autoleucel) is the preferred CAR-T");
  }

  if (pt.phPositive) {
    caveats.push("Ph+ B-ALL — continue TKI through bridging and into CAR-T process; consult per institutional protocol");
    nccnContext.push("Ph+ B-ALL: TKI (dasatinib, ponatinib) should be continued through apheresis and resumed after CAR-T");
  }

  highRisk.push("R/R B-ALL — disease tempo is inherently rapid");
  nccnContext.push("Bridging options: blinatumomab (CD19) and inotuzumab ozogamicin (CD22) — note that blinatumomab is CD19-directed and may impact target antigen");

  return {
    disease: "Acute lymphoblastic leukemia",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── Multiple myeloma ────────────────────────────────────────────────────────
function evaluateMM(pt) {
  const highRisk = [];
  const nccnContext = [];
  const productPreferences = [];
  const caveats = [];

  const lines = parseInt(pt.priorLines, 10) || 0;
  const tripleClassExposed = pt.priorImid && pt.priorPi && pt.priorAntiCd38;

  // Carvykti 1L+ for lenalidomide-refractory (CARTITUDE-4)
  if (pt.lenalidomideRefractory && lines >= 1) {
    nccnContext.push("CARTITUDE-4: Carvykti now approved at 1L+ for lenalidomide-refractory MM — broader access than the 4L+ indication");
    productPreferences.push({ id: "carvykti", reason: "CARTITUDE-4 — 1L+ approved for lenalidomide-refractory MM" });
  }

  if (tripleClassExposed && lines >= 4) {
    nccnContext.push("Triple-class exposed (IMiD + PI + anti-CD38) with ≥4 prior lines — full CAR-T and bispecific access");
    productPreferences.push({ id: "abecma",   reason: "KarMMa — 4L+ approved" });
    productPreferences.push({ id: "carvykti", reason: "CARTITUDE-1 — 4L+ approved (also CARTITUDE-4 for 1L+ len-refractory)" });
    productPreferences.push({ id: "tecvayli", reason: "MajesTEC-1 — 4L+ approved, off-the-shelf BCMA bispecific" });
    productPreferences.push({ id: "talvey",   reason: "MonumenTAL-1 — 4L+ approved, GPRC5D bispecific (usable post-BCMA failure)" });
    productPreferences.push({ id: "elrexfio", reason: "MagnetisMM-3 — 4L+ approved, BCMA bispecific" });
  }

  if (pt.extramedullaryDisease) {
    highRisk.push("Extramedullary disease (EMD)");
    nccnContext.push("EMD portends shorter PFS to BCMA-directed therapies — consider sequencing GPRC5D (Talvey) or aggressive bridging");
  }

  if (pt.highRiskCytogenetics) {
    highRisk.push("High-risk cytogenetics (del17p, t(4;14), t(14;16), or 1q+)");
    nccnContext.push("High-risk cytogenetics — short remission durations expected; prioritize deep response with CAR-T or bispecific sequencing");
  }

  if (lines >= 4 && !tripleClassExposed) {
    caveats.push("≥4 prior lines but triple-class exposure not yet confirmed — document IMiD, PI, and anti-CD38 exposures before referral");
  }

  return {
    disease: "Multiple myeloma",
    highRisk, nccnContext, productPreferences, caveats,
  };
}

// ── Dispatcher ──────────────────────────────────────────────────────────────
export function evaluatePathway(pt) {
  const key = classifyCancer(pt.cancerType);
  if (!key) return null;
  switch (key) {
    case "dlbcl": return evaluateDLBCL(pt);
    case "fl":    return evaluateFL(pt);
    case "mcl":   return evaluateMCL(pt);
    case "cll":   return evaluateCLL(pt);
    case "all":   return evaluateALL(pt);
    case "mm":    return evaluateMM(pt);
    default: return null;
  }
}

// ── Map cancer type → which form fields to show ─────────────────────────────
export function getDiseaseFields(cancerType) {
  const key = classifyCancer(cancerType);
  switch (key) {
    case "dlbcl": return ["earlyRelapse", "doubleHit", "transformedFromIndolent"];
    case "fl":    return ["pod24", "flGrade3b", "transformedToDlbcl"];
    case "mcl":   return ["btkiExposed", "btkiRefractory", "blastoidVariant", "tp53Mutated"];
    case "cll":   return ["btkiVenetoclaxExposed", "richtersTransformation"];
    case "all":   return ["age25OrYounger", "phPositive"];
    case "mm":    return ["lenalidomideRefractory", "extramedullaryDisease", "highRiskCytogenetics"];
    default: return [];
  }
}

// ─── Static catalog of pathway rules (for criteria browser) ────────────────
export const PATHWAY_CATALOG = [
  {
    id: "dlbcl",
    name: "DLBCL / Large B-cell lymphoma",
    highRiskModifiers: [
      "Primary refractory disease (no response to 1L)",
      "Early relapse (<12 months from 1L immunochemo)",
      "Double/triple-hit lymphoma (MYC + BCL2 ± BCL6)",
      "Histologic transformation from indolent lymphoma",
    ],
    nccnRules: [
      "Primary refractory or relapse <12 mo from 1L → CAR-T preferred over auto-SCT (NCCN Category 1)",
      "Late relapse (>12 mo) with transplant eligibility → consider auto-SCT vs CAR-T at 2L (shared decision)",
      "Double-hit lymphoma → CAR-T preferred at 2L due to poor auto-SCT outcomes",
      "Histologic transformation → prior indolent-directed lines don't count toward DLBCL line threshold",
    ],
    preferredProducts: [
      { id: "yescarta", trial: "ZUMA-7",          line: "2L+ for primary refractory / early relapse" },
      { id: "breyanzi", trial: "TRANSFORM",       line: "2L+ approved" },
      { id: "kymriah",  trial: "JULIET",          line: "2L+ approved" },
      { id: "epkinly",  trial: "EPCORE-NHL-1",    line: "3L+ approved (bispecific, off-the-shelf SC)" },
      { id: "columvi",  trial: "NP30179",         line: "2L+ approved (fixed-duration bispecific)" },
    ],
    source: "NCCN B-Cell Lymphomas Guidelines v3.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
  },
  {
    id: "fl",
    name: "Follicular lymphoma",
    highRiskModifiers: [
      "POD24 — progression <24 months from 1L immunochemo",
      "Grade 3B (biologically aggressive — treat per DLBCL)",
      "Transformed to DLBCL",
    ],
    nccnRules: [
      "POD24 portends inferior survival — consider CAR-T or bispecific at 3L+ rather than re-treatment",
      "Grade 3B FL → treat per DLBCL pathway, not FL pathway",
      "Histologic transformation → DLBCL-style approach (Yescarta, Breyanzi at 2L+)",
    ],
    preferredProducts: [
      { id: "yescarta", trial: "ZUMA-5",          line: "3L+ approved" },
      { id: "breyanzi", trial: "TRANSCEND-FL",    line: "3L+ approved" },
      { id: "kymriah",  trial: "ELARA",           line: "3L+ approved" },
      { id: "lunsumio", trial: "GO29781",         line: "2L+ approved (no leukapheresis, fixed-duration)" },
      { id: "epkinly",  trial: "EPCORE-NHL-1",    line: "3L+ approved" },
    ],
    source: "NCCN B-Cell Lymphomas Guidelines v3.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
  },
  {
    id: "mcl",
    name: "Mantle cell lymphoma",
    highRiskModifiers: [
      "BTK inhibitor–refractory",
      "Blastoid / pleomorphic variant",
      "TP53 mutation",
    ],
    nccnRules: [
      "Post-BTKi failure → short survival without CAR-T; refer urgently",
      "Blastoid MCL → high MIPI, short PFS to standard therapy; prioritize CAR-T",
      "TP53 mutation predicts BTKi failure and chemoresistance — CAR-T is preferred consolidative approach",
    ],
    preferredProducts: [
      { id: "tecartus", trial: "ZUMA-2", line: "R/R MCL after BTKi exposure" },
    ],
    source: "NCCN B-Cell Lymphomas Guidelines v3.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
  },
  {
    id: "cll",
    name: "CLL / SLL",
    highRiskModifiers: [
      "Richter's transformation (treat per DLBCL pathway)",
    ],
    nccnRules: [
      "Breyanzi for CLL/SLL requires prior BTKi AND venetoclax exposure",
      "Richter's transformation → DLBCL-style CAR-T (Yescarta, Breyanzi)",
    ],
    preferredProducts: [
      { id: "breyanzi", trial: "TRANSCEND CLL 004", line: "R/R CLL/SLL after BTKi + venetoclax" },
    ],
    source: "NCCN CLL/SLL Guidelines v3.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1478",
  },
  {
    id: "all",
    name: "Acute lymphoblastic leukemia (B-ALL)",
    highRiskModifiers: [
      "R/R B-ALL — inherently rapid disease tempo",
      "Philadelphia chromosome–positive (Ph+)",
    ],
    nccnRules: [
      "Pediatric/AYA (≤25 yo) R/R B-ALL → Kymriah (ELIANA — only product approved in this age group)",
      "Adult R/R B-ALL → Tecartus (ZUMA-3)",
      "Ph+ B-ALL: continue TKI through bridging and resume after CAR-T",
      "Blinatumomab bridging: CD19-directed — may impact subsequent CAR-T target antigen",
    ],
    preferredProducts: [
      { id: "kymriah",  trial: "ELIANA",  line: "≤25 years, R/R B-ALL" },
      { id: "tecartus", trial: "ZUMA-3",  line: "Adult R/R B-ALL" },
    ],
    source: "NCCN ALL Guidelines v1.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1410",
  },
  {
    id: "mm",
    name: "Multiple myeloma",
    highRiskModifiers: [
      "Extramedullary disease (EMD)",
      "High-risk cytogenetics (del17p, t(4;14), t(14;16), 1q+)",
      "Triple-class exposed (IMiD + PI + anti-CD38)",
    ],
    nccnRules: [
      "CARTITUDE-4: Carvykti approved at 1L+ for lenalidomide-refractory MM (broader than 4L+ indication)",
      "Triple-class exposed with ≥4 lines → full CAR-T and bispecific access",
      "EMD portends shorter PFS to BCMA-directed therapies — consider sequencing GPRC5D (Talvey)",
      "High-risk cytogenetics → prioritize deep response with CAR-T or bispecific sequencing",
    ],
    preferredProducts: [
      { id: "carvykti", trial: "CARTITUDE-1/4", line: "4L+ standard · 1L+ for len-refractory" },
      { id: "abecma",   trial: "KarMMa",        line: "4L+ approved" },
      { id: "tecvayli", trial: "MajesTEC-1",    line: "4L+ BCMA bispecific" },
      { id: "talvey",   trial: "MonumenTAL-1",  line: "4L+ GPRC5D — alt after BCMA failure" },
      { id: "elrexfio", trial: "MagnetisMM-3",  line: "4L+ BCMA bispecific" },
    ],
    source: "NCCN Multiple Myeloma Guidelines v3.2024",
    sourceUrl: "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1445",
  },
];

export const DISEASE_FIELD_LABELS = {
  earlyRelapse:            "Early relapse (<12 months from 1L immunochemo)",
  doubleHit:               "Double/triple-hit (MYC + BCL2 ± BCL6 rearrangement)",
  transformedFromIndolent: "Transformed from indolent lymphoma",
  pod24:                   "POD24 — progression <24 months from 1L immunochemo",
  flGrade3b:               "Grade 3B follicular lymphoma",
  transformedToDlbcl:      "Transformed to DLBCL",
  btkiExposed:             "Prior BTK inhibitor exposure",
  btkiRefractory:          "BTK inhibitor–refractory",
  blastoidVariant:         "Blastoid / pleomorphic variant",
  tp53Mutated:             "TP53-mutated",
  btkiVenetoclaxExposed:   "Prior BTKi AND venetoclax exposure",
  richtersTransformation:  "Richter's transformation",
  age25OrYounger:          "Patient ≤25 years (pediatric/AYA)",
  phPositive:              "Philadelphia chromosome–positive (Ph+)",
  lenalidomideRefractory:  "Lenalidomide-refractory",
  extramedullaryDisease:   "Extramedullary disease (EMD)",
  highRiskCytogenetics:    "High-risk cytogenetics (del17p, t(4;14), t(14;16), 1q+)",
};
