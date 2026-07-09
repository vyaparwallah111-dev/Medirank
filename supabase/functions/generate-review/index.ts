import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const GEMINI_MODEL='gemini-3.1-flash-lite';
const GEMINI_TIMEOUT_MS=7_000;
const TARGET_COUNT=4;
const ROUTING_CAP_24H=5;
const DAILY_KEYWORD_SEQUENCE_CAP=10;

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type Strategy='seo_injection'|'clean_ambient';
const text=(value:unknown,fallback='')=>typeof value==='string'&&value.trim()?value.trim():fallback;
const list=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&!!item.trim()).map(item=>item.trim()):[];
const unique=(items:string[],max=20)=>Array.from(new Set(items.map(item=>item.trim()).filter(Boolean))).slice(0,max);
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const jsonList=(value:unknown):string[]=>{
  if(Array.isArray(value))return list(value);
  if(typeof value==='string')return value.split(',').map(item=>item.trim()).filter(Boolean);
  if(value&&typeof value==='object')return Object.values(value as Record<string,unknown>).flatMap(jsonList);
  return [];
};
const indiaDayStart=()=>{const now=new Date();const india=new Date(now.getTime()+330*60_000);return new Date(Date.UTC(india.getUTCFullYear(),india.getUTCMonth(),india.getUTCDate())-330*60_000).toISOString()};
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('')}
const haversine=(lat1:number,lon1:number,lat2:number,lon2:number)=>{const rad=(value:number)=>value*Math.PI/180;const dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;return 6_371_000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};

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
  const clean=(value:string)=>value.replace(/^```(?:json|text)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{
    const parsed=JSON.parse(candidate) as unknown;
    if(Array.isArray(parsed))return unique(parsed.map(item=>typeof item==='string'?item:text((item as {review?:unknown})?.review)),expectedCount);
    if(parsed&&typeof parsed==='object'){
      const collection=(parsed as {reviews?:unknown;drafts?:unknown;options?:unknown}).reviews??(parsed as {drafts?:unknown}).drafts??(parsed as {options?:unknown}).options;
      if(Array.isArray(collection))return unique(collection.map(item=>typeof item==='string'?item:text((item as {review?:unknown})?.review)),expectedCount);
    }
  }catch{/* tolerate plain text */}
  return unique(candidate.split(/\n\s*\n+|---REVIEW_SPLIT---/).map(clean),expectedCount);
}

function ratingLayout(rating:number,language:Language,serviceKeyword:string){
  const service=serviceKeyword||'service';
  if(rating===1)return `rating_shape: 1 star. Sharp negative but constructive. Naturally embed "${service}" with direct friction context. Keep it fair, no threats, no unsafe medical claims.`;
  if(rating===2)return 'rating_shape: 2 stars. Casual low-satisfaction plain narrative. Sound disappointed but not dramatic.';
  if(rating===3)return 'rating_shape: 3 stars. Mid-tier neutral review, strictly 2 to 4 text lines per review.';
  return `rating_shape: ${rating} stars. Long comprehensive story-driven patient experience, exactly 10 to 12 text lines per review. Combine active name/locality inputs naturally when present.`;
}

function targetLineCount(rating:number){
  if(rating===3)return {min:2,max:4,target:3};
  if(rating>=4)return {min:10,max:12,target:10};
  return {min:1,max:5,target:3};
}

function shapeLines(content:string,rating:number,language:Language){
  const shape=targetLineCount(rating);
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

function emergencyDrafts(language:Language,rating=5){
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
    const doctorId=text(body.doctor_id);
    doctorIdForAudit=doctorId||null;
    if(!doctorId)return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});

    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){
      console.error('Missing Edge Function secrets',{hasUrl:!!url,hasServiceKey:!!serviceKey,hasGeminiKey:!!geminiKey});
      return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});
    }
    db=createClient(url,serviceKey);
    const {data:doctor,error:doctorError}=await db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base,latitude,longitude').eq('id',doctorId).eq('is_active',true).maybeSingle();
    if(doctorError){void logSystemError(db,doctorId,doctorError.message||'Doctor lookup failed');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}
    if(!doctor){void logSystemError(db,doctorId,'Clinic not found or inactive');return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}})}

    const deviceToken=text(body.device_token).slice(0,128);
    if(!deviceToken)return reply({error:'Unable to verify this device. Please refresh and try again.'},400);
    const browserSignature=(req.headers.get('user-agent')||'unknown').slice(0,300);
    const fingerprintHash=await sha256(`${doctor.id}|${deviceToken}|${browserSignature}`);
    const patientLatitude=typeof body.latitude==='number'?body.latitude:NaN,patientLongitude=typeof body.longitude==='number'?body.longitude:NaN;
    const hasPatientLocation=Number.isFinite(patientLatitude)&&Number.isFinite(patientLongitude)&&patientLatitude>=-90&&patientLatitude<=90&&patientLongitude>=-180&&patientLongitude<=180;
    const hasClinicLocation=Number.isFinite(doctor.latitude)&&Number.isFinite(doctor.longitude);
    let locationVerified:boolean|null=null,distanceMeters:number|null=null;
    if(hasPatientLocation&&hasClinicLocation){distanceMeters=Math.round(haversine(patientLatitude,patientLongitude,Number(doctor.latitude),Number(doctor.longitude)));locationVerified=distanceMeters<=500}

    const rollingSince=new Date(Date.now()-86_400_000).toISOString();
    const scanCountResult=await db.from('analytics_events').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).eq('event_type','scan').gte('created_at',rollingSince);
    if(scanCountResult.error)console.error('24-hour scan routing lookup failed; defaulting to gated route',scanCountResult.error);
    const scanSequence24h=Math.max(1,scanCountResult.count??1);
    const allowLanguageStep=scanSequence24h<=ROUTING_CAP_24H;
    const allowDetailForm=scanSequence24h<=ROUTING_CAP_24H;
    if(body.precheck_only===true)return reply({allowed:true,location_verified:locationVerified,distance_meters:distanceMeters,routing:{scan_sequence_24h:scanSequence24h,allow_language_step:allowLanguageStep,allow_detail_form:allowDetailForm}});

    const effectiveLanguage:Language=allowLanguageStep&&body.language==='hinglish'?'hinglish':'english';
    fallbackLanguage=effectiveLanguage;
    const rating=Math.min(5,Math.max(1,Math.round(Number(body.rating)||5)));
    const kb=(doctor.knowledge_base&&typeof doctor.knowledge_base==='object'?doctor.knowledge_base:{}) as KB;
    const primaryArea=text(body.primary_area,text(kb.area_name,text(doctor.city))).slice(0,120);
    const patientName=allowDetailForm?text(body.patient_name).slice(0,60):'';
    const patientLocality=allowDetailForm?text(body.patient_locality).slice(0,80):'';
    const customNotes=text(body.custom_notes).slice(0,500);

    const {data:keywordRows,error:keywordError}=await db.from('doctor_keywords').select('keyword,category').eq('doctor_id',doctor.id).order('created_at');
    if(keywordError)console.error('Doctor keyword lookup failed; continuing with supplied chips only',keywordError);
    const activeKeywords=unique((keywordRows||[]).map(row=>text(row.keyword)),20);
    const allowedKeywords=new Set(activeKeywords.map(normalize));
    const requestedChips=unique([...list(body.selected_chips),...list(body.selected_keywords),...list(body.selected_experiences),text(body.selected_chip)].filter(Boolean),5)
      .filter(item=>!allowedKeywords.size||allowedKeywords.has(normalize(item)));
    const selectedChips=requestedChips.length?requestedChips:activeKeywords.slice(0,2);
    const serviceKeyword=selectedChips[0]||activeKeywords[0]||'service';

    const dailySince=indiaDayStart();
    const dailyCountResult=await db.from('review_generation_events').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',dailySince);
    if(dailyCountResult.error)console.error('Daily generation sequence lookup failed; defaulting to first generation',dailyCountResult.error);
    const dailySequence=(dailyCountResult.count??0)+1;
    const strategy:Strategy=dailySequence<=DAILY_KEYWORD_SEQUENCE_CAP&&dailySequence%2===1?'seo_injection':'clean_ambient';
    const injectionKeywords=strategy==='seo_injection'?unique([doctor.clinic_name,primaryArea,patientLocality,...selectedChips,...activeKeywords],10):[];
    const blockedKeywords=strategy==='clean_ambient'?unique([doctor.clinic_name,doctor.doctor_name,primaryArea,patientLocality,...selectedChips,...activeKeywords],30):[];

    const structuralPrefix=`STRUCTURAL_LAYOUT_PREFIX_CACHE_V1
Return raw JSON array only, exactly ${TARGET_COUNT} strings. No markdown, no object wrapper.
Each string is one Google review draft. Keep language human, ordinary, and safe.
Do not invent medical outcomes, diagnosis, guaranteed relief, legal claims, discounts, or staff names.
Respect line breaks as real review lines.`;
    const strategyBlock=strategy==='seo_injection'
      ? `strategy: SEO injection. Naturally weave these exact mapped assets without stuffing: clinic_name="${text(doctor.clinic_name)}"; primary_area="${primaryArea||'not supplied'}"; selected_chips=${JSON.stringify(selectedChips)}; active_keywords=${JSON.stringify(activeKeywords.slice(0,10))}. Use at most 10 keyword assets total across the layout.`
      : `strategy: Clean ambient. Focus only on abstract user behavior, comfort, process, waiting, listening, clarity, or atmosphere. ZERO structural keywords: do not mention or paraphrase these exact assets: ${JSON.stringify(blockedKeywords)}. Do not mention clinic name, doctor name, locality, selected chips, treatments, or SEO terms.`;
    const executionLayout=`EXECUTION_LAYOUT
model: ${GEMINI_MODEL}
request_window: rolling_24h_scan_sequence=${scanSequence24h}; language_step_active=${allowLanguageStep}; form_fields_active=${allowDetailForm}
daily_generation_sequence: ${dailySequence}
language: ${effectiveLanguage==='hinglish'?'Hinglish in Latin script':'English'}
${strategyBlock}
${ratingLayout(rating,effectiveLanguage,strategy==='seo_injection'?serviceKeyword:'service')}
patient_inputs: name="${patientName||'inactive'}"; locality="${patientLocality||'inactive'}"; note="${customNotes||'none'}"
variation: make the ${TARGET_COUNT} drafts feel different in opening, pacing, and detail density.
Return only valid JSON array.`;

    let reviews:string[]=[];
    let generationAttempts=0;
    try{
      generationAttempts=1;
      const geminiPayload={
        systemInstruction:{parts:[{text:structuralPrefix}]},
        contents:[{parts:[{text:structuralPrefix},{text:executionLayout}]}],
        generationConfig:{temperature:.82,topP:.95,topK:40,maxOutputTokens:1200,responseMimeType:'application/json'},
      };
      console.log('Gemini request',{model:GEMINI_MODEL,doctor_id:doctor.id,scanSequence24h,dailySequence,strategy,rating,effectiveLanguage,maxOutputTokens:1200});
      const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},GEMINI_TIMEOUT_MS);
      const responseText=await response.text();
      if(!response.ok){
        console.error('Gemini HTTP error',{model:GEMINI_MODEL,status:response.status,body:responseText.slice(0,1000)});
        void logSystemError(db,doctor.id,`Gemini HTTP ${response.status}: ${responseText.slice(0,500)}`);
      }else{
        const envelope=JSON.parse(responseText) as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>};
        const modelText=(envelope.candidates?.[0]?.content?.parts??[]).map(part=>text(part.text)).filter(Boolean).join('\n\n');
        reviews=parseReviews(modelText,TARGET_COUNT).map(review=>shapeLines(review,rating,effectiveLanguage));
      }
    }catch(error){
      const message=error instanceof Error?error.message:String(error);
      console.error('Gemini request failed',{model:GEMINI_MODEL,error:message});
      void logSystemError(db,doctor.id,message);
    }

    if(reviews.length<TARGET_COUNT){
      reviews=unique([...reviews,...emergencyDrafts(effectiveLanguage,rating)],TARGET_COUNT).map(review=>shapeLines(review,rating,effectiveLanguage));
    }
    reviews=reviews.slice(0,TARGET_COUNT);

    if(strategy==='clean_ambient'&&blockedKeywords.length){
      const leaked=reviews.some(review=>blockedKeywords.some(keyword=>keyword&&normalize(review).includes(normalize(keyword))));
      if(leaked){
        console.error('Clean ambient output leaked structural keyword; using emergency drafts',{doctor_id:doctor.id,dailySequence});
        reviews=emergencyDrafts(effectiveLanguage,rating);
      }
    }

    const metadata={
      policy_version:'state-driven-24h-v1',
      model:GEMINI_MODEL,
      max_output_tokens:1200,
      scan_sequence_24h:scanSequence24h,
      allow_language_step:allowLanguageStep,
      allow_detail_form:allowDetailForm,
      daily_generation_sequence:dailySequence,
      strategy,
      keyword_injection_active:strategy==='seo_injection',
      keyword_injection_assets:injectionKeywords,
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
      const {error}=await db.from('review_generation_events').insert({doctor_id:doctor.id,fingerprint_hash:fingerprintHash,personality:strategy,location_verified:locationVerified,distance_meters:distanceMeters,created_at:generatedAt});
      if(error)console.error('Generation event audit insert failed; continuing',error);
    }catch(error){console.error('Generation event audit insert threw; continuing',error)}
    try{
      const fingerprintAudit={doctor_id:doctor.id,fingerprint_hash:fingerprintHash,location_verified:locationVerified,distance_meters:distanceMeters,generated_at:generatedAt};
      const {error}=await db.from('device_fingerprints').upsert(fingerprintAudit,{onConflict:'doctor_id,fingerprint_hash'});
      if(error)console.error('Device fingerprint audit upsert failed; continuing',error);
    }catch(error){console.error('Device fingerprint audit upsert threw; continuing',error)}

    return reply({reviews,target_count:TARGET_COUNT,quality:{...metadata,routing:{scan_sequence_24h:scanSequence24h,allow_language_step:allowLanguageStep,allow_detail_form:allowDetailForm}}});
  }catch(error){
    console.error('Unhandled generate-review error; returning emergency drafts',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true,generation_attempts:0}});
  }
});
