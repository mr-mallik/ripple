// Phone numbers shown in the student app.
// Local numbers come from env vars so they can be set per deployment.
// When one isn't set, the app shows the card without a call button.

export type CallTarget = {
  title: string;
  detail: string;
  href: string | null;
  eyebrow?: string;
  emergency?: boolean;
  action?: "phone" | "message";
};

const tel = (n: string | undefined) => (n ? `tel:${n.replace(/\s+/g, "")}` : null);

export const CAMPUS_SECURITY_NUMBER = process.env.NEXT_PUBLIC_CAMPUS_SECURITY_TEL || "";
export const CAMPUS_SECURITY_HREF = tel(CAMPUS_SECURITY_NUMBER);
const WELLBEING_NUMBER = process.env.NEXT_PUBLIC_WELLBEING_TEL || "";

export const EMERGENCY_CONTACTS: CallTarget[] = [
  {
    eyebrow: "Nearest to you",
    title: "University of Huddersfield Security",
    detail: CAMPUS_SECURITY_NUMBER || "Campus safety team · number not set in this demo",
    href: CAMPUS_SECURITY_HREF,
  },
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
  {
    title: "University wellbeing service",
    detail: WELLBEING_NUMBER || "Number not set in this demo",
    href: tel(WELLBEING_NUMBER),
  },
  { eyebrow: "Free · 24/7", title: "Samaritans", detail: "116 123", href: "tel:116123" },
  { eyebrow: "Text support", title: "Shout", detail: "Text 85258", href: "sms:85258", action: "message" },
  { eyebrow: "Free · 24/7", title: "Victim Support", detail: "0808 168 9111", href: "tel:08081689111" },
];
