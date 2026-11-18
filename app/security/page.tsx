import type { Metadata } from "next";
import SecurityLoader from "@/components/security/SecurityLoader";

export const metadata: Metadata = { title: "Safety team" };

export default function SecurityPage() {
  return <SecurityLoader />;
}
