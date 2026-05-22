// src/utils/actions.js
// Maps eligibility blocks/warnings to specific clinical actions and
// generates a consolidated "path to eligibility" or "referral steps" list.

// ─── Action rules for blocking criteria ─────────────────────────────────────
// Each rule has a `source` indicating where the threshold/exclusion comes from.
export const BLOCK_ACTIONS = [
  { match: /ECOG/i,                        action: "Optimize performance status (PT/OT, palliative care, supportive care) and reassess ECOG in 4 weeks",
    source: "FDA product labels (all 12) — performance status exclusion criteria" },
  { match: /ALT|AST/i,                     action: "Repeat LFTs in 1–2 weeks · review hepatotoxic medications · hepatology consult if persistent",
    source: "FDA product labels — organ function entry criteria (PI §5 Warnings)" },
  { match: /Renal function|Creatinine|CrCl/i, action: "Recheck creatinine + 24-hr CrCl · ensure adequate hydration · nephrology consult if persistent",
    source: "FDA product labels — organ function entry criteria (PI §2 Patient Selection)" },
  { match: /Bilirubin/i,                   action: "Repeat bilirubin · rule out cholestasis (RUQ ultrasound, GGT, alk phos)",
    source: "FDA product labels — hepatic function thresholds (PI §2)" },
  { match: /LVEF/i,                        action: "Cardiology consult · optimize HF therapy · repeat echo/MUGA in 4–6 weeks",
    source: "FDA CAR-T product labels — cardiac function for CRS tolerance (PI §5.1)" },
  { match: /SpO/i,                         action: "Pulmonology consult · PFTs and ABG · address reversible causes",
    source: "FDA CAR-T product labels — pulmonary function for CRS tolerance" },
  { match: /Cancer type not in approved/i, action: "Re-confirm pathology · explore clinical trial enrollment for off-label indications",
    source: "FDA product labels — Approved Indications section (PI §1)" },
  { match: /Requires .\d+ prior lines|prior lines.*patient has/i, action: "Continue current therapy line · re-screen at progression (manufacturer expanded-access may apply for select patients)",
    source: "FDA product labels — line-of-therapy indication threshold" },
  { match: /negative — product requires/i, action: "Re-biopsy with IHC and/or flow cytometry · consider alternative-target therapy if confirmed negative",
    source: "FDA product labels — target antigen expression requirement" },
  { match: /Active CNS/i,                  action: "Initiate CNS-directed therapy (IT chemo, radiation) · MRI brain + CSF cytology · reassess after CNS control",
    source: "FDA product labels — CNS disease exclusion (PI §5.3 Neurologic Toxicities)" },
  { match: /Active autoimmune/i,           action: "Rheumatology consult · taper systemic immunosuppression if disease activity allows · reassess in 3–6 months",
    source: "FDA product labels — active autoimmune disease exclusion" },
  { match: /Allo-SCT only .* months ago|Allo-SCT.*minimum 6/i, action: "Wait until ≥6 months post-allo-SCT · confirm no active GVHD before referral",
    source: "FDA product labels — allogeneic SCT timing exclusion (PI §5)" },
  { match: /Auto-SCT.*months/i,            action: "Wait the required interval post-auto-SCT before referral",
    source: "FDA product labels — autologous SCT timing exclusion" },
  { match: /Prior CAR-T|Prior CD19-targeted/i, action: "Document prior CAR-T product and date · consider alternate-target therapy",
    source: "FDA product labels — prior CAR-T / target-directed therapy exclusion" },
];

// ─── Action rules for warnings (missing data / soft issues) ─────────────────
export const WARNING_ACTIONS = [
  { match: /CD19 status unknown/i,    action: "Order CD19 IHC on most recent biopsy specimen (typically positive in B-cell malignancies)",
    source: "FDA CD19-directed product labels — target antigen confirmation recommendation" },
  { match: /BCMA status unknown/i,    action: "Order BCMA IHC or flow cytometry on bone marrow biopsy",
    source: "FDA BCMA-directed product labels — target antigen confirmation" },
  { match: /CD20 status unknown/i,    action: "Order CD20 IHC on biopsy specimen (typically positive in B-cell lymphomas)",
    source: "FDA CD20-directed bispecific labels (Epkinly, Columvi, Lunsumio)" },
  { match: /GPRC5D status unknown/i,  action: "GPRC5D testing has limited availability — confirm via specialty/reference lab if pursuing Talvey",
    source: "FDA Talvey label · MonumenTAL-1 (NCT03399799)" },
  { match: /Prior IMiD required/i,    action: "Confirm lenalidomide/pomalidomide exposure via outside medical records",
    source: "FDA MM product labels — prior therapy requirement (PI §1 Indications)" },
  { match: /Prior PI required/i,      action: "Confirm bortezomib/carfilzomib exposure via outside medical records",
    source: "FDA MM product labels — prior therapy requirement (PI §1 Indications)" },
  { match: /Prior anti-CD38 required/i, action: "Confirm daratumumab/isatuximab exposure via outside medical records",
    source: "FDA MM product labels — prior therapy requirement (PI §1 Indications)" },
  { match: /Prior allo-SCT/i,         action: "Document allo-SCT date · confirm no active GVHD · taper immunosuppression if possible",
    source: "FDA product labels — allogeneic SCT history confirmation" },
  { match: /obinutuzumab/i,           action: "Schedule obinutuzumab 1000 mg IV 7 days before glofitamab cycle 1 — coordinate with infusion center",
    source: "FDA Columvi label · NP30179 protocol (NCT03075696)" },
];

export function findAction(text, type = "block") {
  const rules = type === "warning" ? WARNING_ACTIONS : BLOCK_ACTIONS;
  for (const r of rules) {
    if (r.match.test(text)) return r.action;
  }
  return null;
}

// ─── Consolidated "path to potential eligibility" ───────────────────────────
export function getPathToEligibility(result) {
  const steps = new Set();

  result.blocks.forEach(b => {
    if (/ECOG/i.test(b))                          steps.add("Optimize performance status — PT/OT, palliative input, supportive care");
    if (/ALT|AST|Bilirubin/i.test(b))             steps.add("Repeat liver function tests in 1–2 weeks · review hepatotoxic medications");
    if (/Renal function|Creatinine|CrCl/i.test(b)) steps.add("Recheck creatinine + CrCl · hydrate · nephrology consult if persistent");
    if (/LVEF/i.test(b))                          steps.add("Cardiology evaluation · optimize HF therapy · repeat echo in 4–6 weeks");
    if (/SpO/i.test(b))                           steps.add("Pulmonology evaluation · address reversible respiratory causes");
    if (/Cancer type not in/i.test(b))            steps.add("Confirm pathology · screen for clinical trials of off-label products");
    if (/prior lines/i.test(b))                   steps.add("Complete current line · re-screen at progression");
    if (/negative — product requires/i.test(b))   steps.add("Re-biopsy with IHC/flow for target marker confirmation");
    if (/Active CNS/i.test(b))                    steps.add("Treat CNS disease first · reassess after CNS control");
    if (/autoimmune/i.test(b))                    steps.add("Rheumatology consult · taper immunosuppression if feasible");
    if (/Allo-SCT/i.test(b))                      steps.add("Wait until ≥6 months post-allo-SCT · document GVHD status");
  });

  result.warnings.forEach(w => {
    if (/status unknown/i.test(w))                steps.add("Complete biomarker testing (IHC/flow cytometry) on tumor specimen");
    if (/Prior .* required.*confirm exposure/i.test(w)) steps.add("Document prior therapy exposures via outside medical records");
    if (/Prior allo-SCT/i.test(w))                steps.add("Document allo-SCT date and current GVHD status");
    if (/obinutuzumab/i.test(w))                  steps.add("Schedule obinutuzumab pretreatment 7 days before glofitamab cycle 1");
  });

  if (steps.size > 0) steps.add("Reassess eligibility in 4–6 weeks with updated data");

  return Array.from(steps);
}

// ─── Referral steps for ELIGIBLE products ───────────────────────────────────
export function getReferralSteps(product) {
  const isBispecific = product.type === "bispecific";
  return isBispecific
    ? [
        "Refer to a center experienced with bispecific antibody administration",
        "Plan inpatient admission for step-up dosing (CRS monitoring)",
        "Insurance prior authorization · confirm REMS enrollment if required",
        "Patient counseling: CRS/ICANS, infection risk, ongoing dosing commitment",
      ]
    : [
        "Refer to CAR-T treatment center (FACT-accredited)",
        "Schedule apheresis evaluation · confirm adequate T-cell count",
        "Plan bridging therapy if needed (4–6 week manufacturing wait)",
        "Insurance prior authorization · confirm CAR-T center contract",
        "Patient counseling: CRS, ICANS, hospitalization expectations",
      ];
}
