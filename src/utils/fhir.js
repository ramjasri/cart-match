// src/utils/fhir.js
// FHIR R4 Bundle export for cell-therapy referral cases.
//
// EHR vendors (Epic, Oracle Health, Athenahealth) evaluate clinical software
// against a single binary question: "Can it integrate?" Answering that
// requires speaking their native data model — FHIR. This utility converts
// a CellTx case into a FHIR Bundle containing Patient, Condition,
// Observation, ServiceRequest, Task, CarePlan, and Provenance resources.
//
// Design choices:
//  - PATIENT is de-identified by default (no PHI fields). Caller can pass
//    a label/MRN if they have one. Architectural commitment: client-side
//    export only — server never sees PHI.
//  - Resource IDs are deterministic (case ID + suffix) so re-exports are
//    idempotent.
//  - Codes use established systems where possible (LOINC for labs, ICD-10
//    for conditions, SNOMED CT for procedures).
//  - Bundle type is "collection" (not "transaction") — this is a read-only
//    snapshot, not a write-back to an EHR.

const FHIR_VERSION = "4.0.1";
const SYSTEM_INTERNAL = "https://cart-match.vercel.app/fhir/case-id";

// ─── Code system mappings ─────────────────────────────────────────────────
const CANCER_TO_ICD10 = {
  "DLBCL":                "C83.3",  // Diffuse large B-cell lymphoma
  "Follicular":           "C82.9",  // Follicular lymphoma, unspecified
  "Mantle":               "C83.1",  // Mantle cell lymphoma
  "CLL":                  "C91.1",  // Chronic lymphocytic leukemia
  "SLL":                  "C83.0",  // Small cell B-cell lymphoma
  "Multiple myeloma":     "C90.0",
  "ALL":                  "C91.0",  // Acute lymphoblastic leukemia
  "PMBCL":                "C85.2",  // Mediastinal (thymic) large B-cell lymphoma
};

const STAGE_TO_SNOMED = {
  // SNOMED codes for clinical stages (best-effort; some are placeholders)
  pending_review:  { code: "182843003", display: "Awaiting clinical assessment" },
  discussed:       { code: "385676005", display: "Discussed with multidisciplinary team" },
  approved:        { code: "184162001", display: "Approved for treatment" },
  deferred:        { code: "182857001", display: "Therapy deferred" },
  not_indicated:   { code: "385669000", display: "Treatment not indicated" },
  referred:        { code: "3457005",   display: "Patient referral" },
  apheresis:       { code: "11800006",  display: "Leukapheresis procedure" },
  manufacturing:   { code: "415163004", display: "Cell therapy product manufacturing" },
  infused:         { code: "419964006", display: "Immunotherapy procedure" },
  follow_up_30:    { code: "390906007", display: "Follow-up assessment" },
  follow_up_90:    { code: "390906007", display: "Follow-up assessment" },
  closed:          { code: "385660001", display: "Treatment episode complete" },
};

const BIOMARKER_LOINC = {
  CD19:   { code: "84219-2", display: "CD19 expression" },
  BCMA:   { code: "100929-1", display: "BCMA expression" },
  CD20:   { code: "33747-0",  display: "CD20 expression" },
  GPRC5D: { code: "0",        display: "GPRC5D expression" }, // No standard LOINC yet
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function classifyCancer(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("dlbcl") || c.includes("large b")) return "DLBCL";
  if (c.includes("follicular")) return "Follicular";
  if (c.includes("mantle")) return "Mantle";
  if (c.includes("cll")) return "CLL";
  if (c.includes("sll")) return "SLL";
  if (c.includes("myeloma")) return "Multiple myeloma";
  if (c.includes("all") || c.includes("leukemia")) return "ALL";
  if (c.includes("pmbcl")) return "PMBCL";
  return null;
}

function ref(resourceType, id) {
  return { reference: `${resourceType}/${id}` };
}

function makeId(caseId, suffix) {
  return `${caseId}-${suffix}`;
}

// ─── Resource builders ────────────────────────────────────────────────────
function buildPatient(caseData) {
  const id = makeId(caseData.id, "patient");
  return {
    resourceType: "Patient",
    id,
    identifier: [{
      system: SYSTEM_INTERNAL,
      value: caseData.id,
      use: "usual",
    }],
    // No name, birthDate, or other PHI by default — this is a de-identified
    // export. Customers who need full PHI export use their own EHR's data
    // (we never store it).
    meta: {
      tag: [{
        system: "http://terminology.hl7.org/CodeSystem/v3-ObservationValue",
        code: "DEIDENTIFIED",
        display: "De-identified patient record",
      }],
    },
    extension: [{
      url: "https://cart-match.vercel.app/fhir/StructureDefinition/internal-label",
      valueString: caseData.patientLabel || "Patient",
    }],
  };
}

function buildCondition(caseData) {
  const cancerKey = classifyCancer(caseData.patient?.cancerType);
  const icd10 = cancerKey ? CANCER_TO_ICD10[cancerKey] : null;
  return {
    resourceType: "Condition",
    id: makeId(caseData.id, "condition-cancer"),
    clinicalStatus: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
        code: "active",
      }],
    },
    verificationStatus: {
      coding: [{
        system: "http://terminology.hl7.org/CodeSystem/condition-ver-status",
        code: "confirmed",
      }],
    },
    code: {
      coding: icd10 ? [{
        system: "http://hl7.org/fhir/sid/icd-10-cm",
        code: icd10,
        display: cancerKey,
      }] : [],
      text: caseData.patient?.cancerType || "Unspecified malignancy",
    },
    subject: ref("Patient", makeId(caseData.id, "patient")),
    extension: caseData.patient?.priorLines ? [{
      url: "https://cart-match.vercel.app/fhir/StructureDefinition/prior-lines",
      valueInteger: parseInt(caseData.patient.priorLines, 10),
    }] : undefined,
  };
}

function buildObservations(caseData) {
  const obs = [];
  const pt = caseData.patient || {};
  const subject = ref("Patient", makeId(caseData.id, "patient"));

  // ECOG performance status
  if (pt.ecog !== "" && pt.ecog !== undefined && pt.ecog !== null) {
    obs.push({
      resourceType: "Observation",
      id: makeId(caseData.id, "obs-ecog"),
      status: "final",
      category: [{
        coding: [{
          system: "http://terminology.hl7.org/CodeSystem/observation-category",
          code: "survey",
        }],
      }],
      code: {
        coding: [{
          system: "http://loinc.org",
          code: "89247-1",
          display: "ECOG Performance Status score",
        }],
      },
      subject,
      valueInteger: parseInt(pt.ecog, 10),
    });
  }

  // Biomarker observations
  ["cd19", "bcma", "cd20", "gprc5d"].forEach(marker => {
    const value = pt[marker];
    if (value && value !== "unknown") {
      const meta = BIOMARKER_LOINC[marker.toUpperCase()];
      obs.push({
        resourceType: "Observation",
        id: makeId(caseData.id, `obs-${marker}`),
        status: "final",
        category: [{
          coding: [{
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "laboratory",
          }],
        }],
        code: {
          coding: meta ? [{
            system: "http://loinc.org",
            code: meta.code,
            display: meta.display,
          }] : [],
          text: `${marker.toUpperCase()} expression`,
        },
        subject,
        valueCodeableConcept: {
          coding: [{
            system: "http://snomed.info/sct",
            code: value === "positive" ? "10828004" : "260385009",
            display: value === "positive" ? "Positive" : "Negative",
          }],
        },
      });
    }
  });

  // Lab values from patient state
  const labMap = {
    labAlt:   { code: "1742-6",   display: "Alanine aminotransferase (ALT)",  unit: "U/L" },
    labAst:   { code: "1920-8",   display: "Aspartate aminotransferase (AST)", unit: "U/L" },
    labCreat: { code: "2160-0",   display: "Creatinine",                       unit: "mg/dL" },
    labCrcl:  { code: "33914-3",  display: "Creatinine clearance",             unit: "mL/min" },
    labBil:   { code: "1975-2",   display: "Bilirubin, total",                 unit: "mg/dL" },
    labLvef:  { code: "10230-1",  display: "Left ventricular ejection fraction", unit: "%" },
    labSpo2:  { code: "59408-5",  display: "Oxygen saturation",                unit: "%" },
  };
  Object.entries(labMap).forEach(([key, meta]) => {
    const v = parseFloat(pt[key]);
    if (!isNaN(v)) {
      obs.push({
        resourceType: "Observation",
        id: makeId(caseData.id, `obs-${key.toLowerCase()}`),
        status: "final",
        category: [{
          coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "laboratory" }],
        }],
        code: {
          coding: [{ system: "http://loinc.org", code: meta.code, display: meta.display }],
        },
        subject,
        valueQuantity: {
          value: v,
          unit: meta.unit,
          system: "http://unitsofmeasure.org",
        },
      });
    }
  });

  return obs;
}

function buildServiceRequest(caseData) {
  if (!caseData.timeline?.referralCreatedAt) return null;
  const stage = caseData.stage || "pending_review";
  const stageMeta = STAGE_TO_SNOMED[stage] || STAGE_TO_SNOMED.pending_review;
  return {
    resourceType: "ServiceRequest",
    id: makeId(caseData.id, "service-referral"),
    status: caseData.stage === "closed" ? "completed"
      : caseData.stage === "deferred" || caseData.stage === "not_indicated" ? "revoked"
      : "active",
    intent: "order",
    category: [{
      coding: [{
        system: "http://snomed.info/sct",
        code: "3457005",
        display: "Patient referral",
      }],
    }],
    code: {
      coding: [{
        system: "http://snomed.info/sct",
        code: "419964006",
        display: "Cell therapy referral",
      }],
    },
    subject: ref("Patient", makeId(caseData.id, "patient")),
    reasonReference: [ref("Condition", makeId(caseData.id, "condition-cancer"))],
    authoredOn: caseData.timeline.referralCreatedAt,
    performer: caseData.timeline.referralCenter ? [{
      display: caseData.timeline.referralCenter,
    }] : undefined,
    extension: [{
      url: "https://cart-match.vercel.app/fhir/StructureDefinition/lifecycle-stage",
      valueCoding: {
        system: "http://snomed.info/sct",
        code: stageMeta.code,
        display: stageMeta.display,
      },
    }],
  };
}

function buildTasks(caseData) {
  return (caseData.tasks || []).map(t => ({
    resourceType: "Task",
    id: makeId(caseData.id, `task-${t.id}`),
    status: t.status === "complete" ? "completed"
      : t.status === "in_progress" ? "in-progress"
      : t.status === "blocked" ? "on-hold"
      : "ready",
    intent: "order",
    priority: t.priority === "high" ? "urgent" : t.priority === "low" ? "routine" : "routine",
    description: t.title,
    for: ref("Patient", makeId(caseData.id, "patient")),
    authoredOn: t.createdAt,
    lastModified: t.completedAt || t.createdAt,
    owner: t.assignedTo ? { display: t.assignedTo } : undefined,
    restriction: t.dueDate ? { period: { end: t.dueDate } } : undefined,
    businessStatus: {
      coding: [{
        system: "https://cart-match.vercel.app/fhir/CodeSystem/task-category",
        code: t.category,
        display: t.category,
      }],
    },
  }));
}

function buildCarePlan(caseData) {
  // CarePlan summarizes the entire referral journey — stage history,
  // timeline state, and current goals.
  const subject = ref("Patient", makeId(caseData.id, "patient"));
  const stage = caseData.stage || "pending_review";

  const activities = [];
  // Timeline entries as activities
  const tl = caseData.timeline || {};
  if (tl.apheresis?.scheduledAt || tl.apheresis?.performedAt) {
    activities.push({
      detail: {
        kind: "Appointment",
        code: { coding: [{ system: "http://snomed.info/sct", code: "11800006", display: "Leukapheresis" }] },
        status: tl.apheresis.performedAt ? "completed" : "scheduled",
        scheduledPeriod: tl.apheresis.scheduledAt ? { start: tl.apheresis.scheduledAt } : undefined,
      },
    });
  }
  if (tl.manufacturing?.productStartedAt || tl.manufacturing?.receivedAt) {
    activities.push({
      detail: {
        kind: "Task",
        code: { coding: [{ system: "http://snomed.info/sct", code: "415163004", display: "Cell therapy manufacturing" }] },
        status: tl.manufacturing.receivedAt ? "completed" : "in-progress",
        scheduledPeriod: {
          start: tl.manufacturing.productStartedAt,
          end: tl.manufacturing.expectedDeliveryAt || undefined,
        },
      },
    });
  }
  if (tl.infusion?.scheduledAt || tl.infusion?.performedAt) {
    activities.push({
      detail: {
        kind: "Appointment",
        code: { coding: [{ system: "http://snomed.info/sct", code: "419964006", display: "Cell therapy infusion" }] },
        status: tl.infusion.performedAt ? "completed" : "scheduled",
        scheduledPeriod: tl.infusion.scheduledAt ? { start: tl.infusion.scheduledAt } : undefined,
      },
    });
  }

  return {
    resourceType: "CarePlan",
    id: makeId(caseData.id, "careplan"),
    status: ["closed", "deferred", "not_indicated"].includes(stage) ? "completed" : "active",
    intent: "plan",
    subject,
    period: {
      start: caseData.addedAt,
    },
    addresses: [ref("Condition", makeId(caseData.id, "condition-cancer"))],
    activity: activities,
    note: caseData.notes ? [{ text: caseData.notes }] : undefined,
  };
}

function buildProvenance(caseData) {
  // Provenance captures the audit trail (every event from activity log)
  // mapped to FHIR Provenance resource per event.
  return (caseData.events || []).map(ev => ({
    resourceType: "Provenance",
    id: makeId(caseData.id, `prov-${ev.id}`),
    target: [ref("Patient", makeId(caseData.id, "patient"))],
    recorded: ev.at,
    agent: [{
      who: { display: ev.by || "system" },
      type: {
        coding: [{
          system: "http://terminology.hl7.org/CodeSystem/provenance-participant-type",
          code: ev.by === "system" ? "performer" : "author",
        }],
      },
    }],
    activity: {
      coding: [{
        system: "https://cart-match.vercel.app/fhir/CodeSystem/event-type",
        code: ev.type,
        display: ev.title,
      }],
      text: [ev.title, ev.detail].filter(Boolean).join(" — "),
    },
  }));
}

// ─── Bundle assembler ─────────────────────────────────────────────────────
export function caseToFhirBundle(caseData, { includeProvenance = true } = {}) {
  if (!caseData) return null;
  const entries = [];

  const patient = buildPatient(caseData);
  entries.push({ resource: patient });

  const condition = buildCondition(caseData);
  entries.push({ resource: condition });

  buildObservations(caseData).forEach(o => entries.push({ resource: o }));

  const sr = buildServiceRequest(caseData);
  if (sr) entries.push({ resource: sr });

  buildTasks(caseData).forEach(t => entries.push({ resource: t }));

  const cp = buildCarePlan(caseData);
  entries.push({ resource: cp });

  if (includeProvenance) {
    buildProvenance(caseData).forEach(p => entries.push({ resource: p }));
  }

  return {
    resourceType: "Bundle",
    id: `bundle-${caseData.id}`,
    meta: {
      lastUpdated: new Date().toISOString(),
      tag: [{
        system: "http://terminology.hl7.org/CodeSystem/v3-ActReason",
        code: "PUBHLTH",
        display: "Public health reporting",
      }],
      profile: ["http://hl7.org/fhir/StructureDefinition/Bundle"],
    },
    type: "collection",
    timestamp: new Date().toISOString(),
    entry: entries,
  };
}

// ─── Client-side download helper ─────────────────────────────────────────
export function downloadCaseAsFhir(caseData) {
  const bundle = caseToFhirBundle(caseData);
  if (!bundle) return;
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/fhir+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const labelClean = (caseData.patientLabel || "Patient").replace(/[^a-z0-9]/gi, "_");
  a.href = url;
  a.download = `fhir-bundle-${labelClean}-${caseData.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Public schema example (used by /api/fhir/example.json) ──────────────
// A canonical example Bundle showing the shape of our export — useful for
// EHR integration teams evaluating the data model without seeing PHI.
export const EXAMPLE_BUNDLE_SCHEMA = {
  resourceType: "Bundle",
  type: "collection",
  description: "Example FHIR R4 Bundle exported by CellTx Match per case",
  fhirVersion: FHIR_VERSION,
  resourceTypes: [
    { type: "Patient",         purpose: "De-identified subject identifier (no PHI by default)" },
    { type: "Condition",       purpose: "Underlying cancer diagnosis with ICD-10-CM coding" },
    { type: "Observation",     purpose: "ECOG, biomarker expression (CD19/BCMA/CD20/GPRC5D), lab values with LOINC codes" },
    { type: "ServiceRequest",  purpose: "Cell therapy referral with SNOMED-coded lifecycle stage" },
    { type: "Task",            purpose: "Coordinator tasks with priority, due date, assignee" },
    { type: "CarePlan",        purpose: "Apheresis → manufacturing → infusion workflow with scheduled periods" },
    { type: "Provenance",      purpose: "Per-event audit trail (every activity log entry maps to one Provenance)" },
  ],
  codeSystems: [
    { name: "ICD-10-CM",  use: "Cancer diagnoses" },
    { name: "LOINC",      use: "Lab values, biomarker assays, ECOG" },
    { name: "SNOMED CT",  use: "Lifecycle stages, procedures, condition status" },
    { name: "UCUM",       use: "Lab value units" },
  ],
};
