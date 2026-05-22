// src/utils/workup.js
// Consolidated workup checklist for referral preparation.
//
// Takes the full patient state and dynamically generates a categorized
// to-do list covering everything needed to prepare a patient for cell
// therapy referral — pathology/biomarkers, labs, imaging, documentation,
// consults, and administrative tasks. Items are smart: they skip what's
// already documented and flag what's missing or out of range.

function classifyCancer(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return "mm";
  if (c.includes("mantle") || c.includes("mcl")) return "mcl";
  if (c.includes("cll") || c.includes("sll")) return "cll";
  if (c.includes("follicular")) return "fl";
  if (c.includes("all") || c.includes("leukemia")) return "all";
  if (c.includes("dlbcl") || c.includes("lbcl") || c.includes("lymphoma") || c.includes("large b")) return "dlbcl";
  return null;
}

export function generateWorkup(pt) {
  const cancer = classifyCancer(pt.cancerType);
  if (!cancer) return null;

  const isMM       = cancer === "mm";
  const isALL      = cancer === "all";
  const isLymphoma = !isMM && !isALL;

  const items = {
    pathology:      [],
    labs:           [],
    imaging:        [],
    documentation: [],
    consults:       [],
    administrative: [],
  };

  const add = (cat, text, reason, priority = "medium") => {
    items[cat].push({ text, reason, priority });
  };

  // ─── PATHOLOGY / BIOMARKERS ──────────────────────────────────────────────
  if (isLymphoma) {
    if (pt.cd19 !== "positive") {
      add("pathology", "Order CD19 IHC on diagnostic biopsy specimen",
        "Required for CD19 CAR-T eligibility (Yescarta, Kymriah, Breyanzi, Tecartus)",
        "high");
    }
    if (pt.cd20 !== "positive") {
      add("pathology", "Order CD20 IHC on diagnostic biopsy specimen",
        "Required for CD20×CD3 bispecifics (Epkinly, Columvi, Lunsumio)",
        "high");
    }
    if (cancer === "dlbcl" && !pt.doubleHit) {
      add("pathology", "Confirm double/triple-hit status — FISH for MYC, BCL2, BCL6 rearrangements",
        "Double-hit drives 2L vs 3L+ decision per NCCN; CAR-T preferred over auto-SCT in double-hit",
        "medium");
    }
    if (cancer === "mcl") {
      add("pathology", "Order TP53 sequencing on tumor specimen",
        "TP53 mutation predicts BTKi failure and chemoresistance — drives earlier CAR-T referral",
        "medium");
      add("pathology", "Document MCL morphology (classical vs blastoid/pleomorphic)",
        "Blastoid variant is aggressive — shorter PFS to standard therapy",
        "medium");
    }
    if (cancer === "fl" && !pt.flGrade3b) {
      add("pathology", "Confirm FL grade (1, 2, 3A vs 3B)",
        "Grade 3B is treated per DLBCL pathway, not FL pathway — different product set",
        "medium");
    }
  }

  if (isMM) {
    if (pt.bcma !== "positive") {
      add("pathology", "Order BCMA IHC or flow cytometry on bone marrow biopsy",
        "Required for BCMA-directed therapies (Abecma, Carvykti, Tecvayli, Elrexfio)",
        "high");
    }
    if (pt.gprc5d !== "positive") {
      add("pathology", "Consider GPRC5D testing if pursuing Talvey (limited reference lab availability)",
        "Key sequencing option after BCMA-directed therapy failure",
        "low");
    }
    add("pathology", "Confirm cytogenetics by FISH — del(17p), t(4;14), t(14;16), 1q gain/amplification",
      "High-risk cytogenetics drive urgency and product sequencing strategy",
      "medium");
    add("pathology", "Bone marrow biopsy with flow cytometry, plasma cell percentage, MRD assessment",
      "Disease burden quantification for response tracking and prognosis",
      "medium");
  }

  if (isALL) {
    if (pt.cd19 !== "positive") {
      add("pathology", "Confirm CD19 expression by flow cytometry on bone marrow aspirate",
        "Required for CD19 CAR-T (Kymriah pediatric/AYA, Tecartus adult)",
        "high");
    }
    add("pathology", "Philadelphia chromosome (BCR-ABL) status by cytogenetics and FISH",
      "Ph+ ALL requires TKI continuation through bridging and after CAR-T",
      "high");
    add("pathology", "MRD assessment by flow cytometry or PCR",
      "MRD status guides bridging strategy (blinatumomab for MRD+) and CAR-T timing",
      "medium");
  }

  // ─── LABS ─────────────────────────────────────────────────────────────────
  if (!pt.labCreat && !pt.labCrcl) {
    add("labs", "Comprehensive metabolic panel + serum creatinine + 24-hr CrCl",
      "Renal function gating: CrCl ≥ 30-40 mL/min depending on product",
      "high");
  }
  if (!pt.labAlt && !pt.labAst) {
    add("labs", "Liver function tests — ALT, AST, total bilirubin, albumin",
      "Hepatic function gating per FDA labels (PI §2)",
      "high");
  }
  if (!pt.labLvef) {
    add("labs", "Baseline ECG + echocardiogram or MUGA for LVEF",
      "Cardiac function threshold 40-50% depending on product — required for CRS tolerance",
      "high");
  }
  if (!pt.labSpo2) {
    add("labs", "Pulse oximetry on room air",
      "CAR-T products require SpO₂ ≥ 92%; PFTs + ABG if respiratory concerns",
      "medium");
  }
  add("labs", "CBC with differential, platelets, ANC",
    "Adequate hematologic reserve required; ANC ≥ 1000, platelets ≥ 50-75k per product",
    "high");
  if (isMM) {
    add("labs", "SPEP, UPEP, serum free light chains, β2-microglobulin, LDH",
      "Disease tracking and ISS/R-ISS prognostic staging",
      "medium");
  }
  if (isLymphoma) {
    add("labs", "LDH, β2-microglobulin (lymphoma prognostic markers)",
      "Aggressive disease markers — drive urgency assessment",
      "medium");
  }
  add("labs", "HIV, HBV (HBsAg + HBcAb), HCV serologies",
    "Required infectious disease screening before cell therapy (PI §5)",
    "high");
  add("labs", "CMV, EBV serologies",
    "Pre-CAR-T infectious workup — reactivation risk during lymphodepletion",
    "medium");
  add("labs", "Quantitative immunoglobulins (IgG, IgA, IgM)",
    "Baseline humoral immunity assessment; IVIG replacement may be needed post-CAR-T",
    "low");

  // ─── IMAGING ──────────────────────────────────────────────────────────────
  if (isLymphoma) {
    add("imaging", "PET/CT for restaging (Lugano criteria)",
      "Document current disease burden and identify extranodal sites — within 4 weeks of referral",
      "high");
  }
  if (isMM) {
    add("imaging", "Whole-body MRI or low-dose whole-body CT",
      "Document bone disease and identify extramedullary disease (EMD) — adverse marker for BCMA therapies",
      "high");
    add("imaging", "PET/CT (if EMD suspected or for response assessment)",
      "Useful for tracking extramedullary plasmacytomas",
      "medium");
  }
  if (isALL) {
    add("imaging", "CT chest/abdomen/pelvis — evaluate for extramedullary disease",
      "Document any extramedullary involvement before CAR-T",
      "medium");
  }
  if (pt.activeCns) {
    add("imaging", "MRI brain with contrast + lumbar puncture with CSF cytology",
      "Active CNS disease is an absolute exclusion — must be resolved before CAR-T",
      "high");
  } else if (isLymphoma || isALL) {
    add("imaging", "MRI brain (if neurological symptoms or CNS-IPI high-risk)",
      "Document CNS status; pre-emptive imaging recommended for high-CNS-risk presentations",
      "medium");
  }

  // ─── DOCUMENTATION ────────────────────────────────────────────────────────
  add("documentation", "Obtain complete outside records — pathology, imaging, treatment dates, response assessments",
    "CAR-T centers require comprehensive history; missing records delay referral by weeks",
    "high");
  if (isMM && (!pt.priorImid || !pt.priorPi || !pt.priorAntiCd38)) {
    add("documentation", "Confirm prior IMiD (lenalidomide / pomalidomide), PI (bortezomib / carfilzomib), and anti-CD38 (daratumumab) exposures",
      "Required to establish triple-class exposure for Abecma, Carvykti, Tecvayli, Talvey, Elrexfio",
      "high");
  }
  if (pt.alloSct) {
    add("documentation", "Confirm allogeneic SCT date and current GVHD status",
      "Allo-SCT < 6 months is an absolute exclusion; active GVHD must be resolved",
      "high");
  }

  // ─── CONSULTS ─────────────────────────────────────────────────────────────
  add("consults", "Cell therapy / CAR-T consult at FACT-accredited center",
    "Primary referral — initiate even if some workup is still pending; earlier is better",
    "high");
  const lvef = parseFloat(pt.labLvef);
  if (!isNaN(lvef) && lvef < 50) {
    add("consults", `Cardiology consult — optimize HF therapy (current LVEF ${lvef}%)`,
      `LVEF ${lvef}% may not meet product thresholds — cardiac optimization needed`,
      "high");
  }
  const creat = parseFloat(pt.labCreat);
  if (!isNaN(creat) && creat > 1.5) {
    add("consults", `Nephrology consult (current creatinine ${creat} mg/dL)`,
      "Renal function near or below product thresholds — optimize before referral",
      "medium");
  }
  if (pt.activeAutoimmune) {
    add("consults", "Rheumatology consult — taper systemic immunosuppression if disease activity allows",
      "Active autoimmune disease on systemic therapy is an exclusion",
      "high");
  }
  if (pt.activeCns) {
    add("consults", "Neuro-oncology consult for CNS-directed therapy",
      "Active CNS disease must be controlled before CAR-T proceeds",
      "high");
  }

  // ─── ADMINISTRATIVE ───────────────────────────────────────────────────────
  add("administrative", "Identify nearest FACT-accredited CAR-T center (factwebsite.org)",
    "Confirm center capability and patient acceptance criteria before formal referral",
    "high");
  add("administrative", "Initiate insurance prior authorization in parallel with referral",
    "CAR-T prior auth typically takes 2-4 weeks — start immediately to avoid delays",
    "high");
  add("administrative", "Verify CAR-T center is in-network for patient's insurance",
    "Out-of-network can result in significant patient financial burden",
    "medium");
  const lines = parseInt(pt.priorLines, 10) || 0;
  if (pt.diseaseTempo === "rapid" || lines >= 3 || pt.primaryRefractory) {
    add("administrative", "Expedite all prior auth — high-urgency case",
      "Rapidly progressive or heavily pretreated patient — accelerate timelines",
      "high");
  }
  add("administrative", "Coordinate with apheresis center if CAR-T is the planned approach",
    "Apheresis scheduling typically requires 1-2 weeks lead time",
    "medium");

  return items;
}

// ─── Display helpers ──────────────────────────────────────────────────────
export const CATEGORY_LABELS = {
  pathology:      { label: "Pathology & Biomarkers", icon: "⊕" },
  labs:           { label: "Laboratory studies",      icon: "◔" },
  imaging:        { label: "Imaging",                 icon: "▦" },
  documentation:  { label: "Documentation",            icon: "❑" },
  consults:       { label: "Specialist consults",     icon: "◈" },
  administrative: { label: "Administrative",          icon: "▢" },
};

export const PRIORITY_META = {
  high:   { label: "Required",     color: "#b54a2c" },
  medium: { label: "Recommended", color: "#7a5e10" },
  low:    { label: "Consider",     color: "#4c6b8c" },
};

// Total count helper
export function workupItemCount(workup) {
  if (!workup) return 0;
  return Object.values(workup).reduce((sum, arr) => sum + arr.length, 0);
}
