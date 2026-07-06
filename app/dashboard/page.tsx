import Link from "next/link";
import { ArrowUpRight, ClipboardCheck, LockKeyhole, QrCode, ScanLine, Send, Star } from "lucide-react";
import { displayDoctorName, getAuthenticatedUser, getCurrentDoctor } from "@/lib/dashboard";
import { DirectLinkShare } from "@/components/direct-link-share";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TrendPoint = { label: string; scans: number; posts: number };

function TrendChart({title,subtitle,points}:{title:string;subtitle:string;points:TrendPoint[]}) {
  const max=Math.max(1,...points.flatMap(point=>[point.scans,point.posts]));
  const coordinates=(key:'scans'|'posts')=>points.map((point,index)=>`${points.length===1?50:(index/(points.length-1))*100},${100-(point[key]/max)*88}`).join(' ');
  return <div className="card p-5 sm:p-6"><h2 className="font-bold">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-5 h-52 rounded-xl bg-slate-50 p-3"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" aria-label={`${title}: scans and successful posts`} role="img"><polyline points={coordinates('scans')} fill="none" stroke="#93C5FD" strokeWidth="3" vectorEffect="non-scaling-stroke"/><polyline points={coordinates('posts')} fill="none" stroke="#1E40AF" strokeWidth="3" vectorEffect="non-scaling-stroke"/></svg></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-[11px] font-semibold text-slate-400">{points.map((point,index)=><span key={`${point.label}-${index}`}>{point.label}</span>)}</div><div className="mt-4 flex gap-5 text-xs font-semibold"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-300"/>Scans</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-brand"/>Successful posts</span></div></div>;
}

function dailyTrends(rows:{created_at:string;event_type:string}[],days=14):TrendPoint[]{
  return Array.from({length:days},(_,index)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(days-1-index));const next=new Date(date);next.setDate(next.getDate()+1);const matches=rows.filter(row=>{const value=new Date(row.created_at);return value>=date&&value<next});return {label:date.toLocaleDateString('en-IN',{day:'numeric',month:'short'}),scans:matches.filter(row=>row.event_type==='scan').length,posts:matches.filter(row=>row.event_type==='click_maps').length}});
}

function weeklyTrends(rows:{created_at:string;event_type:string}[],weeks=8):TrendPoint[]{
  return Array.from({length:weeks},(_,index)=>{const end=new Date();end.setHours(23,59,59,999);end.setDate(end.getDate()-((weeks-1-index)*7));const start=new Date(end);start.setHours(0,0,0,0);start.setDate(start.getDate()-6);const matches=rows.filter(row=>{const value=new Date(row.created_at);return value>=start&&value<=end});return {label:index===weeks-1?'This week':`${weeks-1-index}w`,scans:matches.filter(row=>row.event_type==='scan').length,posts:matches.filter(row=>row.event_type==='click_maps').length}});
}

export default async function Dashboard() {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  const trendSince=new Date(Date.now()-56*24*60*60*1000).toISOString();
  const [scansResult, copiedResult, postedResult, recentResult, trendResult] = await Promise.all([
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("doctor_id", doctor.id).eq("event_type", "scan"),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("doctor_id", doctor.id).eq("event_type", "copy"),
    supabase.from("analytics_events").select("*", { count: "exact", head: true }).eq("doctor_id", doctor.id).eq("event_type", "click_maps"),
    supabase.from("analytics_events").select("id,created_at,event_type").eq("doctor_id", doctor.id).order("created_at", { ascending: false }).limit(6),
    supabase.from("analytics_events").select("created_at,event_type").eq("doctor_id",doctor.id).gte("created_at",trendSince).order("created_at"),
  ]);
  if (doctor.auth_user_id !== user.id) throw new Error("Forbidden");
  const analyticsError=scansResult.error||copiedResult.error||postedResult.error||recentResult.error||trendResult.error;
  if(analyticsError)throw new Error(`Unable to load dashboard analytics: ${analyticsError.message}`);

  const scans = scansResult.count ?? 0;
  const copied = copiedResult.count ?? 0;
  const posted = postedResult.count ?? 0;
  const conversion = scans ? (posted / scans) * 100 : 0;
  const recent = recentResult.data ?? [];
  const trendRows=trendResult.data??[];
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long" }).format(new Date()).toUpperCase();
  const isStarter = (doctor.subscription_tier?.trim().toLowerCase() || "starter") === "starter";
  const isGrowth = doctor.subscription_tier?.trim().toLowerCase() === "growth";

  const heading = <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-sm font-semibold text-brand">{today}</p><h1 className="mt-1 text-3xl font-extrabold">Good morning, Dr. {displayDoctorName(doctor.doctor_name)}</h1><p className="mt-1 text-slate-500">{isStarter ? "Your Starter plan usage at a glance." : "Here’s what’s happening with your patient reviews."}</p></div><Link href={`/r/${doctor.slug}`} className="btn-primary"><QrCode size={18} />Open patient page</Link></div>;

  if (isStarter) return (
    <div className="mx-auto max-w-7xl">
      <DashboardAutoRefresh />
      {heading}
      <div className="card mt-8 max-w-md p-6">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-brand"><ScanLine size={22} /></span>
        <p className="mt-5 text-3xl font-extrabold">Total Scans: {scans.toLocaleString()} / 20</p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (scans / 20) * 100)}%` }} /></div>
      </div>
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div aria-hidden="true" className="pointer-events-none grid gap-5 p-6 blur-[5px] sm:grid-cols-3"><div className="h-32 rounded-xl bg-gradient-to-br from-blue-100 to-slate-100"/><div className="h-32 rounded-xl bg-gradient-to-br from-emerald-100 to-slate-100"/><div className="h-32 rounded-xl bg-gradient-to-br from-orange-100 to-slate-100"/><div className="h-56 rounded-xl bg-slate-100 sm:col-span-3"/></div>
        <div className="absolute inset-0 grid place-items-center bg-white/45 p-5 backdrop-blur-[2px]"><div className="max-w-sm rounded-2xl border border-blue-100 bg-white p-6 text-center shadow-soft"><LockKeyhole className="mx-auto text-brand" size={30}/><h2 className="mt-4 text-xl font-extrabold">Upgrade to Unlock Advanced Analytics</h2><p className="mt-2 text-sm leading-6 text-slate-500">Access conversion charts, time-series trends, and review sentiment insights.</p><Link href="/pricing" className="btn-primary mt-5 min-h-12 w-full">View Growth plans</Link></div></div>
      </div>
    </div>
  );

  const stats = [[ScanLine, "Total scans", scans.toLocaleString()], [ClipboardCheck, "Total review copies", copied.toLocaleString()], [Send, "Total successful posts", posted.toLocaleString()], [Star, "Conversion percentage", `${conversion.toFixed(1)}%`]] as const;
  return (
    <div className="mx-auto max-w-7xl">
      <DashboardAutoRefresh />
      {heading}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(([Icon, label, value]) => <div className="card p-5 transition-shadow duration-300 hover:shadow-md" key={label}><span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-brand"><Icon size={20}/></span><p className="mt-5 min-h-9 text-3xl font-extrabold tabular-nums">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>)}</div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2"><TrendChart title="Daily trend" subtitle="Last 14 days" points={dailyTrends(trendRows)}/><TrendChart title="Weekly trend" subtitle="Last 8 weeks" points={weeklyTrends(trendRows)}/></div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
        <div className="card p-6"><h2 className="font-bold">Review recovery quick action</h2><p className="mt-2 text-sm leading-6 text-slate-500">Copy a ready-to-send WhatsApp message with your clinic's direct review link and share it with past patients.</p>{isGrowth?<DirectLinkShare clinic={doctor.clinic_name} slug={doctor.slug} appOrigin={process.env.NEXT_PUBLIC_APP_URL||''}/>:<Link href="/pricing" className="btn-secondary mt-4 w-full">Unlock with Growth</Link>}</div>
        <div className="card p-6"><h2 className="font-bold">Your review QR</h2><p className="text-sm text-slate-500">Ready for your reception desk</p><div className="mx-auto mt-5 grid aspect-square max-w-32 place-items-center rounded-2xl border bg-white p-3"><QrCode className="h-full w-full text-slate-950" strokeWidth={1.2}/></div><Link href="/dashboard/qr-code" className="btn-secondary mt-5 w-full">View & download <ArrowUpRight size={16}/></Link></div>
      </div>
      <div className="card mt-5 overflow-hidden"><div className="border-b p-5"><h2 className="font-bold">Recent activity</h2></div>{recent.length ? recent.map(row => <div className="flex items-center gap-4 border-b border-slate-100 p-4 last:border-0" key={row.id}><span className={`h-2.5 w-2.5 rounded-full ${row.event_type === "click_maps" ? "bg-emerald-400" : row.event_type === "copy" ? "bg-orange" : "bg-blue-400"}`}/><p className="flex-1 text-sm font-medium">{row.event_type === "click_maps" ? "Google review page opened" : row.event_type === "copy" ? "Review copied" : "QR code scanned"}</p><span className="text-xs text-slate-400">{new Date(row.created_at).toLocaleDateString("en-IN")}</span></div>) : <div className="p-8 text-center text-sm text-slate-400">No patient activity yet.</div>}</div>
    </div>
  );
}
