import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ripple",
    short_name: "Ripple",
    description: "Report harassment on campus in seconds. A HudHackHer 2026 demo.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F6F4EF",
    theme_color: "#10263A",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
