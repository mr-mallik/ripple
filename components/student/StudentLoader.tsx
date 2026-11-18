"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";

// The app uses the browser's location, storage and the map, so it renders on the client only.
const StudentApp = dynamic(() => import("./StudentApp"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center p-8">
      <Spinner label="Opening Ripple…" />
    </div>
  ),
});

export default function StudentLoader() {
  return <StudentApp />;
}
