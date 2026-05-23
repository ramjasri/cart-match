// src/utils/centerMatching.js
// Match a patient to nearby certified cell therapy centers.
//
// MVP strategy: state-based matching with region-based fallback. No
// street-level geocoding (would require an external service + add a
// dependency). State-level granularity is good enough for "is there a
// center I can drive to" — which is the actual question a community
// oncologist asks.
//
// Returns up to N centers ranked by:
//   1. Same state as patient (preferred)
//   2. Same census region (NE/SE/MW/SW/W) as fallback
//   3. Any other certified center
// Within each tier, products matching the patient's indication come first.

import { CENTERS, regionOf, US_REGIONS } from "../data/centers.js";

function cancerToIndicationKey(cancerType) {
  const c = (cancerType || "").toLowerCase();
  if (c.includes("dlbcl") || c.includes("large b") || c.includes("pmbcl") || c.includes("lbcl")) return "dlbcl";
  if (c.includes("follicular")) return "fl";
  if (c.includes("mantle")) return "mcl";
  if (c.includes("cll") || c.includes("chronic lymphocytic")) return "cll";
  if (c.includes("myeloma")) return "mm";
  if (c.includes("acute lymphoblastic") || (c.includes("all") && !c.includes("small"))) return "all";
  return null;
}

export function findNearestCenters(pt, opts = {}) {
  const limit = opts.limit || 5;
  const indicationKey = cancerToIndicationKey(pt.cancerType);
  const stateRaw = (pt.state || "").toUpperCase().trim();
  const state = stateRaw.length === 2 ? stateRaw : null;
  const region = state ? regionOf(state) : null;
  const neighboringStates = region ? US_REGIONS[region] : [];

  // Score every center
  const scored = CENTERS.map(center => {
    let score = 0;
    let proximity = "national";
    let proximityLabel = "Other state";

    // State match
    if (state && center.state === state) {
      score += 100;
      proximity = "in-state";
      proximityLabel = "In your state";
    } else if (region && neighboringStates.includes(center.state)) {
      score += 40;
      proximity = "region";
      proximityLabel = `Same region (${region === "NE" ? "Northeast" : region === "SE" ? "Southeast" : region === "MW" ? "Midwest" : region === "SW" ? "Southwest" : "West"})`;
    }

    // Indication match
    const indicationSupported = !indicationKey || center.indications.includes(indicationKey);
    if (indicationSupported) score += 20;
    else score -= 50; // strong penalty for centers that don't treat this disease

    // FACT / NMDP accreditation (all our seeded centers have it, but score it)
    if (center.factAccredited) score += 5;
    if (center.nmdpAffiliated) score += 2;

    // Product breadth
    score += Math.min(center.products.length, 6);

    return { center, score, proximity, proximityLabel, indicationSupported };
  });

  // Sort by score descending, then alphabetical
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.center.name.localeCompare(b.center.name);
  });

  const top = scored.slice(0, limit);

  return {
    matches: top,
    summary: {
      patientState: state,
      patientRegion: region,
      indicationKey,
      inStateCount: scored.filter(s => s.proximity === "in-state" && s.indicationSupported).length,
      regionCount:  scored.filter(s => s.proximity === "region"  && s.indicationSupported).length,
      totalScreened: CENTERS.length,
    },
  };
}

// US states for the dropdown
export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

// Insurance type enum
export const INSURANCE_TYPES = [
  { id: "medicare",   label: "Medicare" },
  { id: "medicaid",   label: "Medicaid" },
  { id: "commercial", label: "Commercial / Employer" },
  { id: "va-dod",     label: "VA / DoD / TRICARE" },
  { id: "marketplace", label: "ACA Marketplace" },
  { id: "uninsured",  label: "Uninsured / Self-pay" },
  { id: "other",      label: "Other / Unknown" },
];

export const PRIOR_AUTH_STATUSES = [
  { id: "not-started", label: "Not started" },
  { id: "pending",     label: "Submitted — pending" },
  { id: "approved",    label: "Approved" },
  { id: "denied",      label: "Denied — appeal in progress" },
  { id: "na",          label: "Not yet needed" },
];

// Insurance considerations to surface in the decision packet
export function insuranceConsiderations(insuranceType, indication) {
  const out = [];
  if (insuranceType === "medicare") {
    out.push({
      label: "Medicare coverage",
      detail: "CAR-T is covered under Medicare NCD 110.24 (inpatient + outpatient). Most centers have established prior auth workflows. Verify supplemental (Medigap) for out-of-pocket exposure.",
    });
  } else if (insuranceType === "medicaid") {
    out.push({
      label: "Medicaid coverage — state variability",
      detail: "Coverage varies significantly by state Medicaid program. Confirm prior authorization pathway with the receiving center's financial counselor early.",
      severity: "caution",
    });
  } else if (insuranceType === "commercial") {
    out.push({
      label: "Commercial prior authorization",
      detail: "Most commercial payers require prior auth + peer-to-peer review. Building the clinical case for medical necessity (failure of prior lines, eligibility per FDA label) is the central work.",
    });
  } else if (insuranceType === "va-dod") {
    out.push({
      label: "VA / DoD coverage",
      detail: "VA covers CAR-T at designated VA medical centers and through community-care referrals. TRICARE requires preauthorization. Identify whether a VA center or a community center is the right route.",
    });
  } else if (insuranceType === "uninsured") {
    out.push({
      label: "Uninsured / self-pay",
      detail: "Manufacturer patient-assistance programs exist for all 6 CAR-T products and several bispecifics. Most major centers have financial navigation services. Engage the center's financial counselor BEFORE referral.",
      severity: "warning",
    });
  }
  return out;
}
