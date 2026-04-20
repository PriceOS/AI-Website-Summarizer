import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { FREE_PLAN_CREDITS } from "@/lib/billing/plans";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CREDITS_EXHAUSTED_MESSAGE,
  consumeSummaryCredit,
  refundSummaryCredit,
  syncUserCreditsFromBillingProfile,
} from "@/lib/credits/service";
import { executeSummarizeWebsite } from "@/lib/summarizer/workflow";

const admin = getSupabaseAdminClient();
const createdUserIds: string[] = [];

async function createTestUser() {
  const suffix = crypto.randomUUID();
  const email = `credit-test+${suffix}@example.com`;
  const password = `T3st!${suffix}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user.");
  }

  createdUserIds.push(data.user.id);

  return data.user;
}

async function deleteTestUsers() {
  while (createdUserIds.length > 0) {
    const userId = createdUserIds.pop();

    if (!userId) {
      continue;
    }

    await admin.auth.admin.deleteUser(userId);
  }
}

async function waitForCredits(userId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { data, error } = await admin
      .from("user_credits")
      .select("balance, monthly_allowance, plan_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (data) {
      return data;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 200);
    });
  }

  throw new Error(`Timed out waiting for credits for user ${userId}.`);
}

async function setCreditBalance(userId: string, balance: number) {
  const { error } = await admin
    .from("user_credits")
    .update({
      balance,
    })
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }
}

async function countCreditEvents(userId: string, eventType: "deduction" | "grant" | "refund") {
  const { count, error } = await admin
    .from("credit_events")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("user_id", userId)
    .eq("event_type", eventType);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

function getWorkflowDependencies(userId: string, streamSummary: () => AsyncIterable<string>) {
  return {
    authenticateUser: async () => ({
      userId,
    }),
    consumeCredit: async ({ url, userId: activeUserId }: { url: string; userId: string }) => {
      const result = await consumeSummaryCredit(activeUserId, {
        testUrl: url,
      });

      return {
        eventId: result.eventId,
        remainingCredits: result.balance,
      };
    },
    fetchWebpage: async () =>
      "<html><head><title>Test</title></head><body><main>Readable page text for summarization.</main></body></html>",
    refundCredit: async ({
      creditEventId,
      errorMessage,
    }: {
      creditEventId: string;
      errorMessage: string;
      url: string;
      userId: string;
    }) => {
      await refundSummaryCredit(creditEventId, {
        errorMessage,
        source: "vitest",
      });
    },
    streamSummary: async function* () {
      yield* streamSummary();
    },
  };
}

afterEach(async () => {
  await deleteTestUsers();
});

describe("credit system", () => {
  it("creates initial free credits for new users", async () => {
    const user = await createTestUser();
    const credits = await waitForCredits(user.id);
    const grantCount = await countCreditEvents(user.id, "grant");

    expect(credits.balance).toBe(FREE_PLAN_CREDITS);
    expect(credits.monthly_allowance).toBe(FREE_PLAN_CREDITS);
    expect(credits.plan_key).toBe("free");
    expect(grantCount).toBeGreaterThan(0);
  });

  it("deducts one credit after a successful summarize flow", async () => {
    const user = await createTestUser();
    await syncUserCreditsFromBillingProfile(user.id, {
      metadata: {
        source: "vitest",
      },
      reason: "signup_refresh",
    });

    const deltas: string[] = [];

    await executeSummarizeWebsite(
      "https://example.com/article",
      getWorkflowDependencies(user.id, async function* () {
        yield "Summary";
      }),
      (delta) => {
        deltas.push(delta);
      },
    );

    const credits = await waitForCredits(user.id);
    const deductionCount = await countCreditEvents(user.id, "deduction");

    expect(deltas.join("")).toBe("Summary");
    expect(credits.balance).toBe(FREE_PLAN_CREDITS - 1);
    expect(deductionCount).toBe(1);
  });

  it("blocks summarize usage when balance is zero", async () => {
    const user = await createTestUser();
    await syncUserCreditsFromBillingProfile(user.id, {
      metadata: {
        source: "vitest",
      },
      reason: "signup_refresh",
    });
    await setCreditBalance(user.id, 0);

    await expect(
      executeSummarizeWebsite(
        "https://example.com/article",
        getWorkflowDependencies(user.id, async function* () {
          yield "Should not run";
        }),
        () => undefined,
      ),
    ).rejects.toThrow(CREDITS_EXHAUSTED_MESSAGE);

    const credits = await waitForCredits(user.id);
    const deductionCount = await countCreditEvents(user.id, "deduction");

    expect(credits.balance).toBe(0);
    expect(deductionCount).toBe(0);
  });

  it("refunds the credit when the summarize flow fails after deduction", async () => {
    const user = await createTestUser();
    await syncUserCreditsFromBillingProfile(user.id, {
      metadata: {
        source: "vitest",
      },
      reason: "signup_refresh",
    });

    await expect(
      executeSummarizeWebsite(
        "https://example.com/article",
        getWorkflowDependencies(user.id, async function* () {
          throw new Error("Synthetic model failure");
        }),
        () => undefined,
      ),
    ).rejects.toThrow("Synthetic model failure");

    const credits = await waitForCredits(user.id);
    const deductionCount = await countCreditEvents(user.id, "deduction");
    const refundCount = await countCreditEvents(user.id, "refund");

    expect(credits.balance).toBe(FREE_PLAN_CREDITS);
    expect(deductionCount).toBe(1);
    expect(refundCount).toBe(1);
  });

  it("prevents concurrent deductions from driving balance below zero", async () => {
    const user = await createTestUser();
    await syncUserCreditsFromBillingProfile(user.id, {
      metadata: {
        source: "vitest",
      },
      reason: "signup_refresh",
    });
    await setCreditBalance(user.id, 1);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        admin.rpc("consume_user_credit", {
          p_metadata: {
            source: "vitest_concurrency",
          },
          p_reason: "concurrency_test",
          p_user_id: user.id,
        }),
      ),
    );

    const okCount = results.filter((result) => {
      const row = (result.data as Array<{ ok: boolean }> | null)?.[0];
      return row?.ok === true;
    }).length;
    const credits = await waitForCredits(user.id);

    expect(okCount).toBe(1);
    expect(credits.balance).toBe(0);
  });
});
