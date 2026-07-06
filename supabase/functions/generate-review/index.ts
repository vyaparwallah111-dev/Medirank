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
type UsageType='doctor_name'|'clinic_name'|'area_name'|'treatment'|'superlative';
type LengthBand='short'|'medium'|'long';
const weightedLength=():LengthBand=>{const roll=Math.random();return roll<.4?'short':roll<.8?'medium':'long'};
const sentenceRange=(band:LengthBand)=>band==='short'?'1-2':band==='medium'?'3-4':'5-6';
const normalize=(value:string)=>value.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const opening=(value:string)=>normalize(value).split(' ').slice(0,4).join(' ');
function cosine(a:number[],b:number[]){if(!a.length||a.length!==b.length)return 0;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return aa&&bb?dot/(Math.sqrt(aa)*Math.sqrt(bb)):0}
async function embed(apiKey:string,content:string):Promise<number[]|null>{
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'models/gemini-embedding-001',content:{parts:[{text:content}]},outputDimensionality:256})});
    if(!response.ok){console.error('Embedding request failed',response.status,(await response.text()).slice(0,500));return null}
    const payload=await response.json() as {embedding?:{values?:number[]}};
    return Array.isArray(payload.embedding?.values)?payload.embedding.values:null;
  }catch(error){console.error('Embedding request threw',error);return null}
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
  return language==='hinglish'
    ? ['Mera clinic visit achha raha.','Doctor aur clinic staff ke saath mera overall experience positive raha.','Main clinic ke experience se satisfied hoon.','Mere visit ke basis par clinic ka experience achha raha.']
    : ['I had a positive experience during my clinic visit.','My overall visit with the doctor and clinic staff was good.','I am satisfied with my experience at the clinic.','Based on my visit, my experience with the clinic was positive.'];
}

Deno.serve(async(req)=>{
  let targetCount=4;
  let fallbackLanguage:'english'|'hinglish'='english';
  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return reply({error:'Method not allowed.'});
  try{
    let body:Record<string,unknown>;
    try{body=await req.json();fallbackLanguage=body.language==='hinglish'?'hinglish':'english'}catch(error){console.error('Invalid request JSON',error);return reply({error:'Invalid request payload.'})}
    const doctorId=text(body.doctor_id);
    if(!doctorId)return reply({error:'Missing doctor ID.'});
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){console.error('Missing Edge Function secrets',{hasUrl:!!url,hasServiceKey:!!serviceKey,hasGeminiKey:!!geminiKey});return reply({error:'Review service is not configured.'})}
    const db=createClient(url,serviceKey);
    const {data:doctor,error:doctorError}=await db.from('doctors').select('id,doctor_name,clinic_name,city,specialization,knowledge_base,subscription_tier,latitude,longitude,daily_review_cap').eq('id',doctorId).eq('is_active',true).maybeSingle();
    if(doctorError){console.error('Doctor lookup failed',doctorError);return reply({error:'Unable to load clinic details.'})}
    if(!doctor)return reply({error:'Clinic not found.'});

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

    const dailySince=new Date(Date.now()-86_400_000).toISOString();
    let generatedRowCount=0;
    try{
      const result=await db.from('generated_reviews').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',dailySince);
      if(result.error)console.error('24-hour request sequence lookup failed; defaulting to first request',result.error);
      else generatedRowCount=result.count||0;
    }catch(error){console.error('24-hour request sequence lookup threw; defaulting to first request',error)}
    const completedRequestCount=Math.ceil(generatedRowCount/targetCount);
    const requestSequence=completedRequestCount+1;
    const includeIdentity=[1,4,6].includes(requestSequence);

    let usageRows:Array<{usage_type:string}>=[];
    try{
      const result=await db.from('keyword_usage_log').select('usage_type').eq('doctor_id',doctor.id).gte('created_at',dailySince);
      if(result.error)console.error('Daily phrase-cap audit lookup failed; using defaults',result.error);
      else usageRows=result.data||[];
    }catch(error){console.error('Daily phrase-cap audit lookup threw; using defaults',error)}
    const usageCounts:Record<UsageType,number>={doctor_name:0,clinic_name:0,area_name:0,treatment:0,superlative:0};
    for(const row of usageRows||[]){const kind=row.usage_type as UsageType;if(kind in usageCounts)usageCounts[kind]++}
    const flags={
      include_doctor_name:includeIdentity,
      include_clinic_name:includeIdentity,
      include_area_name:usageCounts.area_name<4&&area!=='the local area',
      include_treatment:usageCounts.treatment<4&&!!selectedTreatment,
      include_superlative:usageCounts.superlative<3,
    };
    let history:Array<{id:string;content:string;embedding:unknown}>=[];
    try{
      const result=await db.from('generated_reviews').select('id,content,embedding').eq('doctor_id',doctor.id).order('created_at',{ascending:false}).limit(10);
      if(result.error)console.error('Review history audit lookup failed; continuing',result.error);
      else history=result.data||[];
    }catch(error){console.error('Review history audit lookup threw; continuing',error)}
    const recentOpenings=(history||[]).slice(0,5).map(item=>opening(item.content)).filter(Boolean);
    const historicalEmbeddings:number[][]=[];
    for(const item of history||[]){
      let vector=Array.isArray(item.embedding)?item.embedding.filter((value:unknown):value is number=>typeof value==='number'):[];
      if(!vector.length){const created=await embed(geminiKey,item.content);if(created){vector=created;try{const {error}=await db.from('generated_reviews').update({embedding:created}).eq('id',item.id);if(error)console.error('Embedding audit update failed; continuing',error)}catch(error){console.error('Embedding audit update threw; continuing',error)}}}
      if(vector.length)historicalEmbeddings.push(vector);
    }
    const lengthBands=Array.from({length:targetCount},weightedLength);

    const identityInstruction=includeIdentity
      ? `IDENTITY SEQUENCE ${requestSequence}: Naturally use the actual doctor name "${text(doctor.doctor_name)}" and clinic name "${text(doctor.clinic_name)}" across the review options. Mention each name at least once, without keyword stuffing or repeating either name in every option.`
      : `CRITICAL SAFETY RULE: You MUST NOT mention the specific names "${text(doctor.doctor_name)}" or "${text(doctor.clinic_name)}" anywhere in the text. Instead, strictly write the reviews using generic terms like "the doctor", "the dentist", "the clinic", "the team", or "the staff".`;
    const prompt=`Help a real patient draft honest Google review options based only on the factual details they selected.
${identityInstruction}
Location permission: ${flags.include_area_name?`You may naturally mention ${area} or ${city} in at most one option.`:'Do not mention any area, city, neighborhood, or location.'}
Service category: ${specialty}. Refer to the care provider only as ${providerTerm} or "the clinical staff".
Selected aspect: ${aspects.join(', ')||'good care'}. Treatment permission: ${flags.include_treatment?`You may mention the selected treatment "${selectedTreatment}" in at most one option.`:'Do not name or infer any treatment.'}
Patient rating: ${rating}/5. Patient factual note: ${customNotes||'None'}.
Language: ${language}.
Tone profile: ${personality}. ${personalities[personality]}
${language.startsWith('Hinglish')?'Generate natural Hinglish in Hindi written only in Latin script. Across the four variants, use natural Hindi-English vocabulary without Devanagari or awkward literal translations.':''}

CRITICAL: Follow the identity cap above exactly. Never invent a person, treatment outcome, waiting time, parking issue, seating issue, complaint, rating, or detail that the patient did not provide. Preserve the patient's actual ${rating}/5 rating and sentiment. ${flags.include_superlative?'A superlative may appear in at most one option and only when directly supported by the patient-selected wording.':'Do not use superlatives such as best, amazing, excellent, perfect, or outstanding.'}
Do not begin any option with these recently used opening patterns: ${recentOpenings.length?recentOpenings.join(' | '):'none'}.

STRUCTURAL VARIATION RULES FOR THE FOUR VARIANTS:
1. Option 1: ${sentenceRange(lengthBands[0])} sentences (${lengthBands[0]}), direct and conversational.
2. Option 2: ${sentenceRange(lengthBands[1])} sentences (${lengthBands[1]}), focused on selected facts only.
3. Option 3: ${sentenceRange(lengthBands[2])} sentences (${lengthBands[2]}), natural phrasing while preserving meaning.
4. Option 4: ${sentenceRange(lengthBands[3])} sentences (${lengthBands[3]}), ${language.startsWith('Hinglish')?'natural localized Hinglish using mixed Hindi-English vocabulary in Latin script.':'distinctly worded conversational English.'}

CRITICAL OUTPUT RULES:
Generate exactly ${targetCount} unique, distinct review variants separated by the tags [REVIEW] and [/REVIEW]. Vary lengths and perspectives naturally across the set. Reflect the rating honestly. If a patient note exists, preserve its factual meaning without exaggeration. Wrap every variant strictly inside [REVIEW] and [/REVIEW].
Write conversational Indian customer-style options. Do not keyword-stuff, manipulate ratings, or add unsupported claims.
Do not include any introduction, JSON, markdown, or surrounding conversational phrases.`;
    let reviews:string[]=[],reviewEmbeddings:Array<number[]|null>=[],similarities:number[]=[],generationAttempts=0;
    for(let attempt=1;attempt<=3;attempt++){
      generationAttempts=attempt;
      const model='gemini-2.5-flash';
      const retryDirection=attempt===1?'':`\nORIGINALITY RETRY ${attempt}: The previous draft was too close to prior reviews. Change syntax, cadence, perspective, sentence order, and vocabulary while preserving only supplied facts. Avoid these openings: ${recentOpenings.join(' | ')}.`;
      const attemptPrompt=prompt+retryDirection;
      const geminiPayload={contents:[{parts:[{text:attemptPrompt}]}],generationConfig:{temperature:Math.min(1,.78+attempt*.07),maxOutputTokens:2500}};
      console.log('Gemini request',{model,doctor_id:doctor.id,language,attempt,requestSequence,completedRequestCount,flags,lengthBands,usageCounts});
      try{
        const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)});
        const responseText=await response.text();
        if(!response.ok){console.error('Gemini HTTP error',{model,status:response.status,body:responseText.slice(0,1000)});continue}
        let envelope:unknown;
        try{envelope=JSON.parse(responseText)}catch(error){console.error('Gemini envelope parse failed',{model,error:error instanceof Error?error.message:String(error),body:responseText.slice(0,1000)});continue}
        const responseParts=(envelope as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>})?.candidates?.[0]?.content?.parts??[];
        const textResponse=responseParts.map(part=>text(part.text)).filter(Boolean).join('\n\n');
        console.log('Raw Gemini Output:',textResponse);
        const drafts=parseReviews(textResponse,targetCount);
        if(drafts.length<2){console.error('Gemini returned invalid review count',{model,targetCount,count:drafts.length});continue}
        const forbiddenIdentities=[
          ...(!flags.include_doctor_name?[text(doctor.doctor_name),text(doctor.doctor_name).replace(/^dr\.?\s*/i,'')]:[]),
          ...(!flags.include_clinic_name?[text(doctor.clinic_name)]:[]),
        ].map(normalize).filter(Boolean);
        if(forbiddenIdentities.length&&drafts.some(draft=>forbiddenIdentities.some(identity=>normalize(draft).includes(identity)))){
          console.error('Gemini violated 24-hour identity cap',{doctor_id:doctor.id,attempt});
          continue;
        }
        const vectors=await Promise.all(drafts.map(content=>embed(geminiKey,content)));
        const maxSimilarities=vectors.map((vector,index)=>{
          if(!vector)return 0;
          const comparison=[...historicalEmbeddings,...vectors.slice(0,index).filter((item):item is number[]=>Array.isArray(item))];
          return comparison.length?Math.max(...comparison.map(previous=>cosine(vector,previous))):0;
        });
        const duplicate=maxSimilarities.some(score=>score>.85);
        console.log('Originality check',{doctor_id:doctor.id,attempt,maxSimilarities,duplicate,embeddingAvailable:vectors.every(Boolean)});
        if(duplicate)continue;
        reviews=drafts;reviewEmbeddings=vectors;similarities=maxSimilarities;break;
      }catch(error){console.error('Gemini request threw',{model,error:error instanceof Error?error.message:String(error)})}
    }
    // If parsing/model retries fail, return conservative drafts derived only
    // from facts explicitly supplied by the patient. This keeps the patient
    // flow usable without weakening identity or keyword caps.
    if(reviews.length>=2){
      console.log(`Accepted partial generation: requested ${targetCount}, got ${reviews.length}`);
    }else{
      const aspect=aspects[0]||'';
      const treatment=flags.include_treatment&&selectedTreatment?selectedTreatment:'';
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
      reviews=Array.from(new Set([...reviews,...fallbackReviews].map(review=>review.trim()).filter(Boolean))).slice(0,targetCount);
      reviewEmbeddings=Array.from({length:reviews.length},()=>null);
      similarities=Array.from({length:reviews.length},()=>0);
      console.warn('Using policy-safe fallback reviews',{doctor_id:doctor.id,parsed_count:reviews.length,generationAttempts});
    }
    const insertRows=reviews.map((content,index)=>({doctor_id:doctor.id,content,embedding:reviewEmbeddings[index]||null,generation_metadata:{policy_version:'identity-sequence-v1',request_sequence_24h:requestSequence,completed_requests_24h:completedRequestCount,actual_patient_rating:rating,personality,location_verified:locationVerified,distance_meters:distanceMeters,length_band:lengthBands[index]||'short',sentence_target:sentenceRange(lengthBands[index]||'short'),actual_sentence_count:content.split(/[.!?]+/).map(value=>value.trim()).filter(Boolean).length,word_count:content.trim().split(/\s+/).filter(Boolean).length,opening_pattern:opening(content),flags,usage_counts_24h:usageCounts,generation_attempts:generationAttempts,max_similarity:similarities[index]||0,similarity_threshold:.85,embedding_model:'gemini-embedding-001',embedding_available:!!reviewEmbeddings[index],recent_openings_avoided:recentOpenings}}));
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
      if(flags.include_area_name&&[area,city].some(value=>value&&normalized.includes(normalize(value))))push('area_name',area);
      if(flags.include_treatment&&normalized.includes(normalize(selectedTreatment)))push('treatment',selectedTreatment);
      const usedSuperlative=['best','amazing','excellent','perfect','outstanding'].find(word=>new RegExp(`\\b${word}\\b`,'i').test(row.content));if(usedSuperlative)push('superlative',usedSuperlative);
    }
    if(usageLogs.length){
      try{const {error}=await db.from('keyword_usage_log').insert(usageLogs);if(error)console.error('Keyword usage audit insert failed; continuing',error)}
      catch(error){console.error('Keyword usage audit insert threw; continuing',error)}
    }
    const generatedAt=new Date().toISOString();
    try{const {error}=await db.from('review_generation_events').insert({doctor_id:doctor.id,fingerprint_hash:fingerprintHash,personality,location_verified:locationVerified,distance_meters:distanceMeters,created_at:generatedAt});if(error)console.error('Generation event audit insert failed; continuing',error)}
    catch(error){console.error('Generation event audit insert threw; continuing',error)}
    try{const {error}=await db.from('device_fingerprints').upsert({doctor_id:doctor.id,fingerprint_hash:fingerprintHash,location_verified:locationVerified,distance_meters:distanceMeters,generated_at:generatedAt},{onConflict:'doctor_id,fingerprint_hash'});if(error)console.error('Device fingerprint audit upsert failed; continuing',error)}
    catch(error){console.error('Device fingerprint audit upsert threw; continuing',error)}
    return reply({reviews,target_count:targetCount,quality:{request_sequence_24h:requestSequence,flags,length_bands:lengthBands,generation_attempts:generationAttempts,personality,location_verified:locationVerified}});
  }catch(error){
    console.error('Unhandled generate-review error; returning emergency drafts',error);
    return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:targetCount,quality:{fallback:true,generation_attempts:0}});
  }
});
