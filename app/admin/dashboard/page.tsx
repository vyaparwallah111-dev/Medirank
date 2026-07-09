import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminDashboard, type AdminDoctor } from './admin-dashboard';

export const dynamic='force-dynamic';

export default async function AdminDashboardPage(){
  noStore();
  const sessionClient=createClient();
  if(!sessionClient)redirect('/login');
  const {data:{user}}=await sessionClient.auth.getUser();
  if(!user?.id)redirect('/login');

  // This check deliberately uses the authenticated user's RLS-scoped client.
  // The service-role client is never created until authorization succeeds.
  const {data:profile,error:profileError}=await sessionClient.from('doctors').select('is_admin,is_active').eq('auth_user_id',user.id).maybeSingle();
  if(profileError||profile?.is_admin!==true||profile?.is_active===false)redirect('/login');

  const admin=createAdminClient();
  if(!admin)throw new Error('Admin service is not configured.');
  const {data:rows,error}=await admin.from('doctors').select('id,auth_user_id,clinic_name,doctor_name,phone,subscription_tier,total_scans_used,is_active,is_admin,plan_started_at,plan_expires_at').order('created_at',{ascending:false});
  if(error)throw new Error(`Unable to load doctors: ${error.message}`);

  const emails=new Map<string,string>();
  for(let page=1;;page++){
    const {data,error:usersError}=await admin.auth.admin.listUsers({page,perPage:1000});
    if(usersError)throw new Error(`Unable to load doctor emails: ${usersError.message}`);
    data.users.forEach(authUser=>emails.set(authUser.id,authUser.email||''));
    if(data.users.length<1000)break;
  }
  const doctors:AdminDoctor[]=(rows||[]).map(row=>({
    id:row.id,clinic_name:row.clinic_name,doctor_name:row.doctor_name,email:emails.get(row.auth_user_id||'')||'',phone:row.phone,
    subscription_tier:(row.subscription_tier==='growth'||row.subscription_tier==='premium'?row.subscription_tier:'starter'),
    total_scans_used:Number(row.total_scans_used)||0,is_active:row.is_active!==false,is_admin:row.is_admin===true,
    plan_started_at:row.plan_started_at,plan_expires_at:row.plan_expires_at,
  }));
  const metrics=doctors.reduce((result,doctor)=>{result.total++;result[doctor.subscription_tier]++;result.scans+=doctor.total_scans_used;return result},{total:0,starter:0,growth:0,premium:0,scans:0});
  return <AdminDashboard doctors={doctors} metrics={metrics} adminEmail={user?.email||'Administrator'}/>;
}
