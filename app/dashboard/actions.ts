'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';
import { createAdminClient } from '@/lib/supabase/admin';

export async function addKeyword(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const keyword=String(formData.get('keyword')||'').trim(),category=String(formData.get('category')||'behavior');if(!keyword)return null;const {data,error}=await supabase.from('doctor_keywords').insert({doctor_id:doctor.id,keyword,category,is_active:true}).select('id,keyword,category,is_active').single();if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`);return data}

export async function editKeyword(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const id=String(formData.get('id')||''),keyword=String(formData.get('keyword')||'').trim(),category=String(formData.get('category')||'behavior');if(!id||!keyword)throw new Error('Missing keyword id or name');const {data,error}=await supabase.from('doctor_keywords').update({keyword,category}).eq('id',id).eq('doctor_id',doctor.id).select('id,keyword,category,is_active').single();if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`);return data}

export async function toggleKeywordActive(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const id=String(formData.get('id')||'');if(!id)throw new Error('Missing keyword id');const {data:current,error:fetchError}=await supabase.from('doctor_keywords').select('is_active').eq('id',id).eq('doctor_id',doctor.id).single();if(fetchError)throw new Error(fetchError.message);const {data,error}=await supabase.from('doctor_keywords').update({is_active:!current.is_active}).eq('id',id).eq('doctor_id',doctor.id).select('id,keyword,category,is_active').single();if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`);return data}

export async function deleteKeyword(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const id=String(formData.get('id')||'');if(!id)throw new Error('Missing keyword id');const {error}=await supabase.from('doctor_keywords').delete().eq('id',id).eq('doctor_id',doctor.id);if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`);return {id}}

type Priority='high'|'medium'|'low';
type Tone='Formal'|'Casual'|'Mixed';
type AISettingsInput={
  doctor_id:string;
  target_keywords:Record<Priority,string[]>;
  target_areas:{primary:string[];secondary:string[]};
  patient_concerns:string[];
  usp_points:string[];
  tone_preference:Tone;
};

// Defense in depth against the double-JSON-encoding bug: if a caller ever sends an already-
// JSON-stringified string instead of a real array (e.g. a stale client build), parse it back into
// an array here rather than silently dropping it (old behavior) or writing the raw string into the
// jsonb column (the actual corruption mechanism - a string landing in a jsonb array column, then
// re-escaped on every subsequent load/save round-trip). The frontend should always send real arrays;
// this is a safety net, not the primary fix.
const cleanList=(value:unknown,limit:number,maxLength:number,depth=0):string[]=>{
  if(depth>5)return [];
  if(Array.isArray(value))return value.flatMap(item=>typeof item==='string'?[item.trim()]:cleanList(item,limit,maxLength,depth+1)).filter(Boolean).slice(0,limit).map(item=>item.slice(0,maxLength));
  if(typeof value==='string'){
    const trimmed=value.trim();
    if(trimmed.startsWith('[')||(trimmed.startsWith('"')&&trimmed.endsWith('"')&&trimmed.length>1)){
      try{return cleanList(JSON.parse(trimmed),limit,maxLength,depth+1)}catch{/* not valid JSON - not a list, drop it */}
    }
  }
  return [];
};

export async function updateAISettings(input:AISettingsInput){
  const doctor=await getCurrentDoctor();
  const {supabase,user}=await getAuthenticatedUser();
  if(doctor.auth_user_id!==user.id||input.doctor_id!==doctor.id)throw new Error('Forbidden');
  const tone:Tone=input.tone_preference==='Formal'||input.tone_preference==='Casual'||input.tone_preference==='Mixed'?input.tone_preference:'Mixed';
  const payload={
    doctor_id:doctor.id,
    target_keywords:{
      high:cleanList(input.target_keywords?.high,12,60),
      medium:cleanList(input.target_keywords?.medium,12,60),
      low:cleanList(input.target_keywords?.low,12,60),
    },
    target_areas:{
      primary:cleanList(input.target_areas?.primary,1,90),
      secondary:cleanList(input.target_areas?.secondary,1,90),
    },
    patient_concerns:cleanList(input.patient_concerns,20,120),
    usp_points:cleanList(input.usp_points,20,120),
    tone_preference:tone,
    updated_at:new Date().toISOString(),
  };
  const db=createAdminClient()||supabase;
  const {error}=await db.from('doctor_ai_settings').upsert(payload,{onConflict:'doctor_id'});
  if(error){
    console.error('AI settings save failed:',error.code,error.message);
    throw new Error('Unable to save AI settings. Please try again.');
  }
  revalidatePath('/dashboard/profile');
  revalidatePath(`/r/${doctor.slug}`);
}

export async function updateProfile(formData:FormData){
  const doctor=await getCurrentDoctor();
  const {supabase,user}=await getAuthenticatedUser();
  if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');
  let logo_url=doctor.logo_url;
  const logo=formData.get('logo');
  if(logo instanceof File&&logo.size){
    const allowedTypes=new Set(['image/png','image/jpeg','image/webp']);
    if(!allowedTypes.has(logo.type))throw new Error('Clinic logo must be a PNG, JPG or WebP image.');
    if(logo.size>5*1024*1024)throw new Error('Clinic logo must be smaller than 5 MB.');
    const extension=logo.type==='image/png'?'png':logo.type==='image/jpeg'?'jpg':'webp';
    const path=`${user.id}/clinic-logo-${Date.now()}.${extension}`;
    const {error:uploadError}=await supabase.storage.from('qr-codes').upload(path,logo,{upsert:false,contentType:logo.type,cacheControl:'31536000'});
    if(uploadError)throw new Error(uploadError.message);
    logo_url=supabase.storage.from('qr-codes').getPublicUrl(path).data.publicUrl;
  }
  const hex=/^#[0-9a-f]{6}$/i;
  const color=(name:string,fallback:string)=>{const value=String(formData.get(name)||'').trim();return hex.test(value)?value.toUpperCase():fallback};
  const theme_config={primary:color('theme_primary','#1E40AF'),accent:color('theme_accent','#F97316'),background:color('theme_background','#F8FAFC')};
  const clean=(value:FormDataEntryValue|null,max=80)=>String(value||'').trim().slice(0,max);
  const top_services=clean(formData.get('top_services'),600).split(',').map(item=>item.trim()).filter(Boolean).slice(0,12);
  const knowledge_base={area_name:clean(formData.get('area_name')),city_name:clean(formData.get('city_name')),top_services};
  const updates={doctor_name:String(formData.get('doctor_name')||''),clinic_name:String(formData.get('clinic_name')||''),specialization:String(formData.get('specialization')||''),city:String(formData.get('city')||''),phone:String(formData.get('phone')||''),gmb_review_link:String(formData.get('gmb_review_link')||''),logo_url,theme_config,knowledge_base};
  const {error}=await supabase.from('doctors').update(updates).eq('id',doctor.id).eq('auth_user_id',user.id);
  if(error)throw new Error(error.message);
  revalidatePath('/dashboard','layout');revalidatePath(`/r/${doctor.slug}`);redirect('/dashboard/profile?saved=1');
}
