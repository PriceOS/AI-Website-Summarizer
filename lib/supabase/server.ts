import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getRequiredSupabaseConfig } from "./config";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabasePublishableKey, supabaseUrl } = getRequiredSupabaseConfig();

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can't always mutate cookies during render.
        }
      },
    },
  });
}

export async function requireAuthenticatedUser(): Promise<User> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized");
  }

  return user;
}
