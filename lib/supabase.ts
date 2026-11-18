import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

// The student app and the security dashboard keep separate sessions, so a
// staff login in one tab never replaces someone's session in the app.
let studentClient: SupabaseClient | null = null;
let securityClient: SupabaseClient | null = null;

export function getStudentClient() {
  studentClient ??= createClient(url, key, {
    auth: { storageKey: "ripple-student", persistSession: true, autoRefreshToken: true },
  });
  return studentClient;
}

export function getSecurityClient() {
  securityClient ??= createClient(url, key, {
    auth: { storageKey: "ripple-security", persistSession: true, autoRefreshToken: true },
  });
  return securityClient;
}
