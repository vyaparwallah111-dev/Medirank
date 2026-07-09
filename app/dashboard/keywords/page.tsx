import { DashboardKeywordsManager } from '@/components/dashboard-keywords-manager';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';
import { redirect } from 'next/navigation';

const defaults:Record<string,{keyword:string;category:string}[]>={dentist:[{keyword:'Painless root canal',category:'treatment'},{keyword:'Best dental implant',category:'treatment'},{keyword:'Teeth whitening',category:'treatment'},{keyword:'Painless tooth extraction',category:'treatment'},{keyword:'Advanced clinic treatment',category:'treatment'},{keyword:'Friendly and caring doctor',category:'behavior'},{keyword:'Explained treatment clearly',category:'behavior'},{keyword:'Clean and hygienic clinic',category:'cleanliness'}],dermatologist:[{keyword:'Clear diagnosis',category:'treatment'},{keyword:'Professional care',category:'behavior'},{keyword:'Clean and hygienic clinic',category:'cleanliness'},{keyword:'Helpful skincare advice',category:'treatment'}],default:[{keyword:'Advanced treatment',category:'treatment'},{keyword:'Friendly and caring doctor',category:'behavior'},{keyword:'Clean and hygienic clinic',category:'cleanliness'},{keyword:'Explained treatment clearly',category:'behavior'}]};

export default async function Keywords(){
  const doctor=await getCurrentDoctor();
  const {supabase,user}=await getAuthenticatedUser();
  if(!doctor?.id||!user?.id)redirect('/onboarding');
  if(doctor?.auth_user_id!==user?.id)throw new Error('Forbidden');
  let {data:items,error}=await supabase.from('doctor_keywords').select('id,keyword,category').eq('doctor_id',doctor.id).order('created_at');
  if(error)throw new Error(error.message);
  if(!items?.length){
    const specialization=(doctor.specialization||'').toLowerCase(),key=Object.keys(defaults).find(k=>specialization.includes(k)),seed=defaults[key||'default'];
    const result=await supabase.from('doctor_keywords').insert(seed.map(x=>({...x,doctor_id:doctor.id}))).select('id,keyword,category');
    if(result.error)throw new Error(result.error.message);
    items=result.data;
  }
  return <div className="mx-auto max-w-4xl px-1 sm:px-0">
    <h1 className="text-2xl font-extrabold sm:text-3xl">Review keywords</h1>
    <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">Manage the treatment and care highlights patients can choose.</p>
    <DashboardKeywordsManager initialItems={items??[]} />
  </div>;
}
