"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function getSupabaseConfigError() {
  const missingEnvVars: string[] = [];

  if (!supabaseUrl) {
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabasePublishableKey) {
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missingEnvVars.length === 0) {
    return "";
  }

  return `Missing Supabase environment variables: ${missingEnvVars.join(", ")}. Add them to .env.local and restart the dev server.`;
}

export function getSupabaseBrowserClient() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }

  return browserClient;
}
