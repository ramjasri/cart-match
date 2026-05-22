// src/utils/digest.js
// Client-side composition of the weekly tumor board digest.
//
// CRITICAL ARCHITECTURAL CHOICE: the digest is composed in the BROWSER from
// localStorage cases, then sent through our /api/email/digest relay. The
// server never sees patient-level data beyond what's needed to put together
// the email (label, cancer category, stage, eligibility counts).
//
// We deliberately strip these PHI-risk fields before sending:
//   - clinical notes (free-text the user typed)
//   - lab values
//   - eligibility blocks/warnings text
//   - patient profile object (priorLines, ecog, biomarkers, etc.)
//   - results object (full eligibility output)
// Only the bare-minimum operational summary leaves the browser.

const DIGEST_INTERVAL_DAYS = 7;
const LAST_DIGEST_KEY      = "celltx-last-digest";
const DIGEST_ENABLED_KEY   = "celltx-digest-enabled";

// Stage label lookup (mirrors PIPELINE_STAGES in App.jsx — kept in sync via tests in CI later)
const STAGE_LABELS = {
  pending_review: "Pending review",
  discussed:      "Discussed",
  approved:       "Approved for referral",
  deferred:       "Deferred",
  not_indicated:  "Not indicated",
  referred:       "Referred",
  apheresis:      "Apheresis scheduled",
  manufacturing:  "In manufacturing",
  infused:        "Infused",
  follow_up_30:   "Day 30 follow-up",
  follow_up_90:   "Day 90 follow-up",
  closed:         "Closed",
};

const PHASE_OF = {
  pending_review: "decision",
  discussed:      "decision",
  approved:       "decision",
  deferred:       "decision",
  not_indicated:  "decision",
  referred:       "referral",
  apheresis:      "referral",
  manufacturing:  "referral",
  infused:        "treatment",
  follow_up_30:   "followup",
  follow_up_90:   "followup",
  closed:         "closed",
};

// ─── Preference helpers (localStorage) ─────────────────────────────────────
export function isDigestEnabled() {
  try { return localStorage.getItem(DIGEST_ENABLED_KEY) === "true"; }
  catch { return false; }
}

export function setDigestEnabled(enabled) {
  try {
    localStorage.setItem(DIGEST_ENABLED_KEY, enabled ? "true" : "false");
    if (!enabled) {
      // When user opts out, clear the timestamp so re-enabling triggers fresh send
      localStorage.removeItem(LAST_DIGEST_KEY);
    }
  } catch { /* ignore */ }
}

function getLastDigestTime() {
  try {
    const ts = localStorage.getItem(LAST_DIGEST_KEY);
    return ts ? new Date(ts).getTime() : 0;
  } catch { return 0; }
}

function markDigestSent() {
  try { localStorage.setItem(LAST_DIGEST_KEY, new Date().toISOString()); }
  catch { /* ignore */ }
}

// ─── Payload composition (PHI-safe) ────────────────────────────────────────
function summarizeBoard(board) {
  const stageOf = c => c.stage || "pending_review";
  const TERMINAL = ["closed", "deferred", "not_indicated"];
  const isOverdue = c => {
    if (TERMINAL.includes(stageOf(c)) || !c.nextActionDate) return false;
    const due = new Date(c.nextActionDate + "T00:00:00");
    const now = new Date(); now.setHours(0,0,0,0);
    return (due - now) < 0;
  };
  return {
    overdue:  board.filter(isOverdue).length,
    awaiting: board.filter(c => ["pending_review", "discussed"].includes(stageOf(c))).length,
    active:   board.filter(c => ["approved", "referred", "apheresis", "manufacturing"].includes(stageOf(c))).length,
    infused:  board.filter(c => stageOf(c) === "infused").length,
    followup: board.filter(c => ["follow_up_30", "follow_up_90"].includes(stageOf(c))).length,
    closed:   board.filter(c => TERMINAL.includes(stageOf(c))).length,
  };
}

// Project a board case down to the minimum fields the digest needs.
// Everything else (notes, lab values, full results object) is stripped.
function projectCase(c) {
  const stage = c.stage || "pending_review";
  const eligibleCount = c.results ? Object.values(c.results).filter(r => r.eligible).length : 0;
  const totalCount    = Object.keys(c.results || {}).length;
  const cancerType    = c.patient?.cancerType || "";
  // Strip parenthetical detail (e.g., "DLBCL (Large B-cell lymphoma)" → "DLBCL")
  const cancerCategory = cancerType.split("(")[0].trim().substring(0, 40);

  // Compute reminder status (PHI-safe — just a date and a status string)
  let reminderState = null;
  let reminderLabel = null;
  if (c.nextActionDate) {
    const due = new Date(c.nextActionDate + "T00:00:00");
    const now = new Date(); now.setHours(0,0,0,0);
    const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      reminderState = "overdue";
      reminderLabel = Math.abs(diffDays) === 1 ? "Overdue 1 day" : `Overdue ${Math.abs(diffDays)} days`;
    } else if (diffDays <= 3) {
      reminderState = "due-soon";
      reminderLabel = diffDays === 0 ? "Due today" : diffDays === 1 ? "Due tomorrow" : `Due in ${diffDays} days`;
    }
  }

  return {
    label:           c.patientLabel || "Patient",
    cancerCategory,
    stage,
    stageLabel:      STAGE_LABELS[stage] || stage,
    phase:           PHASE_OF[stage] || "decision",
    eligibleCount,
    totalCount,
    reminderState,
    reminderLabel,
  };
}

export function composeDigestPayload({ board, toEmail, toName, dateStr }) {
  if (!board || board.length === 0) return null;
  const summary = summarizeBoard(board);
  const cases   = board.map(projectCase);
  return {
    toEmail,
    toName,
    dateStr: dateStr || formatDateStr(),
    summary,
    cases,
  };
}

function formatDateStr(d = new Date()) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// ─── Send the digest (used both for manual and automatic triggers) ─────────
export async function sendDigest({ board, toEmail, toName }) {
  const payload = composeDigestPayload({ board, toEmail, toName });
  if (!payload) {
    return { ok: false, reason: "no_cases" };
  }
  try {
    const res = await fetch("/api/email/digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 503) return { ok: false, reason: "not_configured" };
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      return { ok: false, reason: "send_failed", detail: detail.error || res.statusText };
    }
    markDigestSent();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "network", detail: err.message };
  }
}

// ─── Auto-digest scheduler (called on app mount) ───────────────────────────
//
// Logic: if digest is enabled, the user is signed in with an email, the board
// has cases, AND it has been >= 7 days since the last digest, send one.
// This is a "best-effort" weekly cadence — fires whenever the user opens the
// app after the interval. Idempotent (won't double-send within 7 days).
//
// Returns an object describing what happened (for analytics/debugging).
export async function maybeSendAutoDigest({ board, toEmail, toName }) {
  if (!isDigestEnabled()) return { fired: false, reason: "disabled" };
  if (!toEmail) return { fired: false, reason: "no_email" };
  if (!board || board.length === 0) return { fired: false, reason: "empty_board" };

  const lastTs = getLastDigestTime();
  const intervalMs = DIGEST_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() - lastTs < intervalMs) {
    return { fired: false, reason: "too_recent", lastTs };
  }

  const result = await sendDigest({ board, toEmail, toName });
  return { fired: result.ok, ...result };
}
