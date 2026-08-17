import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Budget",
    short_name: "Budget",
    description: "Personal budget tracker",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f6",
    theme_color: "#2f5233",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
