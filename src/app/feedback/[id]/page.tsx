import type { Metadata } from "next";
import TicketDetailClient from "./client";

export const metadata: Metadata = {
  title: "工单详情",
};

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetailClient ticketId={id} />;
}
