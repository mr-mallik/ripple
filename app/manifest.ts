import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ripple",
    short_name: "Ripple",
    description: "Report harassment on campus and walk home together. Women's safety matters.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F6F4EF",
    theme_color: "#6B3F94",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
