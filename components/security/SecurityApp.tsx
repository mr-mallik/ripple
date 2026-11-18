"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DemoBadge, Spinner, btn } from "@/components/ui";
import { getSecurityClient } from "@/lib/supabase";
import Dashboard from "./Dashboard";

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "not-staff"; email: string | undefined }
  | { status: "staff"; session: Session };

export default function SecurityApp() {
  const supabase = getSecurityClient();
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    async function resolve(session: Session | null) {
      if (!session || session.user.is_anonymous) {
        setState({ status: "signed-out" });
        return;
      }
      const { data } = await supabase.rpc("is_staff");
      setState(data ? { status: "staff", session } : { status: "not-staff", email: session.user.email });
    }
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        // Defer: Supabase recommends not awaiting other calls inside this callback.
        setTimeout(() => resolve(session), 0);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Opening the dashboard…" />
      </div>
    );
  }
  if (state.status === "staff") return <Dashboard session={state.session} />;
  return <Login notStaffEmail={state.status === "not-staff" ? (state.email ?? "this account") : null} />;
}

function Login({ notStaffEmail }: { notStaffEmail: string | null }) {
  const supabase = getSecurityClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("That email and password didn't match a security staff account.");
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-navy px-4 py-12">
      <div className="flex w-full max-w-md flex-col gap-6 rounded-3xl bg-card p-8">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" />
            <span className="font-display text-xl font-bold text-navy">Ripple Security</span>
          </span>
          <DemoBadge />
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Staff sign in</h1>
          <p className="text-muted">Only campus security staff can see reports.</p>
        </div>

        {notStaffEmail && (
          <div className="flex flex-col gap-2 rounded-xl bg-amber-wash p-4">
            <p>
              {notStaffEmail} isn&apos;t on the security staff list.
            </p>
            <button className={btn.small} onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-navy">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-12 rounded-xl border border-line bg-white px-3"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-navy">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-12 rounded-xl border border-line bg-white px-3"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-coral-wash p-3 text-coral-deep">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={btn.teal}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="text-sm text-muted">
          Demo login: see <code>DEMO_STAFF_EMAIL</code> and <code>DEMO_STAFF_PASSWORD</code> in{" "}
          <code>.env.local</code>.
        </p>
      </div>
    </main>
  );
}
