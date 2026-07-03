import Link from 'next/link';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Building2, CalendarDays, MapPin, Phone, ScanLine, ShieldCheck, Stethoscope } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ClinicControls } from './clinic-controls';
import { AdminLogoutButton } from '../../admin-logout-button';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-IN',{dateStyle:'medium'}).format(new Date(value)):'—';
const dateTime=(value:string)=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));

export default async function ClinicDetail({params}:{params:{id:string}}){
  noStore();if(!uuid.test(params.id))notFound();
  const session=createClient();if(!session)redirect('/login');const {data:{user}}=await session.auth.getUser();if(!user)redirect('/login');
  const {data:me}=await session.from('doctors').select('is_admin,is_active').eq('auth_user_id',user.id).maybeSingle();if(me?.is_admin!==true||me?.is_active===false)redirect('/login');
  const admin=createAdminClient();if(!admin)throw new Error('Admin service is not configured.');
  const {data:doctor,error}=await admin.from('doctors').select('*').eq('id',params.id).maybeSingle();if(error)throw new Error(error.message);if(!doctor)notFound();
  const [{data:authUser},{data:payments},{data:audits},{count:allTimeScans},{count:generated},{count:copied},{count:posted}]=await Promise.all([
    admin.auth.admin.getUserById(doctor.auth_user_id),
    admin.from('payments').select('id,plan,amount,status,razorpay_payment_id,created_at').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(20),
    admin.from('admin_audit_logs').select('id,action,metadata,created_at').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(20),
    admin.from('scans').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id),
    admin.from('scans').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('review_generated',true),
    admin.from('scans').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('review_copied',true),
    admin.from('scans').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('redirected_to_gmb',true),
  ]);
  const start=new Date();start.setUTCHours(0,0,0,0);start.setUTCDate(start.getUTCDate()-29);
  const scanDates:string[]=[];
  for(let from=0;;from+=1000){const {data,error:scanError}=await admin.from('scans').select('created_at').eq('doctor_id',doctor.id).gte('created_at',start.toISOString()).order('created_at').range(from,from+999);if(scanError)throw new Error(scanError.message);scanDates.push(...(data||[]).map(row=>row.created_at));if(!data||data.length<1000)break;}
  const daily=Array.from({length:30},(_,index)=>{const day=new Date(start);day.setUTCDate(start.getUTCDate()+index);return {key:day.toISOString().slice(0,10),label:new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short'}).format(day),count:0}});const dailyMap=new Map(daily.map(item=>[item.key,item]));scanDates.forEach(value=>{const item=dailyMap.get(value.slice(0,10));if(item)item.count++});const max=Math.max(1,...daily.map(item=>item.count));
  const info=[[Stethoscope,'Doctor',doctor.doctor_name],[Building2,'Clinic',doctor.clinic_name],[Phone,'Phone',doctor.phone||'—'],[MapPin,'City',doctor.city||'—'],[CalendarDays,'Joined',date(doctor.created_at)]] as const;
  const stats:Array<[LucideIcon,string,string|number]>=[[ScanLine,'All-time scans',allTimeScans||0],[ScanLine,'Current cycle',Number(doctor.total_scans_used)||0],[ShieldCheck,'Reviews generated',generated||0],[ShieldCheck,'Copied / Google',`${copied||0} / ${posted||0}`]];
  return <main className="min-h-screen bg-white px-4 py-7 text-[#0A4C95] sm:px-8"><div className="mx-auto max-w-7xl"><Link href="/admin/dashboard" className="inline-flex items-center gap-2 text-sm font-bold hover:text-[#F37021]"><ArrowLeft size={17}/>Back to dashboard</Link>
    <header className="mt-6 flex flex-col gap-4 border-b border-[#0A4C95]/15 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#F37021]">Clinic intelligence</p><h1 className="mt-2 text-3xl font-black">{doctor.clinic_name}</h1><p className="mt-2">{authUser.user?.email||'No email'} · {doctor.specialization||'Specialisation not set'}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-4 py-2 text-sm font-bold text-white ${doctor.is_active?'bg-[#0A4C95]':'bg-[#F37021]'}`}>{doctor.is_active?'Active':'Suspended'}</span><AdminLogoutButton/></div></header>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{info.map(([Icon,label,value])=><div key={label} className="rounded-2xl border border-[#0A4C95]/15 p-5"><Icon size={19} className="text-[#F37021]"/><p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#0A4C95]/55">{label}</p><p className="mt-1 font-extrabold">{value}</p></div>)}</section>
    <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map(([Icon,label,value])=><div key={label} className="rounded-2xl bg-[#0A4C95] p-5 text-white"><Icon size={19} className="text-[#F37021]"/><p className="mt-4 text-2xl font-black">{typeof value==='number'?value.toLocaleString():value}</p><p className="text-xs font-bold uppercase tracking-wider text-white/70">{label}</p></div>)}</section>
    <div className="mt-6"><ClinicControls id={doctor.id} tier={doctor.subscription_tier||'starter'} active={doctor.is_active!==false} isAdmin={doctor.is_admin===true}/></div>
    <section className="mt-6 rounded-2xl border border-[#0A4C95]/15 p-5 shadow-lg shadow-[#0A4C95]/5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Daily scans</h2><p className="text-sm text-[#0A4C95]/60">Last 30 days · {scanDates.length.toLocaleString()} scans</p></div><p className="text-sm font-bold text-[#F37021]">Today: {daily.at(-1)?.count||0}</p></div><div className="mt-6 flex h-52 items-end gap-1 overflow-x-auto border-b border-[#0A4C95]/15 pb-1">{daily.map((item,index)=><div key={item.key} className="group flex min-w-5 flex-1 flex-col items-center justify-end"><span className="mb-1 text-[9px] font-bold opacity-0 group-hover:opacity-100">{item.count}</span><div title={`${item.label}: ${item.count} scans`} style={{height:`${Math.max(item.count?6:1,(item.count/max)*150)}px`}} className={`w-full max-w-7 rounded-t ${index===daily.length-1?'bg-[#F37021]':'bg-[#0A4C95]'}`}/></div>)}</div><div className="mt-2 flex justify-between text-[10px] font-bold text-[#0A4C95]/55"><span>{daily[0].label}</span><span>{daily.at(-1)?.label}</span></div></section>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-[#0A4C95]/15 p-5"><h2 className="text-xl font-black">Subscription history</h2><div className="mt-4 rounded-xl bg-[#0A4C95]/[.04] p-4"><p className="font-extrabold capitalize">Current: {doctor.subscription_tier}</p><p className="mt-1 text-sm">Started: {date(doctor.plan_started_at)} · Expires: {date(doctor.plan_expires_at)}</p></div><div className="mt-4 space-y-3">{payments?.length?payments.map(payment=><div key={payment.id} className="flex justify-between border-b border-[#0A4C95]/10 pb-3 text-sm"><div><p className="font-bold capitalize">{payment.plan} · ₹{(payment.amount/100).toLocaleString('en-IN')}</p><p className="text-[#0A4C95]/60">{dateTime(payment.created_at)}</p></div><span className="font-bold capitalize text-[#F37021]">{payment.status}</span></div>):<p className="text-sm text-[#0A4C95]/60">No online payments recorded. Plan may be manually assigned.</p>}</div></section>
    <section className="rounded-2xl border border-[#0A4C95]/15 p-5"><h2 className="text-xl font-black">Security & admin audit</h2><p className="mt-1 text-sm text-[#0A4C95]/60">Every sensitive override is recorded.</p><div className="mt-4 space-y-3">{audits?.length?audits.map(audit=><div key={audit.id} className="border-b border-[#0A4C95]/10 pb-3"><p className="text-sm font-bold capitalize">{audit.action.replaceAll('_',' ')}</p><p className="text-xs text-[#0A4C95]/60">{dateTime(audit.created_at)}</p></div>):<p className="text-sm text-[#0A4C95]/60">No admin overrides recorded.</p>}</div></section></div>
  </div></main>;
}
