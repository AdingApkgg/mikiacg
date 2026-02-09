import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "数据总览",
  description: "网站运营数据和增长趋势",
};

export default function StatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
