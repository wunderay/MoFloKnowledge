import { KnowledgeViewer } from "@/components/knowledge-viewer";
export default async function ViewPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; versionId?: string }>;
}) {
  const params = await searchParams;
  return (
    <KnowledgeViewer
      key={params.companyId}
      companyId={params.companyId ?? ""}
      initialVersionId={params.versionId}
    />
  );
}
