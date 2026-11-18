// Phone numbers shown in the Ripple app.
// The local safety team's number comes from an env var so each deployment
// (a university, venue or council) can set its own. When it isn't set, the
// card shows without a call button.

export type CallTarget = {
  title: string;
  detail: string;
  href: string | null;
  eyebrow?: string;
  emergency?: boolean;
  action?: "phone" | "message";
};

const tel = (n: string | undefined) => (n ? `tel:${n.replace(/\s+/g, "")}` : null);

export const SAFETY_TEAM_NUMBER =
  process.env.NEXT_PUBLIC_SAFETY_TEAM_TEL || process.env.NEXT_PUBLIC_CAMPUS_SECURITY_TEL || "";
export const SAFETY_TEAM_HREF = tel(SAFETY_TEAM_NUMBER);
const WELLBEING_NUMBER = process.env.NEXT_PUBLIC_WELLBEING_TEL || "";

export const EMERGENCY_CONTACTS: CallTarget[] = [
  ...(SAFETY_TEAM_HREF
    ? [{ eyebrow: "Nearest to you", title: "Local safety team", detail: SAFETY_TEAM_NUMBER, href: SAFETY_TEAM_HREF }]
    : []),
  { title: "Police (non-emergency)", detail: "101", href: "tel:101" },
  { title: "NHS 111", detail: "Urgent medical help, 24/7", href: "tel:111" },
  {
    eyebrow: "Emergency: life at risk",
    title: "999",
    detail: "Police, ambulance, or fire",
    href: "tel:999",
    emergency: true,
  },
];

export const WELLBEING_CONTACTS: CallTarget[] = [
  { eyebrow: "Free · 24/7", title: "Rape Crisis Support Line", detail: "0808 500 2222", href: "tel:08085002222" },
  { eyebrow: "Free · 24/7", title: "National Domestic Abuse Helpline", detail: "0808 2000 247", href: "tel:08082000247" },
  { eyebrow: "Free · 24/7", title: "Samaritans", detail: "116 123", href: "tel:116123" },
  { eyebrow: "Text support", title: "Shout", detail: "Text 85258", href: "sms:85258", action: "message" },
  { eyebrow: "Free · 24/7", title: "Victim Support", detail: "0808 168 9111", href: "tel:08081689111" },
  ...(WELLBEING_NUMBER ? [{ title: "Local wellbeing service", detail: WELLBEING_NUMBER, href: tel(WELLBEING_NUMBER) }] : []),
];
