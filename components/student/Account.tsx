"use client";

// Profile, log in, sign up, email verification, password reset and profile
// editing, backed by Supabase Auth and the profiles table.

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Icon from "./Icon";
import type { Profile } from "@/lib/types";
import type { SignUpDetails } from "./useAccount";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isStudentEmail = (e: string) => /\.(ac\.uk|edu)$/i.test(e.trim());

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </div>
  );
}

function FormError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p className="form-error" id={id} role="alert">
      <Icon name="help" size={16} />
      {children}
    </p>
  );
}

function Submit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button className="primary coral account-submit" type="submit" disabled={busy}>
      {busy ? busyLabel : label}
    </button>
  );
}

/* ----------------------------------------------------------------- profile */

export function ProfileView({
  email,
  profile,
  isMember,
  verified,
  onLogin,
  onSignup,
  onEdit,
  onPrivacy,
  onLogout,
}: {
  email: string | null;
  profile: Profile | null;
  isMember: boolean;
  verified: boolean;
  onLogin: () => void;
  onSignup: () => void;
  onEdit: () => void;
  onPrivacy: () => void;
  onLogout: () => void;
}) {
  const status = !profile
    ? null
    : profile.account_type === "organisation"
      ? profile.approved
        ? { tone: "ok", text: "Approved organisation" }
        : { tone: "wait", text: "Organisation · waiting for approval by the Ripple team" }
      : verified
        ? { tone: "ok", text: "Verified student" }
        : profile.is_student
          ? { tone: "wait", text: "Not verified yet · use your university email (.ac.uk) to join Walk together" }
          : { tone: "plain", text: "Personal account" };

  return (
    <main className="profile-landing">
      <div className="profile-heading">
        <Image src="/brand/ripple-logo.png" alt="Ripple: women's safety matters" width={940} height={478} className="profile-logo" />
        <span>
          <Icon name="person" size={31} />
        </span>
        <p className="eyebrow teal">Your Ripple account</p>
        <h1>{isMember ? (profile?.full_name ?? "Your account") : "Profile"}</h1>
        <p>
          {isMember
            ? (email ?? "")
            : "Log in to report, walk together, and manage your trusted contacts and safety settings."}
        </p>
        {status && <p className={`account-status ${status.tone}`}>{status.text}</p>}
      </div>
      <div className="profile-actions">
        {isMember ? (
          <>
            <button className="primary teal" onClick={onPrivacy}>
              Privacy and safety
            </button>
            {profile && (
              <button className="secondary profile-signup" onClick={onEdit}>
                Edit your details
              </button>
            )}
            <button className="text-button danger-text" onClick={onLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <button className="primary coral" onClick={onLogin}>
              Log in
            </button>
            <button className="secondary profile-signup" onClick={onSignup}>
              Sign up
            </button>
            <button className="text-button" onClick={onPrivacy}>
              Trusted contacts on this device
            </button>
          </>
        )}
      </div>
      <div className="profile-demo-note">
        <Icon name="lock" size={18} />
        <p>
          <strong>Your reports stay anonymous</strong>
          Choose &ldquo;Send anonymously&rdquo; and campus security won&apos;t see who sent a report.
        </p>
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------- login */

export function LoginForm({
  onLogin,
  onForgot,
  onSignup,
}: {
  onLogin: (email: string, password: string) => Promise<string | null>;
  onForgot: () => void;
  onSignup: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="account-form login-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!EMAIL_RE.test(email.trim()) || !password) {
          setError("Enter your email and password.");
          return;
        }
        setBusy(true);
        const err = await onLogin(email, password);
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <Field label="Email" htmlFor="login-email">
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@university.ac.uk"
          aria-describedby={error ? "login-error" : undefined}
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <div className="password-input">
          <input
            id="login-password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            aria-describedby={error ? "login-error" : undefined}
          />
          <button type="button" onClick={() => setShow((s) => !s)}>
            <Icon name="eye" size={18} />
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>
      {error && <FormError id="login-error">{error}</FormError>}
      <Submit busy={busy} label="Log in" busyLabel="Logging in…" />
      <button className="account-link" type="button" onClick={onForgot}>
        Forgot password?
      </button>
      <div className="account-divider" />
      <button className="account-link signup-link" type="button" onClick={onSignup}>
        Don&apos;t have an account? <strong>Sign up</strong>
      </button>
    </form>
  );
}

export function ForgotPassword({ onSend }: { onSend: (email: string) => Promise<string | null> }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  if (state === "sent") {
    return (
      <div className="otp-success">
        <span>
          <Icon name="message" size={34} />
        </span>
        <p className="eyebrow teal">Check your email</p>
        <h2>Reset link sent</h2>
        <p>If {email.trim()} has a Ripple account, you&apos;ll get a link to choose a new password.</p>
      </div>
    );
  }
  return (
    <form
      className="account-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!EMAIL_RE.test(email.trim())) {
          setError("Enter the email you signed up with.");
          return;
        }
        setState("busy");
        const err = await onSend(email);
        if (err) {
          setError(err);
          setState("idle");
        } else setState("sent");
      }}
    >
      <Field label="Email" htmlFor="reset-email">
        <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      {error && <FormError>{error}</FormError>}
      <Submit busy={state === "busy"} label="Send reset link" busyLabel="Sending…" />
    </form>
  );
}

export function SetNewPassword({ onSave }: { onSave: (password: string) => Promise<string | null> }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="account-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const msg = checkPasswords(password, confirm, true);
        if (msg) return setError(msg);
        setBusy(true);
        const err = await onSave(password);
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <Passwords
        prefix="new"
        password={password}
        confirm={confirm}
        show={show}
        onToggle={() => setShow((s) => !s)}
        onPassword={setPassword}
        onConfirm={setConfirm}
      />
      {error && <FormError>{error}</FormError>}
      <Submit busy={busy} label="Save new password" busyLabel="Saving…" />
    </form>
  );
}

/* ----------------------------------------------------------------- sign up */

export function SignupType({ onIndividual, onOrganisation }: { onIndividual: () => void; onOrganisation: () => void }) {
  return (
    <>
      <div className="account-type-list">
        <button onClick={onIndividual}>
          <span>
            <Icon name="person" size={29} />
          </span>
          <div>
            <strong>Sign up as an individual</strong>
            <small>For students and people using Ripple personally</small>
          </div>
          <Icon name="chevron" />
        </button>
        <button onClick={onOrganisation}>
          <span>
            <Icon name="people" size={29} />
          </span>
          <div>
            <strong>Sign up as an organisation</strong>
            <small>For universities, councils, charities, and safety teams</small>
          </div>
          <Icon name="chevron" />
        </button>
      </div>
      <p className="form-privacy-note">
        <Icon name="lock" size={15} /> Your details are private to you. Other students only ever see your first name.
      </p>
    </>
  );
}

function LocationPermission({
  value,
  onChange,
  name,
}: {
  value: string;
  onChange: (v: "always" | "while_using") => void;
  name: string;
}) {
  const options: ["always" | "while_using", string, string][] = [
    ["always", "Always", "Ripple can use your location for safety features you turn on, even when the app is closed."],
    ["while_using", "Only while using the app", "Ripple can use your location only while you have the app open."],
  ];
  return (
    <fieldset className="form-section permission-section">
      <legend>Location sharing permission</legend>
      {options.map(([v, label, hint]) => (
        <label key={v} className={value === v ? "selected" : ""}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />
          <span>
            <strong>{label}</strong>
            <small>{hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function Passwords({
  prefix,
  password,
  confirm,
  show,
  onToggle,
  onPassword,
  onConfirm,
}: {
  prefix: string;
  password: string;
  confirm: string;
  show: boolean;
  onToggle: () => void;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  const level = password.length >= 12 ? 3 : password.length >= 8 ? 2 : password.length > 0 ? 1 : 0;
  const word = ["Enter a password", "Too short", "Okay", "Strong"][level];
  return (
    <>
      <Field label="Password" htmlFor={`${prefix}-password`}>
        <div className="password-input">
          <input
            id={`${prefix}-password`}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <button type="button" onClick={onToggle}>
            <Icon name="eye" size={18} />
            {show ? "Hide" : "Show"}
          </button>
        </div>
        <div className={`password-strength strength-${level}`}>
          <span>
            <i />
            <i />
            <i />
          </span>
          <small>Password strength: {word}</small>
        </div>
      </Field>
      <Field label="Confirm password" htmlFor={`${prefix}-confirm-password`}>
        <div className="password-input">
          <input
            id={`${prefix}-confirm-password`}
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => onConfirm(e.target.value)}
            placeholder="Enter it again"
          />
          <button type="button" onClick={onToggle}>
            <Icon name="eye" size={18} />
            {show ? "Hide" : "Show"}
          </button>
        </div>
      </Field>
    </>
  );
}

function Terms({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="terms-checkbox">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>I agree to Ripple storing these details to run my account and safety features</span>
    </label>
  );
}

function checkPasswords(p: string, c: string, agreed: boolean) {
  if (p.length < 8) return "Password must be at least 8 characters.";
  if (p !== c) return "Passwords do not match.";
  if (!agreed) return "Tick the box to agree before continuing.";
  return "";
}

export function IndividualSignup({ onSubmit }: { onSubmit: (d: SignUpDetails) => Promise<string | null> }) {
  const [f, setF] = useState({
    fullName: "",
    email: "",
    gender: "",
    age: "",
    contact: "",
    address: "",
    location: "" as "" | "always" | "while_using",
    student: "",
    institution: "",
    password: "",
    confirmPassword: "",
  });
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form
      className="account-form signup-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if ([f.fullName, f.email, f.gender, f.age, f.contact, f.location, f.student].some((v) => !v.trim())) {
          return setError("Complete every required field before continuing.");
        }
        if (!EMAIL_RE.test(f.email.trim())) return setError("Enter a valid email address.");
        const age = Number(f.age);
        if (!Number.isInteger(age) || age < 16 || age > 120) return setError("You need to be 16 or over to use Ripple.");
        if (f.contact.replace(/\D/g, "").length < 6) return setError("Enter a contact number.");
        if (f.student === "Yes" && !f.institution.trim()) return setError("Add your university or college.");
        const msg = checkPasswords(f.password, f.confirmPassword, agreed);
        if (msg) return setError(msg);
        setBusy(true);
        const err = await onSubmit({
          account_type: "individual",
          email: f.email,
          password: f.password,
          full_name: f.fullName.trim(),
          gender: f.gender,
          age: f.age,
          contact_number: f.contact.trim(),
          address: f.address.trim(),
          location_permission: f.location as "always" | "while_using",
          is_student: f.student === "Yes",
          institution: f.student === "Yes" ? f.institution.trim() : "",
        });
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <Field label="Full name" htmlFor="individual-name">
        <input id="individual-name" autoComplete="name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} />
      </Field>
      <fieldset className="form-section">
        <legend>Are you a student?</legend>
        <div className="segmented-choice">
          {["Yes", "No"].map((o) => (
            <label key={o} className={f.student === o ? "selected" : ""}>
              <input type="radio" name="student-status" value={o} checked={f.student === o} onChange={() => set("student", o)} />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
      {f.student === "Yes" && (
        <Field label="University or college" htmlFor="individual-institution">
          <input
            id="individual-institution"
            autoComplete="organization"
            value={f.institution}
            onChange={(e) => set("institution", e.target.value)}
            placeholder="University of Huddersfield"
          />
        </Field>
      )}
      <Field
        label="Email"
        htmlFor="individual-email"
        hint={
          f.student === "Yes"
            ? isStudentEmail(f.email) || !f.email
              ? "Use your university email (ending .ac.uk) to be verified for Walk together."
              : "This isn't a university email, so you won't be verified for Walk together."
            : undefined
        }
      >
        <input id="individual-email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Gender" htmlFor="individual-gender" hint="Used only for the Women only walking option.">
        <select id="individual-gender" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
          <option value="">Choose an option</option>
          <option>Woman</option>
          <option>Man</option>
          <option>Non-binary</option>
          <option>Prefer not to say</option>
          <option>Self-describe</option>
        </select>
      </Field>
      <Field label="Age" htmlFor="individual-age">
        <input id="individual-age" type="number" inputMode="numeric" min="16" value={f.age} onChange={(e) => set("age", e.target.value)} />
      </Field>
      <Field label="Contact number" htmlFor="individual-contact">
        <input id="individual-contact" type="tel" autoComplete="tel" value={f.contact} onChange={(e) => set("contact", e.target.value)} />
      </Field>
      <Field label="Address (optional)" htmlFor="individual-address">
        <textarea id="individual-address" autoComplete="street-address" value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <LocationPermission value={f.location} onChange={(v) => set("location", v)} name="individual-location" />
      <Passwords
        prefix="individual"
        password={f.password}
        confirm={f.confirmPassword}
        show={show}
        onToggle={() => setShow((s) => !s)}
        onPassword={(v) => set("password", v)}
        onConfirm={(v) => set("confirmPassword", v)}
      />
      <Terms checked={agreed} onChange={setAgreed} />
      {error && <FormError>{error}</FormError>}
      <Submit busy={busy} label="Create account" busyLabel="Creating account…" />
    </form>
  );
}

export function OrganisationSignup({ onSubmit }: { onSubmit: (d: SignUpDetails) => Promise<string | null> }) {
  const [f, setF] = useState({
    organisation: "",
    type: "",
    contactName: "",
    email: "",
    contact: "",
    address: "",
    location: "" as "" | "always" | "while_using",
    password: "",
    confirmPassword: "",
  });
  const [show, setShow] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form
      className="account-form signup-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if ([f.organisation, f.type, f.contactName, f.email, f.contact, f.address, f.location].some((v) => !v.trim())) {
          return setError("Complete every field before continuing.");
        }
        if (!EMAIL_RE.test(f.email.trim())) return setError("Enter a valid email address.");
        const msg = checkPasswords(f.password, f.confirmPassword, agreed);
        if (msg) return setError(msg);
        setBusy(true);
        const err = await onSubmit({
          account_type: "organisation",
          email: f.email,
          password: f.password,
          full_name: f.organisation.trim(),
          organisation_type: f.type,
          contact_person: f.contactName.trim(),
          contact_number: f.contact.trim(),
          address: f.address.trim(),
          location_permission: f.location as "always" | "while_using",
        });
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <div className="prototype-form-notice">
        <Icon name="shield" size={16} />
        <p>Organisation accounts are checked by the Ripple team before they can see any safety data.</p>
      </div>
      <Field label="Organisation name" htmlFor="organisation-name">
        <input id="organisation-name" autoComplete="organization" value={f.organisation} onChange={(e) => set("organisation", e.target.value)} />
      </Field>
      <Field label="Organisation type" htmlFor="organisation-type">
        <select id="organisation-type" value={f.type} onChange={(e) => set("type", e.target.value)}>
          <option value="">Choose an option</option>
          <option>University</option>
          <option>Students&apos; Union</option>
          <option>Security provider</option>
          <option>Council</option>
          <option>Charity</option>
          <option>Other</option>
        </select>
      </Field>
      <Field label="Contact person's full name" htmlFor="organisation-contact-name">
        <input id="organisation-contact-name" autoComplete="name" value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
      </Field>
      <Field label="Work email" htmlFor="organisation-email">
        <input id="organisation-email" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Contact number" htmlFor="organisation-contact">
        <input id="organisation-contact" type="tel" autoComplete="tel" value={f.contact} onChange={(e) => set("contact", e.target.value)} />
      </Field>
      <Field label="Address" htmlFor="organisation-address">
        <textarea id="organisation-address" autoComplete="street-address" value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <LocationPermission value={f.location} onChange={(v) => set("location", v)} name="organisation-location" />
      <Passwords
        prefix="organisation"
        password={f.password}
        confirm={f.confirmPassword}
        show={show}
        onToggle={() => setShow((s) => !s)}
        onPassword={(v) => set("password", v)}
        onConfirm={(v) => set("confirmPassword", v)}
      />
      <Terms checked={agreed} onChange={setAgreed} />
      {error && <FormError>{error}</FormError>}
      <Submit busy={busy} label="Create account" busyLabel="Creating account…" />
    </form>
  );
}

/* -------------------------------------------------------------- verify email */

export function VerifyEmail({
  email,
  onVerify,
  onResend,
  onChangeEmail,
  onLogin,
}: {
  email: string;
  onVerify: (code: string) => Promise<string | null>;
  onResend: () => Promise<string | null>;
  onChangeEmail: () => void;
  onLogin: () => void;
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(60);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setInterval(() => setWait((w) => Math.max(0, w - 1)), 1000);
    return () => window.clearInterval(id);
  }, [wait]);

  const type = (i: number, value: string) => {
    const clean = value.replace(/\D/g, "");
    if (clean.length > 1) {
      // A pasted code fills every box.
      const all = clean.slice(0, 6).split("");
      setDigits((cur) => cur.map((_, j) => all[j] ?? ""));
      inputs.current[Math.min(all.length, 5)]?.focus();
      return;
    }
    setDigits((cur) => cur.map((x, j) => (j === i ? clean : x)));
    setError("");
    if (clean && i < 5) inputs.current[i + 1]?.focus();
  };

  return (
    <div className="otp-panel">
      <div className="otp-icon">
        <Icon name="message" size={29} />
      </div>
      <p className="otp-copy">
        We sent a 6-digit code and a confirmation link to <strong>{email}</strong>. Enter the code, or tap the link
        in the email.
      </p>
      <div className="otp-inputs" role="group" aria-label="Six digit verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            onChange={(e) => type(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={6}
            aria-label={`Code digit ${i + 1}`}
          />
        ))}
      </div>
      {error && <FormError>{error}</FormError>}
      <button
        className="primary coral account-submit"
        disabled={busy || digits.join("").length !== 6}
        onClick={async () => {
          setBusy(true);
          const err = await onVerify(digits.join(""));
          setBusy(false);
          if (err) setError("That code didn't work. Check it, or ask for a new one.");
        }}
      >
        {busy ? "Checking…" : "Verify"}
      </button>
      <button
        className="account-link"
        disabled={wait > 0}
        onClick={async () => {
          const err = await onResend();
          if (err) setError(err);
          setWait(60);
          setDigits(["", "", "", "", "", ""]);
          inputs.current[0]?.focus();
        }}
      >
        {wait > 0 ? `Resend email in ${wait}s` : "Resend email"}
      </button>
      <button className="account-link change-number" onClick={onChangeEmail}>
        Change email
      </button>
      <button className="account-link" onClick={onLogin}>
        Confirmed with the link? Log in
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- edit profile */

export function EditProfile({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (patch: Partial<Profile>) => Promise<string | null>;
}) {
  const org = profile.account_type === "organisation";
  const [f, setF] = useState({
    full_name: profile.full_name,
    gender: profile.gender ?? "",
    age: profile.age?.toString() ?? "",
    contact_number: profile.contact_number ?? "",
    address: profile.address ?? "",
    location_permission: (profile.location_permission ?? "while_using") as "always" | "while_using",
    is_student: profile.is_student,
    institution: profile.institution ?? "",
    contact_person: profile.contact_person ?? "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  return (
    <form
      className="account-form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.full_name.trim()) return setError("Add your name.");
        const age = f.age ? Number(f.age) : null;
        if (!org && age !== null && (!Number.isInteger(age) || age < 16 || age > 120)) return setError("Enter a valid age.");
        setBusy(true);
        const err = await onSave(
          org
            ? {
                full_name: f.full_name.trim(),
                contact_person: f.contact_person.trim() || null,
                contact_number: f.contact_number.trim() || null,
                address: f.address.trim() || null,
                location_permission: f.location_permission,
              }
            : {
                full_name: f.full_name.trim(),
                gender: f.gender || null,
                age,
                contact_number: f.contact_number.trim() || null,
                address: f.address.trim() || null,
                location_permission: f.location_permission,
                is_student: f.is_student,
                institution: f.is_student ? f.institution.trim() || null : null,
              },
        );
        setBusy(false);
        setError(err ?? "");
      }}
    >
      <Field label={org ? "Organisation name" : "Full name"} htmlFor="edit-name">
        <input id="edit-name" value={f.full_name} onChange={(e) => set("full_name", e.target.value)} />
      </Field>
      {org ? (
        <Field label="Contact person" htmlFor="edit-contact-person">
          <input id="edit-contact-person" value={f.contact_person} onChange={(e) => set("contact_person", e.target.value)} />
        </Field>
      ) : (
        <>
          <Field label="Gender" htmlFor="edit-gender">
            <select id="edit-gender" value={f.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">Choose an option</option>
              <option>Woman</option>
              <option>Man</option>
              <option>Non-binary</option>
              <option>Prefer not to say</option>
              <option>Self-describe</option>
            </select>
          </Field>
          <Field label="Age" htmlFor="edit-age">
            <input id="edit-age" type="number" inputMode="numeric" value={f.age} onChange={(e) => set("age", e.target.value)} />
          </Field>
          <label className="consent-row">
            <input type="checkbox" checked={f.is_student} onChange={(e) => set("is_student", e.target.checked)} />
            <span>
              <strong>I&apos;m a student</strong>
              <small>Needed for Walk together.</small>
            </span>
          </label>
          {f.is_student && (
            <Field label="University or college" htmlFor="edit-institution">
              <input id="edit-institution" value={f.institution} onChange={(e) => set("institution", e.target.value)} />
            </Field>
          )}
        </>
      )}
      <Field label="Contact number" htmlFor="edit-contact">
        <input id="edit-contact" type="tel" value={f.contact_number} onChange={(e) => set("contact_number", e.target.value)} />
      </Field>
      <Field label="Address" htmlFor="edit-address">
        <textarea id="edit-address" value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <LocationPermission value={f.location_permission} onChange={(v) => set("location_permission", v)} name="edit-location" />
      {error && <FormError>{error}</FormError>}
      <Submit busy={busy} label="Save changes" busyLabel="Saving…" />
    </form>
  );
}
