import type { MetadataRoute } from "next";

/** Web app manifest (PROMPT §14): installable, standalone, charcoal theme, maskable icons. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitCoach — Personal Trainer Copilot",
    short_name: "FitCoach",
    description: "Leads, clients, programs, workouts and check-ins for personal trainers.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    theme_color: "#18211D",
    background_color: "#F6F7F3",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
