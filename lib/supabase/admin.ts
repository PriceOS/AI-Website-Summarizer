import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequiredSupabaseServerConfig } from "./config";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (adminClient) {
    return adminClient;
  }

  const { supabaseServiceRoleKey, supabaseUrl } = getRequiredSupabaseServerConfig();

  adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
