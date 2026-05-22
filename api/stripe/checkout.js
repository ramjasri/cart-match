// api/stripe/checkout.js
// Creates a Stripe Checkout session for a subscription tier.
//
// Required env vars (set in Vercel dashboard):
//   STRIPE_SECRET_KEY                         — Stripe API key (sk_live_... or sk_test_...)
//   STRIPE_PRICE_PRACTICE_MONTHLY             — Stripe Price ID for Practice monthly
//   STRIPE_PRICE_PRACTICE_YEARLY              — Practice annual
//   STRIPE_PRICE_INSTITUTION_MONTHLY          — Institution monthly
//   STRIPE_PRICE_INSTITUTION_YEARLY           — Institution annual
//   CLERK_SECRET_KEY                          — Clerk backend SDK (sk_live_... or sk_test_...)
//   SITE_URL                                  — e.g. https://cart-match.vercel.app
//
// POST body: { tier: "practice" | "institution", interval: "monthly" | "yearly" }
// Returns:    { url: "https://checkout.stripe.com/..." } — redirect the user there

import Stripe from "stripe";
import { verifyToken } from "@clerk/backend";

const PRICE_MAP = {
  // The only self-serve Stripe Checkout tier — Pilot is sales-led
  // (qualification needed), Enterprise is custom-contract.
  "institutional:monthly": "STRIPE_PRICE_INSTITUTIONAL_MONTHLY",
  "institutional:yearly":  "STRIPE_PRICE_INSTITUTIONAL_YEARLY",
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Environment guard — if Stripe isn't configured yet, return a clear error
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({
      error: "Stripe not configured",
      hint: "Add STRIPE_SECRET_KEY and tier price IDs to Vercel env vars. Falling back to waitlist.",
    });
  }

  const { tier, interval = "monthly" } = req.body || {};
  const key = `${tier}:${interval}`;
  const priceEnvVar = PRICE_MAP[key];
  if (!priceEnvVar) {
    return res.status(400).json({ error: `Unknown tier/interval: ${key}` });
  }
  const priceId = process.env[priceEnvVar];
  if (!priceId) {
    return res.status(503).json({ error: `Price not configured for ${key}` });
  }

  // Verify the Clerk session (optional — checkout can work for anonymous users too)
  let userId = null;
  let userEmail = null;
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token && process.env.CLERK_SECRET_KEY) {
      const session = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      userId = session.sub;
      userEmail = session.email || null;
    }
  } catch {
    // Anonymous checkout is fine for trial signups
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 14,
        metadata: { tier, clerk_user_id: userId || "anonymous" },
      },
      success_url: `${siteUrl}/?checkout=success&tier=${tier}`,
      cancel_url:  `${siteUrl}/pricing?checkout=cancelled`,
      customer_email: userEmail || undefined,
      client_reference_id: userId || undefined,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });
    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    return res.status(500).json({ error: "Stripe error", detail: err.message });
  }
}
