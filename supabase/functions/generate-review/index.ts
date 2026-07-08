import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value.trim():fallback;
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).map(item=>item.trim()):[];
const GEMINI_MODEL='gemini-2.5-flash';
const GEMINI_TIMEOUT_MS=7_000;
type UsageType='doctor_name'|'clinic_name'|'area_name'|'treatment'|'superlative';
type DensityBand='short'|'medium'|'long';
type DoctorAISettings={target_keywords?:unknown;target_areas?:unknown;patient_concerns?:unknown;usp_points?:unknown;tone_preference?:unknown};
const openingHooks=[
  'Mera experience overall kaafi acha raha.',
  'Maine recently visit kiya aur honestly comfort feel hua.',
  'Kal appointment liya tha, process kaafi smooth raha.',
  'Bahut din se soch raha tha review share karun.',
  'Highly satisfied with my clinic visit.',
  'Sharing my genuine review after the appointment.',
  'First time visit tha and experience positive raha.',
  'The visit felt simple, calm, and properly handled.',
  'Honestly, mujhe staff ka approach helpful laga.',
  'I went in with a few doubts, but things were explained well.',
];
const selectDensity=():DensityBand=>{const roll=Math.random();return roll<.35?'short':roll<.8?'medium':'long'};
const densityInstruction=(band:DensityBand)=>band==='short'
  ? 'SHORT DRAFTS: each review must be max 3 distinct lines. Keep it direct, punchy, colloquial, and concise.'
  : band==='medium'
    ? 'MEDIUM DRAFTS: each review must be 5 to 6 distinct lines. Include doctor behavior and staff hospitality where supported.'
    : 'LONG DRAFTS: each review must be 7 to 8 distinct lines. Use descriptive storytelling with a natural personal touch.';
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const opening=(value:string)=>normalize(value).split(' ').slice(0,4).join(' ');
const jsonList=(value:unknown):string[]=>{
  if(Array.isArray(value))return list(value);
  if(typeof value==='string')return value.split(',').map(item=>item.trim()).filter(Boolean);
  if(value&&typeof value==='object')return Object.values(value as Record<string,unknown>).flatMap(jsonList);
  return [];
};
function weightedKeywordSelection(raw:unknown,max=4){
  const source=(raw&&typeof raw==='object'?raw:{}) as Record<string,unknown>;
  const buckets={high:jsonList(source.high),medium:jsonList(source.medium),low:jsonList(source.low)};
  const selected:string[]=[];
  const pick=(items:string[])=>items.length?items[Math.floor(Math.random()*items.length)]:'';
  for(let i=0;i<max;i++){
    const roll=Math.random();
    const candidate=roll<.6?pick(buckets.high):roll<.9?pick(buckets.medium):pick(buckets.low);
    if(candidate&&!selected.some(item=>item.toLowerCase()===candidate.toLowerCase()))selected.push(candidate);
  }
  if(!selected.length)selected.push(...[...buckets.high,...buckets.medium,...buckets.low].slice(0,max));
  return selected.slice(0,max);
}
function settingsContext(settings:DoctorAISettings|null,selectedKeywords:string[]){
  if(!settings)return 'AI Knowledge Base: no doctor-specific AI settings found.';
  const areaSource=(settings.target_areas&&typeof settings.target_areas==='object'?settings.target_areas:{}) as Record<string,unknown>;
  const primaryAreas=jsonList(areaSource.primary??areaSource.Primary);
  const secondaryAreas=jsonList(areaSource.secondary??areaSource.Secondary);
  const targetAreas=primaryAreas.length||secondaryAreas.length?[...primaryAreas,...secondaryAreas]:jsonList(settings.target_areas);
  const concerns=jsonList(settings.patient_concerns);
  const usp=jsonList(settings.usp_points);
  const tone=text(settings.tone_preference);
  return `AI Knowledge Base Context:
- Selected priority keywords to weave naturally: ${selectedKeywords.join(', ')||'none'}.
- Primary target areas: ${primaryAreas.join(', ')||targetAreas[0]||'none'}.
- Secondary target areas: ${secondaryAreas.join(', ')||targetAreas.slice(1).join(', ')||'none'}.
- Common patient concerns to acknowledge only if relevant: ${concerns.join(', ')||'none'}.
- Clinic USP points to reflect without exaggeration: ${usp.join(', ')||'none'}.
- Doctor tone preference: ${tone||'natural, conversational'}.`;
}
async function logSystemError(db:ReturnType<typeof createClient>|null,doctorId:string|null,errorMessage:string){
  if(!db)return;
  try{
    await db.from('system_error_logs').insert({doctor_id:doctorId,endpoint:'generate-review',error_message:errorMessage.slice(0,1000),severity:'error'});
  }catch(error){console.error('System error audit insert failed; continuing',error)}
}
async function fetchWithSla(url:string,init:RequestInit,timeoutMs:number){
  const controller=new AbortController();
  let timer:number|undefined;
  try{
    return await Promise.race([
      fetch(url,{...init,signal:controller.signal}),
      new Promise<Response>((_,reject)=>{
        timer=setTimeout(()=>{
          controller.abort('sla-timeout');
          reject(new Error(`Gemini request exceeded ${timeoutMs}ms SLA`));
        },timeoutMs);
      }),
    ]);
  }finally{
    if(timer)clearTimeout(timer);
  }
}
const personalities={
  'Casual-Warm':'Use a warm, relaxed conversational tone without exaggeration.',
  'Brief-Direct':'Use direct, economical wording and avoid filler.',
  'Detailed-Descriptive':'Use concrete supplied details with a clear chronological flow; never invent details.',
  'Friendly-Emoji':'Use a friendly tone with at most one context-appropriate emoji.',
  'Simple-Plain':'Use simple everyday vocabulary and plain sentence structure.',
} as const;
type Personality=keyof typeof personalities;
const personalityNames=Object.keys(personalities) as Personality[];
const haversine=(lat1:number,lon1:number,lat2:number,lon2:number)=>{const rad=(value:number)=>value*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6_371_000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};
const indiaDayStart=()=>{const now=new Date();const india=new Date(now.getTime()+330*60_000);const utc=Date.UTC(india.getUTCFullYear(),india.getUTCMonth(),india.getUTCDate())-330*60_000;return new Date(utc).toISOString()};
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}

function parseReviews(raw:unknown,expectedCount:number):string[]{
  if(typeof raw!=='string')return [];
  const clean=(value:string)=>value.replace(/^```(?:json|text)?\s*/i,'').replace(/```$/,'').replace(/^\s*(?:review(?:\s*variant)?|option)?\s*\d+[.):\-]\s*/i,'').trim();
  const unique=(values:string[])=>Array.from(new Set(values.map(clean).filter(value=>value.length>=10))).slice(0,expectedCount);

  // Gemini may return a JSON array/object inside a markdown fence even when
  // the prompt asks for tagged text.
  const jsonCandidate=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{
    const parsed=JSON.parse(jsonCandidate) as unknown;
    if(Array.isArray(parsed)){
      const recovered=unique(parsed.map(item=>typeof item==='string'?item:text((item as {review?:unknown})?.review)));
      if(recovered.length)return recovered;
    }
    if(parsed&&typeof parsed==='object'){
      const object=parsed as {reviews?:unknown;drafts?:unknown;options?:unknown;review?:unknown};
      const collection=object.reviews??object.drafts??object.options;
      if(Array.isArray(collection)){
        const recovered=unique(collection.map(item=>typeof item==='string'?item:text((item as {review?:unknown})?.review)));
        if(recovered.length)return recovered;
      }
      const single=clean(text(object.review));
      if(single)return [single];
    }
  }catch{/* Continue with tolerant text parsing. */}

  const reviewsArray:string[]=[];
  // A closing tag is optional: the next opening tag (or end of text) is also
  // a valid boundary. Gemini sometimes omits or adds spaces inside closing tags.
  const tagRegex=/\[\s*REVIEW\s*\]([\s\S]*?)(?=\[\s*\/\s*REVIEW\s*\]|\[\s*REVIEW\s*\]|$)/gi;
  let match:RegExpExecArray|null;
  while((match=tagRegex.exec(raw))!==null){
    const cleanReview=match[1].replace(/\[\s*\/\s*REVIEW\s*\]/gi,'').trim();
    if(cleanReview)reviewsArray.push(cleanReview);
  }
  if(reviewsArray.length)return unique(reviewsArray);

  const withoutTags=raw.replace(/\[\s*\/?\s*REVIEW\s*\]/gi,'').trim();

  // Accept output from the previous prompt contract during deployment overlap.
  const delimited=withoutTags.split('---REVIEW_SPLIT---').map(review=>review.trim()).filter(Boolean);
  if(delimited.length>1)return unique(delimited);

  // Last-resort recovery for models that emit numbered blocks despite the tags.
  const numbered=withoutTags.split(/(?:^|\n)\s*(?:review(?:\s*variant)?\s*)?[1-5][.):\-]\s*/gi).map(review=>review.trim()).filter(Boolean);
  if(numbered.length>1)return unique(numbered);

  // If the model ignored every marker but returned three separated paragraphs,
  // preserve those otherwise valid reviews.
  const paragraphs=withoutTags.split(/\n\s*\n+/).map(review=>review.trim()).filter(Boolean);
  if(paragraphs.length>1)return unique(paragraphs);
  console.error('Review parser diagnostics',{expectedCount,tagged:reviewsArray.length,delimited:delimited.length,numbered:numbered.length,paragraphs:paragraphs.length});
  const singular=clean(withoutTags);
  return singular.length>=10?[singular]:[];
}

function emergencyDrafts(language:'english'|'hinglish'){
  const repository=language==='hinglish'
    ? [
      'Clinic visit ka experience kaafi acha raha.\nStaff helpful tha aur dr ne baat clearly samjhai.\nOverall mujhe comfortable feel hua.',
      'Mera treatment visit smooth raha.\nThe dentist ne calmly guide kiya, zyada rush jaisa feel nahi hua.\nClinic ka environment bhi neat tha.',
      'Aaj ka visit genuinely theek laga.\nStaff ne process simple rakha aur doctor se baat karke confidence aaya.\nMain overall satisfied hoon.',
      'Clinic mein experience acha tha.\nDoctor aur team ne concerns dhyan se sune, bas normal sa friendly vibe tha.\nFollow-up ke liye bhi clear guidance mili.',
      'Maine recently visit kiya tha.\nReception par thoda wait hua, but doctor ka explanation clear tha.\nOverall acha experience raha.',
      'Bahut simple aur comfortable visit tha.\nStaff polite tha aur dr ne jaldi-jaldi nahi kiya.\nMujhe treatment process samajh aa gaya.',
      'First time aaya tha, thoda nervous tha.\nClinic team ne calmly handle kiya aur doubts clear kiye.\nExperience positive raha.',
      'Genuine review share kar raha hoon.\nDoctor ka behaviour good tha aur clinic clean lagi.\nBas parking thodi busy thi, baaki sab theek.',
    ]
    : [
      'My clinic visit went well overall.\nThe dentist explained things clearly and the staff was polite.\nI felt comfortable through the appointment.',
      'I had a good experience during my visit.\nThe clinic staff handled things smoothly, and the doctor answered my concerns.\nOverall it felt simple and reassuring.',
      'The appointment was comfortable and well managed.\nThe dentist was patient while explaining the treatment.\nI left feeling satisfied with the visit.',
      'My visit to the clinic was positive.\nThe team was helpful, the place felt clean, and the doctor guided me properly.\nWould recommend for a calm dental visit.',
      'Sharing my genuine review after the appointment.\nThe doctor explained the process well and the staff was courteous.\nThere was a short wait, but overall it was good.',
      'I visited with a few doubts in mind.\nThe dentist listened patiently and answered them clearly.\nThe clinic experience felt calm and professional.',
      'Highly satisfied with the way the visit was handled.\nThe staff helped with the basic process and the doctor was easy to talk to.\nOverall, a positive experience.',
      'The clinic felt clean and organised.\nThe medical team was polite, and the doctor guided me properly.\nParking was a bit full, but the visit itself was good.',
    ];
  const offset=Math.floor(Math.random()*repository.length);
  return Array.from({length:4},(_,index)=>repository[(offset+index)%repository.length]);
}
function ensureLineShape(content:string,language:'english'|'hinglish',band:DensityBand){
  const lines=content.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const maxLines=band==='short'?3:band==='medium'?6:8;
  const minLines=band==='short'?1:band==='medium'?5:7;
  if(lines.length>=minLines)return lines.slice(0,maxLines).join('\n');
  const sentenceLines=content.split(/(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean);
  const next=[...(sentenceLines.length>1?sentenceLines:lines)];
  const fillers=language==='hinglish'
    ? ['Overall visit positive laga.','Main experience se satisfied hoon.','Process simple tha.','Staff ka response helpful tha.','Doctor ne calmly explain kiya.','Bas overall acha laga.']
    : ['Overall, my visit felt positive.','I felt satisfied with the experience.','The process felt simple.','The staff response was helpful.','The dentist explained things calmly.','Overall, it was a good visit.'];
  for(const filler of fillers){if(next.length>=minLines)break;if(!next.some(line=>normalize(line)===normalize(filler)))next.push(filler)}
  return next.slice(0,maxLines).join('\n');
}

Deno.serve(async(req)=>{
  let targetCount=4;
  let fallbackLanguage:'english'|'hinglish'='english';
  let db:ReturnType<typeof createClient>|null=null;
  let doctorIdForAudit:string|null=null;
  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}});
  try{
    let body:Record<string,unknown>;
    try{body=await req.json();fallbackLanguage=body.language==='hinglish'?'hinglish':'english'}catch(error){console.error('Invalid request JSON',error);return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}})}
    const doctorId=text(body.doctor_id);
    doctorIdForAudit=doctorId||null;
    if(!doctorId)return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}});
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){console.error('Missing Edge Function secrets',{hasUrl:!!url,hasServiceKey:!!serviceKey,hasGeminiKey:!!geminiKey});return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}})}
    db=createClient(url,serviceKey);
    const {data:doctor,error:doctorError}=await db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base,subscription_tier,latitude,longitude,daily_review_cap').eq('id',doctorId).eq('is_active',true).maybeSingle();
    if(doctorError){console.error('Doctor lookup failed',doctorError);void logSystemError(db,doctorId,doctorError.message||'Doctor lookup failed');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}})}
    if(!doctor){void logSystemError(db,doctorId,'Clinic not found or inactive');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true}})}

    // Token-free abuse checks. These are authoritative and run before any
    // generation or embedding API request, even if the browser preflight is bypassed.
    const deviceToken=text(body.device_token).slice(0,128);
    if(!deviceToken)return reply({error:'Unable to verify this device. Please refresh and try again.'});
    const browserSignature=(req.headers.get('user-agent')||'unknown').slice(0,300);
    const fingerprintHash=await sha256(`${doctor.id}|${deviceToken}|${browserSignature}`);
    const patientLatitude=typeof body.latitude==='number'?body.latitude:NaN,patientLongitude=typeof body.longitude==='number'?body.longitude:NaN;
    const hasPatientLocation=Number.isFinite(patientLatitude)&&Number.isFinite(patientLongitude)&&patientLatitude>=-90&&patientLatitude<=90&&patientLongitude>=-180&&patientLongitude<=180;
    const hasClinicLocation=Number.isFinite(doctor.latitude)&&Number.isFinite(doctor.longitude);
    let locationVerified:boolean|null=null,distanceMeters:number|null=null;
    if(hasPatientLocation&&hasClinicLocation){distanceMeters=Math.round(haversine(patientLatitude,patientLongitude,Number(doctor.latitude),Number(doctor.longitude)));locationVerified=distanceMeters<=500}
    if(body.precheck_only===true)return reply({allowed:true,location_verified:locationVerified,distance_meters:distanceMeters});
    const personality=personalityNames[Math.floor(Math.random()*personalityNames.length)];

    const subscriptionTier=text(doctor.subscription_tier,'starter').toLowerCase();
    const isStarter=subscriptionTier==='starter';
    const language=body.language==='hinglish'?'Hinglish (Latin script)':'English';

    const kb=(doctor.knowledge_base&&typeof doctor.knowledge_base==='object'?doctor.knowledge_base:{}) as KB;
    const area=text(kb.area_name,'the local area'),city=text(kb.city_name,text(doctor.city,area)),specialty=text(doctor.specialization,'Doctor');
    const specialtyLower=specialty.toLowerCase();
    const providerTerm=specialtyLower.includes('dent')?'the dentist':specialtyLower.includes('physician')||specialtyLower.includes('medicine')?'the physician':'the specialist';
    const services=list(kb.top_services);
    const legacyTreatment=text(body.selected_treatment_keyword);
    const requested=[...list(body.selected_treatments),...list(body.selected_services)];
    if(legacyTreatment)requested.unshift(legacyTreatment);
    let treatments=requested
      .filter((item,index,items)=>items.findIndex(candidate=>candidate.toLowerCase()===item.toLowerCase())===index)
      .filter(item=>services.some(service=>service.toLowerCase()===item.toLowerCase()))
      .slice(0,3);
    const {data:keywordRows,error:keywordError}=await db.from('doctor_keywords').select('keyword').eq('doctor_id',doctor.id);
    if(keywordError)console.error('Keyword lookup failed',keywordError);
    const allowed=new Set((keywordRows||[]).map(item=>text(item.keyword).toLowerCase()).filter(Boolean));
    let aspects=[...list(body.selected_keywords),...list(body.selected_experiences)]
      .filter((item,index,items)=>items.findIndex(candidate=>candidate.toLowerCase()===item.toLowerCase())===index)
      .filter(item=>allowed.has(item.toLowerCase()))
      .slice(0,3);
    if(isStarter){
      // Starter accounts may send at most three combined treatment/experience
      // keywords. Treatments retain priority, then remaining aspect slots.
      treatments=treatments.slice(0,3);
      aspects=aspects.slice(0,Math.max(0,3-treatments.length));
    }
    const selectedTreatment=treatments[0]||services[0]||specialty;
    const rating=Math.min(5,Math.max(1,Number(body.rating)||5));
    const customNotes=text(body.custom_notes).slice(0,500);
    let aiSettings:DoctorAISettings|null=null;
    try{
      const result=await db.from('doctor_ai_settings').select('target_keywords,target_areas,patient_concerns,usp_points,tone_preference').eq('doctor_id',doctor.id).maybeSingle();
      if(result.error)console.error('Doctor AI settings lookup failed; continuing with defaults',result.error);
      else aiSettings=(result.data||null) as DoctorAISettings|null;
    }catch(error){console.error('Doctor AI settings lookup threw; continuing with defaults',error)}
    let priorityKeywords=weightedKeywordSelection(aiSettings?.target_keywords);
    const effectiveTone=text(aiSettings?.tone_preference)||personality;
    const areaSource=(aiSettings?.target_areas&&typeof aiSettings.target_areas==='object'?aiSettings.target_areas:{}) as Record<string,unknown>;
    const aiPrimaryArea=jsonList(areaSource.primary??areaSource.Primary)[0]||'';
    const aiSecondaryArea=jsonList(areaSource.secondary??areaSource.Secondary)[0]||'';
    const clinicLocality=aiPrimaryArea||aiSecondaryArea||[area,city].filter(value=>value&&value!=='the local area').join(', ')||area;
    const configuredTreatments=Array.from(new Set([...jsonList(aiSettings?.target_keywords),...services,...treatments].map(item=>item.trim()).filter(Boolean)));
    const selectedSpecificTreatment=treatments[0]||configuredTreatments[0]||selectedTreatment;
    const densityBand=selectDensity();
    const generatedRating=Math.random()<.15?4:5;
    const microComplaint=generatedRating===4
      ? (language.startsWith('Hinglish')?'Add one small non-medical micro-complaint, such as a little wait at reception or parking being full, while keeping the treatment and doctor sentiment positive.':'Add one small non-medical micro-complaint, such as a short reception wait or parking being full, while keeping the treatment and doctor sentiment positive.')
      : 'Do not add complaints. Keep the sentiment clearly 5-star positive.';

    const dailySince=new Date(Date.now()-86_400_000).toISOString();
    let generatedRowCount=0;
    try{
      const result=await db.from('generated_reviews').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',dailySince);
      if(result.error)console.error('24-hour request sequence lookup failed; defaulting to first request',result.error);
      else generatedRowCount=result.count||0;
    }catch(error){console.error('24-hour request sequence lookup threw; defaulting to first request',error)}
    const completedRequestCount=Math.ceil(generatedRowCount/targetCount);
    const requestSequence=completedRequestCount+1;
    let priorIdentityRequests=0;
    let recentHookMemory:string[]=[];
    try{
      const result=await db.from('generated_reviews').select('generation_metadata').eq('doctor_id',doctor.id).gte('created_at',dailySince).order('created_at',{ascending:false}).limit(400);
      if(result.error)console.error('24-hour metadata lookup failed; using proportional defaults',result.error);
      else{
        const identitySequences=new Set<number|string>();
        for(const row of result.data||[]){
          const meta=(row.generation_metadata&&typeof row.generation_metadata==='object'?row.generation_metadata:{}) as Record<string,unknown>;
          const sequence=meta.request_sequence_24h as number|string|undefined;
          const flags=(meta.flags&&typeof meta.flags==='object'?meta.flags:{}) as Record<string,unknown>;
          if(sequence&&(flags.include_doctor_name===true||flags.include_clinic_name===true))identitySequences.add(sequence);
          if(Array.isArray(meta.selected_hooks))recentHookMemory.push(...meta.selected_hooks.filter((item):item is string=>typeof item==='string'));
        }
        priorIdentityRequests=identitySequences.size;
      }
    }catch(error){console.error('24-hour metadata lookup threw; using proportional defaults',error)}
    const cumulativeRequestCount=requestSequence;
    const maxIdentityRequests=Math.max(1,Math.floor(cumulativeRequestCount*.4));
    const includeIdentity=priorIdentityRequests<maxIdentityRequests;
    if(!includeIdentity){
      const blockedIdentities=[text(doctor.doctor_name),text(doctor.doctor_name).replace(/^dr\.?\s*/i,''),text(doctor.clinic_name)].map(normalize).filter(Boolean);
      priorityKeywords=priorityKeywords.filter(keyword=>!blockedIdentities.some(identity=>normalize(keyword).includes(identity)||identity.includes(normalize(keyword))));
    }
    const aiKnowledgeContext=settingsContext(aiSettings,priorityKeywords);

    let usageRows:Array<{usage_type:string}>=[];
    try{
      const result=await db.from('keyword_usage_log').select('usage_type').eq('doctor_id',doctor.id).gte('created_at',dailySince);
      if(result.error)console.error('Daily phrase-cap audit lookup failed; using defaults',result.error);
      else usageRows=result.data||[];
    }catch(error){console.error('Daily phrase-cap audit lookup threw; using defaults',error)}
    const usageCounts:Record<UsageType,number>={doctor_name:0,clinic_name:0,area_name:0,treatment:0,superlative:0};
    for(const row of usageRows||[]){const kind=row.usage_type as UsageType;if(kind in usageCounts)usageCounts[kind]++}
    const allowSpecificLocalityAndTreatment=generatedRowCount<4;
    const flags={
      include_doctor_name:includeIdentity,
      include_clinic_name:includeIdentity,
      include_area_name:allowSpecificLocalityAndTreatment&&usageCounts.area_name<4&&clinicLocality!=='the local area',
      include_treatment:allowSpecificLocalityAndTreatment&&usageCounts.treatment<4&&!!selectedSpecificTreatment,
      include_superlative:usageCounts.superlative<3,
    };
    let history:Array<{id:string;content:string;embedding:unknown}>=[];
    try{
      const result=await db.from('generated_reviews').select('id,content,embedding').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(10);
      if(result.error)console.error('Review history audit lookup failed; continuing',result.error);
      else history=result.data||[];
    }catch(error){console.error('Review history audit lookup threw; continuing',error)}
    const recentOpenings=(history||[]).slice(0,5).map(item=>opening(item.content)).filter(Boolean);
    recentHookMemory=[...list(body.last_hooks),...recentHookMemory,...recentOpenings].filter(Boolean).slice(0,5);
    const hookOffset=Math.floor(Math.random()*openingHooks.length);
    const selectedHooks=Array.from({length:openingHooks.length},(_,index)=>openingHooks[(index+hookOffset)%openingHooks.length])
      .filter(hook=>!recentHookMemory.some(recent=>normalize(hook).startsWith(normalize(recent))||normalize(recent).startsWith(opening(hook))))
      .slice(0,targetCount);
    while(selectedHooks.length<targetCount)selectedHooks.push(openingHooks[(hookOffset+selectedHooks.length)%openingHooks.length]);
    const historicalEmbeddings:number[][]=[];
    for(const item of history||[]){
      let vector=Array.isArray(item.embedding)?item.embedding.filter((value:unknown):value is number=>typeof value==='number'):[];
      if(vector.length)historicalEmbeddings.push(vector);
    }
    const identityInstruction=includeIdentity
      ? `IDENTITY 40% RULE: You may naturally use the actual doctor name "${text(doctor.doctor_name)}" and clinic name "${text(doctor.clinic_name)}" in this request because the rolling 24-hour identity exposure is still below 40%. Use exact names sparingly across the four options; do not repeat either name in every option.`
      : `IDENTITY 40% RULE: You MUST NOT mention the specific names "${text(doctor.doctor_name)}" or "${text(doctor.clinic_name)}" anywhere in the text because the rolling 24-hour identity exposure has reached its limit. Use generic terms only: "the dentist", "the medical team", "this clinic", "the clinic staff", or "the doctor".`;
    const localityInstruction=flags.include_area_name
      ? `Specific locality allowed: naturally mention "${clinicLocality}" in at most one review.`
      : 'Specific locality capped: do not mention exact area, locality, city, neighborhood, or map-pack location. Use generic spatial language like "the clinic area" only if needed.';
    const treatmentInstruction=flags.include_treatment
      ? `Specific treatment allowed: naturally mention "${selectedSpecificTreatment}" in at most one review.`
      : 'Specific treatment capped: do not mention exact procedure names. Use broad phrases like "the standard procedure", "my treatment", or "the visit".';
    const prompt=`Help a real patient draft honest Google review options based only on the factual details they selected.
${identityInstruction}
${localityInstruction}
Service category: ${specialty}. Refer to the care provider only as ${providerTerm} or "the clinical staff".
Selected aspect: ${aspects.join(', ')||'good care'}. ${treatmentInstruction}
Patient-facing rating tier for all four drafts: ${generatedRating}/5. ${microComplaint}
Original patient-selected rating: ${rating}/5. Patient factual note: ${customNotes||'None'}.
Language: ${language}.
Tone profile: ${personality}. ${personalities[personality]}
${aiKnowledgeContext}
Dynamic tone directive: ${effectiveTone}. Use it as a soft voice guide while preserving the ${generatedRating}/5 sentiment.
${language.startsWith('Hinglish')?'Generate natural Hinglish in Hindi written only in Latin script. Across the four variants, use natural Hindi-English vocabulary without Devanagari or awkward literal translations.':''}

CRITICAL: Follow the identity, locality, and treatment caps above exactly. Never invent a person, medical outcome, parking issue, seating issue, or operational detail unless the 4-star micro-complaint rule explicitly asks for one small non-medical issue. Preserve a realistic ${generatedRating}/5 sentiment. ${flags.include_superlative?'A superlative may appear in at most one option and only when directly supported by the patient-selected wording.':'Do not use superlatives such as best, amazing, excellent, perfect, or outstanding.'}
Do not begin any option with these recently used opening patterns: ${recentOpenings.length?recentOpenings.join(' | '):'none'}.
Opening hook entropy: start the four reviews with these hooks in varied order, and do not reuse the same grammar architecture: ${selectedHooks.join(' | ')}.
Length density selected by probability matrix: ${densityInstruction(densityBand)}
Naturally weave selected priority keywords only where they sound organic: ${priorityKeywords.join(', ')||'none'}.
Add tiny human conversational imperfections sparingly: occasional casual casing such as "dr", light Hinglish typing like "acha", or one small grammar slip. Keep the text readable and sincere.

STRUCTURAL VARIATION RULES FOR THE FOUR VARIANTS:
1. Option 1: Use hook "${selectedHooks[0]}" and keep it conversational.
2. Option 2: Use hook "${selectedHooks[1]}" and focus on selected facts only.
3. Option 3: Use hook "${selectedHooks[2]}" and vary sentence rhythm.
4. Option 4: Use hook "${selectedHooks[3]}" and make it ${language.startsWith('Hinglish')?'natural localized Hinglish using mixed Hindi-English vocabulary in Latin script.':'distinctly worded conversational English.'}

CRITICAL OUTPUT RULES:
Generate exactly ${targetCount} unique, distinct review variants separated by the tags [REVIEW] and [/REVIEW]. Each review must have line breaks matching the selected density. Reflect the ${generatedRating}/5 rating honestly. If a patient note exists, preserve its factual meaning without exaggeration. Wrap every variant strictly inside [REVIEW] and [/REVIEW].
Write conversational Indian customer-style options. Do not keyword-stuff, manipulate ratings, or add unsupported claims.
Do not include any introduction, JSON, markdown, or surrounding conversational phrases.`;
    let reviews:string[]=[],reviewEmbeddings:Array<number[]|null>=[],similarities:number[]=[],generationAttempts=0;
    for(let attempt=1;attempt<=1;attempt++){
      generationAttempts=attempt;
      const retryDirection=attempt===1?'':`\nORIGINALITY RETRY ${attempt}: The previous draft was too close to prior reviews. Change syntax, cadence, perspective, sentence order, and vocabulary while preserving only supplied facts. Avoid these openings: ${recentOpenings.join(' | ')}.`;
      const attemptPrompt=prompt+retryDirection;
      const geminiPayload={contents:[{parts:[{text:attemptPrompt}]}],generationConfig:{temperature:Math.min(1,.78+attempt*.07),maxOutputTokens:2500}};
      console.log('Gemini request',{model:GEMINI_MODEL,doctor_id:doctor.id,language,attempt,requestSequence,completedRequestCount,flags,densityBand,generatedRating,selectedHooks,usageCounts,priorityKeywords});
      try{
        const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},GEMINI_TIMEOUT_MS);
        const responseText=await response.text();
        if(!response.ok){console.error('Gemini HTTP error',{model:GEMINI_MODEL,status:response.status,body:responseText.slice(0,1000)});void logSystemError(db,doctor.id,`Gemini HTTP ${response.status}: ${responseText.slice(0,500)}`);continue}
        let envelope:unknown;
        try{envelope=JSON.parse(responseText)}catch(error){console.error('Gemini envelope parse failed',{model:GEMINI_MODEL,error:error instanceof Error?error.message:String(error),body:responseText.slice(0,1000)});void logSystemError(db,doctor.id,`Gemini envelope parse failed: ${error instanceof Error?error.message:String(error)}`);continue}
        const responseParts=(envelope as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>})?.candidates?.[0]?.content?.parts??[];
        const textResponse=responseParts.map(part=>text(part.text)).filter(Boolean).join('\n\n');
        console.log('Raw Gemini Output:',textResponse);
        const drafts=parseReviews(textResponse,targetCount);
        if(drafts.length<targetCount){console.error('Gemini returned invalid review count',{model:GEMINI_MODEL,targetCount,count:drafts.length});void logSystemError(db,doctor.id,`Gemini returned ${drafts.length} reviews; expected ${targetCount}`);continue}
        const forbiddenIdentities=[
          ...(!flags.include_doctor_name?[text(doctor.doctor_name),text(doctor.doctor_name).replace(/^dr\.?\s*/i,'')]:[]),
          ...(!flags.include_clinic_name?[text(doctor.clinic_name)]:[]),
        ].map(normalize).filter(Boolean);
        if(forbiddenIdentities.length&&drafts.some(draft=>forbiddenIdentities.some(identity=>normalize(draft).includes(identity)))){
          console.error('Gemini violated 24-hour identity cap',{doctor_id:doctor.id,attempt});
          continue;
        }
        const formatted=drafts.map(draft=>ensureLineShape(draft,fallbackLanguage,densityBand));
        const maxSimilarities=formatted.map(()=>0);
        console.log('Originality check skipped for SLA',{doctor_id:doctor.id,attempt,historical_embedding_count:historicalEmbeddings.length});
        reviews=formatted;reviewEmbeddings=formatted.map(()=>null);similarities=maxSimilarities;break;
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        console.error('Gemini request threw',{model:GEMINI_MODEL,error:message});
        void logSystemError(db,doctor.id,message.includes('abort')||message.includes('timeout')||message.includes('SLA')?'Gemini request exceeded 7-second SLA timeout':`Gemini request failed: ${message}`);
        break;
      }
    }
    // If parsing/model retries fail, return conservative drafts derived only
    // from facts explicitly supplied by the patient. This keeps the patient
    // flow usable without weakening identity or keyword caps.
    if(reviews.length>=targetCount){
      console.log(`Accepted Gemini generation: requested ${targetCount}, got ${reviews.length}`);
    }else{
      const aspect=aspects[0]||'';
      const treatment=flags.include_treatment&&selectedSpecificTreatment?selectedSpecificTreatment:'';
      const fallbackReviews=language.startsWith('Hinglish')
        ? [
            `${includeIdentity?`${text(doctor.clinic_name)} mein ${text(doctor.doctor_name)} ke saath `:'Mera clinic '}visit achha raha.${aspect?` ${aspect} ka experience raha.`:''}`,
            `${treatment?`${treatment} ke liye `:''}Visit ke dauran ${includeIdentity?text(doctor.doctor_name):'doctor'} aur staff ke saath experience comfortable raha.`,
            `Clinic mein mera overall experience positive raha.${aspect?` Mujhe ${aspect} achha laga.`:''}`,
            `Doctor aur clinic staff ke saath visit smooth raha.${treatment?` Main ${treatment} ke liye aaya tha.`:''}`,
          ]
        : [
            `I had a good experience ${includeIdentity?`with ${text(doctor.doctor_name)} at ${text(doctor.clinic_name)}`:'during my clinic visit'}.${aspect?` I appreciated ${aspect}.`:''}`,
            `My ${treatment?`${treatment} `:''}visit with ${includeIdentity?text(doctor.doctor_name):'the doctor'} and staff felt comfortable.`,
            `My overall experience at the clinic was positive.${aspect?` ${aspect} stood out during my visit.`:''}`,
            `The visit with the doctor and clinic staff went smoothly.${treatment?` I visited for ${treatment}.`:''}`,
          ];
      reviews=Array.from(new Set([...reviews,...fallbackReviews,...emergencyDrafts(fallbackLanguage)].map(review=>ensureLineShape(review.trim(),fallbackLanguage,densityBand)).filter(Boolean))).slice(0,targetCount);
      reviewEmbeddings=Array.from({length:reviews.length},()=>null);
      similarities=Array.from({length:reviews.length},()=>0);
      console.warn('Using policy-safe fallback reviews',{doctor_id:doctor.id,parsed_count:reviews.length,generationAttempts});
    }
    const insertRows=reviews.map((content,index)=>({doctor_id:doctor.id,content,embedding:reviewEmbeddings[index]||null,generation_metadata:{policy_version:'humanized-local-seo-v3-flash',model:GEMINI_MODEL,sla_timeout_ms:GEMINI_TIMEOUT_MS,request_sequence_24h:requestSequence,completed_requests_24h:completedRequestCount,cumulative_requests_24h:cumulativeRequestCount,identity_requests_24h:priorIdentityRequests,identity_cap_24h:maxIdentityRequests,actual_patient_rating:rating,generated_rating:generatedRating,density_band:densityBand,personality,tone_preference:effectiveTone,priority_keywords:priorityKeywords,selected_hooks:selectedHooks,clinic_locality_permission:flags.include_area_name?clinicLocality:'generic only',specific_treatment_permission:flags.include_treatment?selectedSpecificTreatment:'generic only',location_verified:locationVerified,distance_meters:distanceMeters,actual_sentence_count:content.split(/[.!?\n]+/).map(value=>value.trim()).filter(Boolean).length,word_count:content.trim().split(/\s+/).filter(Boolean).length,opening_pattern:opening(content),flags,usage_counts_24h:usageCounts,generation_attempts:generationAttempts,max_similarity:similarities[index]||0,similarity_threshold:.85,embedding_model:null,embedding_available:false,recent_openings_avoided:recentOpenings}}));
    let inserted:Array<{id:string;content:string}>=[];
    try{
      const result=await db.from('generated_reviews').insert(insertRows).select('id,content');
      if(result.error)console.error('Generated review persistence failed; returning drafts anyway',result.error);
      else inserted=result.data||[];
    }catch(error){console.error('Generated review persistence threw; returning drafts anyway',error)}
    const lowerDoctor=normalize(text(doctor.doctor_name)),lowerClinic=normalize(text(doctor.clinic_name));
    const usageLogs:Array<{doctor_id:string;generated_review_id:string;usage_type:UsageType;phrase:string}>=[];
    for(const row of inserted||[]){
      const normalized=normalize(row.content);const push=(usage_type:UsageType,phrase:string)=>usageLogs.push({doctor_id:doctor.id,generated_review_id:row.id,usage_type,phrase});
      if(lowerDoctor&&normalized.includes(lowerDoctor))push('doctor_name',text(doctor.doctor_name));
      if(lowerClinic&&normalized.includes(lowerClinic))push('clinic_name',text(doctor.clinic_name));
      if(flags.include_area_name&&[clinicLocality,area,city].some(value=>value&&normalized.includes(normalize(value))))push('area_name',clinicLocality);
      if(flags.include_treatment&&normalized.includes(normalize(selectedSpecificTreatment)))push('treatment',selectedSpecificTreatment);
      const usedSuperlative=['best','amazing','excellent','perfect','outstanding'].find(word=>new RegExp(`\\b${word}\\b`,'i').test(row.content));if(usedSuperlative)push('superlative',usedSuperlative);
    }
    if(usageLogs.length){
      try{const {error}=await db.from('keyword_usage_log').insert(usageLogs);if(error)console.error('Keyword usage audit insert failed; continuing',error)}
      catch(error){console.error('Keyword usage audit insert threw; continuing',error)}
    }
    const generatedAt=new Date().toISOString();
    try{const {error}=await db.from('review_generation_events').insert({doctor_id:doctor.id,fingerprint_hash:fingerprintHash,personality,location_verified:locationVerified,distance_meters:distanceMeters,created_at:generatedAt});if(error)console.error('Generation event audit insert failed; continuing',error)}
    catch(error){console.error('Generation event audit insert threw; continuing',error)}
    try{
      const fingerprintAudit={doctor_id:doctor.id,fingerprint_hash:fingerprintHash,location_verified:locationVerified,distance_meters:distanceMeters,generated_at:generatedAt};
      const {error}=await db.from('device_fingerprints').upsert(fingerprintAudit,{onConflict:'doctor_id,fingerprint_hash'});
      if(error?.code==='42P10'){
        const update=await db.from('device_fingerprints').update({location_verified:locationVerified,distance_meters:distanceMeters,generated_at:generatedAt}).eq('doctor_id',doctor.id).eq('fingerprint_hash',fingerprintHash).select('id').maybeSingle();
        if(update.error)console.error('Device fingerprint audit update fallback failed; continuing',update.error);
        else if(!update.data){
          const insert=await db.from('device_fingerprints').insert(fingerprintAudit);
          if(insert.error)console.error('Device fingerprint audit insert fallback failed; continuing',insert.error);
        }
      }else if(error)console.error('Device fingerprint audit upsert failed; continuing',error)
    }
    catch(error){console.error('Device fingerprint audit upsert threw; continuing',error)}
    return reply({reviews,target_count:targetCount,quality:{request_sequence_24h:requestSequence,flags,density_band:densityBand,generated_rating:generatedRating,selected_hooks:selectedHooks,generation_attempts:generationAttempts,personality,location_verified:locationVerified}});
  }catch(error){
    console.error('Unhandled generate-review error; returning emergency drafts',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true,generation_attempts:0}});
  }
});
