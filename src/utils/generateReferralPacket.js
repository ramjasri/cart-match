// src/utils/generateReferralPacket.js
// One-page (or two-page) referral packet PDF formatted for the RECEIVING
// CAR-T center to triage an inbound patient in 90 seconds.
//
// Different audience from generatePdf.js — the existing report is for the
// referring clinician / tumor board (deep analysis). This packet is for the
// CAR-T center coordinator who opens the fax on Monday and needs to know:
// who · what · why · urgency · what they have · what's missing.

import { jsPDF } from "jspdf";
import { calculateUrgency } from "./urgency.js";
import { evaluatePathway } from "./pathways.js";
import { generateWorkup, workupItemCount } from "./workup.js";

const COLORS = {
  ink:    [26, 24, 21],
  ink3:   [107, 100, 90],
  paper:  [244, 241, 234],
  paper2: [235, 230, 220],
  red:    [181, 74, 44],
  green:  [90, 122, 74],
  amber:  [196, 166, 97],
  blue:   [76, 107, 140],
  gold:   [196, 166, 97],
};

function setColor(doc, rgb) { doc.setTextColor(...rgb); }
function setFill(doc, rgb)  { doc.setFillColor(...rgb); }
function setDraw(doc, rgb)  { doc.setDrawColor(...rgb); }

function rule(doc, x, y, w, color = COLORS.ink) {
  setDraw(doc, color);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

function pageBreakIfNeeded(doc, y, threshold = 275) {
  if (y > threshold) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function generateReferralPacket({
  patient,
  results,
  products,
  caseData,           // optional: timeline + tasks data when available
  referringInstitution = "",
  referringCoordinator = "",
  referringContact = "",
}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, ML = 14, MR = 14, CW = W - ML - MR;
  let y = 0;

  // ── HEADER BAR ───────────────────────────────────────────────────────────
  setFill(doc, COLORS.ink);
  doc.rect(0, 0, W, 12, "F");
  setFill(doc, COLORS.red);
  doc.rect(0, 0, W * 0.32, 12, "F");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.paper);
  doc.text("CAR-T REFERRAL PACKET", ML, 8);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  setColor(doc, [180, 170, 155]);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated ${dateStr} · via CellTx Match`, W - MR, 8, { align: "right" });

  y = 18;

  // ── PATIENT IDENTITY STRIP ───────────────────────────────────────────────
  const patientLabel = caseData?.patientLabel || "Patient";
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink);
  doc.text(patientLabel, ML, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  setColor(doc, COLORS.ink3);
  const idStripParts = [
    patient.cancerType || "—",
    patient.priorLines ? `${patient.priorLines} prior lines` : null,
    patient.ecog !== "" && patient.ecog !== undefined ? `ECOG ${patient.ecog}` : null,
  ].filter(Boolean);
  doc.text(idStripParts.join(" · "), ML + 40, y);

  y += 5;
  rule(doc, ML, y, CW);
  y += 6;

  // ── REFERRING INFO BLOCK ─────────────────────────────────────────────────
  if (referringInstitution || referringCoordinator || referringContact) {
    setFill(doc, COLORS.paper2);
    doc.rect(ML, y - 3, CW, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.ink3);
    doc.text("REFERRING", ML + 2, y);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink);
    const refParts = [referringInstitution, referringCoordinator, referringContact].filter(Boolean);
    doc.text(refParts.join(" · "), ML + 22, y);
    y += 12;
  }

  // ── URGENCY BAND ─────────────────────────────────────────────────────────
  const urgency = calculateUrgency(patient);
  if (urgency) {
    const uColor = urgency.level === "high" ? COLORS.red
      : urgency.level === "medium" ? COLORS.amber : COLORS.green;
    setFill(doc, [uColor[0], uColor[1], uColor[2], 0.1]);
    setDraw(doc, uColor);
    doc.setLineWidth(0.6);
    doc.rect(ML, y, CW, 14, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, uColor);
    doc.text(urgency.label, ML + 3, y + 4.5);

    doc.setFontSize(10);
    setColor(doc, COLORS.ink);
    doc.text(urgency.sub, ML + 3, y + 9.5);

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(doc, COLORS.ink3);
    const factorTxt = urgency.factors.slice(0, 3).join(" · ");
    if (factorTxt) {
      const lines = doc.splitTextToSize(factorTxt, CW - 6);
      doc.text(lines, ML + 3, y + 13);
    }
    y += 17;
  }

  // ── CANDIDATE PRODUCTS (preferred order) ─────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("CANDIDATE PRODUCTS · IN PREFERENCE ORDER", ML, y);
  y += 4;

  const pathway = evaluatePathway(patient);
  const preferredIds = (pathway?.productPreferences || []).map(p => p.id);
  const eligibleProducts = products
    .filter(p => results[p.id]?.eligible)
    .sort((a, b) => {
      const ai = preferredIds.indexOf(a.id);
      const bi = preferredIds.indexOf(b.id);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

  if (eligibleProducts.length === 0) {
    setFill(doc, [181, 74, 44, 0.08]);
    doc.rect(ML, y, CW, 10, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    setColor(doc, COLORS.red);
    doc.text("No approved products currently eligible. Recommend trial-based referral pathway.", ML + 3, y + 6);
    y += 13;
  } else {
    eligibleProducts.slice(0, 5).forEach((p, idx) => {
      y = pageBreakIfNeeded(doc, y, 268);
      setFill(doc, idx === 0 ? COLORS.green : COLORS.paper2);
      doc.rect(ML, y, CW, 7, "F");

      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      setColor(doc, idx === 0 ? COLORS.paper : COLORS.ink);
      doc.text(`${idx + 1}. ${p.name}`, ML + 2, y + 4.8);

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      setColor(doc, idx === 0 ? COLORS.gold : COLORS.ink3);
      doc.text(`${p.generic} · ${p.target} · ${p.sponsor}`, ML + 32, y + 4.8);

      const ref = (pathway?.productPreferences || []).find(pp => pp.id === p.id);
      if (ref) {
        doc.text(ref.trial || "", W - MR - 2, y + 4.8, { align: "right" });
      }
      y += 8;
    });
    y += 2;
  }

  // ── ELIGIBILITY SNAPSHOT (compact) ───────────────────────────────────────
  y = pageBreakIfNeeded(doc, y, 230);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("ELIGIBILITY · TOP-LINE", ML, y);
  y += 4;

  // Build a compact criteria list from the top candidate product
  const topProduct = eligibleProducts[0] || products.find(p => results[p.id]);
  if (topProduct && results[topProduct.id]) {
    const r = results[topProduct.id];
    setFill(doc, COLORS.paper2);
    doc.rect(ML, y - 2, CW, 4, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    setColor(doc, COLORS.ink3);
    doc.text(`Reference: ${topProduct.name} eligibility profile`, ML + 2, y + 1);
    y += 5;

    // Mix passes + warnings together, max 6 lines
    const items = [
      ...r.passes.slice(0, 4).map(t => ({ icon: "✓", color: COLORS.green, text: t })),
      ...r.warnings.slice(0, 2).map(t => ({ icon: "!", color: COLORS.amber, text: t })),
      ...r.blocks.slice(0, 2).map(t => ({ icon: "✗", color: COLORS.red, text: t })),
    ].slice(0, 8);

    items.forEach(it => {
      y = pageBreakIfNeeded(doc, y, 270);
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, it.color);
      doc.text(it.icon, ML + 2, y);
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      const lines = doc.splitTextToSize(it.text, CW - 12);
      doc.text(lines, ML + 8, y);
      y += lines.length * 3.5 + 0.5;
    });
    y += 2;
  }

  // ── WORKUP STATUS ────────────────────────────────────────────────────────
  y = pageBreakIfNeeded(doc, y, 220);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("WORKUP STATUS", ML, y);
  y += 4;

  // If caseData has tasks/labs already tracked, use those; else use the
  // generic workup checklist
  const completedLabs = caseData?.timeline?.pendingLabs?.filter(l => l.status === "complete") || [];
  const pendingLabs   = caseData?.timeline?.pendingLabs?.filter(l => l.status !== "complete") || [];
  const wk = generateWorkup(patient);
  const hasCaseTracking = (completedLabs.length + pendingLabs.length) > 0;

  if (hasCaseTracking) {
    // Show actual tracked status
    if (completedLabs.length > 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, COLORS.green);
      doc.text("COMPLETED", ML + 2, y);
      y += 3.5;
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      completedLabs.forEach(lab => {
        y = pageBreakIfNeeded(doc, y, 270);
        doc.setFontSize(7);
        doc.text(`✓ ${lab.name}${lab.completedAt ? ` (${lab.completedAt})` : ""}`, ML + 4, y);
        y += 3.5;
      });
      y += 1;
    }
    if (pendingLabs.length > 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "bold");
      setColor(doc, COLORS.amber);
      doc.text("PENDING", ML + 2, y);
      y += 3.5;
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      pendingLabs.forEach(lab => {
        y = pageBreakIfNeeded(doc, y, 270);
        doc.setFontSize(7);
        doc.text(`☐ ${lab.name}${lab.orderedAt ? ` (ordered ${lab.orderedAt})` : ""}`, ML + 4, y);
        y += 3.5;
      });
      y += 1;
    }
  } else if (wk && workupItemCount(wk) > 0) {
    // Show recommended workup
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    setColor(doc, COLORS.ink3);
    doc.text("Recommended pre-referral workup (status not yet tracked):", ML + 2, y);
    y += 4;
    const cats = ["pathology", "labs", "imaging", "documentation"];
    cats.forEach(cat => {
      const arr = wk[cat] || [];
      if (arr.length === 0) return;
      y = pageBreakIfNeeded(doc, y, 270);
      const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      setColor(doc, COLORS.ink3);
      doc.text(`${catLabel.toUpperCase()} (${arr.length})`, ML + 2, y);
      y += 3.5;
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      arr.slice(0, 4).forEach(item => {
        y = pageBreakIfNeeded(doc, y, 270);
        const txt = `☐ ${item.text}`;
        const lines = doc.splitTextToSize(txt, CW - 8);
        doc.text(lines, ML + 4, y);
        y += lines.length * 3.5;
      });
      y += 0.5;
    });
  }

  // ── CLINICAL CONTEXT (pathway-aware) ─────────────────────────────────────
  if (pathway) {
    y = pageBreakIfNeeded(doc, y, 220);
    y += 2;
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    setColor(doc, COLORS.blue);
    doc.text("CLINICAL CONTEXT · NCCN-ALIGNED", ML, y);
    y += 4;

    if (pathway.nccnContext.length > 0) {
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      setColor(doc, COLORS.ink);
      pathway.nccnContext.slice(0, 3).forEach(ctx => {
        y = pageBreakIfNeeded(doc, y, 270);
        const lines = doc.splitTextToSize(`· ${ctx}`, CW - 4);
        doc.text(lines, ML + 2, y);
        y += lines.length * 3.5 + 0.5;
      });
    }
  }

  // ── ATTACHMENTS NEEDED FROM REFERRING TEAM ───────────────────────────────
  y = pageBreakIfNeeded(doc, y, 230);
  y += 2;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  setColor(doc, COLORS.ink3);
  doc.text("ATTACHMENTS NEEDED FROM REFERRING TEAM", ML, y);
  y += 4;

  const attachments = [
    "Most recent pathology report (with biomarker IHC if available)",
    "Outside records — complete therapy history with dates and best responses",
    "Most recent imaging (PET/CT, MRI, etc.) with reports",
    "Active medication list",
    "Insurance card front + back",
    "Patient demographics + contact information",
  ];
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  setColor(doc, COLORS.ink);
  attachments.forEach(a => {
    y = pageBreakIfNeeded(doc, y, 270);
    doc.text(`☐ ${a}`, ML + 2, y);
    y += 3.5;
  });

  // ── FOOTER ───────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    setFill(doc, COLORS.ink);
    doc.rect(0, 287, W, 10, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    setColor(doc, [180, 170, 155]);
    doc.text(`CellTx Match · Referral Packet · Page ${i} of ${pages}`, ML, 293);
    doc.text("Not a medical device · Decision support only · Verify against current FDA PI", W - MR, 293, { align: "right" });
  }

  const labelClean = (caseData?.patientLabel || "Patient").replace(/[^a-z0-9]/gi, "_");
  doc.save(`Referral-Packet-${labelClean}.pdf`);
}
