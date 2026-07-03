import { Mail, MessageCircle } from 'lucide-react';
import { getCurrentDoctor } from '@/lib/dashboard';

const whatsapp='https://wa.me/919187641492?text=Hi%20Vyapar%20Wallah,%20I%20am%20on%20the%20Growth%20Plan%20and%20need%20assistance.';

export default async function SupportPage(){
  const doctor=await getCurrentDoctor();
  const isGrowth=doctor.subscription_tier?.trim().toLowerCase()==='growth';
  return <div className="mx-auto max-w-3xl"><h1 className="text-3xl font-extrabold">Help & support</h1><p className="mt-2 text-slate-500">Get help with your clinic review workflow.</p><div className="mt-8 grid gap-5 sm:grid-cols-2"><a href="mailto:support@vyaparwallah.com" className="card p-6 transition hover:border-blue-200"><Mail className="text-brand" size={28}/><h2 className="mt-5 text-lg font-bold">Email support</h2><p className="mt-2 text-sm text-slate-500">support@vyaparwallah.com</p></a>{isGrowth?<a href={whatsapp} target="_blank" rel="noreferrer" className="card border-emerald-200 bg-emerald-50 p-6 transition hover:border-emerald-400"><MessageCircle className="text-emerald-600" size={30}/><h2 className="mt-5 text-lg font-bold">WhatsApp support</h2><p className="mt-2 text-sm text-slate-600">Start a priority click-to-chat conversation.</p><span className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white">Chat on WhatsApp</span></a>:<div className="card p-6 opacity-70"><MessageCircle className="text-slate-400" size={30}/><h2 className="mt-5 text-lg font-bold">WhatsApp support</h2><p className="mt-2 text-sm text-slate-500">Available on the Growth plan.</p></div>}</div></div>;
}
