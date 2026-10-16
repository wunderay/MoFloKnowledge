import { KnowledgeEditor } from "@/components/knowledge-editor";
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const params = await searchParams;
  return (
    <KnowledgeEditor
      key={params.companyId}
      companyId={params.companyId ?? ""}
    />
  );
}
