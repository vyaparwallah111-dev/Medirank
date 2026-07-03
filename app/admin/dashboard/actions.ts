'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const tiers=new Set(['starter','growth','premium']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireAdmin(){
  const sessionClient=createClient();
  if(!sessionClient)throw new Error('Authentication is not configured.');
  const {data:{user}}=await sessionClient.auth.getUser();
  if(!user)throw new Error('Unauthenticated.');
  const {data:profile}=await sessionClient.from('doctors').select('is_admin,is_active').eq('auth_user_id',user.id).maybeSingle();
  if(profile?.is_admin!==true||profile?.is_active===false)throw new Error('Forbidden.');
  const admin=createAdminClient();
  if(!admin)throw new Error('Admin service is not configured.');
  return {admin,user};
}

export async function setDoctorPlan(doctorId:string,tier:string){
  if(!tiers.has(tier))throw new Error('Invalid subscription tier.');
  if(!uuid.test(doctorId))throw new Error('Invalid doctor.');
  const {admin,user}=await requireAdmin();
  const now=new Date();const expiry=tier==='starter'?null:new Date(now.getTime()+30*24*60*60*1000).toISOString();
  const {data:doctor,error:lookupError}=await admin.from('doctors').select('subscription_tier,is_admin').eq('id',doctorId).single();
  if(lookupError||doctor.is_admin)throw new Error('This account cannot be changed.');
  const {error}=await admin.from('doctors').update({subscription_tier:tier,plan:tier,plan_started_at:tier==='starter'?null:now.toISOString(),plan_expires_at:expiry,total_scans_used:0}).eq('id',doctorId).eq('is_admin',false);
  if(error)throw new Error(error.message);
  await admin.from('admin_audit_logs').insert({admin_user_id:user.id,doctor_id:doctorId,action:'plan_changed',metadata:{from:doctor.subscription_tier,to:tier,expires_at:expiry}});
  revalidatePath('/admin/dashboard');revalidatePath(`/admin/dashboard/doctors/${doctorId}`);
}

export async function resetDoctorScans(doctorId:string){
  if(!uuid.test(doctorId))throw new Error('Invalid doctor.');
  const {admin,user}=await requireAdmin();
  const {data:doctor}=await admin.from('doctors').select('total_scans_used,is_admin').eq('id',doctorId).single();
  if(!doctor||doctor.is_admin)throw new Error('This account cannot be changed.');
  const {error}=await admin.from('doctors').update({total_scans_used:0}).eq('id',doctorId).eq('is_admin',false);
  if(error)throw new Error(error.message);
  await admin.from('admin_audit_logs').insert({admin_user_id:user.id,doctor_id:doctorId,action:'scans_reset',metadata:{previous_cycle_scans:doctor.total_scans_used}});
  revalidatePath('/admin/dashboard');revalidatePath(`/admin/dashboard/doctors/${doctorId}`);
}

export async function setDoctorActive(doctorId:string,isActive:boolean){
  if(!uuid.test(doctorId))throw new Error('Invalid doctor.');
  const {admin,user}=await requireAdmin();
  const {error}=await admin.from('doctors').update({is_active:isActive}).eq('id',doctorId).eq('is_admin',false);
  if(error)throw new Error(error.message);
  await admin.from('admin_audit_logs').insert({admin_user_id:user.id,doctor_id:doctorId,action:isActive?'account_activated':'account_suspended',metadata:{}});
  revalidatePath('/admin/dashboard');revalidatePath(`/admin/dashboard/doctors/${doctorId}`);
}
