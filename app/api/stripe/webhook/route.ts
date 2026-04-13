import type Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  completeWebhookEvent,
  ensureWebhookEvent,
  failWebhookEvent,
  syncBillingProfileFromSubscription,
} from "@/lib/billing/profile";
import { syncCheckoutSession, syncInvoiceSubscription } from "@/lib/billing/service";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/server";

export const runtime = "nodejs";

async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncBillingProfileFromSubscription(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
    case "invoice.payment_failed":
      await syncInvoiceSubscription(event.data.object as Stripe.Invoice);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = getStripeWebhookSecret();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      {
        error: "Missing Stripe signature header.",
      },
      {
        status: 400,
      },
    );
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Invalid Stripe webhook payload.",
      },
      {
        status: 400,
      },
    );
  }

  const trackedEvent = await ensureWebhookEvent(event);

  if (!trackedEvent.shouldProcess) {
    return NextResponse.json({
      received: true,
      skipped: true,
    });
  }

  try {
    await handleWebhookEvent(event);
    await completeWebhookEvent(trackedEvent.eventId);

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process the Stripe webhook.";

    await failWebhookEvent(trackedEvent.eventId, message);

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      },
    );
  }
}
