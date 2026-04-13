import { NextResponse } from "next/server";
import { changePlanForExistingSubscriber, createCheckoutSessionForPlan, validateRequestedPlanChange } from "@/lib/billing/service";
import { serializeBillingProfile } from "@/lib/billing/format";
import { ensureBillingProfile, getBillingProfileByUserId } from "@/lib/billing/profile";
import { getBillingInterval, getPlanKey } from "@/lib/billing/plans";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const origin = new URL(request.url).origin;
    const { billingInterval: rawBillingInterval, planKey: rawPlanKey } =
      (await request.json()) as {
        billingInterval?: string;
        planKey?: string;
      };
    const billingInterval = getBillingInterval(rawBillingInterval);
    const planKey = getPlanKey(rawPlanKey);

    await validateRequestedPlanChange(planKey, billingInterval);

    const existingProfile = await ensureBillingProfile(user.id);
    const hasActivePaidSubscription =
      Boolean(existingProfile.stripe_subscription_id) && existingProfile.plan_key !== "free";

    if (!hasActivePaidSubscription) {
      if (planKey === "free") {
        return NextResponse.json({
          mode: "noop",
          profile: serializeBillingProfile(existingProfile),
        });
      }

      const checkoutUrl = await createCheckoutSessionForPlan({
        billingInterval,
        origin,
        planKey,
        user,
      });

      return NextResponse.json({
        mode: "redirect",
        url: checkoutUrl,
      });
    }

    const result = await changePlanForExistingSubscriber({
      billingInterval,
      planKey,
      user,
    });
    const nextProfile = await getBillingProfileByUserId(user.id);

    return NextResponse.json({
      mode: result.mode,
      profile: serializeBillingProfile(nextProfile),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update the billing plan.";
    const status = message === "Unauthorized" ? 401 : 400;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}
