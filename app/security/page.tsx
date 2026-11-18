import type { Metadata } from "next";
import SecurityLoader from "@/components/security/SecurityLoader";

export const metadata: Metadata = { title: "Security dashboard" };

export default function SecurityPage() {
  return <SecurityLoader />;
}
