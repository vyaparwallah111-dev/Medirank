'use server';
import { redirect } from 'next/navigation'; import { getAuthenticatedUser } from '@/lib/dashboard';
const keywordSets:Record<string,{keyword:string;category:string}[]>={dentist:[{keyword:'Painless root canal',category:'treatment'},{keyword:'Best dental implant',category:'treatment'},{keyword:'Teeth whitening',category:'treatment'},{keyword:'Painless tooth extraction',category:'treatment'},{keyword:'Advanced clinic treatment',category:'treatment'},{keyword:'Friendly and caring doctor',category:'behaviour'},{keyword:'Explained treatment clearly',category:'behaviour'},{keyword:'Clean and hygienic clinic',category:'cleanliness'}],default:[{keyword:'Advanced treatment',category:'treatment'},{keyword:'Friendly and caring doctor',category:'behaviour'},{keyword:'Explained treatment clearly',category:'behaviour'},{keyword:'Clean and hygienic clinic',category:'cleanliness'},{keyword:'On-time appointment',category:'clinic'}]};
export async function completeOnboarding(formData:FormData){
  const {supabase,user}=await getAuthenticatedUser();
  const {data:existing}=await supabase.from('doctors').select('id').eq('auth_user_id',user.id).maybeSingle();
  if(existing)redirect('/dashboard');
  const doctorName=String(formData.get('doctor_name')||'').trim();
  const specialization=String(formData.get('specialization')||'').trim();
  const base=doctorName.replace(/^dr\.?\s*/i,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'doctor';
  const slug=`${base}-${crypto.randomUUID().slice(0,6)}`;
  const now=new Date();
  const trialExpiry=new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let insertData: Record<string, unknown> = {
    auth_user_id:user.id,
    doctor_name:doctorName,
    clinic_name:String(formData.get('clinic_name')||'').trim(),
    specialization,
    city:String(formData.get('city')||'').trim(),
    gmb_review_link:String(formData.get('gmb_review_link')||'').trim()||null,
    slug,
    plan:'trial',
    subscription_tier:'growth',
    plan_started_at:now.toISOString(),
    plan_expires_at:trialExpiry.toISOString(),
  };

  let {data:doctor,error}=await supabase.from('doctors').insert(insertData).select('id').maybeSingle();

  // If new columns (like plan_started_at or subscription_tier) are not present in DB yet (PostgreSQL error 42703), retry with base schema
  if (error?.code === '42703') {
    const fallbackData = {
      auth_user_id:user.id,
      doctor_name:doctorName,
      clinic_name:String(formData.get('clinic_name')||'').trim(),
      specialization,
      city:String(formData.get('city')||'').trim(),
      gmb_review_link:String(formData.get('gmb_review_link')||'').trim()||null,
      slug,
      plan:'trial',
    };
    const retry = await supabase.from('doctors').insert(fallbackData).select('id').maybeSingle();
    doctor = retry.data;
    error = retry.error;
  }

  if(error||!doctor) {
    console.error('Failed to create doctor profile:', error);
    throw new Error(error?.message||'Unable to create clinic profile.');
  }

  const key=Object.keys(keywordSets).find(k=>specialization.toLowerCase().includes(k));
  const seed=keywordSets[key||'default'];
  try {
    await supabase.from('doctor_keywords').insert(seed.map(x=>({...x,doctor_id:doctor.id})));
  } catch (err) {
    console.error('Error seeding doctor keywords:', err);
  }
  redirect('/dashboard');
}
