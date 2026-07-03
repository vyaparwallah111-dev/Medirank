'use client';

import { useState } from 'react';
import { Check, MessageCircle } from 'lucide-react';

export function DirectLinkShare({clinic,slug,appOrigin}:{clinic:string;slug:string;appOrigin:string}){
  const [copied,setCopied]=useState(false);
  async function copyTemplate(){
    const origin=(appOrigin||window.location.origin).replace(/\/$/,'');
    const link=`${origin}/r/${encodeURIComponent(slug)}`;
    const text=`Hi! Thank you for visiting ${clinic}. Your feedback means a lot to us. Please share your experience here: ${link}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(()=>setCopied(false),2000);
  }
  return <button type="button" onClick={copyTemplate} className="btn-primary mt-3 min-h-12 w-full">{copied?<><Check size={18}/>Template copied</>:<><MessageCircle size={18}/>Direct Link Share</>}</button>;
}
