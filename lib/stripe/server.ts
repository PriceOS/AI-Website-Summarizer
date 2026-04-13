import Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-03-25.dahlia";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) {
    return stripeClient;
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error(
      "Missing Stripe environment variable: STRIPE_SECRET_KEY. Add it to .env.local and restart the dev server.",
    );
  }

  stripeClient = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
  });

  return stripeClient;
}

export function getStripeWebhookSecret() {
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeWebhookSecret) {
    throw new Error(
      "Missing Stripe environment variable: STRIPE_WEBHOOK_SECRET. Add it to .env.local and restart the dev server.",
    );
  }

  return stripeWebhookSecret;
}
