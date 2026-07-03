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

function parseReviews(raw:unknown,expectedCount:number):string[]{
  if(typeof raw!=='string')return [];
  const reviewsArray:string[]=[];
  // A closing tag is optional: the next opening tag (or end of text) is also
  // a valid boundary. Gemini sometimes omits or adds spaces inside closing tags.
  const tagRegex=/\[\s*REVIEW\s*\]([\s\S]*?)(?=\[\s*\/\s*REVIEW\s*\]|\[\s*REVIEW\s*\]|$)/gi;
  let match:RegExpExecArray|null;
  while((match=tagRegex.exec(raw))!==null){
    const cleanReview=match[1].replace(/\[\s*\/\s*REVIEW\s*\]/gi,'').trim();
    if(cleanReview)reviewsArray.push(cleanReview);
  }
  if(reviewsArray.length===expectedCount)return reviewsArray;

  const withoutTags=raw.replace(/\[\s*\/?\s*REVIEW\s*\]/gi,'').trim();

  // Accept output from the previous prompt contract during deployment overlap.
  const delimited=withoutTags.split('---REVIEW_SPLIT---').map(review=>review.trim()).filter(Boolean);
  if(delimited.length===expectedCount)return delimited;

  // Last-resort recovery for models that emit numbered blocks despite the tags.
  const numbered=withoutTags.split(/(?:^|\n)\s*(?:review(?:\s*variant)?\s*)?[1-5][.):\-]\s*/gi).map(review=>review.trim()).filter(Boolean);
  if(numbered.length===expectedCount)return numbered;

  // If the model ignored every marker but returned three separated paragraphs,
  // preserve those otherwise valid reviews.
  const paragraphs=withoutTags.split(/\n\s*\n+/).map(review=>review.trim()).filter(Boolean);
  if(paragraphs.length===expectedCount)return paragraphs;
  console.error('Review parser diagnostics',{expectedCount,tagged:reviewsArray.length,delimited:delimited.length,numbered:numbered.length,paragraphs:paragraphs.length});
  return reviewsArray;
}

Deno.serve(async(req)=>{
  let targetCount=4;
  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return reply({error:'Method not allowed.'});
  try{
    let body:Record<string,unknown>;
    try{body=await req.json()}catch(error){console.error('Invalid request JSON',error);return reply({error:'Invalid request payload.'})}
    const doctorId=text(body.doctor_id);
    if(!doctorId)return reply({error:'Missing doctor ID.'});
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){console.error('Missing Edge Function secrets',{hasUrl:!!url,hasServiceKey:!!serviceKey,hasGeminiKey:!!geminiKey});return reply({error:'Review service is not configured.'})}
    const db=createClient(url,serviceKey);
    const {data:doctor,error:doctorError}=await db.from('doctors').select('id,city,specialization,knowledge_base,subscription_tier').eq('id',doctorId).eq('is_active',true).maybeSingle();
    if(doctorError){console.error('Doctor lookup failed',doctorError);return reply({error:'Unable to load clinic details.'})}
    if(!doctor)return reply({error:'Clinic not found.'});

    const subscriptionTier=text(doctor.subscription_tier,'starter').toLowerCase();
    const isStarter=subscriptionTier==='starter';
    const isGrowth=subscriptionTier==='growth';
    const language=isStarter?'English':body.language==='hinglish'?'Hinglish (Latin script)':'English';

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

    const since=new Date(Date.now()-3_600_000).toISOString();
    const {count,error:countError}=await db.from('generated_reviews').select('*',{count:'exact',head:true}).eq('doctor_id',doctor.id).gte('created_at',since);
    if(countError)console.error('Rate-limit lookup failed',countError);
    if((count||0)>=15)return reply({error:'Hourly limit reached. Please try again soon.'});

    const prompt=`Help a real patient draft an honest Google review based only on the factual details they selected.
Location: ${area}, ${city}. Service category: ${specialty}. Refer to the care provider only as ${providerTerm} or "the clinical staff".
Selected aspect: ${aspects.join(', ')||'good care'}. Selected treatment: ${selectedTreatment}.
Patient rating: ${rating}/5. Patient factual note: ${customNotes||'None'}.
Language: ${language}.
${isStarter?'Use English only.':''}
${isGrowth&&language.startsWith('Hinglish')?'Generate natural, high-converting Hinglish in Hindi written only in Latin script. Across the four variants, include natural Hinglish-led options as well as pure English options so the patient can choose. Avoid Devanagari and awkward literal translations.':''}

CRITICAL: Never mention specific doctor names, employee names, or terms like "Dr. Avinash" or "Dr. Verma". Use generic terms like "the specialist", "the clinical staff", "the dentist", or "the physician" depending on the service category. Never invent a person, treatment outcome, or detail that the patient did not provide.

STRUCTURAL VARIATION RULES FOR THE FOUR VARIANTS:
1. One ultra-short, casual, single-line review.
2. Two or three short lines focused only on clinic hygiene or wait time; use only facts present in the selected inputs and omit unsupported claims.
3. A direct conversational review with naturally imperfect grammar, while preserving the patient's meaning.
4. ${isGrowth&&language.startsWith('Hinglish')?'Natural localized Hinglish using mixed Hindi-English vocabulary in Latin script.':'A distinctly worded, concise conversational English review.'}

CRITICAL OUTPUT RULES:
Generate exactly ${targetCount} unique, distinct review variants separated by the tags [REVIEW] and [/REVIEW]. Vary lengths and perspectives naturally across the set. Reflect the rating honestly. If a patient note exists, preserve its factual meaning without exaggeration. Wrap every variant strictly inside [REVIEW] and [/REVIEW].
Write a short, conversational, and raw Indian customer style review. For each variant, use ONLY 2 or 3 of the injected keywords naturally. Do not stuff all terms into a single sentence. Keep every review under 2-3 lines so it passes human review validation.
Do not include any introduction, JSON, markdown, or surrounding conversational phrases.`;
    let reviews:string[]=[];
    for(const model of ['gemini-2.5-flash']){
      const geminiPayload={contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:.8,maxOutputTokens:2500}};
      console.log('Gemini request',{model,doctor_id:doctor.id,area_name:area,city_name:city,selected_treatment_keyword:selectedTreatment,language,prompt,payload:geminiPayload});
      try{
        const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)});
        const responseText=await response.text();
        if(!response.ok){console.error('Gemini HTTP error',{model,status:response.status,body:responseText.slice(0,1000)});continue}
        let envelope:unknown;
        try{envelope=JSON.parse(responseText)}catch(error){console.error('Gemini envelope parse failed',{model,error:error instanceof Error?error.message:String(error),body:responseText.slice(0,1000)});continue}
        const textResponse=(envelope as {candidates?:Array<{content?:{parts?:Array<{text?:string}>}}>})?.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('Raw Gemini Output:',textResponse);
        reviews=parseReviews(textResponse,targetCount);
        if(reviews.length===targetCount)break;
        console.error('Gemini returned invalid review count',{model,targetCount,count:reviews.length,raw:textResponse});
      }catch(error){console.error('Gemini request threw',{model,error:error instanceof Error?error.message:String(error)})}
    }
    // If we got at least 2 reviews, accept it and don't crash the UI.
    if(reviews.length>=2){
      console.log(`Accepted partial generation: requested ${targetCount}, got ${reviews.length}`);
    }else{
      // Only throw if generation is empty or returned fewer than 2 variants.
      throw new Error(`Insufficient review count: got ${reviews.length}`);
    }
    const {error:insertError}=await db.from('generated_reviews').insert(reviews.map(content=>({doctor_id:doctor.id,content})));
    if(insertError)console.error('Generated review insert failed',insertError);
    return reply({reviews,target_count:targetCount});
  }catch(error){console.error('Unhandled generate-review error',error);return reply({error:error instanceof Error?error.message:'Unexpected review service error.'})}
});
