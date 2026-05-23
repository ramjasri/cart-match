// src/utils/resistance.js
// Resistance & Escalation Intelligence — the defensible moat layer.
//
// Two engines:
//   1. Biomarker / NGS interpretation — extracts mutations from free-text
//      NGS reports and maps them to ESCAT-tiered actionability + resistance
//      evidence + therapy implications.
//   2. Cell therapy nonresponse risk scoring — computes high-risk feature
//      count from patient state (TP53, LDH, EMD, prior antigen exposure,
//      bulky disease) and outputs a calibrated risk flag for referral
//      decision-making.
//
// Framing is deliberately conservative per the analysis:
//   - We surface evidence; we don't claim prediction
//   - ESCAT tiers communicate evidence strength explicitly
//   - Every flag links back to its reasoning
//   - No black-box "AI recommends X" language anywhere

// ─── ESCAT evidence tiers (ESMO Scale for Clinical Actionability) ─────────
// Per Mateo et al. Annals of Oncology 2018 (ESCAT framework)
export const ESCAT_TIERS = {
  IA: { label: "Tier IA", color: "#5a7a4a", desc: "Validated · clinical decision target (randomized trials in this tumor type)" },
  IB: { label: "Tier IB", color: "#5a7a4a", desc: "Validated · regulatory approval in tumor type" },
  IC: { label: "Tier IC", color: "#5a7a4a", desc: "Validated · regulatory approval in another tumor type" },
  IIA: { label: "Tier IIA", color: "#c4a661", desc: "Clinical evidence · meaningful benefit in this tumor type" },
  IIB: { label: "Tier IIB", color: "#c4a661", desc: "Clinical evidence · response in this tumor type" },
  III: { label: "Tier III", color: "#4c6b8c", desc: "Clinical evidence in other tumor types" },
  IV:  { label: "Tier IV",  color: "#6b645a", desc: "Preclinical evidence only" },
  V:   { label: "Tier V",   color: "#6b645a", desc: "Hypothetical · evidence inconclusive" },
  X:   { label: "Tier X",   color: "#98908380", desc: "Not actionable · prognostic only" },
};

// ─── Curated biomarker knowledge base ─────────────────────────────────────
// Each entry: regex patterns to detect in NGS text, applicable cancers,
// ESCAT tier (by tumor type), resistance context, therapy implications.
// Conservative curation — only well-established alterations.
export const BIOMARKER_DB = [
  // ─── Hematologic — directly relevant to CAR-T / bispecific decisions ────
  {
    id: "tp53_mut",
    name: "TP53 mutation",
    patterns: [/TP53[\s:]+(?:p\.)?[A-Z]?\d+[A-Z]/i, /TP53\s+(?:mut|mutation|R\d{3})/i, /tp53.{0,30}(?:mutation|altered|variant)/i],
    relevantCancers: ["dlbcl", "mm", "cll", "mcl", "all"],
    tier: { default: "IIA" },
    type: "adverse_prognostic",
    summary: "Adverse prognostic and predictive marker in B-cell malignancies and MM.",
    resistance: [
      "Chemoimmunotherapy resistance in DLBCL/MCL",
      "BTK inhibitor failure in CLL/MCL",
      "Reduced CAR-T durability signal (especially CLL, MCL)",
      "Bortezomib/IMiD resistance in MM",
    ],
    implications: [
      "Prioritize CAR-T early — don't expect long remissions from chemoimmunotherapy",
      "Discuss at molecular tumor board",
      "Consider clinical trial enrollment for novel mechanisms",
    ],
    references: [
      "Wenzl et al. Blood 2023 (TP53 in DLBCL CAR-T)",
      "Eskelund et al. Blood 2017 (TP53 MCL)",
    ],
  },
  {
    id: "myc_bcl2_dh",
    name: "Double-hit lymphoma (MYC + BCL2)",
    patterns: [/double[\s-]?hit/i, /MYC\s+rearrang/i, /MYC.{0,20}BCL2/i, /HGBCL/i, /high[\s-]grade B-cell/i],
    relevantCancers: ["dlbcl"],
    tier: { default: "IA" },
    type: "adverse_prognostic",
    summary: "High-grade B-cell lymphoma with MYC + BCL2 (± BCL6) rearrangements. Adverse prognosis.",
    resistance: [
      "Poor outcomes with R-CHOP",
      "Poor outcomes with auto-SCT",
    ],
    implications: [
      "CAR-T preferred at 2L over auto-SCT per NCCN",
      "Intensified frontline (DA-EPOCH-R) may be considered",
      "Early CAR-T referral strongly indicated",
    ],
    references: [
      "Sehn LH, Salles G. NEJM 2021",
      "NCCN B-Cell Lymphomas v3.2024",
    ],
  },
  {
    id: "del17p",
    name: "del(17p)",
    patterns: [/del\s*\(?\s*17p\s*\)?/i, /17p\s*del/i, /17p13\s*del/i],
    relevantCancers: ["mm", "cll"],
    tier: { default: "IIA" },
    type: "high_risk_cytogenetic",
    summary: "High-risk cytogenetic abnormality involving TP53 locus.",
    resistance: [
      "Reduced response durability to standard MM regimens",
      "BTK inhibitor failure in CLL",
    ],
    implications: [
      "MM: prioritize CAR-T / bispecific sequencing post-triple-class exposure",
      "CLL: prioritize CAR-T after BTKi/venetoclax failure",
    ],
    references: ["Avet-Loiseau et al. JCO 2018 (MM cytogenetics)"],
  },
  {
    id: "t_4_14",
    name: "t(4;14)",
    patterns: [/t\s*\(?\s*4\s*;\s*14\s*\)?/i],
    relevantCancers: ["mm"],
    tier: { default: "IIA" },
    type: "high_risk_cytogenetic",
    summary: "High-risk MM cytogenetic abnormality (FGFR3/MMSET translocation).",
    resistance: ["Shorter PFS to standard induction regimens"],
    implications: ["Prioritize deep response strategies · CAR-T / bispecific sequencing"],
    references: ["NCCN MM v3.2024 risk stratification"],
  },
  {
    id: "gain_1q",
    name: "1q gain / amplification",
    patterns: [/1q\s*(?:gain|amp|amplification)/i, /\+1q/i, /gain\s*\(?1q\)?/i],
    relevantCancers: ["mm"],
    tier: { default: "IIA" },
    type: "high_risk_cytogenetic",
    summary: "Adverse MM cytogenetic abnormality.",
    resistance: ["Reduced response durability"],
    implications: ["Prioritize CAR-T / bispecific in 4L+ setting"],
    references: ["Walker et al. JCO 2018"],
  },
  {
    id: "myc_burkitt",
    name: "MYC rearrangement (single-hit)",
    patterns: [/MYC\s+rearrang/i, /MYC\s+translocation/i, /t\s*\(?\s*8\s*;\s*14\s*\)?/i],
    relevantCancers: ["dlbcl"],
    tier: { default: "IIB" },
    type: "adverse_prognostic",
    summary: "Single-hit MYC rearrangement.",
    resistance: ["Adverse prognosis with R-CHOP"],
    implications: ["Consider intensified frontline or early CAR-T referral"],
    references: ["NCCN B-Cell Lymphomas v3.2024"],
  },
  {
    id: "complex_karyotype",
    name: "Complex karyotype (≥3 abnormalities)",
    patterns: [/complex\s+karyotype/i, /\d+\s+chromosomal\s+abnormalities/i],
    relevantCancers: ["cll", "mm", "all"],
    tier: { default: "IIA" },
    type: "adverse_prognostic",
    summary: "Adverse cytogenetic complexity; associated with poor outcomes across hematologic malignancies.",
    resistance: ["BTKi resistance in CLL", "Reduced durability across regimens"],
    implications: ["Earlier CAR-T referral", "Molecular tumor board review"],
    references: ["Baliakas et al. Blood 2019 (CLL)"],
  },
  {
    id: "philadelphia",
    name: "Philadelphia chromosome (BCR-ABL1)",
    patterns: [/philadelphia/i, /BCR[\s-]?ABL/i, /t\s*\(?\s*9\s*;\s*22\s*\)?/i, /Ph\+/i],
    relevantCancers: ["all"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Defining genetic abnormality of Ph+ B-ALL.",
    resistance: [],
    implications: [
      "TKI must be continued through CAR-T bridging and resumed after CAR-T",
      "Ponatinib for T315I mutation",
      "Tecartus (ZUMA-3) eligible for adult R/R B-ALL",
    ],
    references: ["NCCN ALL v1.2024"],
  },

  // ─── Solid tumor — included for the broader OncoMarker positioning ──────
  {
    id: "egfr_activating",
    name: "EGFR activating mutation (exon 19 del / L858R)",
    patterns: [/EGFR\s+(?:exon\s+19|L858R|E746[\s_-]?A750|delE746|exon\s+19\s+deletion)/i],
    relevantCancers: ["nsclc"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Activating EGFR mutation — sensitizing to EGFR TKIs.",
    implications: ["1st-line osimertinib indicated in NSCLC", "Monitor for T790M / C797S on progression"],
    references: ["NCCN NSCLC v3.2024"],
  },
  {
    id: "egfr_t790m",
    name: "EGFR T790M",
    patterns: [/EGFR[\s:]+T790M/i, /T790M/i],
    relevantCancers: ["nsclc"],
    tier: { default: "IA" },
    type: "resistance",
    summary: "Resistance mutation to 1st/2nd-generation EGFR TKIs.",
    resistance: ["1st-gen EGFR TKI resistance (erlotinib, gefitinib)"],
    implications: ["Osimertinib indicated"],
    references: ["NCCN NSCLC v3.2024"],
  },
  {
    id: "egfr_c797s",
    name: "EGFR C797S",
    patterns: [/EGFR[\s:]+C797S/i, /C797S/i],
    relevantCancers: ["nsclc"],
    tier: { default: "IIA" },
    type: "resistance",
    summary: "Acquired resistance mutation to osimertinib.",
    resistance: ["Osimertinib resistance"],
    implications: ["Discuss at molecular tumor board · trial enrollment recommended"],
    references: ["Thress et al. Nat Med 2015"],
  },
  {
    id: "kras_g12c",
    name: "KRAS G12C",
    patterns: [/KRAS\s+G12C/i],
    relevantCancers: ["nsclc", "crc"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Actionable KRAS mutation.",
    implications: ["Sotorasib or adagrasib indicated in NSCLC", "Adagrasib + cetuximab in CRC"],
    references: ["NCCN NSCLC v3.2024"],
  },
  {
    id: "kras_other",
    name: "KRAS mutation (non-G12C)",
    patterns: [/KRAS\s+(?:G12D|G12V|G13D|Q61|mutation)/i],
    relevantCancers: ["crc", "nsclc", "pancreatic"],
    tier: { default: "X" },
    type: "resistance",
    summary: "Non-G12C KRAS mutation.",
    resistance: ["Anti-EGFR therapy resistance in CRC (cetuximab, panitumumab not indicated)"],
    implications: ["Avoid anti-EGFR therapy in CRC", "Trial enrollment for novel KRAS inhibitors"],
    references: ["NCCN Colorectal v3.2024"],
  },
  {
    id: "braf_v600e",
    name: "BRAF V600E",
    patterns: [/BRAF\s+V600E/i, /V600E/i],
    relevantCancers: ["melanoma", "nsclc", "crc", "glioma"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Actionable BRAF mutation.",
    implications: ["Dabrafenib + trametinib indicated (melanoma, NSCLC, glioma)", "Encorafenib + cetuximab in CRC"],
    references: ["NCCN guidelines · multiple tumor types"],
  },
  {
    id: "msi_h",
    name: "MSI-H / dMMR",
    patterns: [/MSI[\s-]?H/i, /MSI[\s-]?High/i, /dMMR/i, /mismatch\s+repair\s+deficien/i, /microsatellite\s+instab/i],
    relevantCancers: ["pan-cancer", "crc", "endometrial"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Pan-cancer immunotherapy biomarker.",
    implications: ["Pembrolizumab indicated regardless of tissue of origin"],
    references: ["NCCN immunotherapy guidelines"],
  },
  {
    id: "tmb_high",
    name: "TMB-High (≥10 mut/Mb)",
    patterns: [/TMB[\s-]?(?:high|H)/i, /tumor\s+mutational\s+burden.{0,30}high/i, /TMB.{0,20}\d{2,}/i],
    relevantCancers: ["pan-cancer"],
    tier: { default: "IB" },
    type: "actionable",
    summary: "Pan-cancer immunotherapy biomarker.",
    implications: ["Pembrolizumab indicated (TMB ≥10 mut/Mb)"],
    references: ["FDA approval · KEYNOTE-158"],
  },
  {
    id: "brca_germline",
    name: "BRCA1/2 mutation",
    patterns: [/BRCA[12]?\s+(?:mut|mutation|p\.|altered)/i, /germline\s+BRCA/i],
    relevantCancers: ["breast", "ovarian", "pancreatic", "prostate"],
    tier: { default: "IA" },
    type: "actionable",
    summary: "Germline or somatic BRCA1/2 alteration.",
    implications: ["PARP inhibitor indicated in ovarian, breast, pancreatic, prostate contexts"],
    references: ["NCCN guidelines · multiple tumor types"],
  },
  {
    id: "brca_reversion",
    name: "BRCA reversion mutation",
    patterns: [/BRCA\s+reversion/i, /reversion\s+mutation/i, /restored\s+BRCA/i],
    relevantCancers: ["ovarian", "breast", "pancreatic"],
    tier: { default: "IIA" },
    type: "resistance",
    summary: "Acquired reversion of BRCA mutation.",
    resistance: ["PARP inhibitor resistance", "Platinum resistance"],
    implications: ["Discuss at molecular tumor board", "Non-PARP / non-platinum strategies"],
    references: ["Lin et al. Cancer Discov 2019"],
  },
];

// ─── Extract biomarkers from free-text NGS report ─────────────────────────
export function extractBiomarkers(ngsText, cancerType) {
  if (!ngsText || typeof ngsText !== "string") return [];
  const cancerKey = (cancerType || "").toLowerCase();
  const text = ngsText;
  const detected = [];

  BIOMARKER_DB.forEach(bm => {
    const matched = bm.patterns.some(p => p.test(text));
    if (!matched) return;

    // Determine if this biomarker is relevant to the patient's cancer
    const relevant = bm.relevantCancers.includes("pan-cancer") ||
      bm.relevantCancers.some(c => cancerKey.includes(c) || (c === "dlbcl" && cancerKey.includes("large b")));

    detected.push({
      ...bm,
      detected: true,
      relevant,
      tier: bm.tier?.default || "X",
    });
  });

  return detected;
}

// ─── Cell therapy nonresponse risk scoring ─────────────────────────────────
// NOT a prediction model — a high-risk feature counter sourced from
// published CAR-T outcome literature. Used to flag patients for earlier
// referral, molecular tumor board review, bridging strategy planning.
export const NONRESPONSE_RISK_FACTORS = [
  { id: "tp53",                 label: "TP53 mutation",                 weight: 3, source: "Wenzl Blood 2023" },
  { id: "high_ldh",             label: "Elevated LDH (>2× ULN)",         weight: 2, source: "Locke et al. Lancet 2019" },
  { id: "extramedullary",       label: "Extramedullary disease",         weight: 2, source: "MM CAR-T literature · BCMA failure context" },
  { id: "bulky_disease",        label: "Bulky disease (>10 cm)",         weight: 2, source: "ZUMA-1 / TRANSCEND subgroup analyses" },
  { id: "prior_cd19",           label: "Prior CD19-directed therapy",    weight: 3, source: "Antigen escape risk · re-treatment concern" },
  { id: "prior_bcma",           label: "Prior BCMA-directed therapy",    weight: 3, source: "MM sequential CAR-T data" },
  { id: "antigen_loss",         label: "Documented antigen loss",        weight: 5, source: "Definitive resistance signal" },
  { id: "high_risk_cyto",       label: "High-risk cytogenetics",         weight: 2, source: "del17p, t(4;14), 1q+, complex karyotype" },
  { id: "prior_lines_high",     label: "≥5 prior lines",                 weight: 1, source: "Reduced T-cell fitness" },
  { id: "ecog_3",               label: "ECOG ≥3",                        weight: 2, source: "Declining performance status" },
];

export function computeNonResponseRisk(pt, detectedBiomarkers = []) {
  const factors = [];
  let score = 0;

  const add = (id, label, weight, detail) => {
    factors.push({ id, label, weight, detail });
    score += weight;
  };

  // TP53 (from form OR detected in NGS)
  const tp53Detected = detectedBiomarkers.some(b => b.id === "tp53_mut");
  if (pt.tp53Mutated || tp53Detected) {
    add("tp53", "TP53 mutation", 3, tp53Detected ? "Detected in NGS report" : "Reported by clinician");
  }

  // High LDH
  const ldhMult = parseFloat(pt.ldhMultipleUln);
  if (pt.elevatedLdh && (!ldhMult || ldhMult >= 2)) {
    add("high_ldh", "Elevated LDH" + (ldhMult ? ` (${ldhMult}× ULN)` : ""), 2);
  }

  // Extramedullary disease
  if (pt.extramedullaryDisease) {
    add("extramedullary", "Extramedullary disease", 2, "Adverse marker for BCMA-directed therapies");
  }

  // Bulky disease
  if (pt.bulkyDisease) {
    add("bulky_disease", "Bulky disease (>10 cm)", 2, "High tumor burden");
  }

  // Prior CD19-directed therapy
  if (pt.priorCd19Therapy) {
    add("prior_cd19", "Prior CD19-directed therapy", 3, "Consider antigen escape · CD22 / dual-target trials");
  }

  // Prior BCMA-directed therapy
  if (pt.priorBcmaTherapy) {
    add("prior_bcma", "Prior BCMA-directed therapy", 3, "Consider GPRC5D (Talvey) · sequential strategy");
  }

  // Antigen loss
  if (pt.antigenLoss) {
    add("antigen_loss", "Documented antigen loss", 5, "Definitive resistance signal · alternative target required");
  }

  // High-risk cytogenetics (from form OR detected)
  const hrcDetected = detectedBiomarkers.some(b => ["del17p", "t_4_14", "gain_1q", "complex_karyotype"].includes(b.id));
  if (pt.highRiskCytogenetics || hrcDetected) {
    add("high_risk_cyto", "High-risk cytogenetics", 2, hrcDetected ? "Detected in NGS report" : "Reported");
  }

  // High prior lines
  const lines = parseInt(pt.priorLines, 10);
  if (!isNaN(lines) && lines >= 5) {
    add("prior_lines_high", `${lines} prior lines of therapy`, 1, "Reduced T-cell fitness");
  }

  // ECOG ≥3
  const ecog = parseInt(pt.ecog, 10);
  if (!isNaN(ecog) && ecog >= 3) {
    add("ecog_3", `ECOG ${ecog}`, 2, "Declining performance status · referral window narrowing");
  }

  // Classify
  let level, headline, recommendation, color;
  if (score >= 7) {
    level = "high"; color = "#b54a2c";
    headline = "HIGH nonresponse risk profile";
    recommendation = "Strong recommendation: discuss at molecular tumor board · plan bridging strategy · consider clinical trial enrollment · alternative-target therapy review.";
  } else if (score >= 4) {
    level = "moderate"; color = "#c4a661";
    headline = "MODERATE nonresponse risk profile";
    recommendation = "Recommended: molecular tumor board review · early bridging plan · refer urgently to prevent further risk-factor accumulation.";
  } else if (score >= 1) {
    level = "low"; color = "#5a7a4a";
    headline = "Limited high-risk features identified";
    recommendation = "Standard referral pathway appropriate. Monitor for evolving risk features at each visit.";
  } else {
    level = "none"; color = "#6b645a";
    headline = "No high-risk features documented";
    recommendation = "Standard referral pathway. Consider documenting cytogenetics, LDH, and bulk status if not yet captured.";
  }

  return { score, level, color, headline, recommendation, factors };
}

// ─── Generate evidence-ranked clinical summary ────────────────────────────
// Returns a structured object suitable for rendering in the
// "Molecular & Resistance Intelligence" panel + the molecular tumor board
// summary PDF.
export function generateMolecularSummary(pt, ngsText = "") {
  const detected = extractBiomarkers(ngsText, pt.cancerType);
  const risk = computeNonResponseRisk(pt, detected);

  // Actionable findings (with implications)
  const actionable = detected.filter(b =>
    b.relevant && ["IA", "IB", "IC", "IIA", "IIB"].includes(b.tier)
  );

  // Resistance findings
  const resistance = detected.filter(b =>
    b.relevant && (b.type === "resistance" || (b.resistance && b.resistance.length > 0))
  );

  // Prognostic / non-actionable findings
  const prognostic = detected.filter(b =>
    b.relevant && b.type === "adverse_prognostic"
  );

  // Tumor-type-irrelevant findings (still detected but in wrong cancer context)
  const incidental = detected.filter(b => !b.relevant);

  return {
    detected,
    actionable,
    resistance,
    prognostic,
    incidental,
    risk,
    hasAnyFindings: detected.length > 0 || risk.score > 0,
  };
}
