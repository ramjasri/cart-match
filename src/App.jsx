// CAR-T Match — Standalone CAR-T & Cell Therapy Eligibility Screener
// 6 FDA-approved products: Yescarta, Kymriah, Breyanzi, Tecartus, Abecma, Carvykti

import { useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ExternalLink, Dna, X } from "lucide-react";

// Replace with your Formspree endpoint after signing up at formspree.io
const FORMSPREE_URL = "https://formspree.io/f/xyzzeroo";

// ── Product database ───────────────────────────────────────────────────────
const PRODUCTS = [
  {
    id: "yescarta",
    name: "Yescarta",
    generic: "axicabtagene ciloleucel",
    target: "CD19",
    sponsor: "Kite / Gilead",
    color: "#b54a2c",
    indications: [
      "Large B-cell lymphoma (LBCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
      "Primary mediastinal B-cell lymphoma (PMBCL)",
    ],
    cancerKeys: ["lbcl", "dlbcl", "lymphoma", "fl", "follicular", "pmbcl", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "axicabtagene+ciloleucel",
    organ: [
      "ALT / AST ≤ 5× ULN",
      "Creatinine ≤ 1.5× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN",
      "LVEF ≥ 50% (echo or MUGA)",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active or prior CNS lymphoma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Prior CAR-T or gene therapy",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
    ],
  },
  {
    id: "kymriah",
    name: "Kymriah",
    generic: "tisagenlecleucel",
    target: "CD19",
    sponsor: "Novartis",
    color: "#4c6b8c",
    indications: [
      "ALL (≤25 yr, R/R B-cell)",
      "Large B-cell lymphoma (LBCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
    ],
    cancerKeys: ["all", "leukemia", "lbcl", "dlbcl", "lymphoma", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "tisagenlecleucel",
    organ: [
      "ALT / AST ≤ 5× ULN",
      "Creatinine ≤ 1.5× ULN",
      "Bilirubin ≤ 2× ULN",
      "LVEF ≥ 45% (LBCL); no restriction (ALL)",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS disease (CNS-3 for ALL)",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection including HIV, HBV, HCV",
      "Prior CD19-targeted therapy",
      "Allo-SCT < 6 months or active GVHD",
    ],
  },
  {
    id: "breyanzi",
    name: "Breyanzi",
    generic: "lisocabtagene maraleucel",
    target: "CD19",
    sponsor: "Bristol Myers Squibb",
    color: "#5a7a4a",
    indications: [
      "Large B-cell lymphoma (LBCL) — 2L+",
      "CLL / SLL — 3L+",
      "Mantle cell lymphoma (MCL) — 2L+",
      "Follicular lymphoma (FL) — 3L+",
    ],
    cancerKeys: ["lbcl", "dlbcl", "lymphoma", "cll", "sll", "mcl", "mantle", "fl", "follicular", "b-cell", "large b"],
    minPriorLines: 2,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "lisocabtagene+maraleucel",
    organ: [
      "ALT / AST ≤ 5× ULN",
      "Creatinine ≤ 1.5× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 2× ULN (≤ 3× if Gilbert's)",
      "LVEF ≥ 40%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS lymphoma",
      "Active autoimmune disease requiring systemic immunosuppression",
      "Active uncontrolled infection",
      "Prior CAR-T within 3 months",
      "Allo-SCT within 6 months or active GVHD",
    ],
  },
  {
    id: "tecartus",
    name: "Tecartus",
    generic: "brexucabtagene autoleucel",
    target: "CD19",
    sponsor: "Kite / Gilead",
    color: "#8a4a7a",
    indications: [
      "Mantle cell lymphoma (MCL) — R/R",
      "ALL (adult, R/R B-cell)",
    ],
    cancerKeys: ["mcl", "mantle", "all", "leukemia", "b-cell", "lymphoma"],
    minPriorLines: 1,
    ecogMax: 2,
    targetMarker: "CD19",
    mmReqs: false,
    nctSearch: "brexucabtagene+autoleucel",
    organ: [
      "ALT / AST ≤ 5× ULN",
      "Creatinine ≤ 1.5× ULN",
      "Bilirubin ≤ 2× ULN",
      "LVEF ≥ 50%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Active CNS disease",
      "Active autoimmune disease requiring systemic immunosuppression",
      "Active uncontrolled infection",
      "Prior CD19-targeted CAR-T",
      "Allo-SCT within 6 months or active GVHD",
    ],
  },
  {
    id: "abecma",
    name: "Abecma",
    generic: "idecabtagene vicleucel",
    target: "BCMA",
    sponsor: "Bristol Myers Squibb",
    color: "#c4a661",
    indications: [
      "Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38, anti-BCMA)",
    ],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 4,
    ecogMax: 2,
    targetMarker: "BCMA",
    mmReqs: true,
    nctSearch: "idecabtagene+vicleucel",
    organ: [
      "ALT / AST ≤ 3× ULN",
      "Creatinine ≤ 2× ULN or CrCl ≥ 40 mL/min",
      "Bilirubin ≤ 1.5× ULN",
      "LVEF ≥ 45%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Prior BCMA-targeted therapy (antibody-drug conjugate or CAR-T)",
      "Active CNS myeloma",
      "Active autoimmune disease",
      "Active uncontrolled infection",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
    ],
  },
  {
    id: "carvykti",
    name: "Carvykti",
    generic: "ciltacabtagene autoleucel",
    target: "BCMA",
    sponsor: "J&J / Legend Biotech",
    color: "#6b5a8c",
    indications: [
      "Multiple myeloma — 4L+ (prior IMiD, PI, anti-CD38)",
      "Multiple myeloma — 1L+ lenalidomide-refractory (2024)",
    ],
    cancerKeys: ["myeloma", "mm", "multiple myeloma"],
    minPriorLines: 1,
    ecogMax: 2,
    targetMarker: "BCMA",
    mmReqs: true,
    nctSearch: "ciltacabtagene+autoleucel",
    organ: [
      "ALT / AST ≤ 3× ULN",
      "Creatinine ≤ 2× ULN or CrCl ≥ 30 mL/min",
      "Bilirubin ≤ 1.5× ULN",
      "LVEF ≥ 45%",
      "SpO₂ ≥ 92% on room air",
    ],
    exclusions: [
      "Prior BCMA-targeted therapy",
      "Active CNS myeloma",
      "Active autoimmune disease requiring systemic treatment",
      "Active uncontrolled infection",
      "Allo-SCT within 6 months or active GVHD",
      "Auto-SCT within 3 months",
      "Prior CAR-T within 6 months",
    ],
  },
];

// ── Eligibility engine ─────────────────────────────────────────────────────
function score(product, pt) {
  const blocks = [], warnings = [], passes = [];
  const cancerLow = (pt.cancerType || "").toLowerCase();

  // Indication
  const indicationMatch = product.cancerKeys.some(k => cancerLow.includes(k));
  if (!indicationMatch) blocks.push("Cancer type not in approved indications");
  else passes.push("Indication matches an approved indication");

  // Target marker
  if (indicationMatch) {
    const markerVal = product.targetMarker === "CD19" ? pt.cd19 : pt.bcma;
    if (markerVal === "negative") blocks.push(`${product.targetMarker}-negative — product requires ${product.targetMarker} expression`);
    else if (markerVal === "positive") passes.push(`${product.targetMarker} expression: confirmed positive`);
    else warnings.push(`${product.targetMarker} status unknown — confirm before proceeding`);
  }

  // Prior lines
  const lines = parseInt(pt.priorLines, 10);
  if (!isNaN(lines)) {
    if (lines < product.minPriorLines) blocks.push(`Requires ≥${product.minPriorLines} prior lines; patient has ${lines}`);
    else passes.push(`Prior lines: ${lines} (threshold of ${product.minPriorLines} met)`);
  }

  // ECOG
  const ecog = parseInt(pt.ecog, 10);
  if (!isNaN(ecog)) {
    if (ecog > product.ecogMax) blocks.push(`ECOG ${ecog} exceeds maximum of ${product.ecogMax}`);
    else passes.push(`ECOG ${ecog}: within acceptable range`);
  }

  // MM prior therapy
  if (product.mmReqs && indicationMatch) {
    if (pt.priorImid) passes.push("Prior IMiD: confirmed");
    else warnings.push("Prior IMiD required (lenalidomide / pomalidomide) — confirm exposure");
    if (pt.priorPi) passes.push("Prior proteasome inhibitor: confirmed");
    else warnings.push("Prior PI required (bortezomib / carfilzomib) — confirm exposure");
    if (pt.priorAntiCd38) passes.push("Prior anti-CD38: confirmed");
    else warnings.push("Prior anti-CD38 required (daratumumab) — confirm exposure");
  }

  // Exclusions
  if (pt.activeCns) blocks.push("Active CNS disease: absolute exclusion for all products");
  else passes.push("No active CNS disease");

  if (pt.activeAutoimmune) blocks.push("Active autoimmune disease requiring systemic treatment");
  else passes.push("No active autoimmune disease");

  if (pt.alloSct) {
    const months = parseInt(pt.alloSctMonths, 10);
    if (!isNaN(months) && months < 6) blocks.push(`Allo-SCT only ${months} months ago (minimum 6 months required)`);
    else if (!isNaN(months)) warnings.push("Prior allo-SCT — screen carefully for active GVHD");
    else warnings.push("Prior allo-SCT reported — confirm timing and GVHD status");
  }

  return {
    eligible: blocks.length === 0,
    hasWarning: blocks.length === 0 && warnings.length > 0,
    blocks, warnings, passes,
  };
}

// ── Styles ─────────────────────────────────────────────────────────────────
const CSS = `
  .app {
    background: #f4f1ea; min-height: 100vh; position: relative;
    font-family: 'Inter Tight', sans-serif; color: #1a1815;
    letter-spacing: -0.005em;
  }
  .app::before {
    content: ''; position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(circle at 20% 10%, rgba(181,74,44,0.04), transparent 40%),
      radial-gradient(circle at 80% 90%, rgba(76,107,140,0.04), transparent 40%);
  }
  .app > * { position: relative; z-index: 1; }

  /* HEADER */
  .hdr { border-bottom: 1px solid #1a1815; background: #f4f1ea; }
  .hdr-rule { height: 4px; background: #1a1815; position: relative; }
  .hdr-rule::after {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 30%; background: #b54a2c;
  }
  .hdr-inner {
    max-width: 1200px; margin: 0 auto; padding: 20px 40px;
    display: flex; align-items: center; justify-content: space-between; gap: 24px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .brand-glyph {
    width: 38px; height: 38px; background: #1a1815; color: #f4f1ea;
    display: grid; place-items: center; flex-shrink: 0;
  }
  .brand-name {
    font-family: 'Fraunces', serif; font-size: 18px; font-weight: 500;
    letter-spacing: 0.1em; line-height: 1;
  }
  .brand-sub {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.22em; color: #6b645a; margin-top: 4px;
  }
  .hdr-meta {
    display: flex; align-items: center; gap: 24px;
  }
  .hdr-badge {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: flex; align-items: center; gap: 6px;
  }
  .hdr-badge-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #5a7a4a;
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; } 50% { opacity: 0.4; }
  }

  /* HERO */
  .hero {
    max-width: 1200px; margin: 0 auto; padding: 52px 40px 40px;
    border-bottom: 1px solid #1a181520;
  }
  .hero-tag {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a;
    display: flex; align-items: center; gap: 10px; margin-bottom: 14px;
  }
  .hero-tag::before {
    content: ''; width: 20px; height: 1px; background: #6b645a;
  }
  .hero-h1 {
    font-family: 'Fraunces', serif; font-size: 42px; font-weight: 400;
    line-height: 1.1; letter-spacing: -0.025em; color: #1a1815;
    margin: 0 0 14px;
  }
  .hero-h1 em { font-style: italic; color: #b54a2c; }
  .hero-sub {
    font-size: 15px; color: #6b645a; line-height: 1.6; max-width: 580px;
  }
  .hero-pills {
    display: flex; gap: 10px; margin-top: 22px; flex-wrap: wrap;
  }
  .hero-pill {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #3a352e;
    border: 1px solid #1a181530; padding: 5px 12px; background: #ebe6dc;
  }

  /* LAYOUT */
  .layout {
    max-width: 1200px; margin: 0 auto; padding: 36px 40px 80px;
    display: grid; grid-template-columns: 300px 1fr; gap: 32px; align-items: start;
  }
  @media (max-width: 860px) {
    .layout { grid-template-columns: 1fr; padding: 24px 20px 60px; }
    .hero { padding: 36px 20px 32px; }
    .hdr-inner { padding: 16px 20px; }
    .hero-h1 { font-size: 30px; }
  }

  /* FORM PANEL */
  .form-panel {
    background: #ebe6dc; border: 1px solid #1a1815; padding: 24px;
    position: sticky; top: 24px;
  }
  .form-title {
    font-family: 'Fraunces', serif; font-size: 15px; font-weight: 500;
    letter-spacing: -0.01em; margin: 0 0 20px; color: #1a1815;
    border-bottom: 1px solid #1a181525; padding-bottom: 12px;
  }
  .field { margin-bottom: 16px; }
  .lbl {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: block; margin-bottom: 6px;
  }
  .inp, .sel {
    width: 100%; padding: 9px 12px; background: #f4f1ea;
    border: 1px solid #1a181545; font-family: 'Inter Tight', sans-serif;
    font-size: 13px; color: #1a1815; appearance: none; border-radius: 0;
  }
  .inp:focus, .sel:focus { outline: none; border-color: #1a1815; }
  .radio-row { display: flex; gap: 6px; }
  .radio-btn {
    flex: 1; padding: 7px 4px; text-align: center; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em;
    border: 1px solid #1a181535; background: #f4f1ea; color: #6b645a;
    transition: all 0.1s;
  }
  .radio-btn.on { background: #1a1815; color: #f4f1ea; border-color: #1a1815; }
  .sec-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
    text-transform: uppercase; letter-spacing: 0.18em; color: #6b645a;
    margin: 18px 0 10px; border-top: 1px solid #1a181818; padding-top: 14px;
  }
  .chk-row {
    display: flex; align-items: center; gap: 10px;
    padding: 7px 0; border-bottom: 1px solid #1a181510; cursor: pointer;
  }
  .chk-row:last-of-type { border-bottom: none; }
  .chk-box {
    width: 16px; height: 16px; border: 1px solid #1a181550;
    background: #f4f1ea; display: grid; place-items: center; flex-shrink: 0;
  }
  .chk-box.on { background: #1a1815; border-color: #1a1815; }
  .chk-lbl { font-size: 12.5px; color: #3a352e; line-height: 1.35; }
  .run-btn {
    width: 100%; padding: 12px; margin-top: 20px;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; transition: background 0.12s;
  }
  .run-btn:hover { background: #b54a2c; }
  .run-btn:disabled { background: #98908380; cursor: default; }

  /* RESULTS */
  .results-hdr {
    display: flex; align-items: baseline; gap: 12px; margin-bottom: 20px;
  }
  .results-title {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400; color: #1a1815;
  }
  .results-count {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; text-transform: uppercase; letter-spacing: 0.15em;
  }
  .empty {
    background: #ebe6dc; border: 1px solid #1a181520;
    padding: 52px 32px; text-align: center;
  }
  .empty-glyph {
    font-family: 'Fraunces', serif; font-size: 48px; color: #1a181530;
    margin-bottom: 16px; line-height: 1;
  }
  .empty-text { font-size: 14px; color: #6b645a; line-height: 1.6; }

  /* CARDS */
  .card { border: 1px solid #1a1815; background: #f4f1ea; margin-bottom: 10px; overflow: hidden; }
  .card-hdr {
    display: flex; align-items: center; gap: 12px;
    padding: 16px 20px; cursor: pointer; transition: background 0.1s; user-select: none;
  }
  .card-hdr:hover { background: #ebe6dc; }
  .card-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
  .card-name-wrap { flex: 1; min-width: 0; }
  .card-name {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 500;
    color: #1a1815; line-height: 1;
  }
  .card-generic {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #6b645a; margin-top: 3px;
  }
  .card-target {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em;
    padding: 3px 8px; border: 1px solid currentColor; flex-shrink: 0;
  }
  .badge {
    display: flex; align-items: center; gap: 5px; flex-shrink: 0;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.1em; padding: 4px 10px;
  }
  .badge.eligible { background: #5a7a4a18; color: #5a7a4a; border: 1px solid #5a7a4a35; }
  .badge.review   { background: #c4a66118; color: #7a5e10; border: 1px solid #c4a66135; }
  .badge.blocked  { background: #b54a2c15; color: #b54a2c; border: 1px solid #b54a2c35; }
  .chevron { color: #6b645a; flex-shrink: 0; transition: transform 0.18s; }
  .chevron.open { transform: rotate(180deg); }

  .card-body {
    border-top: 1px solid #1a181520; padding: 22px 20px 18px; background: #faf8f4;
  }
  .body-grid {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 18px;
  }
  @media (max-width: 700px) { .body-grid { grid-template-columns: 1fr; } }
  .body-section-head {
    font-family: 'JetBrains Mono', monospace; font-size: 9px;
    text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a; margin-bottom: 8px;
  }
  .crit-item {
    display: flex; align-items: flex-start; gap: 7px;
    font-size: 12px; color: #3a352e; margin-bottom: 5px; line-height: 1.45;
  }
  .crit-item svg { flex-shrink: 0; margin-top: 1px; }
  .plain-list { list-style: none; }
  .plain-li {
    font-size: 11.5px; color: #3a352e; padding: 3px 0;
    border-bottom: 1px solid #1a181510; line-height: 1.4;
  }
  .plain-li:last-child { border-bottom: none; }
  .plain-li::before { content: '— '; color: #6b645a; }
  .trial-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    color: #4c6b8c; text-decoration: none; text-transform: uppercase;
    letter-spacing: 0.12em; border: 1px solid #4c6b8c40; padding: 7px 14px;
    transition: background 0.1s;
  }
  .trial-link:hover { background: #4c6b8c0d; }

  /* DISCLAIMER */
  .disclaimer {
    max-width: 1200px; margin: 0 auto 0; padding: 0 40px 48px;
  }
  .disclaimer-inner {
    border: 1px solid #1a181520; background: #ebe6dc;
    padding: 16px 20px; font-size: 12px; color: #6b645a; line-height: 1.65;
  }
  .disclaimer-inner strong {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.12em; color: #3a352e;
  }
  @media (max-width: 860px) { .disclaimer { padding: 0 20px 40px; } }

  /* CTA BANNER */
  .cta-banner {
    max-width: 1200px; margin: 0 auto; padding: 0 40px 32px;
  }
  .cta-inner {
    background: #1a1815; color: #f4f1ea;
    padding: 28px 32px; display: flex; align-items: center;
    justify-content: space-between; gap: 24px; flex-wrap: wrap;
  }
  .cta-text {}
  .cta-title {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 400;
    line-height: 1.2; margin-bottom: 6px; letter-spacing: -0.01em;
  }
  .cta-title em { font-style: italic; color: #c4a661; }
  .cta-sub {
    font-family: 'Inter Tight', sans-serif; font-size: 13px;
    color: #f4f1ea99; line-height: 1.5;
  }
  .cta-btn {
    padding: 12px 24px; background: #b54a2c; color: #f4f1ea; border: none;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; cursor: pointer;
    transition: background 0.12s; white-space: nowrap; flex-shrink: 0;
  }
  .cta-btn:hover { background: #c4a661; color: #1a1815; }
  @media (max-width: 860px) { .cta-banner { padding: 0 20px 28px; } }

  /* MODAL OVERLAY */
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(26,24,21,0.7);
    display: grid; place-items: center; z-index: 100; padding: 20px;
    backdrop-filter: blur(2px);
  }
  .modal {
    background: #f4f1ea; border: 1px solid #1a1815;
    width: 100%; max-width: 480px; position: relative;
  }
  .modal-rule { height: 4px; background: #1a1815; position: relative; }
  .modal-rule::after {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0;
    width: 40%; background: #b54a2c;
  }
  .modal-body { padding: 28px 28px 24px; }
  .modal-close {
    position: absolute; top: 16px; right: 16px; background: none;
    border: none; cursor: pointer; color: #6b645a; padding: 4px;
  }
  .modal-close:hover { color: #1a1815; }
  .modal-title {
    font-family: 'Fraunces', serif; font-size: 22px; font-weight: 400;
    letter-spacing: -0.015em; margin: 0 0 6px; color: #1a1815;
  }
  .modal-sub {
    font-size: 13px; color: #6b645a; line-height: 1.55; margin-bottom: 22px;
  }
  .modal-field { margin-bottom: 14px; }
  .modal-lbl {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a;
    display: block; margin-bottom: 5px;
  }
  .modal-inp {
    width: 100%; padding: 9px 12px; background: #ebe6dc;
    border: 1px solid #1a181540; font-family: 'Inter Tight', sans-serif;
    font-size: 13px; color: #1a1815; border-radius: 0; box-sizing: border-box;
  }
  .modal-inp:focus { outline: none; border-color: #1a1815; }
  .modal-submit {
    width: 100%; padding: 12px; margin-top: 6px;
    background: #1a1815; color: #f4f1ea; border: none; cursor: pointer;
    font-family: 'JetBrains Mono', monospace; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.18em; transition: background 0.12s;
  }
  .modal-submit:hover { background: #b54a2c; }
  .modal-submit:disabled { background: #98908380; cursor: default; }
  .modal-success {
    padding: 28px; text-align: center;
  }
  .modal-success-icon { font-size: 36px; margin-bottom: 14px; }
  .modal-success-title {
    font-family: 'Fraunces', serif; font-size: 20px; color: #1a1815; margin-bottom: 8px;
  }
  .modal-success-text { font-size: 13px; color: #6b645a; line-height: 1.6; }

  /* FOOTER */
  .footer {
    border-top: 1px solid #1a181820; padding: 20px 40px;
    max-width: 1200px; margin: 0 auto;
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
  }
  .footer-brand {
    font-family: 'Fraunces', serif; font-size: 14px; color: #6b645a; letter-spacing: 0.05em;
  }
  .footer-links { display: flex; gap: 20px; }
  .footer-link {
    font-family: 'JetBrains Mono', monospace; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.15em; color: #6b645a; text-decoration: none;
  }
  .footer-link:hover { color: #1a1815; }
`;

// ── Small components ───────────────────────────────────────────────────────
function Checkbox({ checked, onChange, label }) {
  return (
    <label className="chk-row" onClick={onChange}>
      <div className={`chk-box${checked ? " on" : ""}`}>
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="#f4f1ea" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <span className="chk-lbl">{label}</span>
    </label>
  );
}

function RadioGroup({ value, options, onChange }) {
  return (
    <div className="radio-row">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`radio-btn${value === o.value ? " on" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ProductCard({ product, result }) {
  const [open, setOpen] = useState(false);
  const trialsUrl = `https://clinicaltrials.gov/search?term=${product.nctSearch}&recrs=a`;

  const badgeClass = !result ? "" : result.blocks.length > 0 ? "blocked" : result.hasWarning ? "review" : "eligible";
  const badgeLabel = !result ? "" : result.blocks.length > 0 ? "Ineligible" : result.hasWarning ? "Review" : "Eligible";

  return (
    <div className="card">
      <div className="card-hdr" onClick={() => setOpen(x => !x)}>
        <div className="card-dot" style={{ background: product.color }} />
        <div className="card-name-wrap">
          <div className="card-name">{product.name}</div>
          <div className="card-generic">{product.generic} · {product.sponsor}</div>
        </div>
        <span className="card-target" style={{ color: product.color }}>{product.target}</span>
        {result && (
          <div className={`badge ${badgeClass}`}>
            {result.blocks.length > 0 ? <XCircle size={11} /> : result.hasWarning ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}
            {badgeLabel}
          </div>
        )}
        <div className={`chevron${open ? " open" : ""}`}><ChevronDown size={16} /></div>
      </div>

      {open && (
        <div className="card-body">
          {result && (
            <div className="body-grid">
              {result.blocks.length > 0 && (
                <div>
                  <div className="body-section-head" style={{ color: "#b54a2c" }}>Blocking ({result.blocks.length})</div>
                  {result.blocks.map((b, i) => (
                    <div key={i} className="crit-item"><XCircle size={12} color="#b54a2c" />{b}</div>
                  ))}
                </div>
              )}
              {result.warnings.length > 0 && (
                <div>
                  <div className="body-section-head" style={{ color: "#7a5e10" }}>Review ({result.warnings.length})</div>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="crit-item"><AlertTriangle size={12} color="#c4a661" />{w}</div>
                  ))}
                </div>
              )}
              {result.passes.length > 0 && (
                <div>
                  <div className="body-section-head" style={{ color: "#5a7a4a" }}>Passed ({result.passes.length})</div>
                  {result.passes.map((p, i) => (
                    <div key={i} className="crit-item"><CheckCircle size={12} color="#5a7a4a" />{p}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="body-grid">
            <div>
              <div className="body-section-head">Organ function thresholds</div>
              <ul className="plain-list">
                {product.organ.map((o, i) => <li key={i} className="plain-li">{o}</li>)}
              </ul>
            </div>
            <div>
              <div className="body-section-head">Key exclusions</div>
              <ul className="plain-list">
                {product.exclusions.map((e, i) => <li key={i} className="plain-li">{e}</li>)}
              </ul>
            </div>
            <div>
              <div className="body-section-head">Approved indications</div>
              <ul className="plain-list">
                {product.indications.map((ind, i) => <li key={i} className="plain-li">{ind}</li>)}
              </ul>
            </div>
          </div>

          <a href={trialsUrl} target="_blank" rel="noopener noreferrer" className="trial-link">
            <ExternalLink size={11} />
            Recruiting trials — ClinicalTrials.gov
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────
const CANCER_OPTIONS = [
  { value: "", label: "Select cancer type…" },
  { value: "DLBCL (Large B-cell lymphoma)", label: "DLBCL / Large B-cell lymphoma" },
  { value: "Follicular lymphoma", label: "Follicular lymphoma" },
  { value: "Mantle cell lymphoma", label: "Mantle cell lymphoma (MCL)" },
  { value: "CLL/SLL", label: "CLL / SLL" },
  { value: "ALL (acute lymphoblastic leukemia)", label: "ALL — acute lymphoblastic leukemia" },
  { value: "Multiple myeloma", label: "Multiple myeloma" },
  { value: "PMBCL (Primary mediastinal B-cell lymphoma)", label: "Primary mediastinal B-cell lymphoma" },
  { value: "Other B-cell lymphoma", label: "Other B-cell lymphoma" },
  { value: "Other (not in scope)", label: "Other (not currently in scope)" },
];

const INIT = {
  cancerType: "", priorLines: "", ecog: "",
  cd19: "unknown", bcma: "unknown",
  activeCns: false, activeAutoimmune: false,
  alloSct: false, alloSctMonths: "",
  priorImid: false, priorPi: false, priorAntiCd38: false,
};

// ── Waitlist modal ─────────────────────────────────────────────────────────
function WaitlistModal({ onClose }) {
  const [form, setForm] = useState({ name: "", email: "", institution: "", role: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const canSubmit = form.name && form.email && form.institution && status === "idle";

  const submit = async (e) => {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) setStatus("done");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-rule" />
        <button className="modal-close" onClick={onClose}><X size={16} /></button>

        {status === "done" ? (
          <div className="modal-success">
            <div className="modal-success-icon">✓</div>
            <div className="modal-success-title">You're on the list</div>
            <p className="modal-success-text">
              We'll be in touch when institutional access opens.<br />
              In the meantime, the screener is fully free to use.
            </p>
          </div>
        ) : (
          <div className="modal-body">
            <div className="modal-title">Request institutional access</div>
            <p className="modal-sub">
              Early access for cancer centers and oncology practices.
              Includes multi-user accounts, PDF report export, and ClinicalTrials.gov integration.
            </p>
            <form onSubmit={submit}>
              <div className="modal-field">
                <label className="modal-lbl">Full name *</label>
                <input className="modal-inp" type="text" placeholder="Dr. Jane Smith"
                  value={form.name} onChange={e => setF("name", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Work email *</label>
                <input className="modal-inp" type="email" placeholder="jsmith@cancercenter.org"
                  value={form.email} onChange={e => setF("email", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Institution *</label>
                <input className="modal-inp" type="text" placeholder="Memorial Sloan Kettering"
                  value={form.institution} onChange={e => setF("institution", e.target.value)} required />
              </div>
              <div className="modal-field">
                <label className="modal-lbl">Role</label>
                <input className="modal-inp" type="text" placeholder="Oncologist / Pharmacist / APP"
                  value={form.role} onChange={e => setF("role", e.target.value)} />
              </div>
              {status === "error" && (
                <p style={{ fontSize: 12, color: "#b54a2c", marginBottom: 8 }}>
                  Something went wrong — email sri.ramya003@gmail.com directly.
                </p>
              )}
              <button className="modal-submit" type="submit" disabled={!canSubmit}>
                {status === "sending" ? "Sending…" : "Request access →"}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [pt, setPt] = useState(INIT);
  const [results, setResults] = useState(null);
  const [ran, setRan] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const set = (k, v) => setPt(p => ({ ...p, [k]: v }));
  const tog = k => setPt(p => ({ ...p, [k]: !p[k] }));

  const isMM = pt.cancerType.toLowerCase().includes("myeloma");
  const canRun = pt.cancerType && pt.priorLines !== "" && pt.ecog !== "";

  const run = () => {
    const res = {};
    PRODUCTS.forEach(p => { res[p.id] = score(p, pt); });
    setResults(res);
    setRan(true);
  };

  const eligible = results ? Object.values(results).filter(r => r.eligible).length : 0;

  const sorted = results
    ? [...PRODUCTS].sort((a, b) => {
        const rank = r => r.blocks.length > 0 ? 2 : r.hasWarning ? 1 : 0;
        return rank(results[a.id]) - rank(results[b.id]);
      })
    : PRODUCTS;

  return (
    <div className="app">
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-rule" />
        <div className="hdr-inner">
          <div className="brand">
            <div className="brand-glyph"><Dna size={18} strokeWidth={1.4} /></div>
            <div>
              <div className="brand-name">CAR-T MATCH</div>
              <div className="brand-sub">Cell Therapy Eligibility Screener</div>
            </div>
          </div>
          <div className="hdr-meta">
            <div className="hdr-badge">
              <div className="hdr-badge-dot" />
              6 FDA-approved products
            </div>
            <div className="hdr-badge">Free · No login required</div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-tag">CAR-T &amp; Cell Therapy Screener · May 2026</div>
        <h1 className="hero-h1">
          Match patients to <em>eligible</em><br />cell therapy products
        </h1>
        <p className="hero-sub">
          Enter a patient profile to screen eligibility across all FDA-approved CAR-T
          products simultaneously. See blocking criteria, organ function requirements,
          and recruiting trials in one view.
        </p>
        <div className="hero-pills">
          {PRODUCTS.map(p => (
            <span key={p.id} className="hero-pill" style={{ borderColor: p.color + "60", color: p.color }}>
              {p.name}
            </span>
          ))}
        </div>
      </section>

      {/* MAIN LAYOUT */}
      <div className="layout">

        {/* FORM */}
        <div className="form-panel">
          <div className="form-title">Patient Profile</div>

          <div className="field">
            <label className="lbl">Cancer type</label>
            <select className="sel" value={pt.cancerType} onChange={e => set("cancerType", e.target.value)}>
              {CANCER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="lbl">Prior lines of therapy</label>
            <input className="inp" type="number" min="0" max="20" placeholder="e.g. 3"
              value={pt.priorLines} onChange={e => set("priorLines", e.target.value)} />
          </div>

          <div className="field">
            <label className="lbl">ECOG performance status</label>
            <RadioGroup value={pt.ecog}
              options={["0","1","2","3","4"].map(v => ({ value: v, label: v }))}
              onChange={v => set("ecog", v)} />
          </div>

          <div className="sec-head">Biomarker expression</div>

          <div className="field">
            <label className="lbl">CD19 status</label>
            <RadioGroup value={pt.cd19}
              options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
              onChange={v => set("cd19", v)} />
          </div>

          <div className="field">
            <label className="lbl">BCMA status</label>
            <RadioGroup value={pt.bcma}
              options={[{ value:"positive", label:"+" }, { value:"negative", label:"−" }, { value:"unknown", label:"?" }]}
              onChange={v => set("bcma", v)} />
          </div>

          <div className="sec-head">Clinical flags</div>

          <Checkbox checked={pt.activeCns} onChange={() => tog("activeCns")}
            label="Active CNS disease / CNS lymphoma" />
          <Checkbox checked={pt.activeAutoimmune} onChange={() => tog("activeAutoimmune")}
            label="Active autoimmune disease (systemic treatment)" />
          <Checkbox checked={pt.alloSct} onChange={() => tog("alloSct")}
            label="Prior allogeneic SCT" />
          {pt.alloSct && (
            <div className="field" style={{ paddingLeft: 26, marginTop: 8 }}>
              <label className="lbl">Months since allo-SCT</label>
              <input className="inp" type="number" min="0" placeholder="e.g. 8"
                value={pt.alloSctMonths} onChange={e => set("alloSctMonths", e.target.value)} />
            </div>
          )}

          {isMM && (
            <>
              <div className="sec-head">MM prior therapy (required for BCMA products)</div>
              <Checkbox checked={pt.priorImid} onChange={() => tog("priorImid")}
                label="Prior IMiD (lenalidomide / pomalidomide)" />
              <Checkbox checked={pt.priorPi} onChange={() => tog("priorPi")}
                label="Prior PI (bortezomib / carfilzomib)" />
              <Checkbox checked={pt.priorAntiCd38} onChange={() => tog("priorAntiCd38")}
                label="Prior anti-CD38 (daratumumab)" />
            </>
          )}

          <button className="run-btn" onClick={run} disabled={!canRun}>
            Screen eligibility →
          </button>
        </div>

        {/* RESULTS */}
        <div>
          {!ran ? (
            <div className="empty">
              <div className="empty-glyph">⬤</div>
              <p className="empty-text">
                Fill in the patient profile on the left<br />
                and click <strong>Screen eligibility</strong> to see matched products.
              </p>
            </div>
          ) : (
            <>
              <div className="results-hdr">
                <div className="results-title">Eligibility results</div>
                <div className="results-count">{eligible} of {PRODUCTS.length} eligible</div>
              </div>
              {sorted.map(p => (
                <ProductCard key={p.id} product={p} result={results[p.id]} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* CTA BANNER */}
      <div className="cta-banner">
        <div className="cta-inner">
          <div className="cta-text">
            <div className="cta-title">Want this for your <em>tumor board?</em></div>
            <div className="cta-sub">
              Institutional access includes multi-user accounts, PDF eligibility reports, and live trial integration.
            </div>
          </div>
          <button className="cta-btn" onClick={() => setShowWaitlist(true)}>
            Request access →
          </button>
        </div>
      </div>

      {/* DISCLAIMER */}
      <div className="disclaimer">
        <div className="disclaimer-inner">
          <strong>Clinical disclaimer</strong> — This tool is for educational and research purposes only.
          Eligibility must be confirmed against current FDA prescribing information, institutional
          protocols, and individual clinical assessment by a qualified oncologist. Criteria reflect
          approved labeling as of May 2026 and may not capture the most recent updates or off-label use.
        </div>
      </div>

      {/* WAITLIST MODAL */}
      {showWaitlist && <WaitlistModal onClose={() => setShowWaitlist(false)} />}

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-brand">CAR-T Match</div>
        <div className="footer-links">
          <a href="https://biomarker-database.vercel.app" target="_blank" rel="noopener noreferrer" className="footer-link">
            OncoMarker →
          </a>
          <a href="https://clinicaltrials.gov" target="_blank" rel="noopener noreferrer" className="footer-link">
            ClinicalTrials.gov
          </a>
        </div>
      </footer>
    </div>
  );
}
