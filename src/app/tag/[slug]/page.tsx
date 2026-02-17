import { redirect } from "next/navigation";

interface TagPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TagPage({ params }: TagPageProps) {
  const { slug } = await params;
  redirect(`/video/tag/${slug}`);
}
