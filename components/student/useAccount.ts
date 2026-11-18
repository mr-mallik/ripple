"use client";

import { useCallback, useEffect, useState } from "react";
import type { EmailOtpType, User } from "@supabase/supabase-js";
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

  // Email links point to /app?token_hash=…&type=…. We only use the token when
  // the person taps Continue, so email scanners that open links first (common
  // with university and work mailboxes) can't use it up.
  const [linkToken, setLinkToken] = useState<{ tokenHash: string; type: EmailOtpType } | null>(() => {
    const q = new URLSearchParams(window.location.search);
    const tokenHash = q.get("token_hash");
    const type = q.get("type") as EmailOtpType | null;
    return tokenHash && type ? { tokenHash, type } : null;
  });
  // An expired or already-used link comes back with an error in the URL.
  const [linkError, setLinkError] = useState<string | null>(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const q = new URLSearchParams(window.location.search);
    const code = h.get("error_code") ?? q.get("error_code");
    if (!code) return null;
    return code === "otp_expired"
      ? "That email link has expired or was already used. Ask for a new code below."
      : (h.get("error_description") ?? q.get("error_description") ?? "That email link didn't work.").replace(/\+/g, " ");
  });
  useEffect(() => {
    if (linkToken || linkError) window.history.replaceState(null, "", window.location.pathname);
  }, [linkToken, linkError]);

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

  const confirmLink = useCallback(async () => {
    if (!linkToken) return null;
    const { error: e } = await supabase.auth.verifyOtp({ token_hash: linkToken.tokenHash, type: linkToken.type });
    if (e) {
      setLinkToken(null);
      setLinkError("That link has expired or was already used. Get a 6-digit code instead.");
      return null;
    }
    if (linkToken.type === "recovery") setRecovering(true);
    setLinkToken(null);
    return null;
  }, [supabase, linkToken]);

  const verifyRecovery = useCallback(
    async (email: string, code: string) => {
      const { error: e } = await supabase.auth.verifyOtp({ email: email.trim(), token: code, type: "recovery" });
      if (e) return "That code didn't work. Check it, or ask for a new one.";
      setRecovering(true);
      return null;
    },
    [supabase],
  );

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
    linkToken,
    confirmLink,
    dismissLink: () => setLinkToken(null),
    linkError,
    clearLinkError: () => setLinkError(null),
    verifyRecovery,
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
