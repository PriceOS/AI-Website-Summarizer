import { FREE_PLAN_CREDITS } from "@/lib/billing/plans";
import type { UserCredits, UserCreditsRow } from "./types";

export const USER_CREDITS_SELECT_COLUMNS = `
  user_id,
  balance,
  monthly_allowance,
  plan_key,
  current_period_start,
  current_period_end,
  created_at,
  updated_at
`;

export function getDefaultUserCredits(): UserCredits {
  return {
    balance: FREE_PLAN_CREDITS,
    currentPeriodEnd: null,
    currentPeriodStart: null,
    monthlyAllowance: FREE_PLAN_CREDITS,
    planKey: "free",
  };
}

export function serializeUserCredits(userCredits: UserCreditsRow | null | undefined): UserCredits {
  if (!userCredits) {
    return getDefaultUserCredits();
  }

  return {
    balance: userCredits.balance,
    currentPeriodEnd: userCredits.current_period_end,
    currentPeriodStart: userCredits.current_period_start,
    monthlyAllowance: userCredits.monthly_allowance,
    planKey: userCredits.plan_key,
  };
}
