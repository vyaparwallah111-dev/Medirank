'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';

export async function addKeyword(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const keyword=String(formData.get('keyword')||'').trim(),category=String(formData.get('category')||'behavior');if(!keyword)return;const {error}=await supabase.from('doctor_keywords').insert({doctor_id:doctor.id,keyword,category});if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`)}
export async function deleteKeyword(formData:FormData){const doctor=await getCurrentDoctor();const {supabase,user}=await getAuthenticatedUser();if(doctor.auth_user_id!==user.id)throw new Error('Forbidden');const id=String(formData.get('id')||'');const {error}=await supabase.from('doctor_keywords').delete().eq('id',id).eq('doctor_id',doctor.id);if(error)throw new Error(error.message);revalidatePath('/dashboard/keywords');revalidatePath(`/r/${doctor.slug}`)}

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
