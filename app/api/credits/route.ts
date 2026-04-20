import { NextResponse } from "next/server";
import { serializeUserCredits } from "@/lib/credits/format";
import { syncUserCreditsFromBillingProfile } from "@/lib/credits/service";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const credits = await syncUserCreditsFromBillingProfile(user.id, {
      metadata: {
        source: "credits_api",
      },
      reason: "ui_refresh",
    });

    return NextResponse.json({
      credits: serializeUserCredits(credits),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load credits.";
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
