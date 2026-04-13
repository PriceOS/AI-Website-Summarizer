import type { BillingInterval, PlanKey } from "./types";

export type PlanDefinition = {
  billingCopy: Record<BillingInterval, string>;
  description: string;
  key: PlanKey;
  monthlyCredits: number;
  name: string;
  priceIds: Partial<Record<BillingInterval, string>>;
  priceInUsd: Record<BillingInterval, number>;
  rank: number;
};

export const FREE_PLAN_CREDITS = 10;

export const BILLING_PLANS: PlanDefinition[] = [
  {
    billingCopy: {
      month: "$0 / month",
      year: "$0 / year",
    },
    description: "Try the product with a small monthly credit bucket.",
    key: "free",
    monthlyCredits: FREE_PLAN_CREDITS,
    name: "Free",
    priceIds: {},
    priceInUsd: {
      month: 0,
      year: 0,
    },
    rank: 0,
  },
  {
    billingCopy: {
      month: "$9 / month",
      year: "$90 / year",
    },
    description: "For light personal use and occasional website research.",
    key: "starter",
    monthlyCredits: 25,
    name: "Starter",
    priceIds: {
      month: "price_1TLlkOD27Ytoy41WmSrrardr",
      year: "price_1TLlkkD27Ytoy41WTEjXQJSM",
    },
    priceInUsd: {
      month: 9,
      year: 90,
    },
    rank: 1,
  },
  {
    billingCopy: {
      month: "$19 / month",
      year: "$190 / year",
    },
    description: "For steady professional usage and repeat research workflows.",
    key: "pro",
    monthlyCredits: 100,
    name: "Pro",
    priceIds: {
      month: "price_1TLlkzD27Ytoy41WzZXwyVNq",
      year: "price_1TLllDD27Ytoy41WijoemV1M",
    },
    priceInUsd: {
      month: 19,
      year: 190,
    },
    rank: 2,
  },
  {
    billingCopy: {
      month: "$29 / month",
      year: "$290 / year",
    },
    description: "For heavy usage and larger monthly credit allocations.",
    key: "pro_plus",
    monthlyCredits: 500,
    name: "Pro Plus",
    priceIds: {
      month: "price_1TLllSD27Ytoy41Wp5ixrjgc",
      year: "price_1TLlldD27Ytoy41WUdy59l7O",
    },
    priceInUsd: {
      month: 29,
      year: 290,
    },
    rank: 3,
  },
];

const planByKey = new Map(BILLING_PLANS.map((plan) => [plan.key, plan]));
const paidPriceIds = new Map(
  BILLING_PLANS.flatMap((plan) =>
    Object.values(plan.priceIds)
      .filter((priceId): priceId is string => Boolean(priceId))
      .map((priceId) => [priceId, plan.key]),
  ),
);

export function getPlanDefinition(planKey: PlanKey) {
  const plan = planByKey.get(planKey);

  if (!plan) {
    throw new Error(`Unknown billing plan: ${planKey}`);
  }

  return plan;
}

export function getBillingInterval(value: string | null | undefined): BillingInterval {
  return value === "year" ? "year" : "month";
}

export function getPlanKey(value: string | null | undefined): PlanKey {
  if (value === "starter" || value === "pro" || value === "pro_plus") {
    return value;
  }

  return "free";
}

export function isPaidPlan(planKey: PlanKey) {
  return planKey !== "free";
}

export function getMonthlyCreditsForPlan(planKey: PlanKey) {
  return getPlanDefinition(planKey).monthlyCredits;
}

export function getPriceIdForPlan(planKey: PlanKey, billingInterval: BillingInterval) {
  const plan = getPlanDefinition(planKey);
  const priceId = plan.priceIds[billingInterval];

  if (!priceId) {
    throw new Error(`No Stripe price configured for ${planKey} (${billingInterval}).`);
  }

  return priceId;
}

export function getPlanFromStripePriceId(priceId: string | null | undefined): PlanKey {
  if (!priceId) {
    return "free";
  }

  return paidPriceIds.get(priceId) ?? "free";
}

export function getPlanChangeKind(currentPlanKey: PlanKey, nextPlanKey: PlanKey) {
  const currentPlan = getPlanDefinition(currentPlanKey);
  const nextPlan = getPlanDefinition(nextPlanKey);

  if (nextPlan.rank > currentPlan.rank) {
    return "upgrade";
  }

  if (nextPlan.rank < currentPlan.rank) {
    return "downgrade";
  }

  return "lateral";
}
