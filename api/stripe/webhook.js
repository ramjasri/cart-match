// api/stripe/webhook.js
// Receives Stripe webhook events and updates Clerk user metadata
// (subscription status, plan, current period end).
//
// Required env vars:
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET     — from Stripe Dashboard → Developers → Webhooks
//   CLERK_SECRET_KEY
//
// Configure the webhook in Stripe Dashboard:
//   Endpoint URL: https://cart-match.vercel.app/api/stripe/webhook
//   Events to send:
//     - checkout.session.completed
//     - customer.subscription.created
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_succeeded
//     - invoice.payment_failed

import Stripe from "stripe";
import { createClerkClient } from "@clerk/backend";

export const config = {
  api: {
    bodyParser: false, // Stripe webhooks require the raw body for signature verification
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function updateClerkUserMetadata(clerkUserId, metadata) {
  if (!clerkUserId || clerkUserId === "anonymous") return;
  if (!process.env.CLERK_SECRET_KEY) return;
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  try {
    await clerk.users.updateUserMetadata(clerkUserId, { publicMetadata: metadata });
  } catch (err) {
    console.error("Clerk metadata update failed:", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" });
  const sig = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const clerkUserId = session.client_reference_id;
      const tier = session.metadata?.tier || session.subscription_data?.metadata?.tier;
      if (clerkUserId) {
        await updateClerkUserMetadata(clerkUserId, {
          subscription: {
            status: "trialing",
            tier,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
          },
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const clerkUserId = sub.metadata?.clerk_user_id;
      const tier = sub.metadata?.tier;
      if (clerkUserId && clerkUserId !== "anonymous") {
        await updateClerkUserMetadata(clerkUserId, {
          subscription: {
            status: sub.status, // "trialing" | "active" | "past_due" | "canceled" | etc.
            tier,
            stripeCustomerId: sub.customer,
            stripeSubscriptionId: sub.id,
            currentPeriodEnd: sub.current_period_end,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const clerkUserId = sub.metadata?.clerk_user_id;
      if (clerkUserId && clerkUserId !== "anonymous") {
        await updateClerkUserMetadata(clerkUserId, {
          subscription: { status: "canceled", tier: null },
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      // Could trigger an email here; for now just log
      console.warn("Payment failed for customer:", event.data.object.customer);
      break;
    }
  }

  return res.status(200).json({ received: true });
}
