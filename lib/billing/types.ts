export type PlanKey = "free" | "starter" | "pro" | "pro_plus";
export type BillingInterval = "month" | "year";

export type BillingProfile = {
  billingInterval: BillingInterval;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  isPaid: boolean;
  monthlyCredits: number;
  pendingBillingInterval: BillingInterval | null;
  pendingPlanKey: PlanKey | null;
  planKey: PlanKey;
  status: string;
  stripeCustomerId: string | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
};
