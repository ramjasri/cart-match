// src/utils/billing.js
// Client-side helpers for Stripe Checkout + Customer Portal.
//
// Graceful fallback: if Stripe isn't configured (no env vars in Vercel yet),
// startCheckout() throws a known error and the UI falls back to the
// existing waitlist modal flow. No user-facing breakage during the period
// between launch and Stripe activation.

export async function startCheckout({ tier, interval = "monthly", clerkToken }) {
  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(clerkToken ? { Authorization: `Bearer ${clerkToken}` } : {}),
    },
    body: JSON.stringify({ tier, interval }),
  });

  if (res.status === 503) {
    // Stripe not configured yet — caller should fall back to waitlist
    const err = new Error("Stripe not configured");
    err.code = "STRIPE_NOT_CONFIGURED";
    throw err;
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Checkout error (${res.status})`);
  }
  const { url } = await res.json();
  if (!url) throw new Error("Checkout session missing URL");
  window.location.href = url;
}

export async function openBillingPortal({ clerkToken }) {
  if (!clerkToken) throw new Error("Sign in required");
  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: { Authorization: `Bearer ${clerkToken}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `Portal error (${res.status})`);
  }
  const { url } = await res.json();
  if (!url) throw new Error("Portal session missing URL");
  window.location.href = url;
}
