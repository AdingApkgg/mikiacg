import AdminTicketDetailClient from "./client";

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminTicketDetailClient ticketId={id} />;
}
