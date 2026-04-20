import type Stripe from "stripe";
import { BILLING_PROFILE_SELECT_COLUMNS, type BillingProfileRow } from "./format";
import { getBillingInterval, getMonthlyCreditsForPlan, getPlanFromStripePriceId } from "./plans";
import { syncUserCreditsFromBillingProfile } from "@/lib/credits/service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

function toIsoString(unixTimestamp: number | null | undefined) {
  if (!unixTimestamp) {
    return null;
  }

  return new Date(unixTimestamp * 1000).toISOString();
}

async function selectSingleProfileBy(
  column: "user_id" | "stripe_customer_id",
  value: string,
): Promise<BillingProfileRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_profiles")
    .select(BILLING_PROFILE_SELECT_COLUMNS)
    .eq(column, value)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getBillingProfileByUserId(userId: string) {
  return selectSingleProfileBy("user_id", userId);
}

export async function getBillingProfileByCustomerId(customerId: string) {
  return selectSingleProfileBy("stripe_customer_id", customerId);
}

export async function ensureBillingProfile(userId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_profiles")
    .upsert(
      {
        user_id: userId,
      },
      {
        onConflict: "user_id",
      },
    )
    .select(BILLING_PROFILE_SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateBillingProfile(
  userId: string,
  updates: Partial<BillingProfileRow>,
): Promise<BillingProfileRow> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_profiles")
    .update(updates)
    .eq("user_id", userId)
    .select(BILLING_PROFILE_SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function ensureWebhookEvent(event: Stripe.Event) {
  const supabase = getSupabaseAdminClient();
  const { data: existingEvent, error: selectError } = await supabase
    .from("billing_webhook_events")
    .select("id, status")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (existingEvent?.status === "processed") {
    return {
      eventId: existingEvent.id as string,
      shouldProcess: false,
    };
  }

  const { data, error } = await supabase
    .from("billing_webhook_events")
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        livemode: event.livemode,
        payload: event as unknown as Record<string, unknown>,
        processing_error: null,
        processed_at: null,
        status: "processing",
      },
      {
        onConflict: "stripe_event_id",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    eventId: data.id as string,
    shouldProcess: true,
  };
}

export async function completeWebhookEvent(eventId: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("billing_webhook_events")
    .update({
      processed_at: new Date().toISOString(),
      processing_error: null,
      status: "processed",
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function failWebhookEvent(eventId: string, errorMessage: string) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("billing_webhook_events")
    .update({
      processing_error: errorMessage,
      status: "failed",
    })
    .eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function syncBillingProfileFromSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const existingProfile = await getBillingProfileByCustomerId(customerId);

  if (!existingProfile) {
    throw new Error(`No billing profile found for Stripe customer ${customerId}.`);
  }

  if (subscription.status === "canceled") {
    const profile = await updateBillingProfile(existingProfile.user_id, {
      billing_interval: "month",
      cancel_at_period_end: false,
      current_period_end: null,
      current_period_start: null,
      monthly_credits: getMonthlyCreditsForPlan("free"),
      pending_billing_interval: null,
      pending_plan_key: null,
      plan_key: "free",
      stripe_price_id: null,
      stripe_subscription_id: null,
      subscription_status: "free",
    });

    await syncUserCreditsFromBillingProfile(existingProfile.user_id, {
      metadata: {
        source: "stripe_webhook",
        stripeSubscriptionId: subscription.id,
      },
      reason: "billing_sync",
    });

    return profile;
  }

  const subscriptionItem = subscription.items.data[0];
  const priceId = subscriptionItem?.price?.id ?? null;
  const planKey = getPlanFromStripePriceId(priceId);
  const billingInterval = getBillingInterval(subscriptionItem?.price?.recurring?.interval);
  const pendingPlanMatchesCurrent =
    existingProfile.pending_plan_key === planKey &&
    existingProfile.pending_billing_interval === billingInterval;

  const profile = await updateBillingProfile(existingProfile.user_id, {
    billing_interval: billingInterval,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: toIsoString(subscriptionItem?.current_period_end),
    current_period_start: toIsoString(subscriptionItem?.current_period_start),
    monthly_credits: getMonthlyCreditsForPlan(planKey),
    pending_billing_interval: subscription.cancel_at_period_end
      ? "month"
      : pendingPlanMatchesCurrent
        ? null
        : existingProfile.pending_billing_interval,
    pending_plan_key: subscription.cancel_at_period_end
      ? "free"
      : pendingPlanMatchesCurrent
        ? null
        : existingProfile.pending_plan_key,
    plan_key: planKey,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
  });

  await syncUserCreditsFromBillingProfile(existingProfile.user_id, {
    metadata: {
      source: "stripe_webhook",
      stripeSubscriptionId: subscription.id,
    },
    reason: "billing_sync",
  });

  return profile;
}
