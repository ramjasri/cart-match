// src/utils/generatePdf.js
// Generates a "Cell Therapy Referral Report" PDF for tumor board packets

import { jsPDF } from "jspdf";
import { findAction, getPathToEligibility, getReferralSteps } from "./actions.js";
import { calculateUrgency } from "./urgency.js";
import { generateWorkup, CATEGORY_LABELS, PRIORITY_META, workupItemCount } from "./workup.js";

const COLORS = {
  ink:     [26, 24, 21],
  ink3:    [107, 100, 90],
  paper:   [244, 241, 234],
  paper2:  [235, 230, 220],
  red:     [181, 74, 44],
  green:   [90, 122, 74],
  amber:   [196, 166, 97],
  blue:    [76, 107, 140],
  rule:    [26, 24, 21],
};

function setColor(doc, rgb) { doc.setTextColor(...rgb); }
function setFill(doc, rgb) { doc.setFillColor(...rgb); }
function setDraw(doc, rgb) { doc.setDrawColor(...rgb); }

function rule(doc, x, y, w, color = COLORS.paper2) {
  setDraw(doc, color);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

function tag(doc, label, x, y, color) {
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(doc, color);
  doc.text(label.toUpperCase(), x, y);
}

export function generatePdf({ patient, results, products, grayscale = false }) {
  // Shadow module-level COLORS with grayscale palette when grayscale=true
  // All COLORS.xxx references below use this local variable automatically
  // eslint-disable-next-line no-shadow
  const COLORS = grayscale ? {
    ink:    [26, 24, 21],   ink3:   [90, 90, 90],
    paper:  [255, 255, 255], paper2: [210, 210, 210],
    red:    [50, 50, 50],   green:  [26, 24, 21],
    amber:  [80, 80, 80],   blue:   [60, 60, 60],
    rule:   [160, 160, 160],
  } : {
    ink:    [26, 24, 21],   ink3:   [107, 100, 90],
    paper:  [244, 241, 234], paper2: [235, 230, 220],
    red:    [181, 74, 44],  green:  [90, 122, 74],
    amber:  [196, 166, 97], blue:   [76, 107, 140],
    rule:   [26, 24, 21],
  };

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, ML = 16, MR = 16, CW = W - ML - MR;
  let y = 0;

  // ── Header bar ────────────────────────────────────────────────────────────
  setFill(doc, COLORS.ink);
  doc.rect(0, 0, W, 14, "F");
  setFill(doc, COLORS.red);
  doc.rect(0, 0, W * 0.3, 14, "F");

  setFill(doc, COLORS.ink);
  doc.rect(0, 14, W, 22, "F");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  setColor(doc, [244, 241, 234]);
  doc.text("CELL THERAPY REFERRAL REPORT", ML, 29);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(doc, [180, 170, 155]);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated ${dateStr} · CellTx Match · cart-match.vercel.app`, ML, 33);

  y = 46;

  // ── Urgency banner ────────────────────────────────────────────────────────
  const urgency = calculateUrgency(patient);
  if (urgency) {
    const uRgb = grayscale
      ? (urgency.level === "high" ? [50, 50, 50] : urgency.level === "medium" ? [110, 110, 110] : [60, 60, 60])
      : (urgency.level === "high" ? COLORS.red : urgency.level === "medium" ? COLORS.amber : COLORS.green);

    // Compute banner height based on factors count
    const factorsCount = urgency.factors.length;
    const bannerH = 22 + factorsCount * 3.5 + 8;

    setDraw(doc, uRgb);
    doc.setLineWidth(0.8);
    doc.rect(ML, y, CW, bannerH, "D");
    setFill(doc, [uRgb[0], uRgb[1], uRgb[2], 0.06]);
    doc.rect(ML, y, CW, bannerH, "F");

    // Level label
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, uRgb);
    doc.text(urgency.label, ML + 4, y + 6);

    // Subhead
    doc.setFontSize(11);
    setColor(doc, COLORS.ink);
    doc.text(urgency.sub, ML + 4, y + 12);

    // Factors
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink3);
    urgency.factors.forEach((f, i) => {
      doc.text(`· ${f}`, ML + 6, y + 17 + i * 3.5);
    });

    // Timeline
    const tY = y + 19 + factorsCount * 3.5;
    setDraw(doc, [uRgb[0], uRgb[1], uRgb[2]]);
    doc.setLineWidth(0.2);
    doc.line(ML + 4, tY, ML + CW - 4, tY);
    doc.setFontSize(6.8);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("RECOMMENDED TIMELINE", ML + 4, tY + 3);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink);
    const tLines = doc.splitTextToSize(urgency.timeline, CW - 8);
    doc.text(tLines, ML + 4, tY + 6.5);

    y += bannerH + 8;
  }

  // ── Patient summary ───────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("PATIENT PROFILE", ML, y);
  rule(doc, ML, y + 2, CW);
  y += 8;

  const fields = [
    ["Cancer type",    patient.cancerType || "—"],
    ["Prior lines",    patient.priorLines  || "—"],
    ["ECOG",           patient.ecog        || "—"],
    ["CD19 status",    patient.cd19],
    ["BCMA status",    patient.bcma],
    ["Active CNS",     patient.activeCns        ? "Yes" : "No"],
    ["Autoimmune",     patient.activeAutoimmune  ? "Yes" : "No"],
    ["Prior allo-SCT", patient.alloSct ? `Yes (${patient.alloSctMonths || "?"} months ago)` : "No"],
  ];
  if (patient.cancerType.toLowerCase().includes("myeloma")) {
    fields.push(
      ["Prior IMiD",     patient.priorImid     ? "Yes" : "No"],
      ["Prior PI",       patient.priorPi       ? "Yes" : "No"],
      ["Prior anti-CD38",patient.priorAntiCd38 ? "Yes" : "No"],
    );
  }

  const col2 = ML + CW / 2;
  fields.forEach(([label, val], i) => {
    const col = i % 2 === 0 ? ML : col2;
    if (i % 2 === 0 && i > 0) y += 6;
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text(label + ":", col, y);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink);
    doc.text(String(val), col + 28, y);
  });
  y += 10;

  // ── Recommended Workup ────────────────────────────────────────────────────
  const workup = generateWorkup(patient);
  if (workup && workupItemCount(workup) > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("RECOMMENDED WORKUP", ML, y);
    rule(doc, ML, y + 2, CW);
    y += 8;

    const orderedCats = ["pathology", "labs", "imaging", "documentation", "consults", "administrative"];
    orderedCats.forEach(cat => {
      const arr = workup[cat] || [];
      if (arr.length === 0) return;
      if (y > 268) { doc.addPage(); y = 20; }

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, COLORS.ink3);
      doc.text(`${CATEGORY_LABELS[cat].label.toUpperCase()} · ${arr.length}`, ML, y);
      y += 5;

      arr.forEach(item => {
        if (y > 270) { doc.addPage(); y = 20; }
        const pmeta = PRIORITY_META[item.priority] || PRIORITY_META.medium;
        const pColor = grayscale
          ? (item.priority === "high" ? [50, 50, 50] : item.priority === "medium" ? [95, 95, 95] : [130, 130, 130])
          : (item.priority === "high" ? COLORS.red : item.priority === "medium" ? COLORS.amber : COLORS.blue);

        // Checkbox
        setDraw(doc, COLORS.ink3);
        doc.setLineWidth(0.3);
        doc.rect(ML + 2, y - 3, 3, 3, "D");

        // Priority tag
        doc.setFontSize(6.5);
        doc.setFont("helvetica", "bold");
        setColor(doc, pColor);
        doc.text(pmeta.label.toUpperCase(), ML + 8, y);

        // Task text
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "normal");
        setColor(doc, COLORS.ink);
        const taskLines = doc.splitTextToSize(item.text, CW - 32);
        doc.text(taskLines, ML + 27, y);
        y += taskLines.length * 3.5;

        // Reason
        if (item.reason) {
          if (y > 272) { doc.addPage(); y = 20; }
          doc.setFontSize(6.5);
          doc.setFont("helvetica", "italic");
          setColor(doc, COLORS.ink3);
          const reasonLines = doc.splitTextToSize(`→ ${item.reason}`, CW - 32);
          doc.text(reasonLines, ML + 27, y);
          y += reasonLines.length * 3 + 1;
        }
        y += 1;
      });
      y += 2;
    });
    y += 4;
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const eligible  = products.filter(p => results[p.id]?.eligible).length;
  const review    = products.filter(p => !results[p.id]?.eligible && results[p.id]?.blocks.length === 0).length;
  const blocked   = products.filter(p => results[p.id]?.blocks.length > 0).length;

  const boxes = [
    { label: "ELIGIBLE",  val: eligible, color: COLORS.green },
    { label: "REVIEW",    val: review,   color: COLORS.amber },
    { label: "INELIGIBLE",val: blocked,  color: COLORS.red   },
  ];
  const bw = CW / 3;
  boxes.forEach(({ label, val, color }, i) => {
    const bx = ML + i * bw;
    setFill(doc, [color[0], color[1], color[2], 0.08]);
    setDraw(doc, color);
    doc.setLineWidth(0.4);
    doc.rect(bx, y, bw - 2, 16, "FD");
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    setColor(doc, color);
    doc.text(String(val), bx + bw / 2 - 2, y + 10, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text(label, bx + bw / 2 - 2, y + 14, { align: "center" });
  });
  y += 22;

  // ── Per-product results ───────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("CANDIDATE PRODUCTS", ML, y);
  rule(doc, ML, y + 2, CW);
  y += 8;

  // Sort: eligible → review → blocked
  const sorted = [...products].sort((a, b) => {
    const rank = r => r.blocks.length > 0 ? 2 : r.hasWarning ? 1 : 0;
    return rank(results[a.id]) - rank(results[b.id]);
  });

  sorted.forEach(product => {
    const r = results[product.id];
    if (!r) return;

    // Check page space
    if (y > 250) { doc.addPage(); y = 20; }

    const statusColor = r.blocks.length > 0 ? COLORS.red : r.hasWarning ? COLORS.amber : COLORS.green;
    const statusLabel = r.blocks.length > 0 ? "INELIGIBLE" : r.hasWarning ? "REVIEW" : "ELIGIBLE";

    // Product row
    setFill(doc, COLORS.paper2);
    doc.rect(ML, y - 4, CW, 9, "F");

    // Color accent strip
    const pc = product.color ? hexToRgb(product.color) : COLORS.ink;
    setFill(doc, pc);
    doc.rect(ML, y - 4, 3, 9, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink);
    doc.text(product.name, ML + 6, y + 1);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink3);
    doc.text(product.generic, ML + 6, y + 4.5);

    // Target badge
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    setColor(doc, pc);
    doc.text(product.target, ML + CW - 40, y + 1);

    // Status badge
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(doc, statusColor);
    doc.text(statusLabel, ML + CW - 24, y + 1);

    y += 10;

    // Criteria items — blocks + warnings with inline actions, then passes
    const itemsWithActions = [
      ...r.blocks.map(b => ({ text: b, type: "block", action: findAction(b, "block") })),
      ...r.warnings.map(w => ({ text: w, type: "warn",  action: findAction(w, "warning") })),
      ...r.passes.map(p => ({ text: p, type: "pass",  action: null })),
    ];

    itemsWithActions.forEach(({ text, type, action }) => {
      if (y > 268) { doc.addPage(); y = 20; }
      const color = type === "block" ? COLORS.red : type === "warn" ? COLORS.amber : COLORS.green;
      const sym = type === "block" ? "✗" : type === "warn" ? "!" : "✓";
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      setColor(doc, color);
      doc.text(sym, ML + 5, y);
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      const lines = doc.splitTextToSize(text, CW - 16);
      doc.text(lines, ML + 10, y);
      y += lines.length * 4 + 1;

      // Inline action beneath the criterion (only for blocks/warnings)
      if (action) {
        if (y > 268) { doc.addPage(); y = 20; }
        doc.setFontSize(6.8);
        doc.setFont("helvetica", "bold");
        setColor(doc, COLORS.amber);
        doc.text("ACTION", ML + 12, y);
        doc.setFont("helvetica", "italic");
        setColor(doc, COLORS.ink3);
        const aLines = doc.splitTextToSize(action, CW - 36);
        doc.text(aLines, ML + 26, y);
        y += aLines.length * 3.5 + 2;
      }
    });

    // Consolidated path-to-eligibility or referral steps
    const path = !r.eligible ? getPathToEligibility(r) : [];
    const refs = r.eligible ? getReferralSteps(product) : [];
    const summarySteps = path.length > 0 ? path : refs;
    const summaryLabel = path.length > 0 ? "PATH TO POTENTIAL ELIGIBILITY" : "RECOMMENDED REFERRAL STEPS";
    const summaryColor = path.length > 0 ? COLORS.amber : COLORS.green;

    if (summarySteps.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 2;
      setFill(doc, [summaryColor[0], summaryColor[1], summaryColor[2], 0.08]);
      const blockHeight = 6 + summarySteps.length * 4 + 2;
      doc.rect(ML, y, CW, blockHeight, "F");
      setFill(doc, summaryColor);
      doc.rect(ML, y, 2, blockHeight, "F");

      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, summaryColor);
      doc.text(summaryLabel, ML + 5, y + 4);
      y += 7;
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      summarySteps.forEach(s => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(7);
        setColor(doc, summaryColor);
        doc.text("→", ML + 6, y);
        setColor(doc, COLORS.ink);
        const sLines = doc.splitTextToSize(s, CW - 16);
        doc.text(sLines, ML + 11, y);
        y += sLines.length * 4;
      });
      y += 3;
    }

    y += 4;
    rule(doc, ML, y, CW, COLORS.paper2);
    y += 4;
  });

  // ── Disclaimer ────────────────────────────────────────────────────────────
  if (y > 260) { doc.addPage(); y = 20; }

  setFill(doc, COLORS.paper2);
  doc.rect(ML, y, CW, 18, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("CLINICAL DISCLAIMER", ML + 3, y + 5);
  doc.setFont("helvetica", "normal");
  setColor(doc, COLORS.ink3);
  const disc = "This report is for educational and research purposes only. Eligibility must be confirmed against current FDA prescribing information, institutional protocols, and individual clinical assessment by a qualified oncologist. Criteria reflect approved labeling as of May 2026.";
  const discLines = doc.splitTextToSize(disc, CW - 6);
  doc.text(discLines, ML + 3, y + 9);

  // ── Footer on every page ──────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFill(doc, COLORS.ink);
    doc.rect(0, 287, W, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(doc, [180, 170, 155]);
    doc.text("CellTx Match · Precision Oncology Referral Platform · cart-match.vercel.app", ML, 293);
    doc.text(`Page ${i} of ${pages}`, W - MR, 293, { align: "right" });
  }

  doc.save(grayscale ? "CellTx-Referral-Report-BW.pdf" : "CellTx-Referral-Report.pdf");
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
