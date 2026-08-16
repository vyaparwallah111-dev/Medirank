import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const GEMINI_MODEL=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash'; // Use env var, fallback to latest stable model
// PER-ATTEMPT timeout. Frontend AbortController allows 20s total (review-experience.tsx). Since
// generation now retries once on failure (worst case: two attempts + backoff), the per-attempt
// budget must leave room for both: 8s x 2 + up to 800ms backoff + DB/overhead comfortably fits
// under 20s. A single successful attempt is unaffected - Gemini flash models finish well inside 8s.
const GEMINI_TIMEOUT_MS=8_000;
const TARGET_COUNT=3;

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type ArchetypeKey='A'|'B'|'C'|'D'|'E'|'F'|'G';
type ClientDigest={
  doctor_id:string;doctor_name:string;clinic_name:string;city:string;specialization:string;
  high_priority_keywords:string[];medium_keywords:string[];low_keywords:string[];
  selected_chips:string[];patient_concerns:string[];usp_points:string[];tone_preference:string;
  primary_area:string;secondary_area:string|null;
  patient_name:string;patient_locality:string;custom_notes:string;rating:number;language:Language;
};
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
  if(rating<4)return null;
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

async function checkDuplicateRisk(db:ReturnType<typeof createClient>,doctorId:string,newReviewOpeningLine:string){
  const recentResult=await db.from('generated_reviews').select('content').eq('doctor_id',doctorId).order('created_at',{ascending:false}).limit(20);
  if(recentResult.error||!recentResult.data)return false;
  const newOpeningWords=newReviewOpeningLine.split(/\n/)[0]?.split(/\s+/).slice(0,8).join(' ')?.toLowerCase()||'';
  if(!newOpeningWords||newOpeningWords.length<10)return false;
  for(const row of recentResult.data){
    const content=typeof row.content==='string'?row.content:'';
    const recentOpening=content.split(/\n/)[0]?.toLowerCase()||'';
    if(!recentOpening)continue;
    if(recentOpening===newOpeningWords)return true;
  }
  return false;
}

// NOTE: There is deliberately no hardcoded "fallback template" function anymore. A patient must
// never receive a robotic, pre-written review that looks like it came from the AI when it didn't -
// that was the previous emergencyDrafts() behaviour. On failure (see the retry loop below), the
// function now returns {success:false} and the frontend shows a clear "try again" state instead.
const fail=(error:string,status:number)=>reply({success:false,error},status);

Deno.serve(async(req)=>{
  let db:ReturnType<typeof createClient>|null=null;
  let doctorIdForAudit:string|null=null;

  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return fail('invalid_request',405);

  const requestStartMs=Date.now();
  try{
    // Parse request
    let body:Record<string,unknown>;
    try{body=await req.json()}
    catch(error){console.error('Invalid JSON',error);return fail('invalid_request',400)}

    const doctorId=sanitizeText(body.doctor_id,80);
    doctorIdForAudit=doctorId;
    if(!doctorId||!uuidPattern.test(doctorId))return fail('invalid_request',400);

    // Initialize DB
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){
      console.error('Missing secrets');
      return fail('configuration_error',500);
    }
    db=createClient(url,serviceKey);

    // Build ClientDigest - fetch all data in parallel
    const language:Language=body.language==='hinglish'?'hinglish':'english';
    const rating=Math.min(5,Math.max(1,Math.round(Number(body.rating)||5)));
    const deviceToken=sanitizeText(body.device_token,128);
    if(!deviceToken)return fail('invalid_request',400);

    // Precheck - return routing info quickly
    if(body.precheck_only===true){
      return reply({
        allowed:true,
        routing:{
          operationalScanSequence:0,
          operationalWindowActive:operationalWindow().isActive,
          operationalWindowStart:operationalWindow().startIso,
          operationalWindowEnd:operationalWindow().endIso,
          allowLanguageStep:true,
          allowDetailForm:Math.random()<0.40,
        }
      });
    }

    const dbStartMs=Date.now();
    const [doctorResult,aiSettingsResult,keywordsResult,recentReviewsResult]=await Promise.allSettled([
      db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base').eq('id',doctorId).eq('is_active',true).maybeSingle(),
      db.from('doctor_ai_settings').select('*').eq('doctor_id',doctorId).maybeSingle(),
      db.from('doctor_keywords').select('keyword').eq('doctor_id',doctorId),
      db.from('generated_reviews').select('content').eq('doctor_id',doctorId).order('created_at',{ascending:false}).limit(15),
    ]);
    const dbMs=Date.now()-dbStartMs;
    console.log(`⏱️  DB queries: ${dbMs}ms`);

    const doctor=(doctorResult.status==='fulfilled'?doctorResult.value.data:null);
    if(!doctor){
      console.error('Doctor not found');
      void logSystemError(db,doctorId,'Doctor not found or inactive');
      return fail('not_found',404);
    }

    const aiSettings=aiSettingsResult.status==='fulfilled'?aiSettingsResult.value.data:null;
    const keywordRows=(keywordsResult.status==='fulfilled'?keywordsResult.value.data:[]) as Array<{keyword:unknown}>;
    const recentReviews=(recentReviewsResult.status==='fulfilled'?recentReviewsResult.value.data:[]) as Array<{content:unknown}>;

    // Build keyword hierarchy
    const priorityKeywords=selectPriorityKeywords(aiSettings,unique(keywordRows.map(r=>sanitizeText(r.keyword,80)).filter(Boolean)));
    const mergedKeywords=mergeKeywordsByPriority(priorityKeywords,unique(keywordRows.map(r=>sanitizeText(r.keyword,80)).filter(Boolean)));

    // User selections this session
    const selectedChips=unique([...list(body.selected_chips,80),...list(body.selected_keywords,80),...list(body.selected_experiences,80),sanitizeText(body.selected_chip,80)].filter(Boolean),5);
    const patientName=normalizeHumanInput(body.patient_name,60,'name');
    const patientLocality=normalizeHumanInput(body.patient_locality,60,'locality');
    const customNotes=sanitizeText(body.custom_notes,240);

    // Build ClientDigest
    const kb=(doctor.knowledge_base&&typeof doctor.knowledge_base==='object'?doctor.knowledge_base:{}) as KB;
    const digest:ClientDigest={
      doctor_id:doctorId,
      doctor_name:sanitizeText(doctor.doctor_name,100),
      clinic_name:sanitizeText(doctor.clinic_name,120),
      city:sanitizeText(doctor.city,80),
      specialization:sanitizeText(doctor.specialization,80),
      high_priority_keywords:mergedKeywords.high.slice(0,3),
      medium_keywords:mergedKeywords.medium.slice(0,3),
      low_keywords:mergedKeywords.low.slice(0,2),
      selected_chips:selectedChips.length?selectedChips:mergedKeywords.high.slice(0,2),
      patient_concerns:jsonList(aiSettings?.patient_concerns||[]),
      usp_points:jsonList(aiSettings?.usp_points||[]),
      tone_preference:sanitizeText(aiSettings?.tone_preference,40),
      primary_area:sanitizeText(body.primary_area,80)||sanitizeText(kb.area_name,80)||sanitizeText(doctor.city,80),
      secondary_area:(Math.random()<0.25&&aiSettings?.target_areas?.secondary)?sanitizeText(jsonList(aiSettings.target_areas.secondary)[0],80):null,
      patient_name:patientName,
      patient_locality:patientLocality,
      custom_notes:customNotes,
      rating,
      language,
    };

    // Build unified prompt
    const selectedArchetypeKey=mapToneToArchetype(digest.tone_preference,[]);
    const selectedArchetype=STRUCTURE_ARCHETYPES[selectedArchetypeKey];
    const personalityVariant=selectPersonalityVariant([]);
    const casingProfile=randomItem(casingProfiles);
    const includeDoctorName=Math.random()<0.45;
    const allowEmoji=rating>=4&&Math.random()<0.45;

    const allKeywords=unique([...digest.high_priority_keywords,...digest.medium_keywords,...digest.low_keywords,...digest.selected_chips],10);
    const selectedConcern=rating>=4&&digest.patient_concerns.length?randomItem(digest.patient_concerns):null;
    const selectedUSP=digest.usp_points.length?randomItem(digest.usp_points):null;

    // Blocked phrases - expanded to include generic filler chains AND fallback-template openers
    // (Gemini must never converge on the same generic lines the hardcoded emergency fallback uses)
    const blockedPhrases=[
      'sharing genuine','overall good','highly satisfied','recently visited','my experience was',
      'I would definitely recommend','five-star','would rate','everything was perfect','best clinic',
      'without a doubt','The appointment felt organised from the start','The reception process was simple',
      'The doctor listened to my concerns carefully','The explanation was calm and clear',
      'The clinic environment felt clean','The staff response was polite','The visit did not feel rushed',
      'I understood the next steps properly','Overall the experience felt comfortable','I felt satisfied with my visit',
      'I had a positive experience','The treatment process ran smoothly','The consultation was meaningful',
      'I felt comfortable and satisfied','The team was cooperative','The atmosphere was welcoming',
      'I learned about the treatment plan','My confidence grew during the visit','The experience was memorable',
      'Clinic visit ka experience theek raha','Mera visit simple raha','Aaj ka visit manageable laga',
      'My clinic visit went well overall','The appointment was comfortable and well managed',
      'The clinic felt clean and organised','visit did not meet my expectations','experience felt below expectations',
    ];

    // Rating-aware, per-draft length/structure guidance - always a RANGE, never a fixed sentence count,
    // and each of the 3 drafts gets a DIFFERENT shape so they can't collapse into the same skeleton
    const draftShape=rating>=4
      ? {d1:'3-4 sentences, flowing narrative with connectors',d2:'a single longer paragraph of 5-7 sentences, reading as one continuous account with no short choppy breaks',d3:'3-5 sentences that open with one specific concrete detail (not a generic feeling statement like "the visit went well")'}
      : rating===3
        ? {d1:'2-3 sentences, plain and neutral',d2:'3-4 sentences as one continuous paragraph',d3:'2-4 sentences opening with a specific detail, not a generic feeling statement'}
        : {d1:'2-3 short, blunt sentences',d2:'3-4 sentences as one continuous complaint, not fragmented',d3:'1-3 direct sentences opening with the specific problem, not a generic feeling statement'};

    const prompt=`You are a Google review generator for a clinic. Generate exactly ${TARGET_COUNT} authentic patient reviews that READ LIKE REAL PATIENT STORIES, not checklists.

CLINIC CONTEXT:
- Doctor: ${digest.doctor_name}
- Clinic: ${digest.clinic_name}
- Location: ${digest.primary_area}${digest.secondary_area?`, also serves ${digest.secondary_area}`:''}
- Specialization: ${digest.specialization}

RATING: ${rating} star${rating!==1?'s':''}
LANGUAGE: ${digest.language==='hinglish'?'Hinglish (mix Hindi & English)':'English'}
STYLE: ${selectedArchetype}
TONE: ${personalityVariant}
CASING: ${casingProfile}

KEYWORDS (mandatory, weave naturally - do not give any keyword its own dedicated sentence): ${digest.high_priority_keywords.length?digest.high_priority_keywords.map(kw=>`"${kw}"`).join(', '):'none required'}. Each one must appear 2-3 times total across the review, blended into sentences that already carry other meaning.

REQUIREMENTS (blend all of these into the narrative - do not turn this list into a list of sentences in the output):
${digest.high_priority_keywords.length?`- All high-priority keywords must be threaded through the story, 2-3 mentions each.`:''}
${digest.patient_name&&digest.patient_locality?`- Introduce name "${digest.patient_name}" AND locality "${digest.patient_locality}" together in the opening 1-2 sentences, combined with other content in the same sentence (never their own standalone line, never in parentheses).`:digest.patient_name?`- Introduce name "${digest.patient_name}" naturally, fused into a sentence with other content.`:digest.patient_locality?`- Introduce locality "${digest.patient_locality}" naturally, fused into a sentence with other content.`:''}
${includeDoctorName?`- Mention doctor name "${digest.doctor_name}" fused into a sentence that also carries a keyword (e.g., "Dr. ${digest.doctor_name} explained the ${digest.high_priority_keywords[0]||'procedure'} thoroughly").`:'- Do not mention any doctor name.'}
${selectedConcern?`- Subtly address "${selectedConcern}", folded into an existing sentence, not standalone.`:''}
${selectedUSP?`- Reference "${selectedUSP}" once, folded into an existing sentence, not standalone.`:''}
- Never start with "I am X from Y" in parentheses - that reads as artificial.
- Never end with a chain of short generic sentences (e.g., avoid: "The doctor was attentive. The process was smooth. The consultation was meaningful." one after another). Every closing sentence must tie back to a specific detail.
- FORBIDDEN PHRASES (never use, in any draft): ${blockedPhrases.map(p=>`"${p}"`).join(', ')}
- ${allowEmoji?'Max 1 emoji only, used contextually (👍 🦷 ⭐)':'No emoji.'}
- Rating tone: ${rating===1?'honest, specific complaints (not just negative)':rating===2?'mixed or disappointed, but fair':rating===3?'balanced neutral':'genuine positive with specific details (not just "satisfied")'}

ANTI-TEMPLATE RULE (mandatory, this is the most important rule): Do NOT write one sentence per requirement (one sentence for an opening feeling, one sentence per keyword, one sentence for patient context) - that produces a robotic checklist, which is exactly what you must avoid. In every draft, at least ONE sentence must combine two or more required elements together - for example a keyword together with the patient's name/locality, two keywords together, or the doctor's name together with a keyword. Thread requirements through fewer, richer sentences, never one-requirement-per-line.

STRUCTURE ACROSS THE ${TARGET_COUNT} DRAFTS (mandatory - vary structure, not just word choice, so the drafts don't collapse into the same skeleton):
- Draft 1: ${draftShape.d1}.
- Draft 2: ${draftShape.d2}.
- Draft 3: ${draftShape.d3}.
Each draft must be structurally distinct from the others - different sentence counts and a different opening style, not the same shape with swapped words.

TONE CHECK (to avoid checklist sound):
BAD (checklist, disconnected, one-requirement-per-sentence): "My visit went well. The doctor explained things clearly. The staff was polite. The treatment was smooth. I felt comfortable."
GOOD (narrative, multiple elements combined per sentence): "My visit went well, and the doctor explained things clearly while also addressing my concerns about the best dental implant procedure. The staff was polite throughout, which helped me feel comfortable as I learned about teeth whitening options."

OUTPUT FORMAT:
Return exactly ${TARGET_COUNT} reviews as JSON:
[
  {"review": "review text here - NARRATIVE STYLE, NOT CHECKLIST"},
  {"review": "review text here - NARRATIVE STYLE, NOT CHECKLIST"},
  {"review": "review text here - NARRATIVE STYLE, NOT CHECKLIST"}
]
`;

    // Call Gemini
    console.log('🔍 DIAGNOSIS START');
    console.log('Doctor ID:',doctorId);
    console.log('Selected Chips:',digest.selected_chips);
    console.log('High Priority Keywords:',digest.high_priority_keywords);
    console.log('Rating:',rating,'Language:',language);

    const geminiPayload={
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{
        temperature:0.85,
        topP:0.95,
        topK:40,
        // Was derived from lengthBracket.max, which could be as low as 3 ('crisp' roll, 15% of
        // high-rating requests) -> maxOutputTokens as low as 325, truncating Gemini's JSON
        // mid-response and forcing parseReviews() to fail, silently falling back to emergencyDrafts()
        // (the rigid hardcoded template). Raised well past what 3 natural reviews ever need, so a
        // genuinely human-sounding response is never cut off mid-sentence for budget reasons.
        maxOutputTokens:4096,
        responseMimeType:'application/json',
      },
    };

    console.log('📤 Sending to Gemini prompt with keywords:',digest.high_priority_keywords);
    console.log('Prompt length:',prompt.length,'chars');

    // STEP 1: one automatic, silent retry before giving up. Most Gemini failures (network blip,
    // momentary slowness, an occasional truncated/malformed response) are transient - a second
    // attempt recovers the majority of them without the patient ever knowing attempt 1 failed.
    const MAX_ATTEMPTS=2;
    let reviews:string[]|null=null;
    let lastFailureReason='unknown';
    for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
      const attemptStartMs=Date.now();
      try{
        const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},GEMINI_TIMEOUT_MS);
        console.log(`⏱️  Attempt ${attempt}/${MAX_ATTEMPTS} Gemini API call: ${Date.now()-attemptStartMs}ms`);
        if(!response.ok){
          const errText=await response.text();
          lastFailureReason=`api_error_${response.status}`;
          console.error(`❌ Attempt ${attempt}/${MAX_ATTEMPTS} failed - GEMINI API ERROR`,{status:response.status,error:errText.slice(0,500)});
        }else{
          const envelope=await response.json() as any;
          const parts=envelope?.candidates?.[0]?.content?.parts;
          if(!Array.isArray(parts)){
            lastFailureReason='invalid_response_structure';
            console.error(`❌ Attempt ${attempt}/${MAX_ATTEMPTS} failed - INVALID RESPONSE STRUCTURE`,{parts});
          }else{
            const modelText=parts.map((p:any)=>typeof p.text==='string'?p.text:'').filter(Boolean).join('\n');
            console.log(`📥 Attempt ${attempt}/${MAX_ATTEMPTS} RAW GEMINI RESPONSE:\n`,modelText);
            const parsed=parseReviews(modelText,TARGET_COUNT);
            if(parsed.length===TARGET_COUNT){
              reviews=parsed;
              console.log(`✅ Attempt ${attempt}/${MAX_ATTEMPTS} succeeded - parsed ${parsed.length} reviews`);
            }else{
              lastFailureReason='parse_failed_or_truncated';
              console.error(`❌ Attempt ${attempt}/${MAX_ATTEMPTS} failed - parsed ${parsed.length}/${TARGET_COUNT} reviews (malformed or truncated JSON)`);
            }
          }
        }
      }catch(error){
        lastFailureReason=error instanceof Error&&/SLA/.test(error.message)?'timeout':'network_error';
        console.error(`❌ Attempt ${attempt}/${MAX_ATTEMPTS} threw`,error instanceof Error?error.message:String(error));
      }
      if(reviews)break;
      if(attempt<MAX_ATTEMPTS){
        const backoffMs=400+Math.floor(Math.random()*400);
        console.log(`⏳ Retrying in ${backoffMs}ms (attempt 1 failure kept internal, not shown to patient)...`);
        await new Promise(resolve=>setTimeout(resolve,backoffMs));
      }
    }

    // STEP 2: both attempts failed - return a clear failure, never the old hardcoded template.
    if(!reviews){
      console.error(`❌ Both Gemini attempts failed. Last reason: ${lastFailureReason}. Returning success:false to client.`);
      void logSystemError(db,doctorId,`Gemini generation failed after ${MAX_ATTEMPTS} attempts: ${lastFailureReason}`);
      return fail('generation_unavailable',503);
    }

    console.log('📋 FINAL REVIEWS (from Gemini, no post-processing):');
    reviews.forEach((r,i)=>console.log(`\n=== Review ${i+1} ===\n${r}`));

    // Lightweight duplicate check - informational only, does not block the response
    console.log('🔍 Checking duplicates against',recentReviews.length,'recent reviews');
    const recentFirstLines=recentReviews.map(r=>{
      const firstLine=(typeof r.content==='string'?r.content:'').split(/\n/)[0]?.toLowerCase()||'';
      return firstLine.split(/\s+/).slice(0,6).join(' ');
    });
    let duplicateCount=0;
    for(let i=0;i<reviews.length;i++){
      const newFirstLine=reviews[i].split(/\n/)[0]?.toLowerCase().split(/\s+/).slice(0,6).join(' ')||'';
      for(const recentLine of recentFirstLines){
        const common=newFirstLine.split(/\s+/).filter(w=>recentLine.includes(w)).length;
        const similarity=common/Math.max(newFirstLine.split(/\s+/).length,1);
        if(similarity>0.65){duplicateCount++;break}
      }
    }
    if(duplicateCount>0)console.log('ℹ️  Detected',duplicateCount,'potential duplicates (informational only)');

    // NOTE: Post-processing DISABLED - New narrative-style prompt handles all injections
    // (doctor name, patient name/area, keywords) naturally in Gemini's response
    // Post-processing functions (injectDoctorName, injectPatientContext) were causing
    // duplication by modifying content sequentially, each calling shapeLines()
    // Now: Gemini generates complete, natural reviews - no post-processing needed

    console.log('\n🔍 FINAL REVIEW OUTPUT:');
    console.log('='.repeat(60));
    reviews.forEach((r,i)=>{
      console.log(`\n### REVIEW ${i+1} (from Gemini, no post-processing):`);
      console.log(r);
      console.log('\nKeyword check:');
      digest.high_priority_keywords.forEach(kw=>{
        const count=(r.match(new RegExp(kw,'gi'))||[]).length;
        console.log(`  "${kw}": ${count} times`);
      });
    });
    console.log('\n='.repeat(60));

    // Save metadata
    const metadata={
      model:GEMINI_MODEL,
      doctor_id:doctorId,
      rating,
      language,
      target_count:TARGET_COUNT,
      review_count:reviews.length,
      archetype:selectedArchetypeKey,
      personality:personalityVariant,
      keywords_high:digest.high_priority_keywords,
      keywords_selected:digest.selected_chips,
      doctor_name_included:includeDoctorName,
      patient_context_included:!!digest.patient_name||!!digest.patient_locality,
    };

    // Persist reviews
    try{
      const rows=reviews.map(content=>({doctor_id:doctorId,content,embedding:null,generation_metadata:metadata}));
      const {error}=await db.from('generated_reviews').insert(rows);
      if(error)console.error('Persist failed',error);
    }catch(error){console.error('Persist threw',error)}

    // Persist metadata
    try{
      const metadataRow={
        doctor_id:doctorId,
        rating,
        language,
        structure_archetype_key:selectedArchetypeKey,
        structure_archetype:selectedArchetype,
        personality_variant:personalityVariant,
        casing_profile:casingProfile,
        created_at:new Date().toISOString(),
      };
      console.log('📊 Inserting metadata with columns:',Object.keys(metadataRow));
      const {error}=await db.from('review_generation_meta').insert(metadataRow);
      if(error){
        console.error('❌ Meta persist failed',{
          error_message:error.message,
          error_code:error.code,
          columns_attempted:Object.keys(metadataRow),
        });
      }else{
        console.log('✅ Metadata persisted successfully');
      }
    }catch(error){
      console.error('❌ Meta persist exception',{
        message:error instanceof Error?error.message:String(error),
        stack:error instanceof Error?error.stack:undefined,
      });
    }

    const totalMs=Date.now()-requestStartMs;
    console.log(`⏱️  TOTAL REQUEST TIME: ${totalMs}ms (DB: ${dbMs}ms + Gemini + overhead)`);

    return reply({success:true,reviews,target_count:TARGET_COUNT,quality:{...metadata,timing_ms:totalMs}});

  }catch(error){
    const totalMs=Date.now()-requestStartMs;
    console.error('❌ Unhandled error after',totalMs,'ms:',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return fail('generation_unavailable',503);
  }
});
