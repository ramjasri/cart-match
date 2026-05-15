// src/utils/generatePdf.js
// Generates a "CAR-T Eligibility Report" PDF for tumor board packets

import { jsPDF } from "jspdf";

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

export function generatePdf({ patient, results, products }) {
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
  doc.text("CAR-T ELIGIBILITY REPORT", ML, 29);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(doc, [180, 170, 155]);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated ${dateStr} · CAR-T Match · cart-match.vercel.app`, ML, 33);

  y = 46;

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
  doc.text("PRODUCT ELIGIBILITY", ML, y);
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

    // Criteria items
    const allItems = [
      ...r.blocks.map(b => ({ text: b, type: "block" })),
      ...r.warnings.map(w => ({ text: w, type: "warn" })),
      ...r.passes.map(p => ({ text: p, type: "pass" })),
    ];

    allItems.forEach(({ text, type }) => {
      if (y > 270) { doc.addPage(); y = 20; }
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
    });

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
    doc.text("CAR-T Match · cart-match.vercel.app", ML, 293);
    doc.text(`Page ${i} of ${pages}`, W - MR, 293, { align: "right" });
  }

  doc.save("CAR-T-Eligibility-Report.pdf");
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
