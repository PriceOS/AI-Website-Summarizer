import type { User } from "@supabase/supabase-js";
import type Stripe from "stripe";
import {
  ensureBillingProfile,
  getBillingProfileByUserId,
  syncBillingProfileFromSubscription,
  updateBillingProfile,
} from "./profile";
import { getPlanChangeKind, getPlanDefinition, getPriceIdForPlan, isPaidPlan } from "./plans";
import type { BillingInterval, PlanKey } from "./types";
import { getStripe } from "@/lib/stripe/server";

function getStripeCustomerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!customer) {
    return null;
  }

  return typeof customer === "string" ? customer : customer.id;
}

function getStripeSubscriptionId(
  subscription: string | Stripe.Subscription | null,
): string | null {
  if (!subscription) {
    return null;
  }

  return typeof subscription === "string" ? subscription : subscription.id;
}

async function ensureStripeCustomerForUser(user: User) {
  const stripe = getStripe();
  const profile = await ensureBillingProfile(user.id);

  if (profile.stripe_customer_id) {
    return profile;
  }

  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: {
      supabaseUserId: user.id,
    },
  });

  return updateBillingProfile(user.id, {
    stripe_customer_id: customer.id,
  });
}

async function releaseScheduleIfPresent(scheduleId: string | Stripe.SubscriptionSchedule | null) {
  if (!scheduleId) {
    return;
  }

  const stripe = getStripe();
  const normalizedScheduleId = typeof scheduleId === "string" ? scheduleId : scheduleId.id;

  await stripe.subscriptionSchedules.release(normalizedScheduleId);
}

async function getActiveSubscription(subscriptionId: string) {
  const stripe = getStripe();

  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["schedule"],
  });
}

async function schedulePlanChangeAtRenewal(
  subscription: Stripe.Subscription,
  targetPriceId: string,
  targetInterval: BillingInterval,
) {
  const stripe = getStripe();
  const activeScheduleId = subscription.schedule
    ? typeof subscription.schedule === "string"
      ? subscription.schedule
      : subscription.schedule.id
    : null;
  const schedule =
    activeScheduleId === null
      ? await stripe.subscriptionSchedules.create({
          from_subscription: subscription.id,
        })
      : await stripe.subscriptionSchedules.retrieve(activeScheduleId);
  const currentPhase = schedule.phases[0];
  const currentItem = currentPhase?.items[0];

  if (!currentPhase || !currentItem?.price || !currentPhase.start_date || !currentPhase.end_date) {
    throw new Error("Unable to schedule the plan change for the next renewal.");
  }

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: [
          {
            price: currentItem.price as string,
            quantity: currentItem.quantity ?? 1,
          },
        ],
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
      },
      {
        items: [
          {
            price: targetPriceId,
            quantity: currentItem.quantity ?? 1,
          },
        ],
        duration: {
          interval: targetInterval,
          interval_count: 1,
        },
        proration_behavior: "none",
      },
    ],
  });
}

export async function createCheckoutSessionForPlan({
  billingInterval,
  origin,
  planKey,
  user,
}: {
  billingInterval: BillingInterval;
  origin: string;
  planKey: PlanKey;
  user: User;
}) {
  const stripe = getStripe();
  const profile = await ensureStripeCustomerForUser(user);
  const priceId = getPriceIdForPlan(planKey, billingInterval);

  const session = await stripe.checkout.sessions.create({
    cancel_url: `${origin}/?billing=cancelled`,
    client_reference_id: user.id,
    customer: profile.stripe_customer_id ?? undefined,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    metadata: {
      billingInterval,
      planKey,
      supabaseUserId: user.id,
    },
    mode: "subscription",
    subscription_data: {
      metadata: {
        billingInterval,
        planKey,
        supabaseUserId: user.id,
      },
    },
    success_url: `${origin}/?billing=success`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return session.url;
}

export async function createCustomerPortalSession({
  origin,
  user,
}: {
  origin: string;
  user: User;
}) {
  const stripe = getStripe();
  const profile = await ensureStripeCustomerForUser(user);

  if (!profile.stripe_customer_id) {
    throw new Error("No Stripe customer was found for this account.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/`,
  });

  return session.url;
}

export async function changePlanForExistingSubscriber({
  billingInterval,
  planKey,
  user,
}: {
  billingInterval: BillingInterval;
  planKey: PlanKey;
  user: User;
}) {
  const stripe = getStripe();
  const profile = await getBillingProfileByUserId(user.id);

  if (!profile?.stripe_subscription_id) {
    throw new Error("No active paid subscription was found for this account.");
  }

  const subscription = await getActiveSubscription(profile.stripe_subscription_id);

  if (planKey === "free") {
    await releaseScheduleIfPresent(subscription.schedule);

    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });

    await syncBillingProfileFromSubscription(updatedSubscription);

    return {
      mode: "updated" as const,
      profile,
    };
  }

  const targetPriceId = getPriceIdForPlan(planKey, billingInterval);
  const currentPlanChangeKind = getPlanChangeKind(profile.plan_key, planKey);
  const currentItem = subscription.items.data[0];

  if (!currentItem) {
    throw new Error("No subscription item was found for this Stripe subscription.");
  }

  if (currentPlanChangeKind === "upgrade") {
    await releaseScheduleIfPresent(subscription.schedule);

    const updatedSubscription = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
      items: [
        {
          id: currentItem.id,
          price: targetPriceId,
        },
      ],
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    });

    await syncBillingProfileFromSubscription(updatedSubscription);

    return {
      mode: "updated" as const,
      profile,
    };
  }

  if (subscription.cancel_at_period_end) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: false,
    });
  }

  await schedulePlanChangeAtRenewal(subscription, targetPriceId, billingInterval);
  await updateBillingProfile(user.id, {
    pending_billing_interval: billingInterval,
    pending_plan_key: planKey,
  });

  return {
    mode: "scheduled" as const,
    profile,
  };
}

export async function syncSubscriptionById(subscriptionId: string) {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return syncBillingProfileFromSubscription(subscription);
}

export async function syncCheckoutSession(session: Stripe.Checkout.Session) {
  const stripe = getStripe();
  const userId = session.client_reference_id ?? session.metadata?.supabaseUserId;
  const customerId = getStripeCustomerId(session.customer);
  const subscriptionId = getStripeSubscriptionId(session.subscription);

  if (!userId) {
    throw new Error("Checkout session is missing the Supabase user id.");
  }

  await ensureBillingProfile(userId);

  if (customerId) {
    await updateBillingProfile(userId, {
      stripe_customer_id: customerId,
    });
  }

  if (!subscriptionId) {
    return updateBillingProfile(userId, {
      stripe_customer_id: customerId,
    });
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  return syncBillingProfileFromSubscription(subscription);
}

export async function syncInvoiceSubscription(invoice: Stripe.Invoice) {
  const subscriptionId = getStripeSubscriptionId(
    invoice.parent?.subscription_details?.subscription ?? null,
  );

  if (!subscriptionId) {
    return null;
  }

  return syncSubscriptionById(subscriptionId);
}

export async function validateRequestedPlanChange(planKey: PlanKey, billingInterval: BillingInterval) {
  const plan = getPlanDefinition(planKey);

  if (isPaidPlan(plan.key)) {
    getPriceIdForPlan(plan.key, billingInterval);
  }
}
