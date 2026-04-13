const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function collectMissingEnvVars(includeServiceRole = false) {
  const missingEnvVars: string[] = [];

  if (!supabaseUrl) {
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!supabasePublishableKey) {
    missingEnvVars.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (includeServiceRole && !supabaseServiceRoleKey) {
    missingEnvVars.push("SUPABASE_SERVICE_ROLE_KEY");
  }

  return missingEnvVars;
}

export function getSupabaseConfigError() {
  const missingEnvVars = collectMissingEnvVars();

  if (missingEnvVars.length === 0) {
    return "";
  }

  return `Missing Supabase environment variables: ${missingEnvVars.join(", ")}. Add them to .env.local and restart the dev server.`;
}

export function getSupabaseServerConfigError() {
  const missingEnvVars = collectMissingEnvVars(true);

  if (missingEnvVars.length === 0) {
    return "";
  }

  return `Missing Supabase server environment variables: ${missingEnvVars.join(", ")}. Add them to .env.local and restart the dev server.`;
}

export function getRequiredSupabaseConfig() {
  const configError = getSupabaseConfigError();

  if (configError) {
    throw new Error(configError);
  }

  return {
    supabasePublishableKey,
    supabaseUrl,
  };
}

export function getRequiredSupabaseServerConfig() {
  const configError = getSupabaseServerConfigError();

  if (configError) {
    throw new Error(configError);
  }

  return {
    supabasePublishableKey,
    supabaseServiceRoleKey,
    supabaseUrl,
  };
}
