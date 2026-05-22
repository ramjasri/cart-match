// src/utils/retrospective.js
// Batch retrospective analysis engine. Takes historical referral data and
// runs each row through the eligibility + urgency engines, then computes
// study-grade endpoints comparing actual referral timing against
// CellTx-recommended referral timing.
//
// Output is publication-ready: summary table + 4 primary endpoints.

import { calculateUrgency } from "./urgency.js";
import { calculateReferralDecision } from "./earlyReferral.js";

// ─── Parse CSV (simple — handles quoted fields, commas in quotes) ──────────
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const splitLine = (line) => {
    const out = [];
    let buf = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i++; continue; }
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { out.push(buf); buf = ""; continue; }
      buf += ch;
    }
    out.push(buf);
    return out.map(s => s.trim());
  };

  const headers = splitLine(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line);
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] !== undefined ? vals[i] : ""; });
    return row;
  });
  return { headers, rows };
}

// Coerce a raw row into the patient-state shape the engines expect
function rowToPatient(row) {
  const trueLike = (v) => {
    const s = String(v || "").toLowerCase().trim();
    return s === "1" || s === "true" || s === "yes" || s === "y" || s === "t";
  };
  return {
    cancerType:           row.cancer_type || row.cancertype || "",
    priorLines:           row.prior_lines || row.priorlines || "",
    ecog:                 row.ecog || "",
    cd19:                 row.cd19 || "unknown",
    bcma:                 row.bcma || "unknown",
    cd20:                 row.cd20 || "unknown",
    gprc5d:               row.gprc5d || "unknown",
    activeCns:            trueLike(row.active_cns),
    activeAutoimmune:     trueLike(row.active_autoimmune),
    alloSct:              trueLike(row.allo_sct),
    alloSctMonths:        row.allo_sct_months || "",
    priorImid:            trueLike(row.prior_imid),
    priorPi:              trueLike(row.prior_pi),
    priorAntiCd38:        trueLike(row.prior_anti_cd38 || row.prior_anticd38),
    latestResponse:       row.latest_response || "",
    diseaseTempo:         row.disease_tempo || "",
    primaryRefractory:    trueLike(row.primary_refractory),
    bSymptoms:            trueLike(row.b_symptoms),
    elevatedLdh:          trueLike(row.elevated_ldh),
    earlyRelapse:         trueLike(row.early_relapse),
    doubleHit:            trueLike(row.double_hit),
    transformedFromIndolent: trueLike(row.transformed_from_indolent),
    pod24:                trueLike(row.pod24),
    flGrade3b:            trueLike(row.fl_grade_3b),
    transformedToDlbcl:   trueLike(row.transformed_to_dlbcl),
    btkiExposed:          trueLike(row.btki_exposed),
    btkiRefractory:       trueLike(row.btki_refractory),
    blastoidVariant:      trueLike(row.blastoid_variant),
    tp53Mutated:          trueLike(row.tp53_mutated),
    btkiVenetoclaxExposed: trueLike(row.btki_venetoclax_exposed),
    richtersTransformation: trueLike(row.richters_transformation),
    age25OrYounger:       trueLike(row.age_25_or_younger),
    phPositive:           trueLike(row.ph_positive),
    lenalidomideRefractory: trueLike(row.lenalidomide_refractory),
    extramedullaryDisease: trueLike(row.extramedullary_disease),
    highRiskCytogenetics: trueLike(row.high_risk_cytogenetics),
    labAlt: "", labAst: "", labCreat: "", labCrcl: "",
    labBil: "", labLvef: "", labSpo2: "",
  };
}

function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return null;
  const a = new Date(isoA + "T00:00:00");
  const b = new Date(isoB + "T00:00:00");
  return Math.round((b - a) / 86400000);
}

// ─── Analyze a single row ─────────────────────────────────────────────────
export function analyzeRow(row) {
  const patient = rowToPatient(row);
  const urgency = calculateUrgency(patient);
  const decision = calculateReferralDecision(patient);

  const indexDate = row.index_date || row.indexdate || null;
  const referralDate = row.referral_date || row.referraldate || null;
  const infusedDate = row.infused_date || row.infuseddate || null;

  // Days between when CellTx says they SHOULD have been referred (index date)
  // and when they actually were referred.
  const referralDelta = daysBetween(indexDate, referralDate);
  // Days between actual referral and infusion (operational throughput)
  const referralToInfusion = daysBetween(referralDate, infusedDate);

  // Classification per the study endpoints
  let classification = "unknown";
  let flags = [];

  if (decision?.decision === "REFER_NOW" && !referralDate) {
    classification = "missed_never_referred";
    flags.push("CellTx flagged REFER NOW · no referral recorded");
  } else if (decision?.decision === "REFER_NOW" && referralDelta !== null) {
    if (referralDelta > 30) {
      classification = "missed_early_referral";
      flags.push(`CellTx flagged REFER NOW · actual referral ${referralDelta} days late`);
    } else if (referralDelta > 14) {
      classification = "delayed_referral";
      flags.push(`CellTx HIGH urgency · referral delayed ${referralDelta} days`);
    } else if (referralDelta >= 0) {
      classification = "timely_referral";
    } else {
      classification = "pre_emptive";
      flags.push(`Referred ${Math.abs(referralDelta)} days BEFORE engine threshold`);
    }
  } else if (decision?.decision === "REFER_AT_PROGRESSION") {
    classification = "monitor_correct";
  } else if (decision?.decision === "MONITOR" || decision?.decision === "NOT_INDICATED") {
    classification = "not_yet_indicated";
  }

  // Detect "eligibility lost" — if labs degraded between index and referral.
  // For v1 we can't compute this without serial lab data; we mark as
  // "unknowable" but the field is present for extension.

  return {
    patientId:    row.patient_id || row.patientid || row.id || "—",
    patient,
    urgency:      urgency ? urgency.level : "—",
    urgencyScore: urgency ? urgency.score : 0,
    decision:     decision?.decision || "—",
    indexDate, referralDate, infusedDate,
    referralDelta, referralToInfusion,
    classification, flags,
    cellTxRecommendation: decision?.headline || "—",
  };
}

// ─── Run the full batch ───────────────────────────────────────────────────
export function runRetrospective(rows) {
  const analyzed = rows.map(analyzeRow);

  const total = analyzed.length;
  const counts = {
    missed_never_referred:  0,
    missed_early_referral:  0,
    delayed_referral:       0,
    timely_referral:        0,
    pre_emptive:            0,
    monitor_correct:        0,
    not_yet_indicated:      0,
    unknown:                0,
  };
  const deltas = [];
  const r2iDeltas = [];
  analyzed.forEach(a => {
    counts[a.classification] = (counts[a.classification] || 0) + 1;
    if (typeof a.referralDelta === "number") deltas.push(a.referralDelta);
    if (typeof a.referralToInfusion === "number") r2iDeltas.push(a.referralToInfusion);
  });

  const median = (arr) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
  };

  const endpoints = {
    missedEarlyReferralRate:  total > 0 ? (counts.missed_early_referral + counts.missed_never_referred) / total : 0,
    delayedReferralRate:      total > 0 ? counts.delayed_referral / total : 0,
    timelyReferralRate:       total > 0 ? counts.timely_referral / total : 0,
    medianReferralDelay:      median(deltas),
    medianReferralToInfusion: median(r2iDeltas),
  };

  return { total, counts, endpoints, rows: analyzed };
}

// ─── CSV export ───────────────────────────────────────────────────────────
export function toCSV(rows) {
  const cols = [
    "patient_id", "cancer_type", "prior_lines", "ecog",
    "celltx_urgency", "celltx_urgency_score", "celltx_decision",
    "actual_index_date", "actual_referral_date", "actual_infused_date",
    "referral_delta_days", "referral_to_infusion_days",
    "classification", "celltx_recommendation",
  ];
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [cols.join(",")];
  rows.forEach(r => {
    lines.push([
      r.patientId,
      (r.patient.cancerType || "").split("(")[0].trim(),
      r.patient.priorLines,
      r.patient.ecog,
      r.urgency, r.urgencyScore, r.decision,
      r.indexDate, r.referralDate, r.infusedDate,
      r.referralDelta, r.referralToInfusion,
      r.classification, r.cellTxRecommendation,
    ].map(escape).join(","));
  });
  return lines.join("\n");
}

// ─── Sample dataset (for demo/test purposes) ──────────────────────────────
export const SAMPLE_CSV = `patient_id,cancer_type,prior_lines,ecog,cd19,primary_refractory,index_date,referral_date,infused_date
P001,DLBCL,2,1,positive,1,2024-03-15,2024-05-22,2024-07-08
P002,DLBCL,3,2,positive,0,2024-04-02,2024-04-15,2024-05-29
P003,Multiple myeloma,4,2,unknown,0,2024-02-10,,
P004,Mantle cell lymphoma,2,1,positive,0,2024-05-20,2024-06-04,2024-07-19
P005,DLBCL,3,1,positive,1,2024-01-10,2024-04-12,2024-05-28
P006,Follicular lymphoma,3,1,positive,0,2024-03-22,2024-04-05,2024-05-20
P007,DLBCL,4,3,positive,0,2024-02-28,2024-05-15,
P008,Multiple myeloma,5,1,unknown,0,2024-01-15,2024-02-01,2024-03-18
P009,DLBCL,2,0,positive,1,2024-04-18,2024-04-25,2024-06-12
P010,Mantle cell lymphoma,3,2,positive,0,2024-03-08,2024-06-10,`;
