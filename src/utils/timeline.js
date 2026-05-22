// src/utils/timeline.js
// Longitudinal workflow tracking for CAR-T referrals.
//
// Each case gets a `timeline` sub-object capturing the full operational
// journey: referral, pending labs, insurance, apheresis, manufacturing,
// infusion. Pure data + pure functions — no I/O, no PHI exfiltration.

// ─── Default timeline shape (used for new cases + migration) ──────────────
export function emptyTimeline() {
  return {
    referralCreatedAt: null,    // ISO date when formal referral was sent
    referralCenter:    "",      // free-text: which CAR-T center received it

    pendingLabs: [],            // [{ id, name, status, orderedAt, completedAt, notes }]

    insurance: {
      status:      "none",       // none | submitted | approved | denied | appealing
      submittedAt: null,
      decisionAt:  null,
      policy:      "",
      authNumber:  "",
      notes:       "",
    },

    apheresis: {
      scheduledAt: null,
      performedAt: null,
      notes:       "",
    },

    manufacturing: {
      productStartedAt:     null,
      expectedDeliveryAt:   null,
      receivedAt:           null,
      notes:                "",
    },

    infusion: {
      scheduledAt:          null,
      conditioningStartAt:  null,
      performedAt:          null,
      notes:                "",
    },
  };
}

// Ensures every case has a complete timeline object (called on board load)
export function migrateTimeline(c) {
  if (c.timeline && typeof c.timeline === "object") {
    // Fill in any missing sub-objects
    const empty = emptyTimeline();
    return {
      ...c,
      timeline: {
        ...empty,
        ...c.timeline,
        insurance:     { ...empty.insurance,     ...(c.timeline.insurance     || {}) },
        apheresis:     { ...empty.apheresis,     ...(c.timeline.apheresis     || {}) },
        manufacturing: { ...empty.manufacturing, ...(c.timeline.manufacturing || {}) },
        infusion:      { ...empty.infusion,      ...(c.timeline.infusion      || {}) },
        pendingLabs:   Array.isArray(c.timeline.pendingLabs) ? c.timeline.pendingLabs : [],
      },
    };
  }
  return { ...c, timeline: emptyTimeline() };
}

// ─── Manufacturing-day helpers ──────────────────────────────────────────────
// Typical autologous CAR-T manufacturing window
export const MFG_TYPICAL_DAYS = 28;

// Returns countdown object given product start date + optional expected delivery
export function manufacturingCountdown(mfg) {
  if (!mfg?.productStartedAt) return null;
  const start = new Date(mfg.productStartedAt + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expected = mfg.expectedDeliveryAt
    ? new Date(mfg.expectedDeliveryAt + "T00:00:00")
    : new Date(start.getTime() + MFG_TYPICAL_DAYS * 86400000);
  const totalDays  = Math.max(1, Math.round((expected - start) / 86400000));
  const elapsed    = Math.max(0, Math.round((today - start)   / 86400000));
  const remaining  = Math.round((expected - today) / 86400000);
  const percent    = Math.min(1, Math.max(0, elapsed / totalDays));
  return {
    start, expected, totalDays, elapsed, remaining, percent,
    isComplete: !!mfg.receivedAt,
    isOverdue: !mfg.receivedAt && remaining < 0,
  };
}

// ─── Lab status helpers ─────────────────────────────────────────────────────
export const LAB_STATUSES = [
  { id: "ordered",         label: "Ordered",         color: "#c4a661" },
  { id: "result_pending",  label: "Result pending",  color: "#4c6b8c" },
  { id: "complete",        label: "Complete",        color: "#5a7a4a" },
  { id: "abnormal",        label: "Abnormal · re-do", color: "#b54a2c" },
];

export function isLabOverdue(lab, thresholdDays = 5) {
  if (!lab || lab.status === "complete") return false;
  if (!lab.orderedAt) return false;
  const ordered = new Date(lab.orderedAt + "T00:00:00");
  const days = (Date.now() - ordered.getTime()) / 86400000;
  return days > thresholdDays;
}

// Common starter labs by cancer category (used for quick-add chips)
export const COMMON_LABS_BY_CANCER = {
  lymphoma: [
    "CBC + diff",
    "CMP + LFTs",
    "LDH",
    "Echo / LVEF",
    "PFTs",
    "CD19 IHC",
    "PET/CT",
    "Outside records",
  ],
  mm: [
    "CBC + diff",
    "CMP + LFTs",
    "Serum free light chains",
    "β2-microglobulin",
    "Bone marrow biopsy + FISH",
    "BCMA IHC / flow",
    "Whole-body MRI or PET/CT",
    "Outside records",
  ],
  all: [
    "CBC + diff",
    "CMP + LFTs",
    "BM aspirate + flow",
    "CD19 confirmation",
    "BCR-ABL (if Ph+)",
    "Echo / LVEF",
    "Outside records",
  ],
};

export function commonLabsForCancer(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return COMMON_LABS_BY_CANCER.mm;
  if (c.includes("leukemia") || c.includes("all")) return COMMON_LABS_BY_CANCER.all;
  return COMMON_LABS_BY_CANCER.lymphoma;
}

// ─── Insurance status display ─────────────────────────────────────────────
export const INSURANCE_STATUSES = [
  { id: "none",       label: "Not started",        color: "#6b645a" },
  { id: "submitted",  label: "Submitted",          color: "#c4a661" },
  { id: "approved",   label: "Approved",           color: "#5a7a4a" },
  { id: "denied",     label: "Denied",             color: "#b54a2c" },
  { id: "appealing",  label: "Appeal pending",     color: "#4c6b8c" },
];

// ─── Date helpers ─────────────────────────────────────────────────────────
export function daysFromNow(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

export function relativeDateLabel(isoDate) {
  if (!isoDate) return null;
  const days = daysFromNow(isoDate);
  if (days === null) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0 && days <= 7) return `in ${days} days`;
  if (days < 0 && days >= -7) return `${Math.abs(days)} days ago`;
  return new Date(isoDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Aggregate board-level timeline insights ──────────────────────────────
// Used by the board "Today" strip and the digest email.
export function computeTimelineInsights(board) {
  if (!board || board.length === 0) return null;

  const upcomingApheresis     = [];
  const upcomingInfusions     = [];
  const mfgInProgress         = [];
  const mfgArrivingThisWeek   = [];
  const insurancePending      = [];
  const overdueLabs           = [];

  board.forEach(c => {
    const tl = c.timeline;
    if (!tl) return;
    const stage = c.stage || "pending_review";
    const isTerminal = ["closed", "deferred", "not_indicated"].includes(stage);
    if (isTerminal) return;

    // Apheresis upcoming
    if (tl.apheresis.scheduledAt && !tl.apheresis.performedAt) {
      const d = daysFromNow(tl.apheresis.scheduledAt);
      if (d !== null && d >= 0 && d <= 7) upcomingApheresis.push({ case: c, days: d });
    }

    // Infusion upcoming
    if (tl.infusion.scheduledAt && !tl.infusion.performedAt) {
      const d = daysFromNow(tl.infusion.scheduledAt);
      if (d !== null && d >= 0 && d <= 7) upcomingInfusions.push({ case: c, days: d });
    }

    // Manufacturing in progress + arriving soon
    const mfg = manufacturingCountdown(tl.manufacturing);
    if (mfg && !mfg.isComplete) {
      mfgInProgress.push({ case: c, ...mfg });
      if (mfg.remaining >= 0 && mfg.remaining <= 7) mfgArrivingThisWeek.push({ case: c, ...mfg });
    }

    // Insurance pending decision
    if (tl.insurance.status === "submitted" || tl.insurance.status === "appealing") {
      insurancePending.push({ case: c, status: tl.insurance.status, submittedAt: tl.insurance.submittedAt });
    }

    // Overdue labs
    (tl.pendingLabs || []).forEach(lab => {
      if (isLabOverdue(lab)) overdueLabs.push({ case: c, lab });
    });
  });

  return {
    upcomingApheresis,
    upcomingInfusions,
    mfgInProgress,
    mfgArrivingThisWeek,
    insurancePending,
    overdueLabs,
  };
}
