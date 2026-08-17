import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const GEMINI_MODEL=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash'; // Use env var, fallback to latest stable model
// Lighter/faster sibling in the SAME model generation as GEMINI_MODEL - confirmed via ai.google.dev/
// gemini-api/docs/models (model ID column) and Google's 2026-07-21 announcement blog
// (blog.google/.../gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/) as the current, correct ID for
// Google's low-latency "lite" tier. Less "thinking" overhead than the full model, so it's used for
// the fallback layers below where speed/reliability matters more than squeezing out maximum quality.
const GEMINI_MODEL_LITE=Deno.env.get('GEMINI_MODEL_LITE')||'gemini-3.5-flash-lite';
const TARGET_COUNT=3;
// Multi-layer fallback timeouts (real measured data point: thinkingLevel:'low' on the full model
// completed in 6868ms, so Layer 1 gets margin above that). Each later layer is deliberately tighter
// because it's either a lighter model, a shorter prompt, or both - so it should genuinely need less
// time, not just be allotted less. Layers 1-3 sum to ~14s (the "~12-15s combined" target for the
// primary chain); Layer 4 is a separate last-resort call on top of that, not counted against it.
const LAYER_TIMEOUTS_MS:Record<1|2|3|4,number>={1:6500,2:4500,3:3000,4:3000};

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type ArchetypeKey='A'|'B'|'C'|'D'|'E'|'F'|'G';
type ClientDigest={
  doctor_id:string;doctor_name:string;clinic_name:string;city:string;specialization:string;
  high_priority_keywords:string[];medium_keywords:string[];low_keywords:string[];
  selected_chips:string[];patient_concerns:string[];usp_points:string[];tone_preference:string;
  primary_area:string;secondary_area:string|null;
  custom_notes:string;rating:number;language:Language;
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
// Handles legacy double/triple-JSON-encoded values from the corrupted patient_concerns/usp_points
// bug (a string like '["fear of pain"]' stored where a real jsonb array should be) by trying
// JSON.parse first before falling back to comma-splitting plain text. Without this, a corrupted
// value gets comma-split into fragments still containing literal brackets/quotes, which is exactly
// the garbage that was going straight into the Gemini prompt for any doctor with a corrupted row.
const jsonList=(value:unknown,depth=0):string[]=>{
  if(depth>5)return [];
  if(Array.isArray(value))return list(value.flatMap(item=>typeof item==='string'?[item]:jsonList(item,depth+1)));
  if(typeof value==='string'){
    const trimmed=value.trim();
    if(trimmed.startsWith('[')||(trimmed.startsWith('"')&&trimmed.endsWith('"')&&trimmed.length>1)){
      try{return jsonList(JSON.parse(trimmed),depth+1)}catch{/* not valid JSON - fall through */}
    }
    return trimmed.split(',').map(item=>item.trim()).filter(Boolean);
  }
  if(value&&typeof value==='object')return Object.values(value as Record<string,unknown>).flatMap(v=>jsonList(v,depth+1));
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

type ParseReviewsResult={reviews:string[];failureReason?:'truncated_json'|'malformed_json'|'wrong_review_count'};
function parseReviews(raw:unknown,expectedCount:number):ParseReviewsResult{
  if(typeof raw!=='string')return {reviews:[],failureReason:'malformed_json'};
  const candidate=raw.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{
    const parsed=JSON.parse(candidate) as unknown;
    const collection=Array.isArray(parsed)
      ? parsed
      : parsed&&typeof parsed==='object'&&Array.isArray((parsed as {reviews?:unknown}).reviews)
        ? (parsed as {reviews:unknown[]}).reviews
        : [];
    if(!collection.length)return {reviews:[],failureReason:'malformed_json'};
    const reviews=collection.map(item=>{
      if(!item||typeof item!=='object'||Array.isArray(item))return '';
      return sanitizeText((item as {review?:unknown}).review,1600);
    });
    if(reviews.length!==expectedCount||reviews.some(review=>review.length<10))return {reviews:[],failureReason:'wrong_review_count'};
    return {reviews:unique(reviews,expectedCount)};
  }catch(error){
    const message=error instanceof Error?error.message:String(error);
    console.error('Strict Gemini JSON contract validation failed',message);
    // "Unterminated string" / "Unexpected end of JSON input" are JSON.parse's own error text for
    // content that stops mid-token - i.e. the response was cut off before completion (most likely:
    // maxOutputTokens ran out, since thinking+output share that same budget on Gemini 3 models).
    // Any other SyntaxError (e.g. unexpected token) means the JSON that WAS received is genuinely
    // malformed, not just incomplete - a different failure mode worth telling apart in the logs.
    const failureReason=/unterminated string|unexpected end of json input/i.test(message)?'truncated_json':'malformed_json';
    return {reviews:[],failureReason};
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
    // NOTE: patient_name/patient_locality intentionally not read from the request anymore. Gemini was
    // writing reviews about the patient in THIRD PERSON when a name was present ("Avinash ko fear
    // tha" / "he is the Best Doctor") instead of first person as the patient themselves - a confusing,
    // unnatural voice, and inconsistent within a single review in at least one observed case. Rather
    // than patch the prompt repeatedly, the feature (and its frontend collection step) was removed.
    const selectedChips=unique([...list(body.selected_chips,80),...list(body.selected_keywords,80),...list(body.selected_experiences,80),sanitizeText(body.selected_chip,80)].filter(Boolean),5);
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

    // Replaced a fixed 5-option framing menu + 3 rigid per-draft length brackets (short-term fix from
    // the previous round). Both worked WITHIN a batch of 3, but at scale (hundreds of reviews per
    // clinic) they'd converge on only 5 possible framings and 3 possible lengths - a detectable
    // pattern of its own. Now: an open-ended framing instruction (model generates its own variation,
    // not a pick-from-list) and a probabilistic length distribution (a target shape across MANY
    // generations, not a rigid per-draft assignment) - see lengthDistribution and the prompt text below.
    const lengthDistribution=rating>=4
      ? '~30% land short (2-3 sentences), ~40% medium (4-6 sentences), ~30% longer (7-9 sentences)'
      : rating===3
        ? '~30% land short (2 sentences), ~40% medium (3-4 sentences), ~30% longer (5-6 sentences)'
        : '~30% land short (2 sentences), ~40% medium (3-4 sentences), ~30% longer (5 sentences)';

    // NOTE: Prompt was ~5100 chars (~1275 tokens) before this trim - roughly HALVED to ~2500 chars
    // (~625 tokens) while keeping every functional rule (anti-template, structure variation, keyword
    // rules, patient/doctor fusion). Removed: a 38-item exhaustive FORBIDDEN PHRASES list (1200+ chars
    // of near-duplicate generic phrases - replaced with 5 representative examples + the underlying
    // principle, which models generalize from just as well) and a redundant BAD-example block (already
    // covered by the ANTI-TEMPLATE RULE prose). This was done to reduce input-token processing time as
    // one contributing factor toward the production timeout investigation - see LAYER_TIMEOUTS_MS above.
    const prompt=`You are a Google review generator for a clinic. Generate exactly ${TARGET_COUNT} authentic patient reviews that read like real patient stories, not checklists.

PERSPECTIVE (mandatory, read first): write entirely in FIRST PERSON, as if YOU are the patient sharing your own experience ("I visited", "my appointment", "I felt"). Never refer to "the patient" or any patient name in third person - you ARE the person who visited, not someone describing them. Doctor and clinic names are fine to mention directly by name (e.g. "Dr. Sharma explained clearly") - only the patient's own identity must never appear in third person.

CLINIC: ${digest.doctor_name} at ${digest.clinic_name}, ${digest.primary_area}${digest.secondary_area?`/${digest.secondary_area}`:''} (${digest.specialization})
RATING: ${rating} star${rating!==1?'s':''} | LANGUAGE: ${digest.language==='hinglish'?'Hinglish - see HINGLISH STYLE below':'English'} | STYLE: ${selectedArchetype}
TONE: ${personalityVariant} | CASING: ${casingProfile}
${digest.language==='hinglish'?`
HINGLISH STYLE (mandatory - read carefully, this is the most commonly gotten-wrong instruction): write genuine Hinglish the way Indian patients actually text online - mix Hindi and English NATURALLY at the sentence and phrase level THROUGHOUT the whole review, not just 1-2 decorative Hindi words dropped into otherwise-English sentences. Roughly half the sentences/clauses should be Hindi-led, half English-led, naturally alternating. BAD (fake Hinglish, English with token Hindi words): "Crowd dekh kar I had prepared myself for a long wait." GOOD (real code-switching, full clauses mixed): "Waqt pe appointment mil gaya, and the doctor bhi bahut patiently sun rahe the meri problem." Keep this density throughout the review, not just the opening line.
`:''}
KEYWORDS (weave naturally, 2-3 mentions each, never a standalone sentence): ${digest.high_priority_keywords.length?digest.high_priority_keywords.map(kw=>`"${kw}"`).join(', '):'none required'}

REQUIREMENTS (blend into the narrative, don't turn into a list of sentences):
${includeDoctorName?`- Doctor name "${digest.doctor_name}" fused into a sentence that also carries a keyword.`:'- No doctor name.'}
${selectedConcern?`- Subtly address "${selectedConcern}", folded in, not standalone.`:''}
${selectedUSP?`- Reference "${selectedUSP}" once, folded in, not standalone.`:''}
- Never close with a chain of short generic sentences - every closing sentence needs a specific detail.
- Avoid generic templated phrases (e.g. "appointment felt organised", "staff was polite", "experience felt comfortable", "would definitely recommend", "highly satisfied") - describe specifics instead.
- ${allowEmoji?'Max 1 contextual emoji (👍 🦷 ⭐).':'No emoji.'}
- Tone: ${rating===1?'honest, specific complaints':rating===2?'mixed/disappointed but fair':rating===3?'balanced neutral':'genuine positive with specific details'}

ANTI-TEMPLATE RULE (most important): never write one sentence per requirement (opening feeling / keyword / concern each on their own line) - that's a robotic checklist. In every draft, at least ONE sentence must combine 2+ required elements (e.g. two keywords together, or the doctor's name with a keyword).

NATURAL VARIATION (open-ended, not a template): using the clinic/keyword information above, write each review the way a real patient would naturally write it - vary your opening style, angle, and structure freely across the ${TARGET_COUNT} drafts. Do not follow a fixed pattern or reuse the same kind of opening line across drafts. Let the specific details provided (and only those details) shape what each review focuses on and how it opens - don't invent a backstory or framing that isn't supported by the given information.

LENGTH: over many reviews generated across many patients, aim for roughly this natural spread: ${lengthDistribution}. Do not treat this as a rule for exactly these ${TARGET_COUNT} drafts - it's fine if two of them land in a similar range by chance. Just let length vary naturally with what each review needs to say; don't force artificial uniformity, and don't force artificial spread either.

GOOD example (narrative, combined elements): "My visit went well, and the doctor explained things clearly while also addressing my concerns about the best dental implant procedure. The staff was polite throughout, which helped me feel comfortable as I learned about teeth whitening options."

Return exactly ${TARGET_COUNT} reviews as JSON: [{"review": "..."}, {"review": "..."}, {"review": "..."}]`;

    // LAYER 3 prompt: same facts (clinic, rating tone, keywords, first-person, language), but with
    // the structural-variation/anti-template machinery (archetypes, personality variants, casing
    // profiles, length-distribution percentages, doctor-name/concern/USP fusion rules) stripped out.
    // Shorter prompt -> faster to process and fewer distinct instructions to satisfy at once, which
    // is exactly what a fallback layer needs: fewer ways for the response to come back malformed or
    // truncated, at the cost of some of the narrative variety the full prompt aims for.
    const simplifiedPrompt=`Write exactly ${TARGET_COUNT} authentic, first-person patient Google reviews, in ${digest.language==='hinglish'?'natural Hinglish (mixing Hindi and English words/phrases the way Indian patients actually text online)':'English'}.

Clinic: ${digest.doctor_name} at ${digest.clinic_name}${digest.primary_area?`, ${digest.primary_area}`:''} (${digest.specialization}).
Rating: ${rating} star${rating!==1?'s':''} - tone should be ${rating===1?'honest, specific complaints':rating===2?'mixed, disappointed but fair':rating===3?'balanced, neutral':'genuinely positive'}.
Naturally mention these keywords across the ${TARGET_COUNT} reviews (not necessarily every review): ${digest.high_priority_keywords.length?digest.high_priority_keywords.join(', '):'none required'}.
Write entirely in first person ("I visited", "my appointment", "I felt") - never describe "the patient" in third person.
Length: a few natural sentences each, varying a little review to review.
Make the ${TARGET_COUNT} reviews read like ${TARGET_COUNT} different people wrote them, not repeats of each other.

Return exactly ${TARGET_COUNT} reviews as JSON: [{"review": "..."}, {"review": "..."}, {"review": "..."}]`;

    // LAYER 4 (last resort) prompt: intentionally as minimal as a prompt can be while still meeting
    // the frontend's contract of exactly ${TARGET_COUNT} reviews (the drafts carousel/copy-tracking
    // flow expects 3 - dropping to 1 would mean a second, separate change to the frontend just to
    // handle this rare edge case, which isn't worth it when "3 short reviews from one minimal prompt"
    // is just as fast and just as reliable as "1 short review", but keeps the rest of the app
    // untouched). No tone/style guidance beyond rating + first person + a couple of keywords - the
    // fewest possible constraints, for the highest possible success rate when everything else failed.
    const minimalKeywords=(digest.high_priority_keywords.length?digest.high_priority_keywords:digest.selected_chips).slice(0,2);
    const minimalPrompt=`Write exactly ${TARGET_COUNT} short, natural, first-person Google reviews (2-3 sentences each) from a patient of ${digest.doctor_name} at ${digest.clinic_name}, in ${digest.language==='hinglish'?'Hinglish':'English'}. Each is a ${rating}-star review, first-person, naturally mentioning: ${minimalKeywords.length?minimalKeywords.join(', '):digest.clinic_name}. Make the ${TARGET_COUNT} reviews different from each other.

Return as JSON: [{"review": "..."}, {"review": "..."}, {"review": "..."}]`;

    // Call Gemini
    console.log('🔍 DIAGNOSIS START');
    console.log('Doctor ID:',doctorId);
    console.log('Selected Chips:',digest.selected_chips);
    console.log('High Priority Keywords:',digest.high_priority_keywords);
    console.log('Rating:',rating,'Language:',language);

    // Multi-layer fallback chain (replaces the old "retry the same model+prompt twice" approach).
    // Each layer changes SOMETHING about what's likely to be slow or fragile, instead of just hoping
    // a second identical roll of the dice goes better:
    //   Layer 1: full model (GEMINI_MODEL) + full prompt - best quality, tried first.
    //   Layer 2: lite model (GEMINI_MODEL_LITE) + SAME full prompt - less "thinking" overhead, so
    //            faster/less timeout-prone, while keeping the full narrative-variation instructions.
    //   Layer 3: lite model + simplified prompt - fewer instructions to satisfy at once, so fewer
    //            ways for the response to come back truncated/malformed.
    //   Layer 4 (last resort, tried separately below only if 1-3 all fail): lite model + a minimal
    //            prompt with almost no constraints beyond rating/keywords/first-person - the fastest,
    //            most reliable shape a request can take. This REPLACES the old static/hardcoded
    //            template fallback entirely - even the last resort is genuinely AI-generated.
    // CONFIRMED by real data: thinkingLevel:'low' brought latency down to 6868ms on the full model
    // (was timing out at 20000ms+ with the default "medium" thinking level). Google's own docs
    // (ai.google.dev/gemini-api/docs/generate-content/thinking) confirm the Gemini 3 family defaults
    // to "medium" thinking and cannot fully disable it - "low" is Google's documented setting for
    // minimizing latency/cost while keeping most quality, so every layer below uses it.
    type LayerNumber=1|2|3|4;
    type LayerAttempt={layer:LayerNumber;label:string;model:string;prompt:string;maxOutputTokens:number;timeoutMs:number};
    const primaryLayers:LayerAttempt[]=[
      {layer:1,label:'full_model+full_prompt',model:GEMINI_MODEL,prompt,maxOutputTokens:4096,timeoutMs:LAYER_TIMEOUTS_MS[1]},
      {layer:2,label:'lite_model+full_prompt',model:GEMINI_MODEL_LITE,prompt,maxOutputTokens:4096,timeoutMs:LAYER_TIMEOUTS_MS[2]},
      {layer:3,label:'lite_model+simplified_prompt',model:GEMINI_MODEL_LITE,prompt:simplifiedPrompt,maxOutputTokens:2048,timeoutMs:LAYER_TIMEOUTS_MS[3]},
    ];
    const lastResortLayer:LayerAttempt={layer:4,label:'lite_model+minimal_prompt(last_resort)',model:GEMINI_MODEL_LITE,prompt:minimalPrompt,maxOutputTokens:1200,timeoutMs:LAYER_TIMEOUTS_MS[4]};

    async function runLayer(cfg:LayerAttempt):Promise<{reviews:string[]|null;metrics:Record<string,unknown>}>{
      const attemptStartMs=Date.now();
      const approxPromptTokens=Math.round(cfg.prompt.length/4);
      const geminiPayload={
        contents:[{parts:[{text:cfg.prompt}]}],
        generationConfig:{
          // Raised from 0.85 - the open-ended NATURAL VARIATION instruction (replacing the fixed
          // framing menu/length brackets) relies on the model's own randomness to do more of the
          // variation work across drafts and across separate generations, so it needs more room to vary.
          temperature:0.95,
          topP:0.95,
          topK:40,
          thinkingConfig:{thinkingLevel:'low'},
          // maxOutputTokens is a COMBINED budget for thinking + visible output on Gemini 3 models -
          // confirmed via multiple independent real-world reports (e.g. googleapis/python-genai#2062).
          // 4096 for the full prompt (anti-template rule + 3 structural shapes + keyword weaving is a
          // real constraint-satisfaction problem) leaves ~2000 for 'low'-level thinking + ~1200 for the
          // actual 3-review JSON output, +margin. Layers 3/4 use a smaller budget since their prompts
          // ask for far less - a bigger ceiling doesn't cost latency, but there's no need for it either.
          maxOutputTokens:cfg.maxOutputTokens,
          responseMimeType:'application/json',
        },
      };
      // Structured per-layer metrics - deliberately one JSON blob per line so it can be grepped and
      // pasted straight into a spreadsheet/table across multiple real requests in production, and so
      // "how often are we falling back to Layer 2/3/4" is directly answerable from function logs.
      const metrics:Record<string,unknown>={layer:cfg.layer,label:cfg.label,model:cfg.model,promptChars:cfg.prompt.length,approxPromptTokens,maxOutputTokens:cfg.maxOutputTokens,timeoutMs:cfg.timeoutMs};
      try{
        const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},cfg.timeoutMs);
        metrics.latencyMs=Date.now()-attemptStartMs;
        // Surface any rate-limit-related headers Google returns, whether this attempt succeeded or
        // failed. Only logged if actually present - never fabricated.
        const rateLimitHeaders:Record<string,string>={};
        response.headers.forEach((value,key)=>{if(/ratelimit|retry-after|quota/i.test(key))rateLimitHeaders[key]=value});
        if(Object.keys(rateLimitHeaders).length)metrics.rateLimitHeaders=rateLimitHeaders;
        if(!response.ok){
          const errText=await response.text();
          metrics.outcome=`api_error_${response.status}`;
          console.error(`❌ Layer ${cfg.layer} (${cfg.label}) failed - GEMINI API ERROR`,{status:response.status,error:errText.slice(0,500)});
          return {reviews:null,metrics};
        }
        const envelope=await response.json() as any;
        // usageMetadata is Gemini's OWN reported token accounting - authoritative, not an estimate.
        if(envelope?.usageMetadata){
          metrics.usageMetadata={
            promptTokenCount:envelope.usageMetadata.promptTokenCount,
            candidatesTokenCount:envelope.usageMetadata.candidatesTokenCount,
            thoughtsTokenCount:envelope.usageMetadata.thoughtsTokenCount,
            totalTokenCount:envelope.usageMetadata.totalTokenCount,
          };
        }
        const parts=envelope?.candidates?.[0]?.content?.parts;
        if(!Array.isArray(parts)){
          metrics.outcome='invalid_response_structure';
          console.error(`❌ Layer ${cfg.layer} (${cfg.label}) failed - INVALID RESPONSE STRUCTURE`,{parts});
          return {reviews:null,metrics};
        }
        // Defensive hardening: parts are contiguous chunks of ONE text stream, not separate lines -
        // joining with '' (not '\n') avoids inserting a stray newline mid-string if Gemini ever
        // splits the answer across multiple parts.
        const modelText=parts.map((p:any)=>typeof p.text==='string'?p.text:'').filter(Boolean).join('');
        console.log(`📥 Layer ${cfg.layer} (${cfg.label}) RAW GEMINI RESPONSE:\n`,modelText);
        const parsed=parseReviews(modelText,TARGET_COUNT);
        if(parsed.reviews.length===TARGET_COUNT){
          metrics.outcome='success';
          console.log(`✅ Layer ${cfg.layer} (${cfg.label}) succeeded - parsed ${parsed.reviews.length} reviews in ${metrics.latencyMs}ms`);
          return {reviews:parsed.reviews,metrics};
        }
        // Distinct outcome per failure shape - 'truncated_json' specifically means maxOutputTokens ran
        // out mid-response (thinking + output share that budget on Gemini 3), separate from
        // 'malformed_json' (genuinely broken JSON) and 'wrong_review_count' (valid JSON, but not
        // exactly 3 usable reviews) - each points at a different fix.
        metrics.outcome=parsed.failureReason||'wrong_review_count';
        console.error(`❌ Layer ${cfg.layer} (${cfg.label}) failed - ${metrics.outcome} (parsed ${parsed.reviews.length}/${TARGET_COUNT} reviews)`);
        return {reviews:null,metrics};
      }catch(error){
        metrics.latencyMs=Date.now()-attemptStartMs;
        metrics.outcome=error instanceof Error&&/SLA/.test(error.message)?'timeout':'network_error';
        console.error(`❌ Layer ${cfg.layer} (${cfg.label}) threw`,error instanceof Error?error.message:String(error));
        return {reviews:null,metrics};
      }
    }

    let reviews:string[]|null=null;
    let succeededLayer:LayerAttempt|null=null;
    const attemptMetrics:Record<string,unknown>[]=[];
    for(const cfg of primaryLayers){
      const result=await runLayer(cfg);
      console.log('📊 ATTEMPT_METRICS',JSON.stringify(result.metrics));
      attemptMetrics.push(result.metrics);
      if(result.reviews){reviews=result.reviews;succeededLayer=cfg;break}
    }
    if(!reviews){
      console.log('⚠️  All 3 primary layers failed - falling through to Layer 4 (last-resort minimal AI call, NOT a static template)');
      const result=await runLayer(lastResortLayer);
      console.log('📊 ATTEMPT_METRICS',JSON.stringify(result.metrics));
      attemptMetrics.push(result.metrics);
      if(result.reviews){reviews=result.reviews;succeededLayer=lastResortLayer}
    }
    if(succeededLayer)console.log(`🎯 GENERATION SUCCEEDED at Layer ${succeededLayer.layer} (${succeededLayer.label}) using ${succeededLayer.model}`);

    // All 4 layers failed - return a clear failure, never a hardcoded template. The logSystemError
    // call below is what the dashboard's "N failures today" banner counts (app/dashboard/page.tsx
    // queries system_error_logs where endpoint='generate-review') - no new infra needed. Latency
    // summary is embedded in the message itself so production failures are diagnosable straight from
    // that table without needing to dig through function logs separately. Reaching this point means
    // 4 different model/prompt combinations all failed for this one request - genuinely rare.
    if(!reviews){
      const latencySummary=attemptMetrics.map(m=>`L${m.layer}:${m.outcome}@${m.latencyMs}ms`).join(', ');
      console.error(`❌ ALL 4 LAYERS FAILED. Returning success:false to client. [${latencySummary}]`);
      void logSystemError(db,doctorId,`Gemini generation failed after all 4 fallback layers: [${latencySummary}] promptChars=${prompt.length}`);
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

    // Save metadata. archetype/personality/doctor_name_included only reflect what was actually
    // requested when a Layer 1/2 success used the full prompt (which is what computes them) - a
    // Layer 3/4 success used a simplified/minimal prompt that never references them, so recording
    // them there would misleadingly imply structural variation was applied when it wasn't.
    const usedFullPrompt=succeededLayer!.layer<=2;
    const metadata={
      model:succeededLayer!.model,
      layer:succeededLayer!.layer,
      layer_label:succeededLayer!.label,
      doctor_id:doctorId,
      rating,
      language,
      target_count:TARGET_COUNT,
      review_count:reviews.length,
      archetype:usedFullPrompt?selectedArchetypeKey:null,
      personality:usedFullPrompt?personalityVariant:null,
      keywords_high:digest.high_priority_keywords,
      keywords_selected:digest.selected_chips,
      doctor_name_included:usedFullPrompt?includeDoctorName:null,
    };

    // Persist reviews - capture the inserted row ids (draft_index preserves batch order) so the
    // frontend can later tell us exactly which draft the patient copied (see selected_at/selected
    // columns, set by app/api/analytics/select-review when the patient clicks "Copy Review").
    let reviewIds:(string|null)[]=reviews.map(()=>null);
    try{
      const rows=reviews.map((content,i)=>({doctor_id:doctorId,content,embedding:null,generation_metadata:metadata,draft_index:i}));
      const {data:insertedRows,error}=await db.from('generated_reviews').insert(rows).select('id');
      if(error)console.error('Persist failed',error);
      else if(insertedRows)reviewIds=insertedRows.map(row=>row.id as string);
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

    const reviewsWithIds=reviews.map((content,i)=>({id:reviewIds[i],content}));
    return reply({success:true,reviews:reviewsWithIds,target_count:TARGET_COUNT,quality:{...metadata,timing_ms:totalMs}});

  }catch(error){
    const totalMs=Date.now()-requestStartMs;
    console.error('❌ Unhandled error after',totalMs,'ms:',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return fail('generation_unavailable',503);
  }
});
