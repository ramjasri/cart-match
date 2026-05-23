// src/utils/evidenceEngine.js
// Layer 1 of the three-layer platform: the Evidence engine.
//
// Given a patient profile and the set of products that pass eligibility,
// returns an ESCAT-tiered ranking of therapy options with:
//   - the assigned ESCAT tier per product per cancer type
//   - the evidence basis (trial name + NCT id)
//   - any patient-specific tier annotations (e.g. TP53 mutation → reduced
//     durability signal in published subgroup analyses)
//   - NCCN preference flags when applicable
//
// Framing: surfaces evidence, does not predict response. Uses ESCAT tiers
// per Mateo et al. Annals of Oncology 2018.
//
// This is intentionally separate from the eligibility scorer in App.jsx —
// eligibility answers "can this patient receive this product"; the
// evidence engine answers "given they can, how strong is the evidence."

import { ESCAT_TIERS } from "./resistance.js";
import { PRODUCT_CITATIONS, ctGovUrl } from "../data/citations.js";

// ─── ESCAT tier assignments per product × cancer-type × line ──────────────
// Each entry attaches a baseline tier to a specific clinical context.
// Tier IA  = randomized superiority data in that exact context
// Tier IB  = regulatory approval in tumor type
// Tier IC  = regulatory approval in another tumor type
// Tier IIA = clinical evidence (accelerated approval, single-arm)
// Tier IIB = response signal in this tumor type
// Tier III+ = preclinical or other tumor types
//
// `match` is a predicate that decides whether this rule applies to the
// patient. Multiple rules can match the same product (different contexts);
// we keep the highest tier.
export const PRODUCT_EVIDENCE = {
  // ─── CD19 CAR-T ──────────────────────────────────────────────────────────
  yescarta: [
    {
      tier: "IA",
      context: "LBCL 2L+ · primary refractory / early relapse",
      basis: { trial: "ZUMA-7", nctId: "NCT03391466", finding: "Randomized superiority over standard-of-care (ASCT/salvage chemo) in 2L LBCL." },
      nccnPreferred: true,
      match: (pt) => isDlbcl(pt) && (pt.primaryRefractory || pt.earlyRelapse) && priorLines(pt) >= 2,
    },
    {
      tier: "IB",
      context: "LBCL 3L+",
      basis: { trial: "ZUMA-1", nctId: "NCT02348216", finding: "Pivotal single-arm trial supporting initial FDA approval in R/R LBCL 3L+." },
      match: (pt) => isDlbcl(pt) && priorLines(pt) >= 3,
    },
    {
      tier: "IB",
      context: "Follicular lymphoma 3L+",
      basis: { trial: "ZUMA-5", nctId: "NCT03105336", finding: "Pivotal trial supporting accelerated approval in R/R FL." },
      match: (pt) => isFl(pt) && priorLines(pt) >= 3,
    },
  ],
  kymriah: [
    {
      tier: "IA",
      context: "B-ALL ≤25 yo",
      basis: { trial: "ELIANA", nctId: "NCT02435849", finding: "Only curative-intent option in pediatric/young-adult R/R B-ALL — landmark approval." },
      nccnPreferred: true,
      match: (pt) => isAll(pt) && pt.age25OrYounger,
    },
    {
      tier: "IB",
      context: "LBCL 2L+",
      basis: { trial: "JULIET", nctId: "NCT02445248", finding: "Pivotal single-arm trial in R/R DLBCL." },
      match: (pt) => isDlbcl(pt) && priorLines(pt) >= 2,
    },
    {
      tier: "IB",
      context: "Follicular lymphoma 3L+",
      basis: { trial: "ELARA", nctId: "NCT03568461", finding: "Pivotal single-arm trial in R/R FL." },
      match: (pt) => isFl(pt) && priorLines(pt) >= 3,
    },
  ],
  breyanzi: [
    {
      tier: "IA",
      context: "LBCL 2L+ · primary refractory / early relapse",
      basis: { trial: "TRANSFORM", nctId: "NCT03575351", finding: "Randomized superiority over standard-of-care in 2L LBCL." },
      nccnPreferred: true,
      match: (pt) => isDlbcl(pt) && (pt.primaryRefractory || pt.earlyRelapse) && priorLines(pt) >= 2,
    },
    {
      tier: "IB",
      context: "LBCL 3L+",
      basis: { trial: "TRANSCEND-NHL-001", nctId: "NCT02631044", finding: "Pivotal single-arm trial in R/R LBCL." },
      match: (pt) => isDlbcl(pt) && priorLines(pt) >= 2,
    },
    {
      tier: "IB",
      context: "Follicular lymphoma 3L+",
      basis: { trial: "TRANSCEND-FL", nctId: "NCT04245839", finding: "Pivotal trial in R/R FL 3L+." },
      match: (pt) => isFl(pt) && priorLines(pt) >= 3,
    },
    {
      tier: "IIA",
      context: "CLL/SLL after BTKi + venetoclax",
      basis: { trial: "TRANSCEND CLL 004", nctId: "NCT03331198", finding: "Single-arm pivotal — first CAR-T accelerated approval in CLL." },
      match: (pt) => isCll(pt) && pt.btkiVenetoclaxExposed,
    },
  ],
  tecartus: [
    {
      tier: "IB",
      context: "MCL after BTKi",
      basis: { trial: "ZUMA-2", nctId: "NCT02601313", finding: "Pivotal trial in R/R MCL post-BTKi — only FDA-approved CAR-T in MCL." },
      nccnPreferred: true,
      match: (pt) => isMcl(pt) && pt.btkiExposed,
    },
    {
      tier: "IB",
      context: "Adult R/R B-ALL",
      basis: { trial: "ZUMA-3", nctId: "NCT02614066", finding: "Pivotal trial in adult R/R B-ALL." },
      match: (pt) => isAll(pt) && !pt.age25OrYounger,
    },
  ],

  // ─── BCMA & GPRC5D in MM ─────────────────────────────────────────────────
  abecma: [
    {
      tier: "IB",
      context: "R/R MM 3L+ (triple-class exposed)",
      basis: { trial: "KarMMa-3", nctId: "NCT03651128", finding: "Randomized superiority over standard regimens in 3L+ MM." },
      match: (pt) => isMm(pt) && priorLines(pt) >= 3,
    },
  ],
  carvykti: [
    {
      tier: "IA",
      context: "R/R MM 1L+ (lenalidomide-refractory)",
      basis: { trial: "CARTITUDE-4", nctId: "NCT04181827", finding: "Randomized superiority — significant PFS benefit in earlier-line setting." },
      nccnPreferred: true,
      match: (pt) => isMm(pt) && pt.lenalidomideRefractory && priorLines(pt) >= 1,
    },
    {
      tier: "IB",
      context: "R/R MM 4L+",
      basis: { trial: "CARTITUDE-1", nctId: "NCT03548207", finding: "Pivotal single-arm trial supporting initial approval." },
      match: (pt) => isMm(pt) && priorLines(pt) >= 4,
    },
  ],
  tecvayli: [
    {
      tier: "IB",
      context: "R/R MM 4L+ (BCMA bispecific)",
      basis: { trial: "MajesTEC-1", nctId: "NCT04557098", finding: "Pivotal single-arm trial." },
      match: (pt) => isMm(pt) && priorLines(pt) >= 4,
    },
  ],
  talvey: [
    {
      tier: "IB",
      context: "R/R MM 4L+ (GPRC5D bispecific)",
      basis: { trial: "MonumenTAL-1", nctId: "NCT03399799", finding: "Pivotal single-arm trial — alternative target after BCMA failure." },
      match: (pt) => isMm(pt) && priorLines(pt) >= 4,
    },
  ],
  elrexfio: [
    {
      tier: "IB",
      context: "R/R MM 4L+ (BCMA bispecific)",
      basis: { trial: "MagnetisMM-3", nctId: "NCT04649359", finding: "Pivotal single-arm trial." },
      match: (pt) => isMm(pt) && priorLines(pt) >= 4,
    },
  ],

  // ─── Bispecifics in lymphoma ─────────────────────────────────────────────
  epkinly: [
    {
      tier: "IB",
      context: "R/R DLBCL 3L+ · R/R FL 3L+",
      basis: { trial: "EPCORE-NHL-1", nctId: "NCT03625037", finding: "Pivotal single-arm trial." },
      match: (pt) => (isDlbcl(pt) || isFl(pt)) && priorLines(pt) >= 3,
    },
  ],
  columvi: [
    {
      tier: "IB",
      context: "R/R DLBCL 2L+ · R/R FL 2L+",
      basis: { trial: "NP30179", nctId: "NCT03075696", finding: "Pivotal single-arm trial (obinutuzumab pretreatment required)." },
      match: (pt) => (isDlbcl(pt) || isFl(pt)) && priorLines(pt) >= 2,
    },
  ],
  lunsumio: [
    {
      tier: "IB",
      context: "R/R FL grade 1-3A 2L+",
      basis: { trial: "GO29781", nctId: "NCT02500407", finding: "Pivotal trial — fixed-duration treatment." },
      match: (pt) => isFl(pt) && !pt.flGrade3b && priorLines(pt) >= 2,
    },
  ],
};

// ─── Patient-specific tier annotations ────────────────────────────────────
// These DO NOT change the baseline tier — published evidence is what it
// is. They surface subgroup-specific caveats so the clinician sees the
// full picture.
export const TIER_ANNOTATIONS = [
  {
    id: "tp53_carT_durability",
    severity: "caution",
    label: "Reduced durability signal — TP53-mutated",
    detail: "Published subgroup analyses suggest shorter PFS in TP53-mutated patients across CD19 CAR-T programs. Consider trial enrollment for novel mechanisms or sequential strategy planning.",
    source: "Wenzl et al. Blood 2023",
    appliesTo: (pt, product) => pt.tp53Mutated && product.targetMarker === "CD19" && product.id !== "epkinly" && product.id !== "columvi" && product.id !== "lunsumio",
  },
  {
    id: "high_ldh_subgroup",
    severity: "caution",
    label: "Reduced response signal — high LDH",
    detail: "LDH ≥2× ULN was an adverse factor in ZUMA-1 / TRANSCEND-NHL-001 subgroup analyses. Plan aggressive bridging.",
    source: "Locke et al. Lancet 2019 · TRANSCEND subgroups",
    appliesTo: (pt, product) => {
      const ldhMult = parseFloat(pt.ldhMultipleUln);
      if (!isNaN(ldhMult) && ldhMult >= 2 && product.target === "CD19") return true;
      return false;
    },
  },
  {
    id: "prior_cd19",
    severity: "warning",
    label: "Prior CD19-directed therapy — consider antigen escape",
    detail: "Same-target re-treatment has reduced response rates. Consider alternative-target product, dual-target trial, or post-relapse antigen confirmation.",
    source: "Antigen escape literature · multi-center retrospective series",
    appliesTo: (pt, product) => pt.priorCd19Therapy && product.target === "CD19",
  },
  {
    id: "prior_bcma",
    severity: "warning",
    label: "Prior BCMA-directed therapy — consider alternative target",
    detail: "BCMA re-treatment after CAR-T or bispecific has reduced response durability. Consider GPRC5D (Talvey) as alternative target.",
    source: "Sequential BCMA therapy data · ASH 2023+",
    appliesTo: (pt, product) => pt.priorBcmaTherapy && product.targetMarker === "BCMA",
  },
  {
    id: "antigen_loss",
    severity: "block",
    label: "Antigen loss documented — same target not indicated",
    detail: "Documented antigen loss is a definitive resistance signal. Switch to alternative-target therapy.",
    source: "Antigen-loss resistance literature",
    appliesTo: (pt, product) => pt.antigenLoss,  // every product flagged — the clinician knows which target was lost
  },
  {
    id: "double_hit_carT_upgrade",
    severity: "upgrade",
    label: "Double-hit lymphoma — CAR-T preferred over auto-SCT",
    detail: "Double-hit / high-grade B-cell lymphoma has poor outcomes with auto-SCT. NCCN preference for early CAR-T referral.",
    source: "NCCN B-Cell Lymphomas v3.2024",
    appliesTo: (pt, product) => pt.doubleHit && product.target === "CD19" && (product.id === "yescarta" || product.id === "breyanzi"),
  },
  {
    id: "high_risk_cyto_mm",
    severity: "caution",
    label: "High-risk cytogenetics — durability caveat",
    detail: "del(17p), t(4;14), 1q+, or complex karyotype are associated with shorter PFS in MM cell therapy trials. Plan sequential strategy.",
    source: "Avet-Loiseau JCO 2018 · MM real-world series",
    appliesTo: (pt, product) => pt.highRiskCytogenetics && isMm({ cancerType: product.cancerKeys.includes("mm") ? "Multiple myeloma" : "" }) && product.cancerKeys.includes("mm"),
  },
  {
    id: "bulky_disease",
    severity: "caution",
    label: "Bulky disease — increased CRS/ICANS risk",
    detail: "High tumor burden was an adverse factor for both efficacy and safety in ZUMA-1 / TRANSCEND subgroup analyses. Plan cytoreductive bridging.",
    source: "ZUMA-1 / TRANSCEND subgroup analyses",
    appliesTo: (pt, product) => pt.bulkyDisease && product.target === "CD19",
  },
];

// ─── Cancer-type predicates ───────────────────────────────────────────────
function isDlbcl(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("dlbcl") || c.includes("large b-cell") || c.includes("pmbcl") || c.includes("lbcl");
}
function isFl(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("follicular");
}
function isMcl(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("mantle");
}
function isCll(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("cll") || c.includes("chronic lymphocytic");
}
function isAll(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("all") && !c.includes("small") || c.includes("acute lymphoblastic");
}
function isMm(pt) {
  const c = (pt.cancerType || "").toLowerCase();
  return c.includes("myeloma");
}
function priorLines(pt) {
  const n = parseInt(pt.priorLines, 10);
  return isNaN(n) ? 0 : n;
}

// ─── Tier sort order (lower index = higher priority) ──────────────────────
const TIER_RANK = { IA: 0, IB: 1, IC: 2, IIA: 3, IIB: 4, III: 5, IV: 6, V: 7, X: 8 };

// ─── Rank therapy options for a patient ───────────────────────────────────
// Inputs:
//   - pt:       patient state (form values)
//   - products: array of { product, score: { blocks, warnings, passes }, eligible: bool }
//     (i.e. the eligibility-engine output from App.jsx scored() function)
// Output:
//   - sorted array of { product, tier, tierMeta, basis, annotations, eligible, blocks, warnings, nccnPreferred }
//   - includes blocked products at the bottom (clinician still needs to see why)
export function rankTherapyOptions(pt, products) {
  const ranked = products.map(({ product, score, eligible }) => {
    // Find all evidence rules that match this patient
    const productRules = PRODUCT_EVIDENCE[product.id] || [];
    const matchingRules = productRules.filter(r => {
      try { return r.match(pt); } catch { return false; }
    });

    // Pick the highest-tier rule
    let best = null;
    matchingRules.forEach(r => {
      if (!best || TIER_RANK[r.tier] < TIER_RANK[best.tier]) best = r;
    });

    // Tier annotations for this product
    const annotations = TIER_ANNOTATIONS.filter(a => {
      try { return a.appliesTo(pt, product); } catch { return false; }
    });

    return {
      product,
      tier: best?.tier || "X",
      tierMeta: ESCAT_TIERS[best?.tier || "X"],
      context: best?.context || "Not in approved indication for this cancer type",
      basis: best?.basis || null,
      nccnPreferred: best?.nccnPreferred || false,
      annotations,
      eligible,
      blocks: score?.blocks || [],
      warnings: score?.warnings || [],
    };
  });

  // Sort: eligible first (by tier rank, then NCCN preferred first), then blocked
  ranked.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    const tierDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
    if (tierDiff !== 0) return tierDiff;
    if (a.nccnPreferred !== b.nccnPreferred) return a.nccnPreferred ? -1 : 1;
    return 0;
  });

  return ranked;
}

// ─── Convenience: build CT.gov trial url from basis ────────────────────────
export function basisUrl(basis) {
  if (!basis || !basis.nctId) return null;
  return ctGovUrl(basis.nctId);
}
