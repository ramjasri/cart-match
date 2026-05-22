// src/data/citations.js
// Structured source citations for every product in the rule library.
// Used by /criteria UI rendering and /api/criteria/v1.json export.
//
// Each entry: { bla, fdaApprovalDate, pivotalTrials[] }
//   bla:              FDA Biologics License Application number (e.g., "125643")
//   fdaApprovalDate:  ISO date of first FDA approval (subsequent indications listed in pivotalTrials)
//   pivotalTrials:    array of { name, nctId, indication } — registry-grade citation per study

export const PRODUCT_CITATIONS = {
  yescarta: {
    bla: "125643",
    fdaApprovalDate: "2017-10-18",
    pivotalTrials: [
      { name: "ZUMA-1",  nctId: "NCT02348216", indication: "LBCL 3L+ (initial approval)" },
      { name: "ZUMA-7",  nctId: "NCT03391466", indication: "LBCL 2L+ (primary refractory / early relapse)" },
      { name: "ZUMA-5",  nctId: "NCT03105336", indication: "FL 3L+" },
    ],
  },
  kymriah: {
    bla: "125646",
    fdaApprovalDate: "2017-08-30",
    pivotalTrials: [
      { name: "ELIANA",  nctId: "NCT02435849", indication: "R/R B-ALL ≤25 yo (initial approval)" },
      { name: "JULIET",  nctId: "NCT02445248", indication: "R/R DLBCL" },
      { name: "ELARA",   nctId: "NCT03568461", indication: "R/R FL 3L+" },
    ],
  },
  breyanzi: {
    bla: "761113",
    fdaApprovalDate: "2021-02-05",
    pivotalTrials: [
      { name: "TRANSCEND-NHL-001", nctId: "NCT02631044", indication: "R/R LBCL 3L+ (initial approval)" },
      { name: "TRANSFORM",         nctId: "NCT03575351", indication: "LBCL 2L+ (primary refractory / early relapse)" },
      { name: "TRANSCEND-FL",      nctId: "NCT04245839", indication: "R/R FL 3L+" },
      { name: "TRANSCEND CLL 004", nctId: "NCT03331198", indication: "R/R CLL/SLL after BTKi + venetoclax" },
    ],
  },
  tecartus: {
    bla: "761151",
    fdaApprovalDate: "2020-07-24",
    pivotalTrials: [
      { name: "ZUMA-2", nctId: "NCT02601313", indication: "R/R MCL after BTKi (initial approval)" },
      { name: "ZUMA-3", nctId: "NCT02614066", indication: "Adult R/R B-ALL" },
    ],
  },
  abecma: {
    bla: "125736",
    fdaApprovalDate: "2021-03-26",
    pivotalTrials: [
      { name: "KarMMa",   nctId: "NCT03361748", indication: "R/R MM 4L+ (initial approval)" },
      { name: "KarMMa-3", nctId: "NCT03651128", indication: "R/R MM 3L+ (confirmatory)" },
    ],
  },
  carvykti: {
    bla: "125743",
    fdaApprovalDate: "2022-02-28",
    pivotalTrials: [
      { name: "CARTITUDE-1", nctId: "NCT03548207", indication: "R/R MM 4L+ (initial approval)" },
      { name: "CARTITUDE-4", nctId: "NCT04181827", indication: "R/R MM 1L+ lenalidomide-refractory (new indication)" },
    ],
  },
  tecvayli: {
    bla: "761291",
    fdaApprovalDate: "2022-10-25",
    pivotalTrials: [
      { name: "MajesTEC-1", nctId: "NCT04557098", indication: "R/R MM 4L+ (BCMA bispecific)" },
    ],
  },
  talvey: {
    bla: "761342",
    fdaApprovalDate: "2023-08-09",
    pivotalTrials: [
      { name: "MonumenTAL-1", nctId: "NCT03399799", indication: "R/R MM 4L+ (GPRC5D bispecific)" },
    ],
  },
  elrexfio: {
    bla: "761345",
    fdaApprovalDate: "2023-08-14",
    pivotalTrials: [
      { name: "MagnetisMM-3", nctId: "NCT04649359", indication: "R/R MM 4L+ (BCMA bispecific)" },
    ],
  },
  epkinly: {
    bla: "761324",
    fdaApprovalDate: "2023-05-19",
    pivotalTrials: [
      { name: "EPCORE-NHL-1", nctId: "NCT03625037", indication: "R/R DLBCL 3L+ · R/R FL 3L+" },
    ],
  },
  columvi: {
    bla: "761309",
    fdaApprovalDate: "2023-06-15",
    pivotalTrials: [
      { name: "NP30179", nctId: "NCT03075696", indication: "R/R DLBCL 2L+ · R/R FL 2L+ (obinutuzumab pretreatment required)" },
    ],
  },
  lunsumio: {
    bla: "761263",
    fdaApprovalDate: "2022-12-22",
    pivotalTrials: [
      { name: "GO29781", nctId: "NCT02500407", indication: "R/R FL grade 1-3A 2L+ (fixed-duration)" },
    ],
  },
};

// ─── NCCN reference URLs (canonical) ───────────────────────────────────────
export const NCCN_REFS = {
  "B-Cell Lymphomas": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1480",
  "CLL/SLL":          "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1478",
  "ALL":              "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1410",
  "Multiple Myeloma": "https://www.nccn.org/guidelines/guidelines-detail?category=1&id=1445",
};

// ─── ClinicalTrials.gov canonical URL builder ──────────────────────────────
export const ctGovUrl = (nctId) => `https://clinicaltrials.gov/study/${nctId}`;

// ─── Catalog metadata (versioning) ─────────────────────────────────────────
export const CATALOG_META = {
  version:     "v1.0.0",
  schemaUrl:   "https://cart-match.vercel.app/api/criteria/v1.json",
  asOf:        "2026-05",
  lastUpdated: new Date().toISOString().slice(0, 10),
  reviewedBy:  "CellTx Match clinical content team",
  changelog: [
    { date: "2026-05", change: "Initial catalog v1.0.0 — 12 FDA-approved products + 6 disease pathways" },
  ],
};
