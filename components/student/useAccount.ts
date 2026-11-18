"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getStudentClient } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export type SignUpDetails = {
  account_type: "individual" | "organisation";
  email: string;
  password: string;
  full_name: string;
  gender?: string;
  age?: string;
  contact_number: string;
  address?: string;
  location_permission: "always" | "while_using";
  is_student?: boolean;
  institution?: string;
  organisation_type?: string;
  contact_person?: string;
};

const redirectTo = () => `${window.location.origin}/app`;

/** Student session: anonymous by default, or a real Ripple account. */
export function useAccount() {
  const supabase = getStudentClient();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verified, setVerified] = useState(false);
  const [recovering, setRecovering] = useState(false);

  // Start a session. People who aren't logged in get a silent anonymous one,
  // so they can report without signing up.
  useEffect(() => {
    let cancelled = false;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Supabase advises against awaiting other calls inside this callback.
      window.setTimeout(() => {
        if (cancelled) return;
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
        setUser(session?.user ?? null);
      }, 0);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { data: anon, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) {
          if (!cancelled) {
            setError(anonError.message);
            setStatus("error");
          }
          return;
        }
        if (!cancelled) setUser(anon.user);
      } else if (!cancelled) {
        setUser(data.session.user);
      }
      if (!cancelled) setStatus("ready");
    })();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  const loadProfile = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const u = auth.user;
    if (!u || u.is_anonymous) {
      setProfile(null);
      setVerified(false);
      return;
    }
    const [{ data: p }, { data: v }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", u.id).maybeSingle(),
      supabase.rpc("am_i_verified"),
    ]);
    setProfile((p as Profile) ?? null);
    setVerified(v === true);
  }, [supabase]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const id = window.setTimeout(loadProfile, 0);
    return () => window.clearTimeout(id);
  }, [userId, loadProfile]);

  const signUp = useCallback(
    async (d: SignUpDetails): Promise<{ error?: string; needsCode?: boolean }> => {
      const { email, password, ...meta } = d;
      const { data, error: e } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: redirectTo(), data: { ...meta, is_student: !!meta.is_student } },
      });
      if (e) return { error: e.message };
      if (data.user && data.user.identities?.length === 0) {
        return { error: "There's already an account with this email. Log in instead." };
      }
      return { needsCode: !data.session };
    },
    [supabase],
  );

  const verifyCode = useCallback(
    async (email: string, code: string) => {
      const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "email" });
      return e?.message ?? null;
    },
    [supabase],
  );

  const resendCode = useCallback(
    async (email: string) => {
      const { error: e } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: redirectTo() },
      });
      return e?.message ?? null;
    },
    [supabase],
  );

  const logIn = useCallback(
    async (email: string, password: string) => {
      const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (!e) return null;
      if (/confirm/i.test(e.message)) return "Confirm your email first. We sent you a code and a link when you signed up.";
      return "That email and password don't match a Ripple account.";
    },
    [supabase],
  );

  const logOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" });
    // Keep reporting available straight away.
    await supabase.auth.signInAnonymously();
  }, [supabase]);

  const sendReset = useCallback(
    async (email: string) => {
      const { error: e } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
      return e?.message ?? null;
    },
    [supabase],
  );

  const setNewPassword = useCallback(
    async (password: string) => {
      const { error: e } = await supabase.auth.updateUser({ password });
      if (!e) setRecovering(false);
      return e?.message ?? null;
    },
    [supabase],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return "You're not logged in.";
      const { error: e } = await supabase
        .from("profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (e) return e.message;
      await loadProfile();
      return null;
    },
    [supabase, user, loadProfile],
  );

  return {
    status,
    error,
    user,
    isMember: !!user && !user.is_anonymous,
    profile,
    verified,
    recovering,
    cancelRecovery: () => setRecovering(false),
    signUp,
    verifyCode,
    resendCode,
    logIn,
    logOut,
    sendReset,
    setNewPassword,
    updateProfile,
    reloadProfile: loadProfile,
  };
}

export type AccountApi = ReturnType<typeof useAccount>;
