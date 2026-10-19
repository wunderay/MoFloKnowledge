import { redirect } from "next/navigation";
import { withQuery, type QueryParams } from "@/lib/query-string";
export default async function Home({ searchParams }: { searchParams: Promise<QueryParams> }) {
  redirect(withQuery("/knowledge", await searchParams));
}
