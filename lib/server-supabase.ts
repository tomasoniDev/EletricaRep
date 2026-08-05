import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseServerConfigured = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
export const isSupabaseAdminConfigured = Boolean(supabaseUrl && supabaseServiceRoleKey);

export function createSupabaseAuthClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Configuração server-side do Supabase Auth ausente.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createSupabaseAdminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Configuração server-side do Supabase ausente.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function sessionSecret() {
  const secret = process.env.APP_SESSION_SECRET ?? supabaseServiceRoleKey;
  if (!secret) {
    throw new Error("APP_SESSION_SECRET ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }
  return secret;
}
