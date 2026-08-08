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
const TARGET_COUNT=2;
const DOCTOR_NAME_INJECTION_PROBABILITY=0.50;
const DAILY_KEYWORD_SEQUENCE_CAP=500;
const PERSONALIZED_FLOW_PROBABILITY=0.25;

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type Strategy='keyword_optimized'|'clean_human';
type LengthBracket={key:string;min:number;max:number;target:number};
type ArchetypeKey='A'|'B'|'C'|'D'|'E'|'F'|'G';
const STRUCTURE_ARCHETYPES:Record<ArchetypeKey,string>={
  A:'Write as ONE flowing sentence, no formal breaks, casual run-on style. Conversational, like texting a friend.',
  B:"Start directly with the doctor's name, skip any generic opening. Focus on their personal impact.",
  C:'Start with a short backstory reason for the visit (1 line), then the experience. Personal angle.',
  D:'Keep it to a single short line, no elaboration, no closing remark. Crisp, punchy.',
  E:'Write like a list of quick observations separated by commas, not polished sentences. Rapid-fire.',
  F:'End abruptly after the main point \u2014 no wrap-up. Stop mid-thought to feel authentic.',
  G:'Mention one minor imperfection naturally before the positive note. Real experiences aren\'t perfect.',
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
const titleCaseHuman=(value:string)=>value.split(/\s+/).filter(Boolean).map(part=>`${part[0].toUpperCase()}${part.slice(1).toLowerCase()}`).join(' ');
const splitKnownCompound=(value:string,terms:string[])=>{
  const lower=value.toLowerCase();
  for(const term of terms){
    if(lower.length>term.length+2&&lower.endsWith(term)){
      const prefix=lower.slice(0,-term.length);
      return `${prefix} ${term}`;
    }
  }
  return value;
};
const normalizeHumanInput=(value:unknown,maxLength:number,kind:'name'|'locality')=>{
  const compact=sanitizeText(value,maxLength)
    .replace(/[-_./]+/g,' ')
    .replace(/([a-z])([A-Z])/g,'$1 $2')
    .replace(/\s+/g,' ')
    .trim();
  if(!compact)return '';
  const knownNameTerms=['jha','kumar','singh','yadav','gupta','sharma','verma','prasad','khan','ali','ahmed','ansari','raj','rani'];
  const knownLocalityTerms=['sharif','nagar','pur','pura','ganj','bazar','bazaar','colony','road','chowk','market','vihar','bagh'];
  const spaced=compact.includes(' ')?compact:splitKnownCompound(compact,kind==='name'?knownNameTerms:knownLocalityTerms);
  return titleCaseHuman(spaced).slice(0,maxLength);
};
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
const doctorKeywordCombo=(doctorName:string,keyword:string,language:Language)=>{
  if(!doctorName||!keyword)return keyword;
  const d=doctorName.split(/\s+/)[0];
  if(language==='hinglish'){
    const templates=[`${d} ne ${keyword.toLowerCase()} explain kiya`,`${d} ke paas ${keyword.toLowerCase()} expertise`,`${d} se ${keyword.toLowerCase()} treatment`];
    return randomItem(templates);
  }else{
    const templates=[`${d} explained ${keyword.toLowerCase()}`,`${d}'s ${keyword.toLowerCase()} expertise`,`${d} handled ${keyword.toLowerCase()}`];
    return randomItem(templates);
  }
};
const firstFourWords=(value:string)=>sanitizeText(value,160).split(/\s+/).filter(Boolean).slice(0,4).join(' ');
const selectPriorityKeywords=(aiSettings:any,dashboardKeywords:string[])=>{
  if(!aiSettings)return{high:[],medium:[],low:[]};
  const high=jsonList(aiSettings.target_keywords?.high||[]);
  const medium=jsonList(aiSettings.target_keywords?.medium||[]);
  const low=jsonList(aiSettings.target_keywords?.low||[]);
  return{high:unique(high,10),medium:unique(medium,10),low:unique(low,10)};
};
const mergeKeywordsByPriority=(priorityKeywords:any,dashboardKeywords:string[])=>{
  const highSet=new Set(priorityKeywords.high.map(normalize));
  const mediumSet=new Set(priorityKeywords.medium.map(normalize));
  const lowSet=new Set(priorityKeywords.low.map(normalize));
  const merged={high:[...priorityKeywords.high],medium:[...priorityKeywords.medium],low:[...priorityKeywords.low]};
  for(const kw of dashboardKeywords){
    const n=normalize(kw);
    if(!highSet.has(n)&&!mediumSet.has(n)&&!lowSet.has(n))merged.medium.push(kw);
  }
  return merged;
};
const pickKeywordsByPriority=(mergedKeywords:any,reviewIndex:number)=>{
  const picked=[];
  if(mergedKeywords.high.length>0)picked.push(randomItem(mergedKeywords.high));
  if(mergedKeywords.medium.length>0&&Math.random()<0.5)picked.push(randomItem(mergedKeywords.medium));
  if(mergedKeywords.low.length>0&&Math.random()<0.2)picked.push(randomItem(mergedKeywords.low));
  return unique(picked,5);
};
const selectPatientConcern=(aiSettings:any,rating:number)=>{
  if(!aiSettings)return null;
  const concerns=jsonList(aiSettings.patient_concerns||[]);
  if(concerns.length===0)return null;
  if(rating<=2)return null;
  return randomItem(concerns);
};
const selectUSPPoint=(aiSettings:any)=>{
  if(!aiSettings)return null;
  const usps=jsonList(aiSettings.usp_points||[]);
  if(usps.length===0)return null;
  return randomItem(usps);
};
const mapToneToArchetype=(tonePref:string|null|undefined,recentArchetypes:ArchetypeKey[]):ArchetypeKey=>{
  if(!tonePref)return selectArchetype(recentArchetypes);
  const toneMap:Record<string,ArchetypeKey>={
    professional:'B',
    casual:'A',
    warm:'E',
    formal:'D',
    conversational:'F',
  };
  const mapped=toneMap[tonePref.toLowerCase()];
  return mapped||selectArchetype(recentArchetypes);
};
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

function ratingLayout(rating:number,language:Language,serviceKeyword:string,doctorName:string,includeDoctorName:boolean,allowEmoji:boolean,lengthBracket:LengthBracket,keywordInjectionActive:boolean,patientName:string,patientLocality:string){
  const service=serviceKeyword||'service';
  const patientRule=patientName&&patientLocality
    ? `patient_context_rule: mandatory in every draft. Naturally include the exact patient name "${patientName}" and exact locality "${patientLocality}" in the review text for every rating tier, including 1-star, 2-star, and 3-star neutral drafts. Do not drop these details for brevity or line-count constraints.`
    : patientName
      ? `patient_context_rule: mandatory in every draft. Naturally include the exact patient name "${patientName}" for every rating tier. Do not drop it for brevity.`
      : patientLocality
        ? `patient_context_rule: mandatory in every draft. Naturally include the exact locality "${patientLocality}" for every rating tier. Do not drop it for brevity.`
        : 'patient_context_rule: no patient name or locality was provided.';
  const doctorRule=includeDoctorName
    ? `doctor_name_rule: include the exact doctor name "${doctorName}" naturally in every draft while respecting the rating shape.`
    : 'doctor_name_rule: do not mention any doctor name.';
  const emojiRule=allowEmoji
    ? 'emoji_rule: high-tier only; randomly allow at most one sparse contextual emoji in some drafts, chosen organically from examples like 👍, 🦷, ⭐. Never repeat the same emoji in every draft.'
    : 'emoji_rule: no emoji.';
  if(rating===1)return `rating_shape: 1 star. Negative/constructive complaint. ${keywordInjectionActive?`Use "${service}" only if it fits the friction.`:'No keyword requirement; raw emotional complaint is allowed.'} Never soften, hide, block, or convert the complaint into praise. ${patientRule} ${doctorRule} ${emojiRule}`;
  if(rating===2)return `rating_shape: 2 stars. Casual low-satisfaction plain narrative. Sound disappointed but not dramatic. ${patientRule} ${doctorRule} ${emojiRule}`;
  if(rating===3)return `rating_shape: 3 stars. Mid-tier neutral review, strictly 2 to 4 text lines per review. ${patientRule} ${doctorRule} ${emojiRule}`;
  return `rating_shape: ${rating} stars. Use ${lengthBracket.key} length: ${lengthBracket.min}-${lengthBracket.max} lines per review, target ${lengthBracket.target}. ${patientRule} ${doctorRule} ${emojiRule}`;
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

function injectPatientContext(content:string,patientName:string,patientLocality:string,rating:number,language:Language,lengthBracket=selectLengthBracket(rating)){
  const safeName=sanitizeText(patientName,60);
  const safeLocality=sanitizeText(patientLocality,60);
  if(!safeName&&!safeLocality)return shapeLines(content,rating,language,lengthBracket);
  const hasName=!safeName||normalize(content).includes(normalize(safeName));
  const hasLocality=!safeLocality||normalize(content).includes(normalize(safeLocality));
  if(hasName&&hasLocality)return shapeLines(content,rating,language,lengthBracket);
  const lines=content.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const first=lines[0]||(
    rating<=2
      ? (language==='hinglish'?'experience expected se weak laga.':'the experience felt below expectations.')
      : rating===3
        ? (language==='hinglish'?'visit ka experience neutral raha.':'the visit felt neutral.')
        : (language==='hinglish'?'clinic visit comfortable raha.':'the clinic visit felt comfortable.')
  );
  const identity=safeName&&safeLocality
    ? (language==='hinglish'?`${safeName}, ${safeLocality} se`:`${safeName} from ${safeLocality}`)
    : safeName
      ? safeName
      : (language==='hinglish'?`${safeLocality} se`:`from ${safeLocality}`);
  lines[0]=language==='hinglish'
    ? `Main ${identity}, ${first.replace(/^main\s+/i,'')}`
    : `I am ${identity}, and ${first.replace(/^I\s+/i,'')}`;
  return shapeLines(lines.join('\n'),rating,language,lengthBracket);
}

function emergencyDrafts(language:Language,rating=5,keywords:string[]=[]){
  const keywordHint=keywords.length>0?keywords[0]:'service';
  if(rating<=2){
    const seeds=language==='hinglish'
      ? [
        `Visit se expectations meet nahi hui.\n${keywordHint} mein kuch issues the.\nProcess better ho sakti thi.`,
        `Experience low satisfaction wala tha.\nCommunication ${keywordHint} ke baare mein clearer hona chahiye tha.\nMain bas honest feedback de raha hoon.`,
        `Visit during ${keywordHint} treatment smooth nahi laga.\nCoordination aur explanation improve ho sakte the.`,
        `Service ke dauran issues feel hue.\nFollow-up better ho sakta tha.`,
      ]
      : [
        `The visit did not meet my expectations.\nThe ${keywordHint} process could be clearer.\nThis needs improvement.`,
        `My ${keywordHint} experience felt low-satisfaction.\nCommunication could have been better.\nI am leaving this as honest feedback.`,
        `The visit for ${keywordHint} did not feel smooth.\nCoordination could be handled better.`,
        `There were concerns about ${keywordHint}.\nThe follow-up could have been clearer.`,
      ];
    return seeds.map(seed=>shapeLines(seed,rating,language)).slice(0,TARGET_COUNT);
  }
  const seeds=language==='hinglish'
    ? [
      `Clinic visit ka experience theek raha.\n${keywordHint} treatment helpful tha aur doctor ne clearly samjhai.\nOverall mujhe comfortable feel hua.`,
      `Mera ${keywordHint} visit simple aur smooth raha.\nDoctor ne calmly guide kiya.\nClinic ka environment bhi neat tha.`,
      `Aaj ka visit manageable laga.\n${keywordHint} process clear tha aur staff ka response polite tha.`,
      `Clinic mein experience comfortable tha.\nDoctor ne ${keywordHint} ke concerns dhyan se sune.\nFollow-up clear mili.`,
    ]
    : [
      `My clinic visit went well overall.\nThe ${keywordHint} treatment was explained clearly.\nI felt comfortable and satisfied.`,
      `The appointment was comfortable and well managed.\nThe ${keywordHint} experience was handled smoothly.\nOverall it felt reassuring.`,
      `I visited for ${keywordHint} with some doubts.\nThe doctor listened and explained clearly.\nThe clinic experience felt professional.`,
      `The clinic felt clean and organised.\nThe ${keywordHint} service was handled well.\nOverall, it was a positive visit.`,
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
    const [doctorResult,aiSettingsResult]=await Promise.allSettled([
      db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base,latitude,longitude').eq('id',doctorId).eq('is_active',true).maybeSingle(),
      db.from('doctor_ai_settings').select('target_keywords,target_areas,patient_concerns,usp_points,tone_preference').eq('doctor_id',doctorId).maybeSingle(),
    ]);
    const {data:doctor,error:doctorError}=doctorResult.status==='fulfilled'?doctorResult.value:{data:null,error:doctorResult.reason};
    if(doctorError){void logSystemError(db,doctorId,doctorError.message||'Doctor lookup failed');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}
    if(!doctor){void logSystemError(db,doctorId,'Clinic not found or inactive');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}
    const aiSettings=aiSettingsResult.status==='fulfilled'?aiSettingsResult.value.data:null;

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
    const suppliedPatientName=normalizeHumanInput(body.patient_name,60,'name');
    const suppliedPatientLocality=normalizeHumanInput(body.patient_locality,60,'locality');
    const operationalScanSequence=0;
    const allowLanguageStep=true;
    const allowDetailForm=true;
    if(body.precheck_only===true)return reply({allowed:true,location_verified:locationVerified,distance_meters:distanceMeters,routing:{operational_scan_sequence:operationalScanSequence,operational_window_active:opWindow.isActive,operational_window_start:opWindow.startIso,operational_window_end:opWindow.endIso,allow_language_step:allowLanguageStep,allow_detail_form:allowDetailForm}});

    const effectiveLanguage:Language=body.language==='hinglish'?'hinglish':'english';
    fallbackLanguage=effectiveLanguage;
    const rating=Math.min(5,Math.max(1,Math.round(Number(body.rating)||5)));
    const kb=(doctor.knowledge_base&&typeof doctor.knowledge_base==='object'?doctor.knowledge_base:{}) as KB;
    const primaryArea=sanitizeText(body.primary_area,80)||sanitizeText(kb.area_name,80)||sanitizeText(doctor.city,80);
    const patientName=suppliedPatientName;
    const patientLocality=suppliedPatientLocality;
    const customNotes=sanitizeText(body.custom_notes,240);

    const {data:keywordRows,error:keywordError}=await db.from('doctor_keywords').select('keyword,category').eq('doctor_id',doctor.id).order('created_at');
    if(keywordError)console.error('Doctor keyword lookup failed; continuing with supplied chips only',keywordError);
    const dashboardKeywords=unique((keywordRows||[]).map(row=>sanitizeText(row.keyword,80)),20);
    const priorityKeywords=selectPriorityKeywords(aiSettings,dashboardKeywords);
    const mergedKeywords=mergeKeywordsByPriority(priorityKeywords,dashboardKeywords);
    const allAvailableKeywords=unique([...mergedKeywords.high,...mergedKeywords.medium,...mergedKeywords.low],30);
    const allowedKeywords=new Set(allAvailableKeywords.map(normalize));
    const requestedChips=unique([...list(body.selected_chips,80),...list(body.selected_keywords,80),...list(body.selected_experiences,80),sanitizeText(body.selected_chip,80)].filter(Boolean),5)
      .filter(item=>!allowedKeywords.size||allowedKeywords.has(normalize(item)));
    const selectedChips=requestedChips.length?requestedChips:pickKeywordsByPriority(mergedKeywords,0);
    const serviceKeyword=selectedChips[0]||mergedKeywords.high[0]||mergedKeywords.medium[0]||'service';
    const doctorName=sanitizeText(doctor.doctor_name,100);
    const clinicName=sanitizeText(doctor.clinic_name,120);
    const includeDoctorName=Math.random()<DOCTOR_NAME_INJECTION_PROBABILITY;
    const isNameAreaPrompted=allowDetailForm;
    const isLanguagePrompted=allowLanguageStep;
    const allowEmoji=rating>=4&&Math.random()<.45;
    const lengthBracket=selectLengthBracket(rating);

    const dailyCountResult=await db.from('review_generation_events').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso);
    if(dailyCountResult.error)console.error('Daily generation sequence lookup failed; defaulting to first generation',dailyCountResult.error);
    const dailySequence=(dailyCountResult.count??0)+1;
    const keywordUseResult=await db.from('review_generation_meta').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('keyword_injection_active',true).gte('created_at',opWindow.startIso).lt('created_at',opWindow.endIso);
    if(keywordUseResult.error)console.error('Keyword usage lookup failed; continuing anyway',keywordUseResult.error);
    const keywordInjectionsToday=keywordUseResult.error?0:(keywordUseResult.count??0);
    let keywordInjectionActive=selectedChips.length>=2&&keywordInjectionsToday<DAILY_KEYWORD_SEQUENCE_CAP;
    const strategy:Strategy=keywordInjectionActive?'keyword_optimized':'clean_human';
    const treatmentChips=selectedChips.filter(chip=>allAvailableKeywords.some(ak=>normalize(ak)===normalize(chip)));
    const doctorCombos=includeDoctorName&&doctorName?treatmentChips.slice(0,2).map(chip=>doctorKeywordCombo(doctorName,chip,effectiveLanguage)):[];
    const selectedConcern=selectPatientConcern(aiSettings,rating);
    const selectedUSP=selectUSPPoint(aiSettings);
    const secondaryArea=(Math.random()<0.25&&aiSettings?.target_areas?.secondary?.length>0)?jsonList(aiSettings.target_areas.secondary)[0]:null;
    const injectionKeywords=keywordInjectionActive?unique([clinicName,primaryArea,patientLocality,...selectedChips,...doctorCombos,...allAvailableKeywords,...(selectedUSP?[selectedUSP]:[]),...(secondaryArea?[secondaryArea]:[])],15):[];
    const blockedKeywords=!keywordInjectionActive?unique([clinicName,...(!includeDoctorName?[doctorName]:[]),primaryArea,...selectedChips,...allAvailableKeywords],30):[];
    const recentMetaResult=await db.from('review_generation_meta').select('structure_archetype_key,personality_variant').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(100);
    if(recentMetaResult.error)console.error('Pattern history lookup failed; using fresh random pattern state',recentMetaResult.error);
    const recentRows=(recentMetaResult.data||[]) as Array<{structure_archetype_key?:unknown;personality_variant?:unknown}>;
    const recentArchetypes=recentRows.slice(0,3).map(row=>sanitizeText(row.structure_archetype_key,2)) as ArchetypeKey[];
    const selectedArchetypeKey=mapToneToArchetype(aiSettings?.tone_preference,recentArchetypes);
    const selectedArchetype=STRUCTURE_ARCHETYPES[selectedArchetypeKey];
    const personalityVariant=selectPersonalityVariant(recentRows.map(row=>sanitizeText(row.personality_variant,40)).filter(Boolean));
    const casingProfile=randomItem(casingProfiles);
    const ownerResponseHookState={enabled:false,status:'reserved'};

    const structuralPrefix=`JSON: exactly ${TARGET_COUNT} [{"review":"..."}], no markdown. BLOCKED_PHRASES: "sharing genuine","overall good","highly satisfied","recently visited","my experience was","I would definitely recommend","five-star","would rate","everything was perfect","best clinic","without a doubt". No fake outcomes/diagnosis/claims. If name/locality: MUST include naturally. Each keyword: 2x+ per review, varied contexts. Allow: small typos, casual tone, minor imperfections (makes it human).`;
    const strategyBlock=keywordInjectionActive
      ? `keywords=${JSON.stringify(injectionKeywords)}; MANDATORY: use each selected chip at least 2x per review, distribute naturally across different contexts, no keyword-stuffing or repetition in same sentence.`
      : `keywords=none; ambient only. Avoid exact assets ${JSON.stringify(blockedKeywords)}.`;
    const highPriorityKeywords=mergedKeywords.high.slice(0,2).join(', ');
    const executionLayout=`ARCH=${selectedArchetypeKey}: ${selectedArchetype}
lang=${effectiveLanguage==='hinglish'?'Hinglish Latin':'English'}; rating=${rating}; length=${lengthBracket.key}:${lengthBracket.min}-${lengthBracket.max},target=${lengthBracket.target}; casing=${casingProfile}; tone=${personalityVariant}
VARIATION: Use mixed sentence lengths (short + long). Start differently each time: question, statement, personal angle. Include one conversational aside or small imperfection to feel genuine.
${strategyBlock}
clinic=${keywordInjectionActive?JSON.stringify(clinicName):'null'}; area=${keywordInjectionActive?JSON.stringify(primaryArea):'null'}; chips=${keywordInjectionActive?JSON.stringify(selectedChips):'[]'}
patient=${JSON.stringify({name:patientName||'',locality:patientLocality||'',note:customNotes||''})}
MANDATORY_ELEMENTS: guaranteed_keywords=[${highPriorityKeywords}] (must include these naturally); concern=${selectedConcern?`"${selectedConcern}" (subtly address this if review mentions comfort/experience)`:'none'}; usp=${selectedUSP?`"${selectedUSP}" (naturally weave once if relevant)`:'none'}; secondary_area=${secondaryArea?`"${secondaryArea}" (mention in ~20% of reviews, e.g., location reference)`:'none'}.
${ratingLayout(rating,effectiveLanguage,keywordInjectionActive?serviceKeyword:'service',doctorName,includeDoctorName,allowEmoji,lengthBracket,keywordInjectionActive,patientName,patientLocality)}
tone_adjustment=${rating<=2?'honest about friction, never soften complaints':'authentic satisfaction, not over-the-top praise'}.`;

    let reviews:string[]=[];
    let generationAttempts=0;
    try{
      generationAttempts=1;
      const maxTokensPerLine=20;
      const jsonOverhead=80;
      const maxOutputTokens=Math.min(lengthBracket.max*maxTokensPerLine*TARGET_COUNT+jsonOverhead,800);
      const isConversational=selectedArchetypeKey==='A'||selectedArchetypeKey==='E'||selectedArchetypeKey==='F';
      const temperature=isConversational?0.88:0.75;
      const topP=isConversational?0.98:0.92;
      const geminiPayload={
        contents:[{parts:[{text:structuralPrefix},{text:executionLayout}]}],
        generationConfig:{temperature,topP,topK:40,maxOutputTokens,responseMimeType:'application/json'},
      };
      console.log('Gemini request',{model:GEMINI_MODEL,doctor_id:doctor.id,dailySequence,strategy,keywordInjectionsToday,selectedArchetypeKey,personalityVariant,rating,effectiveLanguage,temperature,topP,maxOutputTokens});
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
        reviews=strictDrafts.map(review=>{
          const withDoctor=includeDoctorName?injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket):shapeLines(review,rating,effectiveLanguage,lengthBracket);
          return injectPatientContext(withDoctor,patientName,patientLocality,rating,effectiveLanguage,lengthBracket);
        });
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      console.error('Gemini request failed',{model:GEMINI_MODEL,error:message});
      void logSystemError(db,doctor.id,message);
    }

    if(reviews.length<TARGET_COUNT){
      reviews=unique([...reviews,...emergencyDrafts(effectiveLanguage,rating,activeKeywords)],TARGET_COUNT).map(review=>{
        const withDoctor=includeDoctorName?injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket):shapeLines(review,rating,effectiveLanguage,lengthBracket);
        return injectPatientContext(withDoctor,patientName,patientLocality,rating,effectiveLanguage,lengthBracket);
      });
    }
    reviews=reviews.slice(0,TARGET_COUNT);

    if(rating>2&&strategy==='clean_human'&&blockedKeywords.length){
      const leaked=reviews.some(review=>blockedKeywords.some(keyword=>keyword&&normalize(review).includes(normalize(keyword))));
      if(leaked){
        console.error('Clean human output leaked structural keyword; using emergency drafts',{doctor_id:doctor.id,dailySequence});
        reviews=emergencyDrafts(effectiveLanguage,rating,activeKeywords).map(review=>injectPatientContext(review,patientName,patientLocality,rating,effectiveLanguage,lengthBracket));
      }
    }
    reviews=reviews.map(review=>{
      const withDoctor=includeDoctorName?injectDoctorName(review,doctorName,rating,effectiveLanguage,lengthBracket):shapeLines(review,rating,effectiveLanguage,lengthBracket);
      return injectPatientContext(withDoctor,patientName,patientLocality,rating,effectiveLanguage,lengthBracket);
    });
    const firstFourWordSample=reviews.length?firstFourWords(reviews[0]):'';

    const metadata={
      policy_version:'pattern-resistant-operational-window-v2',
      model:GEMINI_MODEL,
      operational_window_active:opWindow.isActive,
      allow_language_step:allowLanguageStep,
      allow_detail_form:allowDetailForm,
      is_name_area_prompted:isNameAreaPrompted,
      is_language_prompted:isLanguagePrompted,
      is_doctor_name_included:includeDoctorName,
      doctor_name_injection_probability:DOCTOR_NAME_INJECTION_PROBABILITY,
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
