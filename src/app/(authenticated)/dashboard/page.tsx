import { CompanyDashboard } from "@/components/dashboard/company-dashboard";
import { verifiedSession } from "@/lib/supabase/server";
import { readCompanySummaries } from "@/server/company-summaries";
import { Notice } from "@/components/shared/ui";
import { redirect } from "next/navigation";
export default async function DashboardPage() {
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
