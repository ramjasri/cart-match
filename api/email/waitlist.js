// api/email/waitlist.js
// Receives waitlist form submissions, sends:
//   1. Internal notification to founder (sri.ramya003@gmail.com)
//   2. Welcome email to the prospect
//
// Required env vars:
//   RESEND_API_KEY        — from https://resend.com (free tier: 100 emails/day, 3k/month)
//   RESEND_FROM           — e.g. "CellTx Match <hello@cart-match.com>" (verified domain)
//   FOUNDER_EMAIL         — internal notification destination (default: sri.ramya003@gmail.com)
//
// To activate:
//   1. Sign up at resend.com
//   2. Verify your sending domain (or use resend.dev for testing)
//   3. Add the env vars to Vercel
//   4. The waitlist modal in App.jsx will automatically use this endpoint
//      if RESEND_API_KEY is set; otherwise falls back to Formspree.

import { Resend } from "resend";

const FOUNDER_EMAIL_DEFAULT = "sri.ramya003@gmail.com";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({
      error: "Resend not configured",
      hint: "Add RESEND_API_KEY to Vercel env vars. Falling back to Formspree.",
    });
  }

  const { name, email, institution, role } = req.body || {};
  if (!name || !email || !institution) {
    return res.status(400).json({ error: "name, email, institution required" });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromAddress = process.env.RESEND_FROM || "CellTx Match <onboarding@resend.dev>";
  const founderEmail = process.env.FOUNDER_EMAIL || FOUNDER_EMAIL_DEFAULT;

  // Notification email to founder
  const internalEmail = {
    from: fromAddress,
    to: founderEmail,
    subject: `[CellTx waitlist] ${name} · ${institution}`,
    text: [
      `New institutional access request:`,
      ``,
      `Name:         ${name}`,
      `Email:        ${email}`,
      `Institution:  ${institution}`,
      `Role:         ${role || "(not provided)"}`,
      ``,
      `Reply directly to this email to respond to the prospect.`,
    ].join("\n"),
    reply_to: email,
  };

  // Welcome email to prospect
  const welcomeEmail = {
    from: fromAddress,
    to: email,
    subject: "Thanks for your interest in CellTx Match",
    html: welcomeHtml({ name, institution }),
    text: welcomeText({ name, institution }),
    reply_to: founderEmail,
  };

  try {
    const [internal, welcome] = await Promise.all([
      resend.emails.send(internalEmail),
      resend.emails.send(welcomeEmail),
    ]);
    return res.status(200).json({
      ok: true,
      internalId: internal?.data?.id,
      welcomeId:  welcome?.data?.id,
    });
  } catch (err) {
    return res.status(500).json({ error: "Email send failed", detail: err.message });
  }
}

function welcomeText({ name, institution }) {
  return [
    `Hi ${name},`,
    ``,
    `Thanks for requesting institutional access to CellTx Match — the cell therapy referral intelligence platform for oncology teams.`,
    ``,
    `I'll personally review your ${institution} request within one business day and follow up with next steps. We typically schedule a 30-minute walk-through where I'll show:`,
    ``,
    `  • How the platform handles your specific tumor board workflow`,
    `  • Custom institution branding on referral PDFs`,
    `  • Shared tumor board across your team`,
    `  • Integration options (API, EMR via Redox/Particle)`,
    ``,
    `In the meantime, the platform is fully free for individual use — feel free to try a few cases:`,
    `https://cart-match.vercel.app`,
    ``,
    `Browse the full criteria library:`,
    `https://cart-match.vercel.app/criteria`,
    ``,
    `Talk soon,`,
    `Ramya Sri Janapareddy`,
    `Founder, CellTx Match`,
    ``,
    `— Reply to this email any time.`,
  ].join("\n");
}

function welcomeHtml({ name, institution }) {
  return `
<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 20px; color: #1a1815; background: #f4f1ea;">
  <div style="border-top: 4px solid #1a1815; border-bottom: 1px solid #1a1815; padding: 18px 0 16px; margin-bottom: 24px;">
    <div style="font-family: Georgia, serif; font-size: 18px; letter-spacing: 0.08em;">CELLTX MATCH</div>
    <div style="font-family: ui-monospace, Menlo, monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.2em; color: #6b645a; margin-top: 4px;">Cell Therapy Referral Intelligence</div>
  </div>

  <p>Hi ${escapeHtml(name)},</p>

  <p>Thanks for requesting institutional access to CellTx Match — the cell therapy referral intelligence platform for oncology teams.</p>

  <p>I'll personally review your <strong>${escapeHtml(institution)}</strong> request within one business day and follow up with next steps. We typically schedule a 30-minute walk-through covering:</p>

  <ul style="line-height: 1.7;">
    <li>How the platform handles your specific tumor board workflow</li>
    <li>Custom institution branding on referral PDFs</li>
    <li>Shared tumor board across your team (multi-user, cross-device)</li>
    <li>Integration options (API, EMR via Redox/Particle)</li>
  </ul>

  <p>In the meantime, the platform is fully free for individual use — feel free to run a few cases:</p>

  <p style="margin: 18px 0;">
    <a href="https://cart-match.vercel.app" style="display: inline-block; padding: 11px 22px; background: #1a1815; color: #f4f1ea; text-decoration: none; font-family: ui-monospace, Menlo, monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em;">Open the screener →</a>
  </p>

  <p>And the full criteria library is publicly browseable — every rule sourced to FDA labels and NCCN guidelines:</p>

  <p style="margin: 14px 0;">
    <a href="https://cart-match.vercel.app/criteria" style="color: #4c6b8c;">cart-match.vercel.app/criteria →</a>
  </p>

  <p style="margin-top: 32px;">Talk soon,<br>
  <strong>Ramya Sri Janapareddy</strong><br>
  <span style="color: #6b645a; font-size: 14px;">Founder, CellTx Match</span></p>

  <p style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1a181520; font-size: 12px; color: #6b645a;">
    Reply to this email any time — it goes directly to me.
  </p>
</body></html>
  `.trim();
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
