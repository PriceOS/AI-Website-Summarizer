import { NextResponse } from "next/server";
import { createCustomerPortalSession } from "@/lib/billing/service";
import { requireAuthenticatedUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const origin = new URL(request.url).origin;
    const url = await createCustomerPortalSession({
      origin,
      user,
    });

    return NextResponse.json({
      url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to open the customer portal.";
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
