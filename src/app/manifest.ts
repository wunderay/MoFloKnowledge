import type { MetadataRoute } from "next";
import { APP_NAME, APP_NAME_PRIMARY } from "../lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME_PRIMARY,
    start_url: "/",
    display: "standalone",
    theme_color: "#3865ff",
    background_color: "#f8f9fb",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
