import type { PlanKey } from "@/lib/billing/types";

export type UserCredits = {
  balance: number;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  monthlyAllowance: number;
  planKey: PlanKey;
};

export type UserCreditsRow = {
  balance: number;
  created_at: string;
  current_period_end: string;
  current_period_start: string;
  monthly_allowance: number;
  plan_key: PlanKey;
  updated_at: string;
  user_id: string;
};

export type ConsumeCreditResult = {
  balance: number;
  eventId: string;
  monthlyAllowance: number;
  planKey: PlanKey;
};
