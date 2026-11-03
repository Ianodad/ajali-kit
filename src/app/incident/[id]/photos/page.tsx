import { SectionPlaceholder } from "@/components/section-placeholder";

export default async function PhotosSectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SectionPlaceholder incidentId={id} title="Photos" />;
}
