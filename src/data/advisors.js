// src/data/advisors.js
// Clinical Advisory Board surface — the moat layer that's genuinely
// uncopyable. Per the strategic feedback: once a named MSK / DFCI /
// Mayo oncologist has publicly endorsed the rule library quarterly,
// a competitor cannot acquire credibility — they have to recruit
// their own KOLs from scratch.
//
// Honest design: this file ships EMPTY (no advisors recruited yet).
// As advisors sign on, individual entries get populated and the
// "Review pending" badge flips to "Reviewed by Dr. X" automatically
// across every output panel. The page itself becomes the recruitment
// landing: "here's what you'd sign off on, here's the cadence,
// here's how it appears in the product."

// ─── Current advisory board ──────────────────────────────────────────────
// Format per entry:
//   {
//     id:           short slug
//     name:         "Dr. Jane Smith, MD"
//     credentials:  "MD" | "MD PhD" | "PharmD" | etc.
//     institution:  "Memorial Sloan Kettering"
//     role:         "Heme Service · Lymphoma Disease Team"
//     focus:        ["dlbcl", "fl", "mcl"]   — drives which rules they review
//     joinedAt:     ISO date
//     bio:          one-paragraph public bio (their words, signed off)
//     publicProfile: URL to their institutional profile
//     conflictsOfInterest: array of disclosed COIs
//     signoffCadence: "quarterly" | "monthly"
//   }
// Empty by design — flips to populated as recruitment lands.
export const ADVISORS = [];

// ─── Signoffs per rule category ──────────────────────────────────────────
// Each rule category (biomarkers, evidence, annotations, pathways, etc.)
// has a signoff record. When an advisor reviews and signs off, this
// updates and the badge on the corresponding output panel lights up.
//
// Categories (matching the code's rule groupings):
//   biomarkers           — BIOMARKER_DB in resistance.js
//   evidenceRules        — PRODUCT_EVIDENCE in evidenceEngine.js
//   tierAnnotations      — TIER_ANNOTATIONS in evidenceEngine.js
//   nonresponseRisk      — NONRESPONSE_RISK_FACTORS in resistance.js
//   pathways             — PATHWAY_CATALOG in pathways.js
//   productEligibility   — PRODUCTS / BISPECIFICS in App.jsx (the score() rules)
//   trialScoring         — TRIAL_SCORING_RULES in trialMatcher.js
//   centerDirectory      — CENTERS in centers.js
export const SIGNOFFS = {
  biomarkers: {
    advisorId: null,           // → references ADVISORS[].id when signed off
    reviewedAt: null,           // ISO date of last sign-off
    nextReviewDue: null,        // ISO date of next scheduled review
    cadence: "quarterly",
    notes: null,                // optional advisor-authored note about the review
  },
  evidenceRules: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "quarterly", notes: null,
  },
  tierAnnotations: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "quarterly", notes: null,
  },
  nonresponseRisk: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "quarterly", notes: null,
  },
  pathways: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "quarterly", notes: null,
  },
  productEligibility: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "monthly", notes: null,
  },
  trialScoring: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "quarterly", notes: null,
  },
  centerDirectory: {
    advisorId: null, reviewedAt: null, nextReviewDue: null, cadence: "monthly", notes: null,
  },
};

// ─── Helper accessors ─────────────────────────────────────────────────────
export function getAdvisor(id) {
  return ADVISORS.find(a => a.id === id) || null;
}

export function getSignoff(category) {
  const s = SIGNOFFS[category];
  if (!s) return null;
  const advisor = s.advisorId ? getAdvisor(s.advisorId) : null;
  return { ...s, advisor };
}

// Returns a short display string for use in panel headers:
//   "Reviewed by Dr. Smith · MSK · 2026-04" (when signed)
//   "Clinical review pending" (when no advisor)
export function signoffBadge(category) {
  const s = getSignoff(category);
  if (!s || !s.advisor || !s.reviewedAt) {
    return { state: "pending", text: "Clinical review pending — advisory board recruiting" };
  }
  const ymd = s.reviewedAt.slice(0, 7);
  const inst = s.advisor.institution.replace(/Memorial Sloan Kettering/i, "MSK")
                                     .replace(/Dana-Farber Cancer Institute/i, "DFCI")
                                     .replace(/Mayo Clinic/i, "Mayo");
  return {
    state: "signed",
    text: `Reviewed by ${s.advisor.name} · ${inst} · ${ymd}`,
    advisor: s.advisor,
    reviewedAt: s.reviewedAt,
  };
}

// Aggregate metrics for /defensibility and /advisors
export function advisoryMetrics() {
  const total = Object.keys(SIGNOFFS).length;
  const signed = Object.values(SIGNOFFS).filter(s => s.advisorId && s.reviewedAt).length;
  return {
    totalCategories: total,
    signedCategories: signed,
    signedPct: total > 0 ? Math.round((signed / total) * 100) : 0,
    advisorCount: ADVISORS.length,
  };
}

// ─── Category metadata for rendering ──────────────────────────────────────
export const SIGNOFF_CATEGORIES = [
  { id: "biomarkers",           label: "Biomarker knowledge base",       rulesIn: "src/utils/resistance.js · BIOMARKER_DB",        description: "Curated genomic alterations · ESCAT tiers · resistance implications" },
  { id: "evidenceRules",        label: "Evidence engine — tier rules",   rulesIn: "src/utils/evidenceEngine.js · PRODUCT_EVIDENCE", description: "Per-product, per-context ESCAT tier assignments tied to pivotal trials" },
  { id: "tierAnnotations",      label: "Patient-specific annotations",   rulesIn: "src/utils/evidenceEngine.js · TIER_ANNOTATIONS", description: "Published subgroup signals — TP53, antigen loss, etc." },
  { id: "nonresponseRisk",      label: "Nonresponse risk scoring",       rulesIn: "src/utils/resistance.js · NONRESPONSE_RISK_FACTORS", description: "Weighted features for cell therapy nonresponse risk" },
  { id: "pathways",             label: "Disease pathways (NCCN-aware)",  rulesIn: "src/utils/pathways.js · PATHWAY_CATALOG",       description: "DLBCL / FL / MCL / CLL / ALL / MM pathway logic" },
  { id: "productEligibility",   label: "Product eligibility rules",      rulesIn: "src/App.jsx · score() + PRODUCTS / BISPECIFICS", description: "Per-product label-derived eligibility criteria" },
  { id: "trialScoring",         label: "Clinical trial matching",        rulesIn: "src/utils/trialMatcher.js · TRIAL_SCORING_RULES", description: "Trial relevance scoring against patient state" },
  { id: "centerDirectory",      label: "Center directory",               rulesIn: "src/data/centers.js · CENTERS",                  description: "FACT + NMDP US programs · accreditation status" },
];
