'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCcw } from 'lucide-react';
import { resetDoctorScans, setDoctorActive, setDoctorPlan } from '../../actions';

export function ClinicControls({id,tier,active,isAdmin}:{id:string;tier:string;active:boolean;isAdmin:boolean}){
  const router=useRouter();const [pending,startTransition]=useTransition();const [message,setMessage]=useState('');
  const run=(action:()=>Promise<void>,success:string)=>startTransition(async()=>{try{await action();setMessage(success);router.refresh()}catch(error){setMessage(error instanceof Error?error.message:'Action failed.')}});
  return <div className="rounded-2xl border border-[#0A4C95]/15 bg-white p-5 shadow-lg shadow-[#0A4C95]/5"><h2 className="font-extrabold">Admin controls</h2><div className="mt-4 flex flex-wrap gap-3">
    <select disabled={pending||isAdmin} defaultValue={tier} onChange={e=>run(()=>setDoctorPlan(id,e.target.value),'Plan updated successfully.')} className="min-h-11 rounded-xl border border-[#0A4C95]/20 bg-white px-4 text-sm font-bold capitalize text-[#0A4C95] outline-none focus:border-[#F37021]">{['starter','growth','premium'].map(value=><option key={value}>{value}</option>)}</select>
    <button disabled={pending||isAdmin} onClick={()=>run(()=>resetDoctorScans(id),'Current scan cycle reset. Historical analytics preserved.')} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0A4C95] px-4 text-sm font-bold text-white disabled:opacity-50">{pending?<Loader2 size={16} className="animate-spin"/>:<RefreshCcw size={16}/>}Reset scan cycle</button>
    <button disabled={pending||isAdmin} onClick={()=>run(()=>setDoctorActive(id,!active),active?'Clinic suspended.':'Clinic activated.')} className="min-h-11 rounded-xl bg-[#F37021] px-4 text-sm font-bold text-white disabled:opacity-50">{active?'Suspend clinic':'Activate clinic'}</button>
  </div>{message&&<p role="status" className="mt-3 text-sm font-bold text-[#F37021]">{message}</p>}</div>;
}
