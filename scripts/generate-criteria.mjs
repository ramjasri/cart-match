// scripts/generate-criteria.mjs
// Build-time generator for /public/api/criteria/v1.json
//
// Pulls every structured rule from the source modules and emits a single
// JSON document that's served as a static asset. Runs before `vite build`
// so the JSON is always in sync with the live rule library.

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ─── Dynamic imports of pure-JS modules ────────────────────────────────────
const { BLOCK_ACTIONS, WARNING_ACTIONS } = await import(pathToFileURL(resolve(root, "src/utils/actions.js")).href);
const { PATHWAY_CATALOG }                = await import(pathToFileURL(resolve(root, "src/utils/pathways.js")).href);
const { URGENCY_RUBRIC }                 = await import(pathToFileURL(resolve(root, "src/utils/urgency.js")).href);
const { TRIAL_SCORING_RULES }            = await import(pathToFileURL(resolve(root, "src/utils/trialMatcher.js")).href);
const { PRODUCT_CITATIONS, NCCN_REFS, CATALOG_META } = await import(pathToFileURL(resolve(root, "src/data/citations.js")).href);

// ─── Extract PRODUCTS and BISPECIFICS from App.jsx via lightweight regex ──
// We don't transpile JSX in Node — instead, we parse the two known-stable
// array literals from the source. The shape is plain data (no JSX, no
// function calls), so JSON.parse-style extraction is reliable.
async function extractArrayFromSource(constName) {
  const src = await readFile(resolve(root, "src/App.jsx"), "utf-8");
  const startPattern = new RegExp(`const ${constName} = \\[`);
  const match = src.match(startPattern);
  if (!match) throw new Error(`Could not find const ${constName} in App.jsx`);
  const startIdx = match.index + match[0].length - 1; // points at the [

  // Walk through, tracking bracket depth, to find the matching closing ]
  let depth = 0;
  let inString = null;       // null | '"' | "'" | '`'
  let i = startIdx;
  for (; i < src.length; i++) {
    const ch = src[i];
    const prev = i > 0 ? src[i - 1] : "";
    if (inString) {
      if (ch === inString && prev !== "\\") inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) throw new Error(`Unbalanced brackets in ${constName}`);
  const literal = src.slice(startIdx, i + 1);

  // Convert JS object literal → JSON. Two transforms:
  //   1. Unquoted keys ({ id: "x" }) → quoted ({ "id": "x" })
  //   2. Trailing commas → removed
  // Approach: evaluate it as JavaScript via Function constructor (safe — content
  // is from our own source repo, not untrusted input).
  // eslint-disable-next-line no-new-func
  const value = new Function(`return (${literal});`)();
  return value;
}

const PRODUCTS    = await extractArrayFromSource("PRODUCTS");
const BISPECIFICS = await extractArrayFromSource("BISPECIFICS");

// ─── Merge citations into each product ────────────────────────────────────
function enrichProduct(p) {
  const citations = PRODUCT_CITATIONS[p.id] || null;
  return {
    ...p,
    type: BISPECIFICS.some(b => b.id === p.id) ? "bispecific" : "cart",
    citations,
  };
}

// ─── Build the final document ─────────────────────────────────────────────
const dump = {
  $schema: "https://cart-match.vercel.app/api/criteria/v1.schema.json",
  meta: {
    ...CATALOG_META,
    generatedAt: new Date().toISOString(),
    productCount:   PRODUCTS.length + BISPECIFICS.length,
    pathwayCount:   PATHWAY_CATALOG.length,
    blockActionCount:   BLOCK_ACTIONS.length,
    warningActionCount: WARNING_ACTIONS.length,
    urgencyFactorCount: URGENCY_RUBRIC.factors.length,
  },
  products: [...PRODUCTS, ...BISPECIFICS].map(enrichProduct),
  pathways: PATHWAY_CATALOG,
  actions: {
    // Convert RegExp to string for JSON serialization
    blocks:   BLOCK_ACTIONS.map(r => ({ pattern: String(r.match).replace(/^\/|\/i$/g, ""), action: r.action, source: r.source || null })),
    warnings: WARNING_ACTIONS.map(r => ({ pattern: String(r.match).replace(/^\/|\/i$/g, ""), action: r.action, source: r.source || null })),
  },
  urgency: URGENCY_RUBRIC,
  trialScoring: TRIAL_SCORING_RULES,
  nccnReferences: NCCN_REFS,
};

// ─── Write output ─────────────────────────────────────────────────────────
const outDir  = resolve(root, "public/api/criteria");
const outFile = resolve(outDir, "v1.json");
await mkdir(outDir, { recursive: true });
await writeFile(outFile, JSON.stringify(dump, null, 2));

const bytes = (await readFile(outFile)).length;
console.log(`✓ Criteria JSON written to public/api/criteria/v1.json`);
console.log(`  ${dump.meta.productCount} products · ${dump.meta.pathwayCount} pathways · ${dump.meta.blockActionCount + dump.meta.warningActionCount} actions · ${dump.meta.urgencyFactorCount} urgency factors`);
console.log(`  ${(bytes / 1024).toFixed(1)} kB`);

// ─── FHIR example endpoint ─────────────────────────────────────────────
const { EXAMPLE_BUNDLE_SCHEMA, caseToFhirBundle } = await import(pathToFileURL(resolve(root, "src/utils/fhir.js")).href);

// Synthetic example case — no PHI, illustrates every resource type
const exampleCase = {
  id: "demo-case-001",
  addedAt: "2026-03-15T10:00:00Z",
  patientLabel: "Patient (de-identified)",
  patient: {
    cancerType: "DLBCL (Large B-cell lymphoma)",
    priorLines: "3",
    ecog: "1",
    cd19: "positive",
    cd20: "positive",
    bcma: "unknown",
    gprc5d: "unknown",
    primaryRefractory: true,
    labCreat: "1.1",
    labLvef: "58",
    labAlt: "32",
  },
  stage: "manufacturing",
  assignedTo: "Coordinator (example)",
  results: {},
  timeline: {
    referralCreatedAt: "2026-03-22",
    referralCenter:    "Example Cell Therapy Center",
    pendingLabs: [
      { id: "lab-1", name: "CD19 IHC", status: "complete", orderedAt: "2026-03-18", completedAt: "2026-03-22" },
    ],
    insurance: { status: "approved", submittedAt: "2026-03-23", decisionAt: "2026-03-30", policy: "Example PPO", authNumber: "EX-0001" },
    apheresis: { scheduledAt: "2026-04-05", performedAt: "2026-04-05" },
    manufacturing: { productStartedAt: "2026-04-06", expectedDeliveryAt: "2026-05-04", receivedAt: null },
    infusion: { scheduledAt: "2026-05-08", conditioningStartAt: "2026-05-05", performedAt: null },
  },
  tasks: [
    { id: "task-1", title: "Confirm infusion bed availability", status: "open", priority: "high", category: "coordination", assignedTo: "Coordinator", dueDate: "2026-05-01", createdAt: "2026-04-20T14:00:00Z" },
  ],
  events: [
    { id: "ev-1", at: "2026-03-15T10:00:00Z", type: "case.created", by: "Coordinator", title: "Case created — Patient (de-identified)", detail: "DLBCL" },
    { id: "ev-2", at: "2026-03-22T09:30:00Z", type: "referral.initiated", by: "Coordinator", title: "Referral initiated", detail: "→ Example Cell Therapy Center" },
    { id: "ev-3", at: "2026-03-30T16:00:00Z", type: "insurance.approved", by: "Coordinator", title: "Insurance approved", detail: "Example PPO · auth EX-0001" },
    { id: "ev-4", at: "2026-04-05T12:00:00Z", type: "apheresis.performed", by: "Coordinator", title: "Apheresis performed", detail: "Date: 2026-04-05" },
    { id: "ev-5", at: "2026-04-06T08:00:00Z", type: "mfg.started", by: "Coordinator", title: "Manufacturing started", detail: "Expected delivery 2026-05-04" },
  ],
};

const exampleBundle = caseToFhirBundle(exampleCase);
const fhirDir = resolve(root, "public/api/fhir");
await mkdir(fhirDir, { recursive: true });
await writeFile(resolve(fhirDir, "example.json"), JSON.stringify(exampleBundle, null, 2));
await writeFile(resolve(fhirDir, "schema.json"), JSON.stringify(EXAMPLE_BUNDLE_SCHEMA, null, 2));
console.log(`✓ FHIR example written to public/api/fhir/example.json`);
console.log(`  ${exampleBundle.entry.length} resources · Bundle type "collection"`);
