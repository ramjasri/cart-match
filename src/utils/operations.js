// src/utils/operations.js
// Cross-case operations engine. Pulls every pending action item from every
// case in the tumor board and surfaces them as a flat, prioritized queue.
//
// This is what makes the /today coordinator dashboard work: instead of
// scanning 12 cases to find the 4 things that need action today, the
// engine extracts the action items themselves.

const TERMINAL_STAGES = ["closed", "deferred", "not_indicated"];

const PENDING_DAYS = {
  insurance_warning: 7,    // > 7 days since submission → warning
  insurance_overdue:  14,  // > 14 days → overdue
  lab_overdue:         5,  // > 5 days since lab ordered → overdue
};

// Days between two date-only strings (YYYY-MM-DD)
function daysFromNow(isoDate) {
  if (!isoDate) return null;
  const target = new Date(isoDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function daysSinceISO(isoDate) {
  if (!isoDate) return null;
  const start = new Date(isoDate + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((today - start) / 86400000);
}

function caseSummary(c) {
  const parts = [
    c.patient?.cancerType ? c.patient.cancerType.split("(")[0].trim() : null,
    c.patient?.priorLines ? `${c.patient.priorLines}L` : null,
    c.patient?.ecog !== "" && c.patient?.ecog !== undefined ? `ECOG ${c.patient.ecog}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// ─── Extract pending items across the board ──────────────────────────────
//
// Returns array of items, each:
//   { id, caseId, caseLabel, caseSummary, stage, assignedTo, escalated,
//     type, urgency, icon, label, daysSince?, daysUntil?, payload? }
//
// `urgency` is one of: overdue | due_today | due_this_week | follow_up | escalated
export function computePendingItems(board) {
  if (!board || board.length === 0) return [];
  const items = [];
  let n = 0;
  const mkId = () => `it_${++n}`;

  board.forEach(c => {
    const stage = c.stage || "pending_review";
    if (TERMINAL_STAGES.includes(stage)) return;
    const tl = c.timeline || {};
    const base = {
      caseId: c.id,
      caseLabel: c.patientLabel,
      caseSummary: caseSummary(c),
      stage,
      assignedTo: c.assignedTo || "",
      escalated: !!c.escalated,
    };

    // Escalations — most prominent
    if (c.escalated) {
      items.push({
        ...base, id: mkId(), type: "escalated", urgency: "escalated",
        icon: "🚩",
        label: c.escalationReason ? `Escalated · ${c.escalationReason}` : "Escalated for physician review",
        payload: { flaggedAt: c.escalationFlaggedAt },
      });
    }

    // Overdue labs
    (tl.pendingLabs || []).forEach(lab => {
      if (lab.status === "complete") return;
      if (!lab.orderedAt) return;
      const days = daysSinceISO(lab.orderedAt);
      if (days === null) return;
      if (days > PENDING_DAYS.lab_overdue) {
        items.push({
          ...base, id: mkId(), type: "lab_overdue", urgency: "overdue",
          icon: "🧪",
          label: `${lab.name} — overdue ${days} days`,
          payload: { labId: lab.id, labName: lab.name, daysSince: days },
        });
      }
    });

    // Insurance pending decision
    if (tl.insurance?.status === "submitted" && tl.insurance.submittedAt) {
      const days = daysSinceISO(tl.insurance.submittedAt);
      if (days > PENDING_DAYS.insurance_overdue) {
        items.push({
          ...base, id: mkId(), type: "insurance_overdue", urgency: "overdue",
          icon: "💳",
          label: `Insurance decision overdue — submitted ${days} days ago`,
          payload: { daysSince: days },
        });
      } else if (days > PENDING_DAYS.insurance_warning) {
        items.push({
          ...base, id: mkId(), type: "insurance_pending", urgency: "due_this_week",
          icon: "💳",
          label: `Insurance decision pending ${days} days`,
          payload: { daysSince: days },
        });
      }
    }
    // Appeals always demand attention
    if (tl.insurance?.status === "appealing") {
      items.push({
        ...base, id: mkId(), type: "insurance_appeal", urgency: "due_this_week",
        icon: "⚖️",
        label: "Insurance appeal in progress",
      });
    }
    // Denied insurance is escalation-worthy
    if (tl.insurance?.status === "denied" && !c.escalated) {
      items.push({
        ...base, id: mkId(), type: "insurance_denied", urgency: "overdue",
        icon: "✗",
        label: "Insurance DENIED — appeal pathway needed",
      });
    }

    // Apheresis upcoming or overdue
    if (tl.apheresis?.scheduledAt && !tl.apheresis.performedAt) {
      const d = daysFromNow(tl.apheresis.scheduledAt);
      if (d === null) {}
      else if (d < 0) {
        items.push({
          ...base, id: mkId(), type: "apheresis_overdue", urgency: "overdue",
          icon: "🩸",
          label: `Apheresis overdue (was scheduled ${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""} ago)`,
        });
      } else if (d === 0) {
        items.push({
          ...base, id: mkId(), type: "apheresis_today", urgency: "due_today",
          icon: "🩸",
          label: "Apheresis today",
        });
      } else if (d <= 7) {
        items.push({
          ...base, id: mkId(), type: "apheresis_week", urgency: "due_this_week",
          icon: "🩸",
          label: `Apheresis in ${d} day${d !== 1 ? "s" : ""}`,
          payload: { daysUntil: d },
        });
      }
    }

    // Manufacturing arriving
    if (tl.manufacturing?.expectedDeliveryAt && !tl.manufacturing.receivedAt) {
      const d = daysFromNow(tl.manufacturing.expectedDeliveryAt);
      if (d === null) {}
      else if (d < 0) {
        items.push({
          ...base, id: mkId(), type: "mfg_overdue", urgency: "overdue",
          icon: "🧬",
          label: `Manufacturing overdue — expected ${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""} ago`,
        });
      } else if (d === 0) {
        items.push({
          ...base, id: mkId(), type: "mfg_today", urgency: "due_today",
          icon: "🧬",
          label: "Manufacturing arrives today",
        });
      } else if (d <= 7) {
        items.push({
          ...base, id: mkId(), type: "mfg_week", urgency: "due_this_week",
          icon: "🧬",
          label: `Manufacturing arrives in ${d} day${d !== 1 ? "s" : ""}`,
          payload: { daysUntil: d },
        });
      }
    }

    // Infusion upcoming
    if (tl.infusion?.scheduledAt && !tl.infusion.performedAt) {
      const d = daysFromNow(tl.infusion.scheduledAt);
      if (d === null) {}
      else if (d < 0) {
        items.push({
          ...base, id: mkId(), type: "infusion_overdue", urgency: "overdue",
          icon: "💉",
          label: `Infusion overdue (was scheduled ${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""} ago)`,
        });
      } else if (d === 0) {
        items.push({
          ...base, id: mkId(), type: "infusion_today", urgency: "due_today",
          icon: "💉",
          label: "Infusion today",
        });
      } else if (d <= 7) {
        items.push({
          ...base, id: mkId(), type: "infusion_week", urgency: "due_this_week",
          icon: "💉",
          label: `Infusion in ${d} day${d !== 1 ? "s" : ""}`,
          payload: { daysUntil: d },
        });
      }
    }

    // Reassessment due (nextActionDate)
    if (c.nextActionDate) {
      const d = daysFromNow(c.nextActionDate);
      if (d === null) {}
      else if (d < 0) {
        items.push({
          ...base, id: mkId(), type: "reassessment_overdue", urgency: "overdue",
          icon: "⏰",
          label: `Reassessment overdue ${Math.abs(d)} day${Math.abs(d) !== 1 ? "s" : ""}`,
          payload: { daysSince: Math.abs(d) },
        });
      } else if (d === 0) {
        items.push({
          ...base, id: mkId(), type: "reassessment_today", urgency: "due_today",
          icon: "⏰",
          label: "Reassessment due today",
        });
      } else if (d <= 7) {
        items.push({
          ...base, id: mkId(), type: "reassessment_week", urgency: "due_this_week",
          icon: "⏰",
          label: `Reassessment due in ${d} day${d !== 1 ? "s" : ""}`,
          payload: { daysUntil: d },
        });
      }
    }

    // Tasks — overdue / due today / due this week
    (c.tasks || []).forEach(task => {
      if (task.status === "complete") return;
      if (!task.dueDate) return;
      const due = new Date(task.dueDate + "T00:00:00");
      const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
      const d = Math.round((due - todayD) / 86400000);
      const prioIcon = task.priority === "high" ? "🔥" : "✓";
      if (d < 0) {
        items.push({
          ...base, id: mkId(), type: "task_overdue", urgency: "overdue",
          icon: prioIcon,
          label: `Task overdue ${Math.abs(d)}d: ${task.title}`,
          assignedTo: task.assignedTo || base.assignedTo,
          payload: { taskId: task.id, daysSince: Math.abs(d), priority: task.priority },
        });
      } else if (d === 0) {
        items.push({
          ...base, id: mkId(), type: "task_today", urgency: "due_today",
          icon: prioIcon,
          label: `Task due today: ${task.title}`,
          assignedTo: task.assignedTo || base.assignedTo,
          payload: { taskId: task.id, priority: task.priority },
        });
      } else if (d <= 7) {
        items.push({
          ...base, id: mkId(), type: "task_week", urgency: "due_this_week",
          icon: prioIcon,
          label: `Task due in ${d}d: ${task.title}`,
          assignedTo: task.assignedTo || base.assignedTo,
          payload: { taskId: task.id, daysUntil: d, priority: task.priority },
        });
      }
    });

    // Blocked tasks always surface (even without due date)
    (c.tasks || []).forEach(task => {
      if (task.status !== "blocked") return;
      items.push({
        ...base, id: mkId(), type: "task_blocked", urgency: "due_this_week",
        icon: "▲",
        label: `Task blocked: ${task.title}`,
        assignedTo: task.assignedTo || base.assignedTo,
        payload: { taskId: task.id },
      });
    });

    // Cases in pending_review for too long (>5 days)
    if (stage === "pending_review") {
      const days = daysSinceISO(c.addedAt?.slice(0, 10));
      if (days !== null && days > 5) {
        items.push({
          ...base, id: mkId(), type: "review_overdue", urgency: "overdue",
          icon: "⚠️",
          label: `Awaiting tumor board review for ${days} days`,
          payload: { daysSince: days },
        });
      }
    }
  });

  return items;
}

// ─── Grouping + counts ────────────────────────────────────────────────────
export function groupByUrgency(items) {
  return {
    overdue:       items.filter(i => i.urgency === "overdue"),
    due_today:     items.filter(i => i.urgency === "due_today"),
    due_this_week: items.filter(i => i.urgency === "due_this_week"),
    escalated:     items.filter(i => i.urgency === "escalated"),
    follow_up:     items.filter(i => i.urgency === "follow_up"),
  };
}

export function summarizeOps(items) {
  const grouped = groupByUrgency(items);
  return {
    total:         items.length,
    overdue:       grouped.overdue.length,
    due_today:     grouped.due_today.length,
    due_this_week: grouped.due_this_week.length,
    escalated:     grouped.escalated.length,
  };
}

// ─── Filtering helpers ────────────────────────────────────────────────────
export function filterByAssignee(items, assignee) {
  if (!assignee || assignee === "__all__") return items;
  if (assignee === "__unassigned__") return items.filter(i => !i.assignedTo);
  return items.filter(i => (i.assignedTo || "").toLowerCase() === assignee.toLowerCase());
}

// Unique assignees in the queue
export function uniqueAssignees(items) {
  const set = new Set();
  items.forEach(i => { if (i.assignedTo) set.add(i.assignedTo); });
  return Array.from(set).sort();
}

// ─── Display metadata ─────────────────────────────────────────────────────
export const URGENCY_META = {
  overdue:       { label: "Overdue",       color: "#b54a2c" },
  due_today:     { label: "Due today",      color: "#c4a661" },
  due_this_week: { label: "This week",      color: "#4c6b8c" },
  escalated:     { label: "Escalated",      color: "#b54a2c" },
  follow_up:     { label: "Follow-up",      color: "#6b645a" },
};
