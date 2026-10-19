import { redirect } from "next/navigation";
import { withQuery, type QueryParams } from "@/lib/query-string";
/** The company list moved to /knowledge; old links and bookmarks land there with their parameters. */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<QueryParams> }) {
  redirect(withQuery("/knowledge", await searchParams));
}
