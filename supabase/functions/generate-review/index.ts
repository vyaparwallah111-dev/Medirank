import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const GEMINI_MODEL='gemini-2.5-flash';
const HELPER_MODEL='gemini-3.1-flash-lite';
const GEMINI_TIMEOUT_MS=7_000;
const TARGET_COUNT=4;
const ROUTING_CAP_DAILY=5;
const DOCTOR_NAME_CAP_DAILY=5;
const DAILY_KEYWORD_SEQUENCE_CAP=10;

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type Strategy='keyword_optimized'|'clean_human';
type LengthBracket={key:string;min:number;max:number;target:number};
type ArchetypeKey='A'|'B'|'C'|'D'|'E'|'F'|'G';
const STRUCTURE_ARCHETYPES:Record<ArchetypeKey,string>={
  A:'Write as ONE flowing sentence, no formal breaks, casual run-on style.',
  B:"Start directly with the doctor's name, skip any generic opening line.",
  C:'Start with a short backstory reason for the visit (1 line), then the experience.',
  D:'Keep it to a single short line, no elaboration, no closing remark.',
  E:'Write like a list of quick observations separated by commas, not polished sentences.',
  F:'End abruptly after the main point \u2014 no overall/highly recommend wrap-up.',
  G:'Mention one minor imperfection naturally before the positive note.',
};
const PERSONALITY_VARIANTS=['plain-spoken','warm-local','reserved-observer','practical-detail','busy-patient','soft-conversational'] as const;
const casingProfiles=['mostly lower-case natural typing','standard sentence casing with one casual fragment','mixed short sentence starts, no title case','one small typo-like casing wobble allowed'] as const;
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value.trim():fallback;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sanitizeText=(value:unknown,maxLength:number)=>{
  const source=typeof value==='string'?value:'';
  return source
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,' ')
    .replace(/\b(?:javascript|data|vbscript):/gi,' ')
    .replace(/[<>{}`\\]/g,' ')
    .replace(/[\u0000-\u001f\u007f]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .slice(0,maxLength);
};
const list=(value:unknown,maxLength=80)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).map(item=>sanitizeText(item,maxLength)).filter(Boolean):[];
const unique=(items:string[],max=20)=>Array.from(new Set(items.map(item=>item.trim()).filter(Boolean))).slice(0,max);
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const jsonList=(value:unknown):string[]=>{
  if(Array.isArray(value))return list(value);
  if(typeof value==='string')return value.split(',').map(item=>item.trim()).filter(Boolean);
  if(value&&typeof value==='object')return Object.values(value as Record<string,unknown>).flatMap(jsonList);
  return [];
};
function operationalWindow(now=new Date()){
  const istOffsetMs=330*60_000;
  const istNow=new Date(now.getTime()+istOffsetMs);
  const year=istNow.getUTCFullYear(),month=istNow.getUTCMonth(),date=istNow.getUTCDate();
  const start=new Date(Date.UTC(year,month,date,9,0,0)-istOffsetMs);
  const end=new Date(Date.UTC(year,month,date,21,0,0)-istOffsetMs);
  return {startIso:start.toISOString(),endIso:end.toISOString(),isActive:now>=start&&now<end,startMs:start.getTime(),endMs:end.getTime(),nowMs:now.getTime()};
}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
const haversine=(lat1:number,lon1:number,lat2:number,lon2:number)=>{const rad=(value:number)=>value*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6_371_000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};
const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));
const randomInt=(min:number,max:number)=>Math.floor(Math.random()*(max-min+1))+min;
const randomItem=<T,>(items:readonly T[])=>items[Math.floor(Math.random()*items.length)];
const firstFourWords=(value:string)=>sanitizeText(value,160).split(/\s+/).filter(Boolean).slice(0,4).join(' ');
const hourlyKeywordProbability=(opWindow:ReturnType<typeof operationalWindow>,usedCount:number)=>{
  if(!opWindow.isActive||usedCount>=DAILY_KEYWORD_SEQUENCE_CAP)return 0;
  const progress=clamp((opWindow.nowMs-opWindow.startMs)/(opWindow.endMs-opWindow.startMs),0,1);
  const expected=DAILY_KEYWORD_SEQUENCE_CAP*progress;
  const pressure=expected-usedCount;
  const base=.45+Math.random()*.10;
  return clamp(base+(pressure*.08),.25,.75);
};
const selectLengthBracket=(rating:number):LengthBracket=>{
  if(rating>=4){
    const roll=Math.random();
    if(roll<.60){const target=randomInt(5,8);return {key:'short_mid',min:5,max:8,target}}
    if(roll<.85){const target=randomInt(9,12);return {key:'comprehensive',min:9,max:12,target}}
    const target=randomInt(2,3);return {key:'crisp',min:2,max:3,target};
  }
  if(rating===3){const target=randomInt(2,4);return {key:'neutral_tight',min:2,max:4,target}}
  if(rating===1)return {key:'raw_complaint',min:1,max:4,target:randomInt(1,3)};
  return {key:'low_satisfaction',min:1,max:4,target:randomInt(2,4)};
};
const selectArchetype=(recent:string[])=>{
  const recentSet=new Set(recent.filter((key):key is ArchetypeKey=>key in STRUCTURE_ARCHETYPES));
  const candidates=(Object.keys(STRUCTURE_ARCHETYPES) as ArchetypeKey[]).filter(key=>!recentSet.has(key));
  return randomItem(candidates.length?candidates:Object.keys(STRUCTURE_ARCHETYPES) as ArchetypeKey[]);
};
const selectPersonalityVariant=(recent:string[])=>{
  const total=recent.length;
  const counts=new Map<string,number>();
  recent.forEach(item=>counts.set(item,(counts.get(item)||0)+1));
  const candidates=PERSONALITY_VARIANTS.filter(item=>((counts.get(item)||0)+1)/Math.max(1,total+1)<.30);
  return randomItem(candidates.length?candidates:PERSONALITY_VARIANTS);
};

async function logSystemError(db:ReturnType<typeof createClient>|null,doctorId:string|null,errorMessage:string){
  if(!db)return;
  try{await db.from('system_error_logs').insert({doctor_id:doctorId,endpoint:'generate-review',error_message:errorMessage.slice(0,1000),severity:'error'})}
  catch(error){console.error('System error audit insert failed; continuing',error)}
}

async function fetchWithSla(url:string,init:RequestInit,timeoutMs:number){
  const controller=new AbortController();
  let timer:number|undefined;
  try{
    return await Promise.race([
      fetch(url,{...init,signal:controller.signal}),
      new Promise<Response>((_,reject)=>{timer=setTimeout(()=>{controller.abort('sla-timeout');reject(new Error(`Gemini request exceeded ${timeoutMs}ms SLA`))},timeoutMs)}),
    ]);
  }finally{if(timer)clearTimeout(timer)}
}

function parseReviews(raw:unknown,expectedCount:number){
  if(typeof raw!=='string')return [];
  const candidate=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{
    const parsed=JSON.parse(candidate) as unknown;
    const collection=Array.isArray(parsed)
      ? parsed
      : parsed&&typeof parsed==='object'&&Array.isArray((parsed as {reviews?:unknown}).reviews)
        ? (parsed as {reviews:unknown[]}).reviews
        : [];
    if(!collection.length)return [];
    const reviews=collection.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return '';
      return sanitizeText((item as {review?:unknown}).review,1600);
    });
    if(reviews.length!==expectedCount||reviews.some(review=>review.length<10))return [];
    return unique(reviews,expectedCount);
  }catch(error){
    console.error('Strict Gemini JSON contract validation failed',error instanceof Error?error.message:String(error));
    return [];
  }
}

function ratingLayout(rating:number,language:Language,serviceKeyword:string,doctorName:string,includeDoctorName:boolean,allowEmoji:boolean,lengthBracket:LengthBracket,keywordInjectionActive:boolean){
  const service=serviceKeyword||'service';
  const doctorRule=includeDoctorName
    ? `doctor_name_rule: include the exact doctor name "${doctorName}" naturally in every draft while respecting the rating shape.`
    : 'doctor_name_rule: do not mention any doctor name.';
  const emojiRule=allowEmoji
    ? 'emoji_rule: high-tier only; randomly allow at most one sparse contextual emoji in some drafts, chosen organically from examples like 👍, 🦷, ⭐. Never repeat the same emoji in every draft.'
    : 'emoji_rule: no emoji.';
  if(rating===1)return `rating_shape: 1 star. Negative/constructive complaint. ${keywordInjectionActive?`Use "${service}" only if it fits the friction.`:'No keyword requirement; raw emotional complaint is allowed.'} Never soften, hide, block, or convert the complaint into praise. ${doctorRule} ${emojiRule}`;
  if(rating===2)return `rating_shape: 2 stars. Casual low-satisfaction plain narrative. Sound disappointed but not dramatic. ${doctorRule} ${emojiRule}`;
  if(rating===3)return `rating_shape: 3 stars. Mid-tier neutral review, strictly 2 to 4 text lines per review. ${doctorRule} ${emojiRule}`;
  return `rating_shape: ${rating} stars. Use ${lengthBracket.key} length: ${lengthBracket.min}-${lengthBracket.max} lines per review, target ${lengthBracket.target}. Combine active name/locality inputs only when present. ${doctorRule} ${emojiRule}`;
}

function shapeLines(content:string,rating:number,language:Language,lengthBracket=selectLengthBracket(rating)){
  const shape=lengthBracket;
  const base=content.replace(/\r/g,'\n').split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const sentenceLines=content.split(/(?<=[.!?])\s+/).map(line=>line.trim()).filter(Boolean);
  const lines=(base.length>1?base:sentenceLines).filter(Boolean);
  const fillers=rating<=2
    ? (language==='hinglish'
      ? ['Experience expected se weak laga.','Process better ho sakta tha.','Main bas honest feedback share kar raha hoon.','Improvement ki zarurat feel hui.']
      : ['The experience felt below expectations.','The process could be handled better.','I am sharing this as honest feedback.','There is room for improvement.'])
    : rating===3
      ? (language==='hinglish'?['Kuch parts theek the.','Kuch areas better ho sakte hain.','Overall experience neutral raha.']:['Some parts were fine.','A few areas could be better.','Overall, it felt neutral.'])
      : (language==='hinglish'
        ? ['Appointment start se kaafi organised feel hua.','Reception par basic process simple tha.','Doctor ne concerns dhyan se sune.','Explanation calm aur clear thi.','Clinic ka environment clean laga.','Staff ka response polite tha.','Visit ke dauran rush jaisa feel nahi hua.','Mujhe next steps samajh aa gaye.','Overall experience comfortable raha.','Main apne visit se satisfied hoon.']
        : ['The appointment felt organised from the start.','The reception process was simple.','The doctor listened to my concerns carefully.','The explanation was calm and clear.','The clinic environment felt clean.','The staff response was polite.','The visit did not feel rushed.','I understood the next steps properly.','Overall, the experience felt comfortable.','I felt satisfied with my visit.']);
  const next=[...lines];
  for(const filler of fillers){if(next.length>=shape.target)break;if(!next.some(line=>normalize(line)===normalize(filler)))next.push(filler)}
  return next.slice(0,shape.max).join('\n');
}

function injectDoctorName(content:string,doctorName:string,rating:number,language:Language,lengthBracket=selectLengthBracket(rating)){
  if(!doctorName||normalize(content).includes(normalize(doctorName)))return shapeLines(content,rating,language,lengthBracket);
  const lines=content.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(rating===1){
    lines[0]=language==='hinglish'
      ? `${doctorName} ke visit mein ${lines[0]||'experience expected se weak laga.'}`
      : `${doctorName} was part of my visit, and ${lines[0]||'the experience felt below expectations.'}`;
  }else if(rating===3){
    lines[0]=language==='hinglish'
      ? `${doctorName} ke saath visit neutral raha.`
      : `My visit with ${doctorName} felt neutral.`;
  }else if(rating>=4){
    lines.splice(Math.min(2,lines.length),0,language==='hinglish'?`${doctorName} ne concerns calmly sune.`:`${doctorName} listened to my concerns calmly.`);
  }else{
    lines[0]=language==='hinglish'
      ? `${doctorName} ke saath experience low-satisfaction raha.`
      : `My experience with ${doctorName} felt low-satisfaction.`;
  }
  return shapeLines(lines.join('\n'),rating,language,lengthBracket);
}

function emergencyDrafts(language:Language,rating=5){
  if(rating<=2){
    const seeds=language==='hinglish'
      ? [
        'Visit se expectations meet nahi hui.\nProcess confusing laga aur wait bhi zyada feel hua.\nIs area mein improvement chahiye.',
        'Experience low satisfaction wala tha.\nCommunication clearer ho sakti thi.\nMain bas honest feedback de raha hoon.',
        'Mujhe visit smooth nahi laga.\nBasic coordination better ho sakta tha.',
        'Service ke dauran friction feel hua.\nFollow-up aur explanation aur clear ho sakte the.',
      ]
      : [
        'The visit did not meet my expectations.\nThe process felt confusing and the waiting experience could be better.\nThis needs improvement.',
        'My experience felt low-satisfaction.\nCommunication could have been clearer.\nI am leaving this as honest feedback.',
        'The visit did not feel smooth to me.\nBasic coordination could be handled better.',
        'There was friction during the service.\nThe follow-up and explanation could have been clearer.',
      ];
    return seeds.map(seed=>shapeLines(seed,rating,language)).slice(0,TARGET_COUNT);
  }
  const seeds=language==='hinglish'
    ? [
      'Clinic visit ka experience theek raha.\nStaff helpful tha aur doctor ne baat clearly samjhai.\nOverall mujhe comfortable feel hua.',
      'Mera visit simple aur smooth raha.\nDoctor ne calmly guide kiya.\nClinic ka environment bhi neat tha.',
      'Aaj ka visit manageable laga.\nProcess clear tha aur staff ka response polite tha.\nMain apna honest feedback share kar raha hoon.',
      'Clinic mein experience normal aur comfortable tha.\nDoctor ne concerns dhyan se sune.\nFollow-up ke liye bhi clear guidance mili.',
    ]
    : [
      'My clinic visit went well overall.\nThe doctor explained things clearly and the staff was polite.\nI felt comfortable through the appointment.',
      'The appointment was comfortable and well managed.\nThe team handled things smoothly, and the doctor answered my concerns.\nOverall it felt simple and reassuring.',
      'I visited with a few doubts in mind.\nThe doctor listened patiently and explained the next steps clearly.\nThe clinic experience felt calm and professional.',
      'The clinic felt clean and organised.\nThe staff was polite, and the doctor guided me properly.\nOverall, it was a positive visit.',
    ];
  return seeds.map(seed=>shapeLines(seed,rating,language)).slice(0,TARGET_COUNT);
}

Deno.serve(async(req)=>{
  let db:ReturnType<typeof createClient>|null=null;
  let doctorIdForAudit:string|null=null;
  let fallbackLanguage:Language='english';
  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});
  try{
    let body:Record<string,unknown>;
    try{body=await req.json();fallbackLanguage=body.language==='hinglish'?'hinglish':'english'}
    catch(error){console.error('Invalid request JSON',error);return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}
    const doctorId=sanitizeText(body.doctor_id,80);
    doctorIdForAudit=doctorId||null;
    if(!doctorId||!uuidPattern.test(doctorId))return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});

    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){
      console.error('Missing Edge Function secrets',{hasUrl:!!url,hasServiceKey:!!serviceKey,hasGeminiKey:!!geminiKey});
      return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});
    }
    db=createClient(url,serviceKey);
    const {data:doctor,error:doctorError}=await db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base,latitude,longitude').eq('id',doctorId).eq('is_active',true).maybeSingle();
    if(doctorError){void logSystemError(db,doctorId,doctorError.message||'Doctor lookup failed');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}
    if(!doctor){void logSystemError(db,doctorId,'Clinic not found or inactive');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}

    const deviceToken=sanitizeText(body.device_token,128);
    if(!deviceToken)return reply({error:'Unable to verify this device. Please refresh and try again.'},400);
    const browserSignature=(req.headers.get('user-agent')||'unknown').slice(0,300);
    const fingerprintHash=await sha256(`${doctor.id}|${deviceToken}|${browserSignature}`);
    const rawScanId=sanitizeText(body.scan_id,80);
    const scanId=uuidPattern.test(rawScanId)?rawScanId:'';
    const patientLatitude=typeof body.latitude==='number'?body.latitude:NaN,patientLongitude=typeof body.longitude==='number'?body.longitude:NaN;
    const hasPatientLocation=Number.isFinite(patientLatitude)&&Number.isFinite(patientLongitude)&&patientLatitude>=-90&&patientLatitude<=90&&patientLongitude>=-180&&patientLongitude<=180;
    const hasClinicLocation=Number.isFinite(doctor.latitude)&&Number.isFinite(doctor.longitude);
    let locationVerified:boolean|null=null,distanceMeters:number|null=null;
    if(hasPatientLocation&&hasClinicLocation){distanceMeters=Math.round(haversine(patientLatitude,patientLongitude,Number(doctor.latitude),Number(doctor.longitude)));locationVerified=distanceMeters<=500}

    const opWindow=operationalWindow();
    const scanCountResult=opWindow.isActive
      ? await db.from('analytics_events').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('event_type','scan').gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso)
      : {count:0,error:null};
    if(scanCountResult.error)console.error('Operational scan routing lookup failed; defaulting to express route',scanCountResult.error);
    const operationalScanSequence=Math.max(1,scanCountResult.count??1);
    const allowLanguageStep=opWindow.isActive&&operationalScanSequence<=ROUTING_CAP_DAILY;
    const allowDetailForm=opWindow.isActive&&operationalScanSequence<=ROUTING_CAP_DAILY;
    if(body.precheck_only===true)return reply({allowed:true,location_verified:locationVerified,distance_meters:distanceMeters,routing:{operational_scan_sequence:operationalScanSequence,operational_window_active:opWindow.isActive,operational_window_start:opWindow.startIso,operational_window_end:opWindow.endIso,allow_language_step:allowLanguageStep,allow_detail_form:allowDetailForm}});

    const effectiveLanguage:Language=allowLanguageStep&&body.language==='hinglish'?'hinglish':'english';
    fallbackLanguage=effectiveLanguage;
    const rating=Math.min(5,Math.max(1,Math.round(Number(body.rating)||5)));
    const kb=(doctor.knowledge_base&&typeof doctor.knowledge_base==='object'?doctor.knowledge_base:{}) as KB;
    const primaryArea=sanitizeText(body.primary_area,80)||sanitizeText(kb.area_name,80)||sanitizeText(doctor.city,80);
    const patientName=allowDetailForm?sanitizeText(body.patient_name,60):'';
    const patientLocality=allowDetailForm?sanitizeText(body.patient_locality,60):'';
    const customNotes=sanitizeText(body.custom_notes,240);

    const {data:keywordRows,error:keywordError}=await db.from('doctor_keywords').select('keyword,category').eq('doctor_id',doctor.id).order('created_at');
    if(keywordError)console.error('Doctor keyword lookup failed; continuing with supplied chips only',keywordError);
    const activeKeywords=unique((keywordRows||[]).map(row=>sanitizeText(row.keyword,80)),20);
    const allowedKeywords=new Set(activeKeywords.map(normalize));
    const requestedChips=unique([...list(body.selected_chips,80),...list(body.selected_keywords,80),...list(body.selected_experiences,80),sanitizeText(body.selected_chip,80)].filter(Boolean),5)
      .filter(item=>!allowedKeywords.size||allowedKeywords.has(normalize(item)));
    const selectedChips=requestedChips.length?requestedChips:activeKeywords.slice(0,2);
    const serviceKeyword=selectedChips[0]||activeKeywords[0]||'service';
    const doctorName=sanitizeText(doctor.doctor_name,100);
    const clinicName=sanitizeText(doctor.clinic_name,120);
    const metaCountResult=opWindow.isActive
      ? await db.from('review_generation_meta').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('is_doctor_name_included',true).gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso)
      : {count:0,error:null};
    if(metaCountResult.error)console.error('Doctor name operational meta lookup failed; defaulting to no doctor-name injection',metaCountResult.error);
    const doctorNameIncludedToday=metaCountResult.error?DOCTOR_NAME_CAP_DAILY:(metaCountResult.count??0);
    const includeDoctorName=opWindow.isActive&&doctorNameIncludedToday<DOCTOR_NAME_CAP_DAILY;
    const isNameAreaPrompted=allowDetailForm;
    const isLanguagePrompted=allowLanguageStep;
    const allowEmoji=rating>=4&&Math.random()<.45;
    const lengthBracket=selectLengthBracket(rating);

    const dailyCountResult=await db.from('review_generation_events').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso);
    if(dailyCountResult.error)console.error('Daily generation sequence lookup failed; defaulting to first generation',dailyCountResult.error);
    const dailySequence=(dailyCountResult.count??0)+1;
    const keywordUseResult=opWindow.isActive
      ? await db.from('review_generation_meta').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('keyword_injection_active',true).gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso)
      : {count:0,error:null};
    if(keywordUseResult.error)console.error('Keyword usage lookup failed; continuing with conservative probability',keywordUseResult.error);
    const keywordInjectionsToday=keywordUseResult.error?0:(keywordUseResult.count??0);
    const keywordProbability=hourlyKeywordProbability(opWindow,keywordInjectionsToday);
    let keywordInjectionActive=opWindow.isActive&&keywordInjectionsToday<DAILY_KEYWORD_SEQUENCE_CAP&&Math.random()<keywordProbability;
    if(rating===1)keywordInjectionActive=opWindow.isActive&&keywordInjectionsToday<DAILY_KEYWORD_SEQUENCE_CAP&&Math.random()<.50;
    const strategy:Strategy=keywordInjectionActive?'keyword_optimized':'clean_human';
    const injectionKeywords=keywordInjectionActive?unique([clinicName,primaryArea,patientLocality,...selectedChips,...activeKeywords],10):[];
    const blockedKeywords=!keywordInjectionActive?unique([clinicName,...(!includeDoctorName?[doctorName]:[]),primaryArea,patientLocality,...selectedChips,...activeKeywords],30):[];
    const recentMetaResult=await db.from('review_generation_meta').select('structure_archetype_key,personality_variant').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(100);
    if(recentMetaResult.error)console.error('Pattern history lookup failed; using fresh random pattern state',recentMetaResult.error);
    const recentRows=(recentMetaResult.data||[]) as Array<{structure_archetype_key?:unknown;personality_variant?:unknown}>;
    const selectedArchetypeKey=selectArchetype(recentRows.slice(0,3).map(row=>sanitizeText(row.structure_archetype_key,2)));
    const selectedArchetype=STRUCTURE_ARCHETYPES[selectedArchetypeKey];
    const personalityVariant=selectPersonalityVariant(recentRows.map(row=>sanitizeText(row.personality_variant,40)).filter(Boolean));
    const casingProfile=randomItem(casingProfiles);
    const ownerResponseHookState={enabled:false,status:'reserved'};

    const structuralPrefix=`JSON only: return exactly ${TARGET_COUNT} objects [{"review":"..."}]. No markdown or wrapper. Block phrases: "sharing my genuine review", "overall it was good", "highly satisfied". No fake outcomes, diagnosis, discounts, legal claims, staff names, or templated closings. Preserve requested line count.`;
    const strategyBlock=keywordInjectionActive
      ? `keywords=${JSON.stringify(injectionKeywords)}; use naturally, no stuffing, max 10 assets.`
      : `keywords=none; ambient only. Avoid exact assets ${JSON.stringify(blockedKeywords)}.`;
    const executionLayout=`ARCH=${selectedArchetypeKey}: ${selectedArchetype}
lang=${effectiveLanguage==='hinglish'?'Hinglish Latin':'English'}; rating=${rating}; length=${lengthBracket.key}:${lengthBracket.min}-${lengthBracket.max},target=${lengthBracket.target}; casing=${casingProfile}; tone=${personalityVariant}
${strategyBlock}
clinic=${keywordInjectionActive?JSON.stringify(clinicName):'null'}; area=${keywordInjectionActive?JSON.stringify(primaryArea):'null'}; chips=${keywordInjectionActive?JSON.stringify(selectedChips):'[]'}
patient=${JSON.stringify({name:patientName||'',locality:patientLocality||'',note:customNotes||''})}
${ratingLayout(rating,effectiveLanguage,keywordInjectionActive?serviceKeyword:'service',doctorName,includeDoctorName,allowEmoji,lengthBracket,keywordInjectionActive)}
complaint_safety=${rating<=2?'never block, filter, soften, or praise-convert low-star feedback':'normal safe review tone'}; owner_response_hook=off.`;

    let reviews:string[]=[];
    let generationAttempts=0;
    try{
      generationAttempts=1;
      const geminiPayload={
        contents:[{parts:[{text:structuralPrefix},{text:executionLayout}]}],
        generationConfig:{temperature:.82,topP:.95,topK:40,maxOutputTokens:1200,responseMimeType:'application/json'},
      };
      console.log('Gemini request',{model:GEMINI_MODEL,helper_model:HELPER_MODEL,doctor_id:doctor.id,operationalScanSequence,operationalWindowActive:opWindow.isActive,dailySequence,strategy,keywordProbability,keywordInjectionsToday,selectedArchetypeKey,lengthBracket:lengthBracket.key,personalityVariant,rating,effectiveLanguage,maxOutputTokens:1200});
      const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},GEMINI_TIMEOUT_MS);
      const responseText=await response.text();
      if(!response.ok){
        console.error('Gemini HTTP error',{model:GEMINI_MODEL,status:response.status,body:responseText.slice(0,1000)});
        void logSystemError(db,doctor.id,`Gemini HTTP ${response.status}: ${responseText.slice(0,500)}`);
      }else{
        let envelope:unknown;
        try{envelope=JSON.parse(responseText)}
        catch(error){throw new Error(`Gemini envelope JSON parse failed: ${error instanceof Error?error.message:String(error)}`)}
        const parts=(envelope as {candidates?:Array<{content?:{parts?:Array<{text?:unknown}>}}>})?.candidates?.[0]?.content?.parts;
        if(!Array.isArray(parts))throw new Error('Gemini envelope missing candidate content parts');
        const modelText=parts.map(part=>typeof part.text==='string'?part.text:'').filter(Boolean).join('\n\n');
        const strictDrafts=parseReviews(modelText,TARGET_COUNT);
        if(strictDrafts.length!==TARGET_COUNT)throw new Error('Gemini response violated strict JSON object-map contract');
        reviews=strictDrafts.map(review=>includeDoctorName?injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket):shapeLines(review,rating,effectiveLanguage,lengthBracket));
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      console.error('Gemini request failed',{model:GEMINI_MODEL,error:message});
      void logSystemError(db,doctor.id,message);
    }

    if(reviews.length<TARGET_COUNT){
      reviews=unique([...reviews,...emergencyDrafts(effectiveLanguage,rating)],TARGET_COUNT).map(review=>includeDoctorName?injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket):shapeLines(review,rating,effectiveLanguage,lengthBracket));
    }
    reviews=reviews.slice(0,TARGET_COUNT);

    if(rating>2&&strategy==='clean_human'&&blockedKeywords.length){
      const leaked=reviews.some(review=>blockedKeywords.some(keyword=>keyword&&normalize(review).includes(normalize(keyword))));
      if(leaked){
        console.error('Clean human output leaked structural keyword; using emergency drafts',{doctor_id:doctor.id,dailySequence});
        reviews=emergencyDrafts(effectiveLanguage,rating);
      }
    }
    if(includeDoctorName)reviews=reviews.map(review=>injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket));
    const firstFourWordSample=reviews.length?firstFourWords(reviews[0]):'';

    const metadata={
      policy_version:'pattern-resistant-operational-window-v2',
      model:GEMINI_MODEL,
      helper_model:HELPER_MODEL,
      max_output_tokens:1200,
      operational_window_active:opWindow.isActive,
      operational_window_start:opWindow.startIso,
      operational_window_end:opWindow.endIso,
      operational_scan_sequence:operationalScanSequence,
      allow_language_step:allowLanguageStep,
      allow_detail_form:allowDetailForm,
      is_name_area_prompted:isNameAreaPrompted,
      is_language_prompted:isLanguagePrompted,
      is_doctor_name_included:includeDoctorName,
      doctor_name_injections_today_before:doctorNameIncludedToday,
      doctor_name_cap_daily:DOCTOR_NAME_CAP_DAILY,
      emoji_enabled:allowEmoji,
      daily_generation_sequence:dailySequence,
      strategy,
      keyword_injection_active:keywordInjectionActive,
      keyword_probability:keywordProbability,
      keyword_injections_today_before:keywordInjectionsToday,
      keyword_injection_assets:injectionKeywords,
      length_bracket:lengthBracket.key,
      length_min:lengthBracket.min,
      length_max:lengthBracket.max,
      length_target:lengthBracket.target,
      structure_archetype_key:selectedArchetypeKey,
      structure_archetype:selectedArchetype,
      first_four_words:firstFourWordSample,
      personality_variant:personalityVariant,
      casing_profile:casingProfile,
      owner_response_hook_state:ownerResponseHookState,
      actual_patient_rating:rating,
      generated_rating:rating,
      selected_chips: selectedChips,
      primary_area: primaryArea || null,
      patient_name_active: !!patientName,
      patient_locality_active: !!patientLocality,
      location_verified:locationVerified,
      distance_meters:distanceMeters,
      generation_attempts:generationAttempts,
    };
    try{
      const rows=reviews.map(content=>({doctor_id:doctor.id,content,embedding:null,generation_metadata:metadata}));
      const {error}=await db.from('generated_reviews').insert(rows);
      if(error)console.error('Generated review persistence failed; returning drafts anyway',error);
    }catch(error){console.error('Generated review persistence threw; returning drafts anyway',error)}

    const generatedAt=new Date().toISOString();
    try{
      const {error}=await db.from('review_generation_meta').insert({
        doctor_id:doctor.id,
        scan_id:scanId||null,
        fingerprint_hash:fingerprintHash,
        rating,
        is_name_area_prompted:isNameAreaPrompted,
        is_language_prompted:isLanguagePrompted,
        is_doctor_name_included:includeDoctorName,
        language:effectiveLanguage,
        strategy,
        keyword_injection_active:keywordInjectionActive,
        keyword_probability:keywordProbability,
        length_bracket:lengthBracket.key,
        structure_archetype_key:selectedArchetypeKey,
        structure_archetype:selectedArchetype,
        first_four_words:firstFourWordSample,
        personality_variant:personalityVariant,
        casing_profile:casingProfile,
        owner_response_hook_state:ownerResponseHookState,
        created_at:generatedAt,
      });
      if(error)console.error('Review generation meta insert failed; continuing',error);
    }catch(error){console.error('Review generation meta insert threw; continuing',error)}
    try{
      const {error}=await db.from('review_generation_events').insert({doctor_id:doctor.id,fingerprint_hash:fingerprintHash,personality:personalityVariant,location_verified:locationVerified,distance_meters:distanceMeters,created_at:generatedAt});
      if(error)console.error('Generation event audit insert failed; continuing',error);
    }catch(error){console.error('Generation event audit insert threw; continuing',error)}
    try{
      const fingerprintAudit={doctor_id:doctor.id,fingerprint_hash:fingerprintHash,location_verified:locationVerified,distance_meters:distanceMeters,generated_at:generatedAt};
      const {error}=await db.from('device_fingerprints').upsert(fingerprintAudit,{onConflict:'doctor_id,fingerprint_hash'});
      if(error)console.error('Device fingerprint audit upsert failed; continuing',error);
    }catch(error){console.error('Device fingerprint audit upsert threw; continuing',error)}

    return reply({reviews,target_count:TARGET_COUNT,quality:{...metadata,routing:{operational_scan_sequence:operationalScanSequence,operational_window_active:opWindow.isActive,operational_window_start:opWindow.startIso,operational_window_end:opWindow.endIso,allow_language_step:allowLanguageStep,allow_detail_form:allowDetailForm}}});
  }catch(error){
    console.error('Unhandled generate-review error; returning emergency drafts',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true,generation_attempts:0}});
  }
});
