// src/utils/analytics-board.js
// Computes per-institution program metrics from the local tumor board.
// Pure functions — no I/O, no PHI exfiltration. Consumed by /analytics view.
//
// Metrics produced:
//   - Funnel counts (screened → decided → approved → referred → apheresis →
//     manufacturing → infused → day 30/90 → closed)
//   - Conversion rates at each step
//   - Median time-in-stage (from stageHistory timestamps)
//   - Outcome breakdown (from outcome field)
//   - By-cancer-type breakdown

const LINEAR = [
  "pending_review", "discussed", "approved", "referred", "apheresis",
  "manufacturing", "infused", "follow_up_30", "follow_up_90", "closed",
];

const TERMINAL_NON_PROGRESSED = ["deferred", "not_indicated"];

// "Reached stage X" = case is currently at X OR has progressed past X in the
// linear pipeline. Deferred/not_indicated cases are excluded from progression
// counts since they never entered the referral phase.
function reachedStage(board, stageId) {
  const targetIdx = LINEAR.indexOf(stageId);
  if (targetIdx === -1) return 0;
  return board.filter(c => {
    if (TERMINAL_NON_PROGRESSED.includes(c.stage)) return false;
    const cIdx = LINEAR.indexOf(c.stage);
    return cIdx >= targetIdx;
  }).length;
}

function median(nums) {
  const xs = nums.filter(n => Number.isFinite(n));
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Days between two stage-history entries on a single case
function daysBetweenStages(c, fromStage, toStage) {
  const hist = c.stageHistory || [];
  const fromEntry = hist.find(h => h.stage === fromStage);
  const toEntry   = hist.find(h => h.stage === toStage);
  if (!fromEntry || !toEntry) return null;
  const diffMs = new Date(toEntry.at) - new Date(fromEntry.at);
  if (diffMs < 0) return null;
  return diffMs / (1000 * 60 * 60 * 24);
}

function medianAcrossBoard(board, fromStage, toStage) {
  const durations = board
    .map(c => daysBetweenStages(c, fromStage, toStage))
    .filter(d => d !== null);
  return median(durations);
}

export function computeBoardAnalytics(board) {
  if (!board || board.length === 0) return null;

  const total = board.length;

  // Stage counts
  const byStage = {};
  board.forEach(c => {
    const s = c.stage || "pending_review";
    byStage[s] = (byStage[s] || 0) + 1;
  });

  // Funnel (cumulative — reached this stage or later in linear pipeline)
  const funnel = {
    screened:    total,
    decided:     total - (byStage.pending_review || 0),
    approved:    reachedStage(board, "approved"),
    referred:    reachedStage(board, "referred"),
    apheresis:   reachedStage(board, "apheresis"),
    inMfg:       reachedStage(board, "manufacturing"),
    infused:     reachedStage(board, "infused"),
    day30:       reachedStage(board, "follow_up_30"),
    day90:       reachedStage(board, "follow_up_90"),
    closed:      byStage.closed || 0,
    deferred:    byStage.deferred || 0,
    notIndicated: byStage.not_indicated || 0,
  };

  // Conversion rates at each step (denominator = previous step)
  const rate = (numer, denom) => denom > 0 ? numer / denom : null;
  const conversionRates = {
    decision:        rate(funnel.decided,   total),
    approval:        rate(funnel.approved,  funnel.decided),
    referral:        rate(funnel.referred,  funnel.approved),
    apheresis:       rate(funnel.apheresis, funnel.referred),
    manufacturing:   rate(funnel.inMfg,     funnel.apheresis),
    infusion:        rate(funnel.infused,   funnel.inMfg),
    endToEnd:        rate(funnel.infused,   total),
  };

  // Median days between key stages (from stageHistory)
  const medianDays = {
    decisionToReferral:  medianAcrossBoard(board, "approved",    "referred"),
    referralToApheresis: medianAcrossBoard(board, "referred",    "apheresis"),
    apheresisToMfg:      medianAcrossBoard(board, "apheresis",   "manufacturing"),
    mfgToInfusion:       medianAcrossBoard(board, "manufacturing","infused"),
    apheresisToInfusion: medianAcrossBoard(board, "apheresis",   "infused"),
    screenedToInfused:   medianAcrossBoard(board, "pending_review","infused"),
  };

  // Outcomes (from outcome field on terminal cases)
  const outcomes = {};
  board.forEach(c => {
    if (c.outcome) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
  });

  // By cancer type
  const byCancerType = {};
  board.forEach(c => {
    const type = (c.patient?.cancerType || "Unspecified").split("(")[0].trim() || "Unspecified";
    if (!byCancerType[type]) byCancerType[type] = { total: 0, infused: 0, deferred: 0, active: 0 };
    byCancerType[type].total++;
    const stage = c.stage || "pending_review";
    if (["infused", "follow_up_30", "follow_up_90", "closed"].includes(stage)) byCancerType[type].infused++;
    if (TERMINAL_NON_PROGRESSED.includes(stage)) byCancerType[type].deferred++;
    if (["approved", "referred", "apheresis", "manufacturing"].includes(stage)) byCancerType[type].active++;
  });

  // Sort cancer types by total (descending)
  const cancerTypeRows = Object.entries(byCancerType)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([type, data]) => ({
      type,
      ...data,
      infusionRate: data.total > 0 ? data.infused / data.total : 0,
    }));

  // Earliest case date (for "since" stamp)
  const firstCaseDate = board
    .map(c => c.addedAt ? new Date(c.addedAt) : null)
    .filter(Boolean)
    .sort((a, b) => a - b)[0] || null;

  return {
    total,
    byStage,
    funnel,
    conversionRates,
    medianDays,
    outcomes,
    cancerTypeRows,
    firstCaseDate,
  };
}

// ─── Display helpers ───────────────────────────────────────────────────────
export const OUTCOME_LABELS = {
  received_product_well:          "Received product · doing well",
  received_product_complications: "Received product · with complications",
  progressed:                     "Disease progressed",
  insurance_denied:               "Insurance denied",
  manufacturing_failure:          "Manufacturing failed",
  patient_declined:               "Patient declined",
  death_pre_infusion:             "Death pre-infusion",
  still_indicated:                "Referred elsewhere",
  other:                          "Other",
};

// Color coding for outcomes (positive = green, negative = red, neutral = blue)
export const OUTCOME_COLORS = {
  received_product_well:          "#5a7a4a",
  received_product_complications: "#c4a661",
  progressed:                     "#b54a2c",
  insurance_denied:               "#b54a2c",
  manufacturing_failure:          "#b54a2c",
  patient_declined:               "#6b645a",
  death_pre_infusion:             "#1a1815",
  still_indicated:                "#4c6b8c",
  other:                          "#6b645a",
};

export function formatPercent(rate) {
  if (rate === null || rate === undefined) return "—";
  return `${Math.round(rate * 100)}%`;
}

export function formatDays(days) {
  if (days === null || days === undefined) return "—";
  if (days < 1) return "<1 day";
  if (days < 21) return `${Math.round(days)} days`;
  return `${Math.round(days / 7)} weeks`;
}
