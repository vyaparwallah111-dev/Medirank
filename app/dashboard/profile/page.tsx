import { CheckCircle2 } from 'lucide-react';
import { getCurrentDoctor } from '@/lib/dashboard';
import { updateProfile } from '../actions';
import { ThemePicker } from '@/components/theme-picker';
import { KnowledgeBaseSettings } from '@/components/knowledge-base-settings';
import { ClinicLogoUpload } from '@/components/clinic-logo-upload';
import { AIKnowledgeBaseSettings } from '@/components/ai-knowledge-base-settings';

const defaultTheme={primary:'#1E40AF',accent:'#F97316',background:'#F8FAFC'};
export default async function Profile({searchParams}:{searchParams:{saved?:string}}){
  const doctor=await getCurrentDoctor();
  const knowledge=doctor.knowledge_base||{area_name:'',city_name:doctor.city||'',top_services:[]};
  return <div className="mx-auto max-w-3xl">
    <h1 className="text-3xl font-extrabold">Clinic profile</h1><p className="mt-2 text-slate-500">Keep the details patients see up to date.</p>
    {searchParams.saved&&<p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700"><CheckCircle2 size={18}/>Clinic profile updated.</p>}
    <form action={updateProfile}><div className="card mt-8 grid gap-5 p-5 sm:grid-cols-2 sm:p-7">
      <div><label className="label">Doctor name</label><input name="doctor_name" className="input" defaultValue={doctor.doctor_name} required/></div>
      <div><label className="label">Specialisation</label><input name="specialization" className="input" defaultValue={doctor.specialization||''}/></div>
      <div className="sm:col-span-2"><label className="label">Clinic name</label><input name="clinic_name" className="input" defaultValue={doctor.clinic_name} required/></div>
      <div><label className="label">City</label><input name="city" className="input" defaultValue={doctor.city||''}/></div>
      <div><label className="label">Phone</label><input name="phone" className="input" defaultValue={doctor.phone||''}/></div>
      <div className="sm:col-span-2"><label className="label">Google review link</label><input name="gmb_review_link" type="url" className="input" defaultValue={doctor.gmb_review_link||''}/></div>
      <div className="sm:col-span-2"><label className="label">Clinic logo</label><ClinicLogoUpload currentLogoUrl={doctor.logo_url}/></div>
    </div><KnowledgeBaseSettings initial={knowledge} specialization={doctor.specialization||''}/><ThemePicker initial={doctor.theme_config||defaultTheme}/><button className="btn-primary mt-6 w-full sm:w-auto">Save profile settings</button></form>
    <AIKnowledgeBaseSettings doctorId={doctor.id}/>
  </div>;
}
