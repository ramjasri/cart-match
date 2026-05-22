// api/email/digest.js
// Sends a weekly tumor board digest email. The CLIENT composes the digest
// content from its localStorage cases (the server never sees patient data).
// We just take the pre-composed payload and pipe it through Resend.
//
// This preserves the "no PHI on servers" architecture: we don't store the
// digest content, we don't log it, we don't retain it beyond the Resend
// transactional pipeline (which is itself ephemeral).
//
// POST body: {
//   toEmail:    string                            (recipient — user's own email)
//   toName:     string                            (optional)
//   dateStr:    string                            (e.g., "Sunday, May 25, 2026")
//   summary:    { awaiting, active, infused, followup, closed }
//   cases:      [{ label, cancerCategory, stageLabel, phase, eligibleCount, totalCount }]
// }
//
// Required env vars: RESEND_API_KEY, RESEND_FROM

import { Resend } from "resend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({
      error: "Resend not configured",
      hint: "Add RESEND_API_KEY to Vercel env vars to enable digest emails.",
    });
  }

  const { toEmail, toName, dateStr, summary = {}, cases = [] } = req.body || {};
  if (!toEmail || !dateStr) {
    return res.status(400).json({ error: "toEmail and dateStr required" });
  }

  // Sanity guards — defuse abuse
  if (cases.length > 200) {
    return res.status(400).json({ error: "Too many cases in digest payload" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM || "CellTx Match <onboarding@resend.dev>";

  const totalActive = (summary.awaiting || 0) + (summary.active || 0);
  const subjectCount = cases.length === 0 ? "your tumor board" : `${cases.length} case${cases.length !== 1 ? "s" : ""}`;
  const urgencyTag = totalActive >= 3 ? " · review needed" : "";

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: toEmail,
      subject: `Your tumor board · ${subjectCount}${urgencyTag} · ${dateStr.split(",")[0]}`,
      html: digestHtml({ toName, dateStr, summary, cases }),
      text: digestText({ toName, dateStr, summary, cases }),
    });
    return res.status(200).json({ ok: true, id: result?.data?.id });
  } catch (err) {
    return res.status(500).json({ error: "Send failed", detail: err.message });
  }
}

function digestText({ toName, dateStr, summary, cases }) {
  const lines = [
    `Your tumor board summary`,
    dateStr,
    ``,
    `Hi ${toName || "Dr."}`,
    ``,
    `Quick summary of your tumor board ahead of next week:`,
    ``,
    `  · ${summary.awaiting || 0} awaiting decision`,
    `  · ${summary.active || 0} active referral${summary.active === 1 ? "" : "s"}`,
    `  · ${(summary.infused || 0) + (summary.followup || 0)} infused / follow-up`,
    `  · ${summary.closed || 0} closed`,
    ``,
  ];

  if (cases.length > 0) {
    lines.push(`Cases:`);
    lines.push(``);
    cases.forEach(c => {
      lines.push(`  ${c.label} — ${c.cancerCategory || "—"} · ${c.stageLabel} · ${c.eligibleCount}/${c.totalCount} eligible`);
    });
    lines.push(``);
  }

  lines.push(`Open the full board:`);
  lines.push(`https://cart-match.vercel.app/board`);
  lines.push(``);
  lines.push(`To stop receiving this digest, turn off "Weekly digest" in the tumor board header.`);
  lines.push(``);
  lines.push(`— CellTx Match`);
  return lines.join("\n");
}

function digestHtml({ toName, dateStr, summary, cases }) {
  const totalActive = (summary.awaiting || 0) + (summary.active || 0);
  const urgentPill = totalActive >= 3
    ? `<span style="display:inline-block;padding:3px 9px;font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.15em;background:#b54a2c;color:#f4f1ea;margin-left:8px;">Review needed</span>`
    : "";

  const summaryHtml = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 8px;">
      ${stat(summary.awaiting || 0, "Awaiting", "#6b645a")}
      ${stat(summary.active   || 0, "Active",   "#5a7a4a")}
      ${stat((summary.infused || 0) + (summary.followup || 0), "Infused / FU", "#4c6b8c")}
      ${stat(summary.closed   || 0, "Closed",   "#1a1815")}
    </div>
  `;

  const caseRowsHtml = cases.length === 0
    ? `<p style="color:#6b645a;font-style:italic;margin:18px 0;">No cases on the board yet. <a href="https://cart-match.vercel.app/" style="color:#4c6b8c;">Screen a patient →</a></p>`
    : `
      <table style="width:100%;border-collapse:collapse;margin:14px 0 24px;">
        <thead>
          <tr style="background:#ebe6dc;">
            <th style="text-align:left;padding:8px 10px;font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#6b645a;border-bottom:1px solid #1a181530;">Patient</th>
            <th style="text-align:left;padding:8px 10px;font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#6b645a;border-bottom:1px solid #1a181530;">Disease</th>
            <th style="text-align:left;padding:8px 10px;font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#6b645a;border-bottom:1px solid #1a181530;">Stage</th>
            <th style="text-align:right;padding:8px 10px;font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#6b645a;border-bottom:1px solid #1a181530;">Eligible</th>
          </tr>
        </thead>
        <tbody>
          ${cases.map(c => `
            <tr>
              <td style="padding:9px 10px;font-weight:600;color:#1a1815;border-bottom:1px solid #1a181515;font-size:13px;">${escapeHtml(c.label)}</td>
              <td style="padding:9px 10px;color:#3a352e;border-bottom:1px solid #1a181515;font-size:13px;">${escapeHtml(c.cancerCategory || "—")}</td>
              <td style="padding:9px 10px;color:#3a352e;border-bottom:1px solid #1a181515;font-size:13px;">${escapeHtml(c.stageLabel)}</td>
              <td style="padding:9px 10px;color:${c.eligibleCount > 0 ? "#5a7a4a" : "#b54a2c"};font-weight:700;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:11px;border-bottom:1px solid #1a181515;">${c.eligibleCount}/${c.totalCount}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

  return `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f1ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;">
    <tr><td align="center" style="padding:32px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#f4f1ea;">

        <!-- Header bar -->
        <tr><td style="border-top:4px solid #1a1815;height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="background:#1a1815;padding:18px 24px;">
          <div style="font-family:Georgia,serif;font-size:18px;color:#f4f1ea;letter-spacing:0.08em;line-height:1;">CELLTX MATCH</div>
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:9.5px;text-transform:uppercase;letter-spacing:0.2em;color:#c4a661;margin-top:5px;">Weekly Tumor Board Digest</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 24px;color:#1a1815;">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.18em;color:#6b645a;margin-bottom:10px;">${escapeHtml(dateStr)}</div>

          <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:500;color:#1a1815;letter-spacing:-0.015em;margin:0 0 6px;line-height:1.15;">
            ${cases.length} case${cases.length !== 1 ? "s" : ""} on your board${urgentPill}
          </h1>
          <p style="font-size:14px;color:#6b645a;line-height:1.6;margin:6px 0 0;">Hi ${escapeHtml(toName || "Dr.")} — here's a quick look ahead of next week's review.</p>

          ${summaryHtml}

          <h2 style="font-family:Georgia,serif;font-size:16px;font-weight:500;color:#1a1815;margin:28px 0 0;padding-bottom:6px;border-bottom:1px solid #1a181530;">Cases</h2>
          ${caseRowsHtml}

          <!-- CTA -->
          <p style="margin:18px 0 4px;">
            <a href="https://cart-match.vercel.app/board" style="display:inline-block;padding:13px 24px;background:#1a1815;color:#f4f1ea;text-decoration:none;font-family:ui-monospace,Menlo,monospace;font-size:11px;text-transform:uppercase;letter-spacing:0.18em;">Open tumor board →</a>
          </p>
        </td></tr>

        <!-- Disclaimer -->
        <tr><td style="padding:14px 24px;background:#ebe6dc;border-top:1px solid #1a181530;border-bottom:1px solid #1a181530;">
          <div style="font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:#6b645a;line-height:1.65;letter-spacing:0.03em;">
            <strong style="color:#1a1815;">CellTx Match is not a medical device.</strong> For decision support by licensed healthcare professionals only. Always verify against current FDA prescribing information.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 24px;color:#6b645a;font-size:11px;line-height:1.65;">
          To stop receiving this digest, open the tumor board and toggle <strong>Weekly digest: OFF</strong> in the header. Cases never leave your browser — this email is composed client-side from your local tumor board state.
          <br><br>
          — CellTx Match · Cell Therapy Referral Intelligence
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>
  `.trim();
}

function stat(num, label, color) {
  return `
    <div style="flex:1;min-width:100px;padding:12px 14px;background:#f4f1ea;border:1px solid #1a181520;border-left:3px solid ${color};">
      <div style="font-family:Georgia,serif;font-size:22px;font-weight:500;color:#1a1815;line-height:1;">${num}</div>
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.14em;color:#6b645a;margin-top:4px;">${label}</div>
    </div>
  `;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
