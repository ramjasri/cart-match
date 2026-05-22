// src/utils/analytics.js
// Lightweight wrapper around Plausible Analytics. Safe to call before the
// Plausible script loads — events queue up via the inline stub in index.html.
//
// We use manual page-view tracking because the app uses pushState routing
// (multiple "pages" — /screener, /refer, /pricing, /criteria, /board — within
// a single SPA load).

function safePlausible(...args) {
  if (typeof window === "undefined") return;
  if (typeof window.plausible !== "function") return;
  try {
    window.plausible(...args);
  } catch {
    /* never let analytics break the app */
  }
}

// ─── Page views (manual SPA tracking) ──────────────────────────────────────
export function trackPageview(path) {
  safePlausible("pageview", { u: window.location.origin + (path || window.location.pathname) });
}

// ─── Custom events ────────────────────────────────────────────────────────
// Plausible custom event format: plausible(name, { props: { ... } })

export function trackScreenRun(pt) {
  safePlausible("Screen Run", {
    props: {
      cancer: (pt.cancerType || "unspecified").split("(")[0].trim().substring(0, 40),
      lines: pt.priorLines || "—",
      ecog: pt.ecog || "—",
      primaryRefractory: pt.primaryRefractory ? "yes" : "no",
    },
  });
}

export function trackReferralDecision(decision, cancer) {
  safePlausible("Referral Decision", {
    props: {
      decision: decision || "—",
      cancer: cancer || "—",
    },
  });
}

export function trackAddToBoard(boardSize) {
  safePlausible("Add to Tumor Board", { props: { boardSize: String(boardSize) } });
}

export function trackPdfExport(kind, grayscale) {
  safePlausible("PDF Export", {
    props: {
      kind: kind || "referral",
      grayscale: grayscale ? "yes" : "no",
    },
  });
}

export function trackBoardPacketExport(caseCount) {
  safePlausible("Board Packet Export", { props: { cases: String(caseCount) } });
}

export function trackCopyShareLink() {
  safePlausible("Copy Share Link");
}

export function trackWaitlistSubmit(role, institution) {
  safePlausible("Waitlist Submit", {
    props: {
      role: (role || "unspecified").substring(0, 30),
      institutionType: classifyInstitution(institution),
    },
  });
}

function classifyInstitution(name) {
  const n = (name || "").toLowerCase();
  if (!n) return "unknown";
  if (n.includes("hospital") || n.includes("medical center")) return "hospital";
  if (n.includes("university") || n.includes("school")) return "academic";
  if (n.includes("clinic") || n.includes("practice")) return "practice";
  if (n.includes("cancer") || n.includes("oncology")) return "cancer center";
  if (n.includes("inc") || n.includes("biotech") || n.includes("pharma")) return "biotech/pharma";
  return "other";
}

export function trackPricingCta(tierId) {
  safePlausible("Pricing CTA", { props: { tier: tierId } });
}

export function trackCriteriaApiAccess() {
  safePlausible("Criteria API Click");
}

export function trackTrialClick(nctId) {
  safePlausible("Trial Click", { props: { nct: nctId || "—" } });
}

export function trackEarlyReferralRun(decision) {
  safePlausible("Early Referral Run", { props: { decision: decision || "—" } });
}
