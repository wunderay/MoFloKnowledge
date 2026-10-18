import { redirect } from "next/navigation";
import { verifiedSession } from "../../lib/supabase/server";
import { AppShell } from "../../components/shared/app-shell";
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    ({ user } = await verifiedSession());
  } catch {
    redirect("/sign-in?error=configuration");
  }
  if (!user) redirect("/sign-in");
  return <AppShell>{children}</AppShell>;
}
