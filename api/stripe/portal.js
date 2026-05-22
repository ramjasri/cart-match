// api/stripe/portal.js
// Creates a Stripe Customer Portal session — gives the user a hosted page
// where they can update payment method, change plan, view invoices, cancel.
//
// POST body: (none required — uses Clerk auth header to identify user)
// Returns:    { url: "https://billing.stripe.com/..." }

import Stripe from "stripe";
import { createClerkClient, verifyToken } from "@clerk/backend";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.CLERK_SECRET_KEY) {
    return res.status(503).json({ error: "Stripe/Clerk not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  let userId;
  try {
    const session = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
    userId = session.sub;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const user = await clerk.users.getUser(userId);
  const customerId = user?.publicMetadata?.subscription?.stripeCustomerId;
  if (!customerId) {
    return res.status(404).json({ error: "No active subscription found" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${siteUrl}/pricing`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: "Stripe error", detail: err.message });
  }
}
