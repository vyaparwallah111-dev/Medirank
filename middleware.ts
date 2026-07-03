import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet={name:string;value:string;options?:Record<string,unknown>};

export async function middleware(req:NextRequest){
  let res=NextResponse.next({request:req});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return res;
  const supabase=createServerClient(url,key,{cookies:{getAll:()=>req.cookies.getAll(),setAll(c:CookieToSet[]){c.forEach(({name,value})=>req.cookies.set(name,value));res=NextResponse.next({request:req});c.forEach(({name,value,options})=>res.cookies.set(name,value,options as any))}}});
  const {data:{user}}=await supabase.auth.getUser();
  const pathname=req.nextUrl.pathname;
  const protectedPath=pathname.startsWith('/dashboard')||pathname.startsWith('/admin');
  if(!user&&protectedPath)return NextResponse.redirect(new URL('/login',req.url));

  let profile:{is_admin?:boolean;is_active?:boolean}|null=null;
  if(user&&(protectedPath||pathname==='/login'||pathname==='/signup')){
    const result=await supabase.from('doctors').select('is_admin,is_active').eq('auth_user_id',user.id).maybeSingle();
    profile=result.data;
  }
  if(user&&pathname.startsWith('/admin')&&profile?.is_admin!==true)return NextResponse.redirect(new URL('/login',req.url));
  if(user&&pathname.startsWith('/dashboard')&&profile?.is_admin===true)return NextResponse.redirect(new URL('/admin/dashboard',req.url));
  if(user&&pathname.startsWith('/dashboard')&&profile?.is_active===false)return NextResponse.redirect(new URL('/login?blocked=1',req.url));
  if(user&&(pathname==='/login'||pathname==='/signup')){
    if(profile?.is_active===false)return res;
    return NextResponse.redirect(new URL(profile?.is_admin===true?'/admin/dashboard':'/dashboard',req.url));
  }
  return res;
}
export const config={matcher:['/dashboard/:path*','/admin/:path*','/onboarding','/login','/signup']};
