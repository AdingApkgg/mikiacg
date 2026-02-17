import LandingClient from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mikiacg - ACGN 内容平台",
  description: "发现最新 ACGN 视频与游戏内容",
};

export default function HomePage() {
  return <LandingClient />;
}
