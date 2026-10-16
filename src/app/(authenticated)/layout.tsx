import { redirect } from 'next/navigation';
import { verifiedSession } from '../../lib/supabase/server';
import { AppShell } from '../../components/app-shell';
export default async function AuthenticatedLayout({children}:{children:React.ReactNode}) {
  const {user}=await verifiedSession();
  if(!user) redirect('/sign-in');
  return <AppShell>{children}</AppShell>;
}
