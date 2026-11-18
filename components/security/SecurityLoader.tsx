"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

// Uses browser storage, location and the map, so it renders on the client only.
const SecurityApp = dynamic(() => import("./SecurityApp"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center p-8">
      <Spinner label="Opening the dashboard…" />
    </div>
  ),
});

export default function SecurityLoader() {
  return <SecurityApp />;
}
