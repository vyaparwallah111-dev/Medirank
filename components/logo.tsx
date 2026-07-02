import Link from 'next/link';
import { Stethoscope } from 'lucide-react';
export function Logo({light=false}:{light?:boolean}){return <Link href="/" className="inline-flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"><Stethoscope size={20}/></span><span className={`text-xl font-extrabold tracking-tight ${light?'text-white':'text-slate-950'}`}>Medi<span className="text-orange">Rank</span><small className={`ml-2 text-[10px] font-semibold tracking-normal ${light?'text-white/70':'text-slate-400'}`}>By Vyapar Wallah</small></span></Link>}
