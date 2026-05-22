// src/utils/generateBoardPdf.js
// Generates a multi-patient "Tumor Board Packet" PDF

import { jsPDF } from "jspdf";

const COLORS = {
  ink:    [26, 24, 21],
  ink3:   [107, 100, 90],
  paper:  [244, 241, 234],
  paper2: [235, 230, 220],
  red:    [181, 74, 44],
  green:  [90, 122, 74],
  amber:  [196, 166, 97],
  blue:   [76, 107, 140],
};

const STATUS_META = {
  "pending":       { label: "Pending",              color: COLORS.ink3,  hex: "#6b645a" },
  "discussed":     { label: "Discussed",             color: COLORS.blue,  hex: "#4c6b8c" },
  "approved":      { label: "Approved for Referral", color: COLORS.green, hex: "#5a7a4a" },
  "deferred":      { label: "Deferred",              color: COLORS.amber, hex: "#c4a661" },
  "not-indicated": { label: "Not Indicated",         color: COLORS.red,   hex: "#b54a2c" },
};

function setColor(doc, rgb) { doc.setTextColor(...rgb); }
function setFill(doc, rgb)  { doc.setFillColor(...rgb); }
function setDraw(doc, rgb)  { doc.setDrawColor(...rgb); }

function rule(doc, x, y, w, color = COLORS.paper2) {
  setDraw(doc, color);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

function hexToRgb(hex) {
  if (!hex || !hex.startsWith("#")) return COLORS.ink3;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function addPageFooters(doc, W, ML, MR, dateStr) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFill(doc, COLORS.ink);
    doc.rect(0, 287, W, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(doc, [180, 170, 155]);
    doc.text(`CellTx Match · Tumor Board Packet · ${dateStr}`, ML, 293);
    doc.text(`Page ${i} of ${pages}`, W - MR, 293, { align: "right" });
  }
}

export function generateBoardPdf(cases) {
  if (!cases || cases.length === 0) return;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, ML = 16, MR = 16, CW = W - ML - MR;
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  let y = 0;

  // ── COVER PAGE ─────────────────────────────────────────────────────────────
  setFill(doc, COLORS.ink);
  doc.rect(0, 0, W, 14, "F");
  setFill(doc, COLORS.red);
  doc.rect(0, 0, W * 0.28, 14, "F");
  setFill(doc, COLORS.ink);
  doc.rect(0, 14, W, 26, "F");

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  setColor(doc, [244, 241, 234]);
  doc.text("TUMOR BOARD PACKET", ML, 29);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  setColor(doc, [180, 170, 155]);
  doc.text(`${dateStr} · CellTx Match · cart-match.vercel.app`, ML, 35);

  y = 52;

  // Summary count boxes
  const approved   = cases.filter(c => c.status === "approved").length;
  const discussed  = cases.filter(c => c.status === "discussed").length;
  const pending    = cases.filter(c => c.status === "pending").length;
  const deferred   = cases.filter(c => c.status === "deferred").length;

  const boxes = [
    { label: "Total Cases", val: cases.length,  color: COLORS.ink3  },
    { label: "Approved",    val: approved,       color: COLORS.green },
    { label: "Discussed",   val: discussed,      color: COLORS.blue  },
    { label: "Deferred",    val: deferred,       color: COLORS.amber },
    { label: "Pending",     val: pending,        color: COLORS.ink3  },
  ];
  const bw = CW / boxes.length;
  boxes.forEach(({ label, val, color }, i) => {
    const bx = ML + i * bw;
    setDraw(doc, color);
    doc.setLineWidth(0.4);
    doc.rect(bx, y, bw - 2, 15, "D");
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    setColor(doc, color);
    doc.text(String(val), bx + (bw - 2) / 2, y + 9.5, { align: "center" });
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text(label.toUpperCase(), bx + (bw - 2) / 2, y + 14, { align: "center" });
  });
  y += 23;

  // Case summary table
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("CASE SUMMARY", ML, y);
  rule(doc, ML, y + 2, CW);
  y += 9;

  // Table header
  setFill(doc, COLORS.paper2);
  doc.rect(ML, y - 3.5, CW, 7.5, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  const cols = { label: ML + 2, cancer: ML + 28, lines: ML + 86, ecog: ML + 100, elig: ML + 114, status: ML + 132 };
  doc.text("PATIENT",     cols.label,  y + 1);
  doc.text("CANCER TYPE", cols.cancer, y + 1);
  doc.text("LINES",       cols.lines,  y + 1);
  doc.text("ECOG",        cols.ecog,   y + 1);
  doc.text("ELIGIBLE",    cols.elig,   y + 1);
  doc.text("STATUS",      cols.status, y + 1);
  y += 8;

  cases.forEach((c, i) => {
    if (y > 272) { doc.addPage(); y = 20; }
    const eligCount  = c.results ? Object.values(c.results).filter(r => r.eligible).length : 0;
    const totalCount = Object.keys(c.results || {}).length;
    const sm = STATUS_META[c.status] || STATUS_META["pending"];

    if (i % 2 === 0) {
      setFill(doc, COLORS.paper);
      doc.rect(ML, y - 3, CW, 7, "F");
    }
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink);
    doc.text(c.patientLabel, cols.label, y + 1);

    doc.setFont("helvetica", "normal");
    const cancerShort = (c.patient.cancerType || "—").split("(")[0].trim().substring(0, 28);
    doc.text(cancerShort,            cols.cancer, y + 1);
    doc.text(String(c.patient.priorLines || "—"), cols.lines, y + 1);
    doc.text(String(c.patient.ecog || "—"),       cols.ecog,  y + 1);

    setColor(doc, eligCount > 0 ? COLORS.green : COLORS.red);
    doc.setFont("helvetica", "bold");
    doc.text(`${eligCount}/${totalCount}`, cols.elig, y + 1);

    setColor(doc, sm.color);
    doc.text(sm.label.toUpperCase(), cols.status, y + 1);

    y += 7;
  });

  // ── PER-PATIENT PAGES ──────────────────────────────────────────────────────
  cases.forEach(c => {
    doc.addPage();
    y = 0;

    const sm = STATUS_META[c.status] || STATUS_META["pending"];
    const statusRgb = hexToRgb(sm.hex);

    // Patient header bar
    setFill(doc, COLORS.ink);
    doc.rect(0, 0, W, 14, "F");
    setFill(doc, statusRgb);
    doc.rect(0, 0, W * 0.16, 14, "F");
    setFill(doc, COLORS.paper2);
    doc.rect(0, 14, W, 22, "F");

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink);
    doc.text(c.patientLabel, ML, 28);

    const subtitleParts = [
      c.patient.cancerType || null,
      c.patient.priorLines ? `${c.patient.priorLines} prior lines` : null,
      c.patient.ecog !== "" ? `ECOG ${c.patient.ecog}` : null,
    ].filter(Boolean);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink3);
    doc.text(subtitleParts.join(" · "), ML + 52, 28);

    // Status badge (right)
    setColor(doc, sm.color);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(sm.label.toUpperCase(), W - MR, 28, { align: "right" });

    y = 44;

    // Notes block
    if (c.notes && c.notes.trim()) {
      setFill(doc, [240, 237, 228]);
      const noteLines = doc.splitTextToSize(c.notes, CW - 26);
      const noteH = Math.max(12, noteLines.length * 4.5 + 6);
      doc.rect(ML, y, CW, noteH, "F");
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, COLORS.ink3);
      doc.text("NOTES", ML + 3, y + 5);
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      doc.text(noteLines, ML + 22, y + 5);
      y += noteH + 6;
    }

    // Patient fields
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("PATIENT PROFILE", ML, y);
    rule(doc, ML, y + 2, CW);
    y += 8;

    const fields = [
      ["Cancer type",    c.patient.cancerType || "—"],
      ["Prior lines",    c.patient.priorLines  || "—"],
      ["ECOG",           c.patient.ecog        || "—"],
      ["CD19",           c.patient.cd19        || "—"],
      ["BCMA",           c.patient.bcma        || "—"],
      ["CD20",           c.patient.cd20        || "—"],
      ["Active CNS",     c.patient.activeCns        ? "Yes" : "No"],
      ["Autoimmune",     c.patient.activeAutoimmune  ? "Yes" : "No"],
    ];
    const col2 = ML + CW / 2;
    fields.forEach(([label, val], i) => {
      const col = i % 2 === 0 ? ML : col2;
      if (i % 2 === 0 && i > 0) y += 5.5;
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      setColor(doc, COLORS.ink3);
      doc.text(label + ":", col, y);
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      doc.text(String(val), col + 26, y);
    });
    y += 10;

    // Eligibility breakdown
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("CANDIDATE PRODUCTS", ML, y);
    rule(doc, ML, y + 2, CW);
    y += 8;

    if (c.results) {
      const sortedEntries = Object.entries(c.results).sort(([, a], [, b]) => {
        const rank = r => r.blocks.length > 0 ? 2 : r.hasWarning ? 1 : 0;
        return rank(a) - rank(b);
      });

      sortedEntries.forEach(([pid, r]) => {
        if (y > 260) { doc.addPage(); y = 20; }
        const rowColor  = r.blocks.length > 0 ? COLORS.red : r.hasWarning ? COLORS.amber : COLORS.green;
        const rowLabel  = r.blocks.length > 0 ? "INELIGIBLE" : r.hasWarning ? "REVIEW" : "ELIGIBLE";

        setFill(doc, COLORS.paper2);
        doc.rect(ML, y - 3, CW, 8, "F");
        setFill(doc, rowColor);
        doc.rect(ML, y - 3, 2.5, 8, "F");

        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        setColor(doc, COLORS.ink);
        doc.text(pid.charAt(0).toUpperCase() + pid.slice(1), ML + 6, y + 2);

        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        setColor(doc, rowColor);
        doc.text(rowLabel, W - MR, y + 2, { align: "right" });
        y += 9;

        if (r.blocks.length > 0) {
          r.blocks.slice(0, 3).forEach(b => {
            if (y > 272) { doc.addPage(); y = 20; }
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            setColor(doc, COLORS.red);
            doc.text("✗", ML + 5, y);
            setColor(doc, COLORS.ink);
            const lines = doc.splitTextToSize(b, CW - 16);
            doc.text(lines, ML + 10, y);
            y += lines.length * 4 + 1;
          });
        }
        y += 2;
        rule(doc, ML, y, CW, COLORS.paper2);
        y += 3;
      });
    }

    // Disclaimer
    if (y > 258) { doc.addPage(); y = 20; }
    setFill(doc, COLORS.paper2);
    doc.rect(ML, y + 4, CW, 14, "F");
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("CLINICAL DISCLAIMER", ML + 3, y + 10);
    doc.setFont("helvetica", "normal");
    const disc = "For educational and research purposes only. Confirm against current FDA prescribing information, institutional protocols, and individual clinical judgment.";
    const discLines = doc.splitTextToSize(disc, CW - 6);
    doc.text(discLines, ML + 3, y + 14);
  });

  // Footers on all pages
  addPageFooters(doc, W, ML, MR, dateStr);

  doc.save("CellTx-Tumor-Board-Packet.pdf");
}
