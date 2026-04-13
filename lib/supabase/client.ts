"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredSupabaseConfig, getSupabaseConfigError } from "./config";

export { getSupabaseConfigError } from "./config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  if (!browserClient) {
    const { supabasePublishableKey, supabaseUrl } = getRequiredSupabaseConfig();

    browserClient = createBrowserClient(supabaseUrl, supabasePublishableKey);
  }

  return browserClient;
}
