import { createServerClient } from '@supabase/ssr'; import { cookies } from 'next/headers';
type CookieToSet={name:string;value:string;options?:Parameters<ReturnType<typeof cookies>['set']>[2]};
export function createClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL;const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;if(!url||!key)return null;const store=cookies();return createServerClient(url,key,{cookies:{getAll(){return store.getAll()},setAll(values:CookieToSet[]){try{values.forEach(({name,value,options})=>store.set(name,value,options))}catch{}}}})}
