'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function AdminLogoutButton(){
  const router=useRouter();
  const [loading,setLoading]=useState(false);
  async function logout(){
    if(loading)return;
    setLoading(true);
    const supabase=createClient();
    if(supabase)await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return <button type="button" onClick={logout} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#F37021] px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60">{loading?<Loader2 size={17} className="animate-spin"/>:<LogOut size={17}/>}Log out</button>;
}
