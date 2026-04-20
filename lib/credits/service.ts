import type { PlanKey } from "@/lib/billing/types";
import { BILLING_PROFILE_SELECT_COLUMNS, type BillingProfileRow } from "@/lib/billing/format";
import { FREE_PLAN_CREDITS } from "@/lib/billing/plans";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { USER_CREDITS_SELECT_COLUMNS } from "./format";
import type { ConsumeCreditResult, UserCreditsRow } from "./types";

export const CREDITS_EXHAUSTED_MESSAGE =
  "You have no credits remaining. Upgrade your plan to continue summarizing websites.";

type SyncReason = "billing_sync" | "signup_refresh" | "summarizer_preflight" | "ui_refresh";

type SyncOptions = {
  metadata?: Record<string, unknown>;
  now?: Date;
  reason?: SyncReason;
};

type ConsumeCreditRpcRow = {
  balance: number;
  event_id: string | null;
  monthly_allowance: number;
  ok: boolean;
  plan_key: PlanKey | null;
};

type RefundCreditRpcRow = {
  balance: number;
  ok: boolean;
  refund_event_id: string | null;
};

function addOneMonth(value: Date) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function getDefaultCreditWindow(now: Date) {
  return {
    end: addOneMonth(now),
    start: now,
  };
}

export function resolveActiveCreditWindow({
  billingProfile,
  existingCredits,
  now = new Date(),
}: {
  billingProfile: BillingProfileRow;
  existingCredits: UserCreditsRow | null;
  now?: Date;
}) {
  if (billingProfile.current_period_start && billingProfile.current_period_end) {
    return {
      end: new Date(billingProfile.current_period_end),
      start: new Date(billingProfile.current_period_start),
    };
  }

  if (!existingCredits?.current_period_start || !existingCredits.current_period_end) {
    return getDefaultCreditWindow(now);
  }

  let start = new Date(existingCredits.current_period_start);
  let end = new Date(existingCredits.current_period_end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return getDefaultCreditWindow(now);
  }

  while (end <= now) {
    start = end;
    end = addOneMonth(end);
  }

  return {
    end,
    start,
  };
}

async function getBillingProfileRow(userId: string): Promise<BillingProfileRow> {
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

  return data as BillingProfileRow;
}

export async function getUserCreditsByUserId(userId: string): Promise<UserCreditsRow | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_credits")
    .select(USER_CREDITS_SELECT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as UserCreditsRow | null) ?? null;
}

export async function syncUserCreditsFromBillingProfile(
  userId: string,
  options: SyncOptions = {},
): Promise<UserCreditsRow> {
  const supabase = getSupabaseAdminClient();
  const billingProfile = await getBillingProfileRow(userId);
  const existingCredits = await getUserCreditsByUserId(userId);
  const now = options.now ?? new Date();
  const window = resolveActiveCreditWindow({
    billingProfile,
    existingCredits,
    now,
  });

  const { data, error } = await supabase
    .rpc("sync_user_credits", {
      p_current_period_end: window.end.toISOString(),
      p_current_period_start: window.start.toISOString(),
      p_metadata: {
        source: options.metadata?.source ?? "application",
        ...options.metadata,
      },
      p_monthly_allowance: billingProfile.monthly_credits ?? FREE_PLAN_CREDITS,
      p_plan_key: billingProfile.plan_key ?? "free",
      p_reason: options.reason ?? "billing_sync",
      p_user_id: userId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as UserCreditsRow;
}

export async function consumeSummaryCredit(
  userId: string,
  metadata: Record<string, unknown> = {},
): Promise<ConsumeCreditResult> {
  const supabase = getSupabaseAdminClient();

  await syncUserCreditsFromBillingProfile(userId, {
    metadata: {
      source: "summarizer",
      ...metadata,
    },
    reason: "summarizer_preflight",
  });

  const { data, error } = await supabase
    .rpc("consume_user_credit", {
      p_metadata: {
        source: "summarizer",
        ...metadata,
      },
      p_reason: "website_summary",
      p_user_id: userId,
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const result = data as ConsumeCreditRpcRow | null;

  if (!result?.ok || !result.event_id || !result.plan_key) {
    throw new Error(CREDITS_EXHAUSTED_MESSAGE);
  }

  return {
    balance: result.balance,
    eventId: result.event_id,
    monthlyAllowance: result.monthly_allowance,
    planKey: result.plan_key,
  };
}

export async function refundSummaryCredit(
  creditEventId: string,
  metadata: Record<string, unknown> = {},
) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .rpc("refund_credit_event", {
      p_event_id: creditEventId,
      p_metadata: {
        source: "summarizer",
        ...metadata,
      },
      p_reason: "website_summary_refund",
    })
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as RefundCreditRpcRow | null;
}
