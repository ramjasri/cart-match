// src/utils/events.js
// Event-stream engine for the case activity log.
//
// Each case carries an `events: []` array. Every meaningful action against
// the case appends an immutable event with timestamp, actor, type, and
// human-readable title. This becomes the audit trail that institutional
// customers will eventually require — and the operational history that
// makes coordinators feel in control of their pipeline.

// ─── Event type registry ──────────────────────────────────────────────────
export const EVENT_TYPES = {
  // Case lifecycle
  "case.created":              { icon: "+",  label: "Case created",             dot: "#1a1815" },
  "case.stage.advanced":       { icon: "→",  label: "Stage advanced",           dot: "#5a7a4a" },
  "case.assigned":             { icon: "◉",  label: "Assigned",                 dot: "#4c6b8c" },
  "case.escalated":            { icon: "▲",  label: "Escalated",                dot: "#b54a2c" },
  "case.escalation.resolved":  { icon: "✓",  label: "Escalation resolved",      dot: "#5a7a4a" },

  // Referral
  "referral.initiated":        { icon: "↗",  label: "Referral initiated",       dot: "#5a7a4a" },
  "referral.center.changed":   { icon: "↺",  label: "Referral center changed",  dot: "#4c6b8c" },

  // External records
  "records.requested":         { icon: "▢",  label: "Outside records requested", dot: "#4c6b8c" },
  "records.received":          { icon: "▢",  label: "Outside records received",  dot: "#5a7a4a" },

  // Labs
  "lab.ordered":               { icon: "○",  label: "Lab ordered",              dot: "#c4a661" },
  "lab.completed":             { icon: "●",  label: "Lab completed",            dot: "#5a7a4a" },
  "lab.abnormal":              { icon: "!",  label: "Lab abnormal — re-do",     dot: "#b54a2c" },
  "lab.removed":               { icon: "×",  label: "Lab removed",              dot: "#6b645a" },

  // Insurance
  "insurance.submitted":       { icon: "↑",  label: "Insurance submitted",      dot: "#c4a661" },
  "insurance.approved":        { icon: "✓",  label: "Insurance approved",       dot: "#5a7a4a" },
  "insurance.denied":          { icon: "✗",  label: "Insurance DENIED",         dot: "#b54a2c" },
  "insurance.appealing":       { icon: "⚖",  label: "Insurance appeal opened",  dot: "#4c6b8c" },

  // Apheresis
  "apheresis.scheduled":       { icon: "□",  label: "Apheresis scheduled",      dot: "#4c6b8c" },
  "apheresis.performed":       { icon: "●",  label: "Apheresis performed",      dot: "#5a7a4a" },

  // Manufacturing
  "mfg.started":               { icon: "⟳",  label: "Manufacturing started",    dot: "#c4a661" },
  "mfg.expected.set":          { icon: "▸",  label: "Expected delivery set",    dot: "#4c6b8c" },
  "mfg.received":              { icon: "✓",  label: "Product received",         dot: "#5a7a4a" },

  // Infusion
  "infusion.scheduled":        { icon: "□",  label: "Infusion scheduled",       dot: "#4c6b8c" },
  "infusion.conditioning":     { icon: "▸",  label: "Conditioning started",     dot: "#c4a661" },
  "infusion.performed":        { icon: "●",  label: "Infusion performed",       dot: "#5a7a4a" },

  // Workflow / manual
  "note.added":                { icon: "▤",  label: "Note",                     dot: "#6b645a" },
  "reminder.set":              { icon: "⏰", label: "Reminder set",              dot: "#4c6b8c" },
  "reminder.cleared":          { icon: "⏰", label: "Reminder cleared",          dot: "#6b645a" },
};

// ─── Factory ──────────────────────────────────────────────────────────────
let _seq = 0;
function nextId() {
  _seq += 1;
  return `${Date.now()}_${_seq}_${Math.random().toString(36).slice(2, 6)}`;
}

export function createEvent({ type, by, title, detail, meta }) {
  const reg = EVENT_TYPES[type] || EVENT_TYPES["note.added"];
  return {
    id: nextId(),
    at: new Date().toISOString(),
    type,
    by: by || "system",
    title: title || reg.label,
    detail: detail || "",
    meta: meta || {},
  };
}

// ─── Diff two case snapshots → list of events ────────────────────────────
// Called from each state mutation so we don't have to sprinkle event
// emission across every helper. Detects every transition that matters.
export function diffEvents(oldCase, newCase, by = "you") {
  const events = [];
  const oc = oldCase || {};
  const nc = newCase || {};

  // Stage transitions
  if (oc.stage && nc.stage && oc.stage !== nc.stage) {
    events.push(createEvent({
      type: "case.stage.advanced",
      by,
      title: `Stage: ${oc.stage} → ${nc.stage}`,
      meta: { from: oc.stage, to: nc.stage },
    }));
  }

  // Assignment
  if ((oc.assignedTo || "") !== (nc.assignedTo || "")) {
    events.push(createEvent({
      type: "case.assigned",
      by,
      title: nc.assignedTo ? `Assigned to ${nc.assignedTo}` : "Unassigned",
      meta: { previous: oc.assignedTo || null, current: nc.assignedTo || null },
    }));
  }

  // Escalation
  if (!oc.escalated && nc.escalated) {
    events.push(createEvent({
      type: "case.escalated",
      by,
      title: "Escalated for physician review",
      detail: nc.escalationReason || "",
    }));
  } else if (oc.escalated && !nc.escalated) {
    events.push(createEvent({
      type: "case.escalation.resolved",
      by,
      title: "Escalation resolved",
    }));
  }

  // Next-action / reminder
  if ((oc.nextActionDate || null) !== (nc.nextActionDate || null)) {
    if (nc.nextActionDate) {
      events.push(createEvent({
        type: "reminder.set",
        by,
        title: `Reminder set: ${nc.nextActionDate}`,
        meta: { date: nc.nextActionDate },
      }));
    } else {
      events.push(createEvent({
        type: "reminder.cleared",
        by,
        title: "Reminder cleared",
      }));
    }
  }

  // ─── Timeline sub-object diffs ─────────────────────────────────────────
  const ot = oc.timeline || {};
  const nt = nc.timeline || {};

  // Referral
  if (!ot.referralCreatedAt && nt.referralCreatedAt) {
    events.push(createEvent({
      type: "referral.initiated",
      by,
      title: "Referral initiated",
      detail: nt.referralCenter ? `→ ${nt.referralCenter}` : "",
      meta: { center: nt.referralCenter || "" },
    }));
  }
  if (ot.referralCreatedAt && nt.referralCreatedAt && (ot.referralCenter || "") !== (nt.referralCenter || "")) {
    events.push(createEvent({
      type: "referral.center.changed",
      by,
      title: `Referral center: ${nt.referralCenter || "—"}`,
      meta: { previous: ot.referralCenter, current: nt.referralCenter },
    }));
  }

  // Insurance status
  const oIns = ot.insurance || {};
  const nIns = nt.insurance || {};
  if (oIns.status !== nIns.status && nIns.status && nIns.status !== "none") {
    const typeMap = {
      submitted: "insurance.submitted",
      approved:  "insurance.approved",
      denied:    "insurance.denied",
      appealing: "insurance.appealing",
    };
    const evType = typeMap[nIns.status];
    if (evType) {
      const detailParts = [];
      if (nIns.policy) detailParts.push(nIns.policy);
      if (nIns.authNumber) detailParts.push(`auth ${nIns.authNumber}`);
      events.push(createEvent({
        type: evType,
        by,
        detail: detailParts.join(" · "),
        meta: { policy: nIns.policy, authNumber: nIns.authNumber },
      }));
    }
  }

  // Apheresis
  const oAph = ot.apheresis || {};
  const nAph = nt.apheresis || {};
  if (!oAph.scheduledAt && nAph.scheduledAt) {
    events.push(createEvent({
      type: "apheresis.scheduled",
      by,
      detail: `Date: ${nAph.scheduledAt}`,
      meta: { date: nAph.scheduledAt },
    }));
  }
  if (!oAph.performedAt && nAph.performedAt) {
    events.push(createEvent({
      type: "apheresis.performed",
      by,
      detail: `Date: ${nAph.performedAt}`,
      meta: { date: nAph.performedAt },
    }));
  }

  // Manufacturing
  const oMfg = ot.manufacturing || {};
  const nMfg = nt.manufacturing || {};
  if (!oMfg.productStartedAt && nMfg.productStartedAt) {
    events.push(createEvent({
      type: "mfg.started",
      by,
      detail: nMfg.expectedDeliveryAt ? `Expected delivery ${nMfg.expectedDeliveryAt}` : "",
      meta: { start: nMfg.productStartedAt, expected: nMfg.expectedDeliveryAt },
    }));
  }
  if (!oMfg.receivedAt && nMfg.receivedAt) {
    events.push(createEvent({
      type: "mfg.received",
      by,
      detail: `Received ${nMfg.receivedAt}`,
      meta: { date: nMfg.receivedAt },
    }));
  }

  // Infusion
  const oInf = ot.infusion || {};
  const nInf = nt.infusion || {};
  if (!oInf.scheduledAt && nInf.scheduledAt) {
    events.push(createEvent({
      type: "infusion.scheduled",
      by,
      detail: `Date: ${nInf.scheduledAt}`,
      meta: { date: nInf.scheduledAt },
    }));
  }
  if (!oInf.conditioningStartAt && nInf.conditioningStartAt) {
    events.push(createEvent({
      type: "infusion.conditioning",
      by,
      detail: `Started ${nInf.conditioningStartAt}`,
      meta: { date: nInf.conditioningStartAt },
    }));
  }
  if (!oInf.performedAt && nInf.performedAt) {
    events.push(createEvent({
      type: "infusion.performed",
      by,
      detail: `Date: ${nInf.performedAt}`,
      meta: { date: nInf.performedAt },
    }));
  }

  return events;
}

// ─── Lab-specific diff (labs are an array, needs special handling) ────────
export function diffLabEvents(oldLabs, newLabs, by = "you") {
  const events = [];
  const oArr = oldLabs || [];
  const nArr = newLabs || [];
  const oById = Object.fromEntries(oArr.map(l => [l.id, l]));
  const nById = Object.fromEntries(nArr.map(l => [l.id, l]));

  // Added labs (ordered)
  nArr.forEach(nl => {
    if (!oById[nl.id]) {
      events.push(createEvent({
        type: "lab.ordered",
        by,
        title: `Lab ordered: ${nl.name}`,
        meta: { labId: nl.id, name: nl.name },
      }));
    }
  });
  // Removed labs
  oArr.forEach(ol => {
    if (!nById[ol.id]) {
      events.push(createEvent({
        type: "lab.removed",
        by,
        title: `Lab removed: ${ol.name}`,
        meta: { name: ol.name },
      }));
    }
  });
  // Status changes
  nArr.forEach(nl => {
    const ol = oById[nl.id];
    if (!ol) return;
    if (ol.status !== nl.status) {
      if (nl.status === "complete") {
        events.push(createEvent({
          type: "lab.completed",
          by,
          title: `Lab completed: ${nl.name}`,
          meta: { name: nl.name },
        }));
      } else if (nl.status === "abnormal") {
        events.push(createEvent({
          type: "lab.abnormal",
          by,
          title: `Lab abnormal — re-do: ${nl.name}`,
          meta: { name: nl.name },
        }));
      }
    }
  });
  return events;
}

// ─── Display helpers ─────────────────────────────────────────────────────
export function formatEventTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = diffMs / 60000;
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${Math.floor(diffMin)} min ago`;
  const diffHr = diffMin / 60;
  if (diffHr < 24 && d.toDateString() === now.toDateString()) {
    return `Today ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  const diffDays = diffMs / 86400000;
  if (diffDays < 7) return `${Math.floor(diffDays)} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: now.getFullYear() === d.getFullYear() ? undefined : "numeric" });
}

export function sortEventsDescending(events) {
  return [...(events || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
}
