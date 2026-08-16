import { notFound } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { ReviewExperience } from '@/components/review-experience';
import { createAdminClient } from '@/lib/supabase/admin';

type PageProps={params:{slug:string}|Promise<{slug:string}>};
type KnowledgeBase={area_name:string;city_name:string;top_services:string[]};
type OperationalWindow={startIso:string;endIso:string;isActive:boolean};
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const dynamic='force-dynamic';
export const revalidate=0;

function unavailable(){return <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-3"><div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm sm:max-w-sm sm:p-7"><AlertCircle className="mx-auto text-orange" size={28} className="sm:size-[32px]"/><h1 className="mt-3 text-lg font-bold sm:mt-4 sm:text-xl">Patient page unavailable</h1><p className="mt-2 text-xs leading-5 text-slate-500 sm:text-sm sm:leading-6">We couldn’t load this clinic right now. Please try scanning the QR code again shortly.</p></div></main>}

function starterLimit(){return <main className="grid min-h-[100dvh] place-items-center bg-slate-50 px-3"><div className="w-full max-w-sm rounded-2xl border border-blue-100 bg-white p-5 text-center shadow-soft sm:rounded-3xl sm:p-8"><AlertCircle className="mx-auto text-brand" size={32} className="sm:size-[38px]"/><h1 className="mt-4 text-xl font-extrabold text-slate-950 sm:mt-5 sm:text-2xl">Plan Limit Exceeded</h1><p className="mt-2 text-sm font-bold leading-6 text-slate-700 sm:mt-3 sm:leading-7">Upgrade Your Plan to continue using MediRank.</p><div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 px-3 py-2 text-center text-xs font-bold text-slate-700 backdrop-blur sm:px-4 sm:py-3 sm:text-sm">Powered by Vyapar Wallah</div></div></main>}

function getOperationalWindow(now=new Date()):OperationalWindow{
  const istOffsetMs=330*60*1000;
  const istNow=new Date(now.getTime()+istOffsetMs);
  const year=istNow.getUTCFullYear(),month=istNow.getUTCMonth(),date=istNow.getUTCDate();
  const start=new Date(Date.UTC(year,month,date,9,0,0)-istOffsetMs);
  const end=new Date(Date.UTC(year,month,date,21,0,0)-istOffsetMs);
  return {startIso:start.toISOString(),endIso:end.toISOString(),isActive:now>=start&&now<end};
}

export default async function PatientPage({params}:PageProps){
  const resolvedParams=await params;
  const resolvedSlug=typeof resolvedParams?.slug==='string'?decodeURIComponent(resolvedParams.slug).trim():'';
  if(!resolvedSlug||!slugPattern.test(resolvedSlug))notFound();
  const supabase=createAdminClient();
  if(!supabase){console.error('Patient page: Supabase admin client is not configured.');return unavailable()}

  try{
    const {data:doctor,error}=await supabase.from('doctors').select('id,doctor_name,clinic_name,specialization,slug,gmb_review_link,logo_url,theme_config,knowledge_base,subscription_tier').eq('slug',resolvedSlug).eq('is_active',true).maybeSingle();
    if(error){console.error('Patient page doctor lookup failed:',error.message);return unavailable()}
    if(!doctor)notFound();
    const subscriptionTier=typeof doctor.subscription_tier==='string'?doctor.subscription_tier.trim().toLowerCase():'starter';
    const isStarter=subscriptionTier==='starter';
    const isGrowth=subscriptionTier==='growth';
    if(isStarter){
      const {count:scanCount,error:scanCountError}=await supabase.from('scans').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id);
      if(scanCountError){console.error('Patient page scan limit lookup failed:',scanCountError.message);return unavailable()}
      if((scanCount??0)>=20)return starterLimit();
    }

    const rawKnowledge=doctor.knowledge_base;
    const knowledgeBase:KnowledgeBase=rawKnowledge&&typeof rawKnowledge==='object'&&!Array.isArray(rawKnowledge)?{
      area_name:typeof rawKnowledge.area_name==='string'?rawKnowledge.area_name:'',
      city_name:typeof rawKnowledge.city_name==='string'?rawKnowledge.city_name:'',
      top_services:Array.isArray(rawKnowledge.top_services)?rawKnowledge.top_services.filter((item:unknown):item is string=>typeof item==='string'&&!!item.trim()):[],
    }:{area_name:'',city_name:'',top_services:[]};

    const [keywordResult,scanResult]=await Promise.allSettled([
      supabase.from('doctor_keywords').select('keyword,category').eq('doctor_id',doctor.id).order('created_at'),
      supabase.from('scans').insert({doctor_id:doctor.id}).select('id').single(),
    ]);
    const keywords=keywordResult.status==='fulfilled'?(keywordResult.value.data??[]):[];
    if(scanResult.status==='fulfilled'&&scanResult.value.error)console.error('Patient page scan session insert failed:',scanResult.value.error.message);
    const scan=scanResult.status==='fulfilled'&&!scanResult.value.error?scanResult.value.data:null;
    if(scan?.id){
      const {error:analyticsError}=await supabase.from('analytics_events').upsert({doctor_id:doctor.id,scan_id:scan.id,event_type:'scan'},{onConflict:'scan_id,event_type'});
      if(analyticsError)console.error('Patient page scan analytics insert failed:',analyticsError.message);
    }else if(scanResult.status==='rejected'){
      console.error('Patient page scan session insert failed:',scanResult.reason);
    }
    const operationalWindow=getOperationalWindow();
    const routingState={
      operationalScanSequence:0,
      allowLanguageStep:true,
    };
    const treatmentKeywords=keywords.filter(item=>item.category==='treatment').map(item=>item.keyword).filter(Boolean);
    const topServices=Array.from(new Set<string>([...knowledgeBase.top_services,...treatmentKeywords]));
    return <ReviewExperience doctor={doctor} isStarter={isStarter} isGrowth={isGrowth} scanId={scan?.id??null} experienceKeywords={keywords.filter(item=>item.category!=='treatment').map(item=>item.keyword).filter(Boolean)} topServices={topServices} routingState={routingState}/>;
  }catch(error){
    // Preserve Next.js navigation signals such as notFound().
    if(error&&typeof error==='object'&&'digest' in error)throw error;
    console.error('Unhandled patient page error:',error);
    return unavailable();
  }
}
