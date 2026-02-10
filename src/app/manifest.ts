import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mikiacg",
    short_name: "Mikiacg",
    description: "Mikiacg 流式媒体内容分享平台",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/Mikiacg-logo.webp",
        sizes: "180x180",
        type: "image/webp",
      },
    ],
    categories: ["entertainment", "video"],
    lang: "zh-CN",
  };
}
