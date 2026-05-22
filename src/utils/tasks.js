// src/utils/tasks.js
// Per-case task management — the CRM layer that sits on top of the
// timeline + operations infrastructure.
//
// Each case carries a tasks[] array. Each task has:
//   - title (free text, what needs to be done)
//   - assignedTo (free text — coordinator/physician/etc.)
//   - dueDate (ISO date or null)
//   - priority (high | normal | low)
//   - status (open | in_progress | complete | blocked)
//   - category (admin | clinical | communication | coordination | followup)
//   - notes (optional context)
//   - createdAt, createdBy, completedAt, completedBy
//
// This is what coordinators currently track in spreadsheets / sticky notes.
// Bringing it into the platform consolidates the operational workflow and
// gives the activity log + operations dashboard another set of signals to
// surface.

let _taskSeq = 0;
function nextTaskId() {
  _taskSeq += 1;
  return `t_${Date.now()}_${_taskSeq}_${Math.random().toString(36).slice(2, 6)}`;
}

export const TASK_PRIORITIES = [
  { id: "high",   label: "High",    dot: "#b54a2c" },
  { id: "normal", label: "Normal",  dot: "#6b645a" },
  { id: "low",    label: "Low",     dot: "#98908380" },
];

export const TASK_STATUSES = [
  { id: "open",         label: "Open",         icon: "○", dot: "#1a1815" },
  { id: "in_progress",  label: "In progress",  icon: "◐", dot: "#c4a661" },
  { id: "complete",     label: "Complete",     icon: "●", dot: "#5a7a4a" },
  { id: "blocked",      label: "Blocked",      icon: "▲", dot: "#b54a2c" },
];

export const TASK_CATEGORIES = [
  { id: "admin",         label: "Admin · paperwork",         icon: "▢" },
  { id: "clinical",      label: "Clinical · labs · imaging", icon: "▽" },
  { id: "insurance",     label: "Insurance · auth",          icon: "▼" },
  { id: "communication", label: "Communication · calls",     icon: "◇" },
  { id: "coordination",  label: "Coordination · scheduling", icon: "◆" },
  { id: "followup",      label: "Follow-up · toxicity",      icon: "◯" },
];

export function newTask({ title, assignedTo = "", dueDate = null, priority = "normal", status = "open", category = "admin", notes = "", createdBy = "system" }) {
  return {
    id:           nextTaskId(),
    title:        (title || "").trim(),
    assignedTo,
    dueDate,
    priority,
    status,
    category,
    notes,
    createdAt:    new Date().toISOString(),
    createdBy,
    completedAt:  null,
    completedBy:  null,
  };
}

// ─── Status / urgency helpers ──────────────────────────────────────────────
export function isTaskOverdue(task) {
  if (!task || task.status === "complete") return false;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate + "T23:59:59");
  return due < new Date();
}

export function isTaskDueSoon(task) {
  if (!task || task.status === "complete") return false;
  if (!task.dueDate) return false;
  const due = new Date(task.dueDate + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due - now) / 86400000);
  return diffDays >= 0 && diffDays <= 3;
}

export function taskDaysOverdue(task) {
  if (!task.dueDate) return null;
  const due = new Date(task.dueDate + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((now - due) / 86400000);
}

// ─── Aggregates per case ──────────────────────────────────────────────────
export function summarizeTasks(tasks) {
  const list = tasks || [];
  return {
    total:        list.length,
    open:         list.filter(t => t.status === "open").length,
    inProgress:   list.filter(t => t.status === "in_progress").length,
    complete:     list.filter(t => t.status === "complete").length,
    blocked:      list.filter(t => t.status === "blocked").length,
    overdue:      list.filter(isTaskOverdue).length,
    dueSoon:      list.filter(isTaskDueSoon).length,
  };
}

// ─── Display formatters ───────────────────────────────────────────────────
export function taskStatusMeta(statusId) {
  return TASK_STATUSES.find(s => s.id === statusId) || TASK_STATUSES[0];
}
export function taskPriorityMeta(priorityId) {
  return TASK_PRIORITIES.find(p => p.id === priorityId) || TASK_PRIORITIES[1];
}
export function taskCategoryMeta(categoryId) {
  return TASK_CATEGORIES.find(c => c.id === categoryId) || TASK_CATEGORIES[0];
}

// ─── Suggested starter tasks by stage ─────────────────────────────────────
// When a coordinator clicks "Add starter tasks" on a fresh case, populate
// with the typical workflow items for the current pipeline stage.
export const STARTER_TASKS_BY_STAGE = {
  pending_review: [
    { title: "Confirm tumor board scheduling for this case",         category: "coordination", priority: "high" },
    { title: "Send pre-board summary to attending oncologist",       category: "communication" },
  ],
  approved: [
    { title: "Identify FACT-accredited CAR-T center for referral",   category: "coordination", priority: "high" },
    { title: "Initiate insurance prior authorization",                category: "insurance",   priority: "high" },
    { title: "Request outside records (path report, prior tx)",       category: "admin",       priority: "high" },
    { title: "Confirm target antigen IHC on biopsy",                   category: "clinical" },
  ],
  referred: [
    { title: "Confirm referral receipt with CAR-T center",            category: "communication", priority: "high" },
    { title: "Submit prior auth packet to insurance",                  category: "insurance",     priority: "high" },
    { title: "Schedule apheresis evaluation visit",                    category: "coordination" },
    { title: "Order baseline organ function labs (LFTs, CMP, LVEF)",   category: "clinical" },
  ],
  apheresis: [
    { title: "Confirm apheresis appointment with patient",            category: "communication", priority: "high" },
    { title: "Coordinate transportation if needed",                    category: "coordination" },
    { title: "Hold/adjust steroids per institutional protocol",        category: "clinical",      priority: "high" },
  ],
  manufacturing: [
    { title: "Schedule conditioning chemotherapy",                     category: "coordination", priority: "high" },
    { title: "Pre-admission counseling on CRS/ICANS",                  category: "communication" },
    { title: "Confirm infusion bed availability with admit team",      category: "coordination" },
    { title: "Bridging therapy plan if interim progression",           category: "clinical" },
  ],
  infused: [
    { title: "CRS/ICANS toxicity monitoring (daily)",                  category: "clinical",     priority: "high" },
    { title: "Day 0 vitals + neurologic exam baseline",                category: "clinical",     priority: "high" },
    { title: "Family meeting · expectations for hospitalization",      category: "communication" },
  ],
  follow_up_30: [
    { title: "Day 30 PET/CT or bone marrow response assessment",       category: "clinical",     priority: "high" },
    { title: "Day 30 labs (CBC, CMP, lymphocyte subsets)",             category: "clinical" },
    { title: "Late toxicity check (cytopenia, infection)",             category: "followup" },
  ],
  follow_up_90: [
    { title: "Day 90 response assessment",                             category: "clinical",     priority: "high" },
    { title: "Immune reconstitution panel",                            category: "clinical" },
    { title: "Survivorship planning · long-term follow-up",            category: "followup" },
  ],
};

export function suggestStarterTasks(stage) {
  const templates = STARTER_TASKS_BY_STAGE[stage] || [];
  return templates.map(t => newTask({
    ...t,
    status: "open",
    createdBy: "system",
  }));
}
