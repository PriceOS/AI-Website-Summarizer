import { getMonthlyCreditsForPlan } from "./plans";
import type { BillingInterval, BillingProfile, PlanKey } from "./types";

export type BillingProfileRow = {
  billing_interval: BillingInterval;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  current_period_start: string | null;
  monthly_credits: number;
  pending_billing_interval: BillingInterval | null;
  pending_plan_key: PlanKey | null;
  plan_key: PlanKey;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  user_id: string;
};

export const BILLING_PROFILE_SELECT_COLUMNS = `
  user_id,
  plan_key,
  billing_interval,
  monthly_credits,
  subscription_status,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,
  cancel_at_period_end,
  current_period_start,
  current_period_end,
  pending_plan_key,
  pending_billing_interval
`;

export function getDefaultBillingProfile(): BillingProfile {
  return {
    billingInterval: "month",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    currentPeriodStart: null,
    isPaid: false,
    monthlyCredits: getMonthlyCreditsForPlan("free"),
    pendingBillingInterval: null,
    pendingPlanKey: null,
    planKey: "free",
    status: "free",
    stripeCustomerId: null,
    stripePriceId: null,
    stripeSubscriptionId: null,
  };
}

export function serializeBillingProfile(profile: BillingProfileRow | null | undefined): BillingProfile {
  if (!profile) {
    return getDefaultBillingProfile();
  }

  return {
    billingInterval: profile.billing_interval,
    cancelAtPeriodEnd: profile.cancel_at_period_end,
    currentPeriodEnd: profile.current_period_end,
    currentPeriodStart: profile.current_period_start,
    isPaid: profile.plan_key !== "free" && profile.subscription_status !== "canceled",
    monthlyCredits: profile.monthly_credits,
    pendingBillingInterval: profile.pending_billing_interval,
    pendingPlanKey: profile.pending_plan_key,
    planKey: profile.plan_key,
    status: profile.subscription_status,
    stripeCustomerId: profile.stripe_customer_id,
    stripePriceId: profile.stripe_price_id,
    stripeSubscriptionId: profile.stripe_subscription_id,
  };
}
