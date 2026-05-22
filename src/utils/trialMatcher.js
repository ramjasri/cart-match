// src/utils/trialMatcher.js
// Patient-level trial matcher — surfaces recruiting trials based on the full
// patient profile (cancer + biomarker + line of therapy), not just per-product.

const CT_BASE = "https://clinicaltrials.gov/api/v2/studies";

// ─── Static scoring rubric (for criteria browser) ──────────────────────────
export const TRIAL_SCORING_RULES = {
  modality: [
    { pattern: "CAR-T / chimeric antigen receptor",  weight: 6 },
    { pattern: "Bispecific / BiTE / T-cell engager", weight: 6 },
    { pattern: "Antibody-drug conjugate (ADC)",      weight: 4 },
    { pattern: "Allogeneic / off-the-shelf",         weight: 3 },
  ],
  targetMarkers: [
    { pattern: "GPRC5D",       weight: 4, note: "Alternative after BCMA failure" },
    { pattern: "CD19",         weight: 3, note: "Patient-aware: green tag when CD19+" },
    { pattern: "BCMA",         weight: 3, note: "Patient-aware: green tag when BCMA+" },
    { pattern: "CD22",         weight: 3, note: "Alternative after CD19 failure" },
    { pattern: "CD20",         weight: 2, note: "Patient-aware: green tag when CD20+" },
    { pattern: "CD79b · FcRH5", weight: 2 },
  ],
  setting: [
    { pattern: "Refractory / relapsed",   weight: 2 },
    { pattern: "Phase 3 (mature)",         weight: 2 },
    { pattern: "Phase 2",                  weight: 1 },
  ],
  penalties: [
    { pattern: "Healthy volunteer",        weight: -20 },
    { pattern: "Prevention",               weight: -8  },
    { pattern: "First-line / frontline",   weight: -2  },
  ],
  source: "Internal scoring · derived from ClinicalTrials.gov v2 intervention/condition metadata",
};


const CANCER_TERMS = {
  dlbcl: "diffuse large B-cell lymphoma",
  fl:    "follicular lymphoma",
  mcl:   "mantle cell lymphoma",
  cll:   "chronic lymphocytic leukemia",
  all:   "acute lymphoblastic leukemia",
  mm:    "multiple myeloma",
};

function classifyCancer(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("myeloma")) return "mm";
  if (c.includes("mantle") || c.includes("mcl")) return "mcl";
  if (c.includes("cll") || c.includes("sll")) return "cll";
  if (c.includes("follicular")) return "fl";
  if (c.includes("all") || c.includes("leukemia")) return "all";
  if (c.includes("dlbcl") || c.includes("lbcl") || c.includes("lymphoma") || c.includes("large b")) return "dlbcl";
  return null;
}

function parseStudy(s, pt) {
  const id   = s.protocolSection?.identificationModule ?? {};
  const des  = s.protocolSection?.designModule ?? {};
  const spon = s.protocolSection?.sponsorCollaboratorsModule ?? {};
  const intr = s.protocolSection?.armsInterventionsModule?.interventions ?? [];
  const locs = s.protocolSection?.contactsLocationsModule?.locations ?? [];

  const title    = id.briefTitle || "Untitled";
  const intrText = intr.map(i => `${i.name || ""} ${i.description || ""}`).join(" ");
  const haystack = (title + " " + intrText).toLowerCase();

  // ── Relevance scoring + tag generation ────────────────────────────────────
  let score = 0;
  const tags = [];

  // Modality (CAR-T / bispecific / ADC carry the most weight)
  if (/car[-\s]?t|chimeric antigen receptor/i.test(haystack)) { score += 6; tags.push("CAR-T"); }
  if (/bispecific|bite|t[-\s]?cell engager|tce/i.test(haystack)) { score += 6; tags.push("Bispecific"); }
  if (/antibody[-\s]?drug conjugate|adc /i.test(haystack))      { score += 4; tags.push("ADC"); }
  if (/allogene|allogeneic|off[-\s]?the[-\s]?shelf/i.test(haystack)) { score += 3; tags.push("Allogeneic"); }

  // Target marker tags — flagged "Matches" when patient is biomarker-positive
  if (/cd19/i.test(haystack))   { score += 3; tags.push(pt.cd19 === "positive"  ? "✓ Matches CD19+"  : "CD19-directed"); }
  if (/bcma/i.test(haystack))   { score += 3; tags.push(pt.bcma === "positive"  ? "✓ Matches BCMA+"  : "BCMA-directed"); }
  if (/cd20/i.test(haystack))   { score += 2; tags.push(pt.cd20 === "positive"  ? "✓ Matches CD20+"  : "CD20-directed"); }
  if (/gprc5d/i.test(haystack)) { score += 4; tags.push("GPRC5D — alt after BCMA"); }
  if (/cd22/i.test(haystack))   { score += 3; tags.push("CD22 — alt after CD19"); }
  if (/cd79b/i.test(haystack))  { score += 2; tags.push("CD79b"); }
  if (/fcrh5/i.test(haystack))  { score += 2; tags.push("FcRH5"); }

  // Patient setting
  if (/refractory|relapsed|r\/r/i.test(haystack)) score += 2;

  // Phase boost (mature trials)
  const phases = des.phases || [];
  if (phases.includes("PHASE3")) score += 2;
  if (phases.includes("PHASE2")) score += 1;

  // Penalize off-topic
  if (/healthy volunteer/i.test(haystack)) score -= 20;
  if (/prevention/i.test(haystack))         score -= 8;
  if (/first[-\s]?line|frontline/i.test(haystack)) score -= 2;

  const topLocs = locs
    .slice(0, 3)
    .map(l => [l.city, l.state, l.country].filter(Boolean).join(", "));

  return {
    nctId:      id.nctId,
    title,
    phase:      phases.map(p => p.replace("PHASE", "").replace(/_/g, "")).join("/") || "N/A",
    sponsor:    spon.leadSponsor?.name || "—",
    enrollment: des.enrollmentInfo?.count ?? null,
    locations:  topLocs,
    locationCount: locs.length,
    tags:       Array.from(new Set(tags)), // dedupe
    score,
    url:        `https://clinicaltrials.gov/study/${id.nctId}`,
  };
}

export async function fetchMatchingTrials(pt) {
  const key = classifyCancer(pt.cancerType);
  if (!key) return { trials: [], query: null };

  const term = CANCER_TERMS[key];
  const params = new URLSearchParams({
    "query.term":            term,
    "filter.overallStatus":  "RECRUITING",
    "pageSize":              "30",
    "format":                "json",
    "fields":                "NCTId|BriefTitle|OverallStatus|Phase|LeadSponsorName|EnrollmentCount|Conditions|Interventions|LocationCity|LocationState|LocationCountry|LocationFacility",
  });

  const res = await fetch(`${CT_BASE}?${params}`);
  if (!res.ok) throw new Error(`CT.gov ${res.status}`);
  const data = await res.json();

  const parsed = (data.studies ?? [])
    .map(s => parseStudy(s, pt))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    trials: parsed.slice(0, 8),
    totalFound: parsed.length,
    query: term,
    searchUrl: `https://clinicaltrials.gov/search?term=${encodeURIComponent(term)}&recrs=a`,
  };
}
