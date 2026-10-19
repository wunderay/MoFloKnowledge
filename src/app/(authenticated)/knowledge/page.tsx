import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { verifiedSession } from "@/lib/supabase/server";
import { readCompanySummaries } from "@/server/company-summaries";
import { Notice } from "@/components/shared/ui";
import { withQuery, type QueryParams } from "@/lib/query-string";
import { redirect } from "next/navigation";
/** The signed-in start page: the company list. A link to one company (from before /knowledge/view showed it) goes there. */
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<QueryParams> }) {
  const params = await searchParams;
  if (params.companyId !== undefined) {
    redirect(withQuery("/knowledge/view", params));
  }
  const { client, user } = await verifiedSession();
  if (!user) {
    redirect("/sign-in");
  }
  try {
    const initialData = await readCompanySummaries(client, user.id);
    return <CompanyDashboard initialData={initialData} />;
  } catch {
    return (
      <Notice error>
        Your companies are temporarily unavailable. Refresh to try again.
      </Notice>
    );
  }
}
