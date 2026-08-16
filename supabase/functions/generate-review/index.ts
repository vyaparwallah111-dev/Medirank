import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const headers={
  'Content-Type':'application/json',
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const GEMINI_MODEL=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash'; // Use env var, fallback to latest stable model
const GEMINI_TIMEOUT_MS=9_000; // Increased from 6s to allow for retries
const TARGET_COUNT=3;

type KB={area_name?:unknown;city_name?:unknown;top_services?:unknown};
type Language='english'|'hinglish';
type LengthBracket={key:string;min:number;max:number;target:number};
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
        ? ['Clinic visit ka experience achcha raha.','Mujhe positive vibes mila.','Doctor ke paas time tha mere liye.','Treatment process smooth tha.','Consultation meaningful thi.','Team cooperative tha.','Clinic atmosphere welcoming tha.','Pata chal gaya ki treatment kaise hoga.','Mera confidence badhta gaya.','Experience memorable raha.']
        : ['The clinic visit was worthwhile.','I had a positive experience.','The doctor was attentive to my needs.','The treatment process ran smoothly.','The consultation was meaningful.','The team was cooperative.','The atmosphere was welcoming.','I learned about the treatment plan.','My confidence grew during the visit.','The experience was memorable.']);
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
  const patternChoice=Math.floor(Math.random()*4);
  if(patternChoice===0){
    lines[0]=language==='hinglish'
      ? `Main ${identity}, ${first.replace(/^main\s+/i,'')}`
      : `I am ${identity}, and ${first.replace(/^I\s+/i,'')}`;
  }else if(patternChoice===1&&lines.length>0){
    const restOfContent=lines.slice(1).join('\n');
    lines[0]=first;
    lines.push(language==='hinglish'?`Main ${identity} hoon.`:`I'm ${identity}.`);
    if(restOfContent)lines.push(restOfContent);
  }else if(patternChoice===2&&safeName&&safeLocality){
    lines[0]=language==='hinglish'
      ? `${safeName} ko visit ke dauran ${first.replace(/^main\s+/i,'')}`
      : `During my visit, ${first.replace(/^I\s+/i,'').replace(/^my\s+/i,'')}. I'm from ${safeLocality}.`;
  }else{
    lines[0]=first;
    lines.splice(1,0,language==='hinglish'?`(Main ${identity} se hoon)`:`(I'm ${identity}.)`);
  }
  return shapeLines(lines.filter(Boolean).join('\n'),rating,language,lengthBracket);
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

function emergencyDrafts(language:Language,rating=5,keywords:string[]=[]){
  const keywordList=keywords.length>0?keywords:['service'];
  const getKeywordPhrase=()=>{
    if(keywordList.length===1)return keywordList[0];
    if(keywordList.length===2)return `${keywordList[0]} and ${keywordList[1]}`;
    return `${keywordList.slice(0,-1).join(', ')}, and ${keywordList[keywordList.length-1]}`;
  };
  const kw1=keywordList[0]||'service';
  const kw2=keywordList[1]||keywordList[0]||'treatment';
  const allKw=getKeywordPhrase();
  if(rating<=2){
    const seeds=language==='hinglish'
      ? [
        `Visit se expectations meet nahi hui.\n${kw1} mein kuch issues the.\n${kw2} ke quality mein improvement needed.\nProcess better ho sakti thi.`,
        `Experience low satisfaction wala tha.\nCommunication ${kw1} ke baare mein clearer hona chahiye tha.\n${kw2} procedure clear nahi tha.\nMain bas honest feedback de raha hoon.`,
        `Visit during ${kw1} treatment smooth nahi laga.\n${kw2} ke dauran coordination kharab tha.\nExplanation improve ho sakta tha.`,
        `${allKw} ke baare mein concerns the.\nFollow-up better ho sakta tha.\nStaff response improve ho sakte the.`,
      ]
      : [
        `The visit did not meet my expectations.\nThe ${kw1} process could be clearer.\n${kw2} quality needs improvement.\nThis needs better handling.`,
        `My ${kw1} experience felt unsatisfactory.\nCommunication about ${kw2} could have been better.\nI am leaving this as honest feedback.`,
        `The visit for ${kw1} did not feel smooth.\n${kw2} coordination could be improved.\nExplanation was not clear enough.`,
        `There were concerns about ${allKw}.\nThe follow-up could have been clearer.\nStaff response could improve.`,
      ];
    return seeds.map(seed=>shapeLines(seed,rating,language)).slice(0,TARGET_COUNT);
  }
  const seeds=language==='hinglish'
    ? [
      `Clinic visit ka experience theek raha.\n${kw1} treatment helpful tha aur doctor ne clearly samjhai.\n${kw2} ke baare mein mujhe confident feel hua.\nOverall mujhe comfortable feel hua.`,
      `Mera ${kw1} visit simple aur smooth raha.\nDoctor ne ${kw2} ke baare mein calmly guide kiya.\nClinic ka environment bhi neat tha.`,
      `Aaj ka visit manageable laga.\n${kw1} process clear tha aur ${kw2} ke baare mein samjh bhi mili.\nStaff ka response polite tha.`,
      `Clinic mein experience comfortable tha.\nDoctor ne ${allKw} ke concerns dhyan se sune.\nFollow-up clear aur helpful mili.`,
    ]
    : [
      `My clinic visit went well overall.\nThe ${kw1} treatment was explained clearly.\nI felt confident about ${kw2}.\nI felt comfortable and satisfied.`,
      `The appointment was comfortable and well managed.\nThe ${kw1} experience was handled smoothly.\nDoctor explained ${kw2} well.\nOverall it felt reassuring.`,
      `I visited for ${kw1} with some doubts.\nThe doctor explained ${kw2} carefully.\nThe clinic experience felt professional.`,
      `The clinic felt clean and organised.\nThe staff addressed ${allKw} comprehensively.\nOverall, it was a positive visit.`,
    ];
  return seeds.map(seed=>shapeLines(seed,rating,language)).slice(0,TARGET_COUNT);
}

Deno.serve(async(req)=>{
  let db:ReturnType<typeof createClient>|null=null;
  let doctorIdForAudit:string|null=null;
  const fallbackLanguage:Language='english';

  if(req.method==='OPTIONS')return reply({ok:true});
  if(req.method!=='POST')return reply({reviews:emergencyDrafts(fallbackLanguage),target_count:TARGET_COUNT,quality:{fallback:true}});

  try{
    const requestStartMs=Date.now();
    // Parse request
    let body:Record<string,unknown>;
    try{body=await req.json()}
    catch(error){console.error('Invalid JSON',error);return reply({reviews:emergencyDrafts('english'),target_count:TARGET_COUNT,quality:{fallback:true}})}

    const doctorId=sanitizeText(body.doctor_id,80);
    doctorIdForAudit=doctorId;
    if(!doctorId||!uuidPattern.test(doctorId))return reply({reviews:emergencyDrafts('english'),target_count:TARGET_COUNT,quality:{fallback:true}});

    // Initialize DB
    const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),geminiKey=Deno.env.get('GEMINI_API_KEY');
    if(!url||!serviceKey||!geminiKey){
      console.error('Missing secrets');
      return reply({reviews:emergencyDrafts('english'),target_count:TARGET_COUNT,quality:{fallback:true}});
    }
    db=createClient(url,serviceKey);

    // Build ClientDigest - fetch all data in parallel
    const language:Language=body.language==='hinglish'?'hinglish':'english';
    const rating=Math.min(5,Math.max(1,Math.round(Number(body.rating)||5)));
    const deviceToken=sanitizeText(body.device_token,128);
    if(!deviceToken)return reply({error:'Unable to verify device'},400);

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
      return reply({reviews:emergencyDrafts(language),target_count:TARGET_COUNT,quality:{fallback:true}});
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
    const lengthBracket=selectLengthBracket(rating);
    const selectedArchetypeKey=mapToneToArchetype(digest.tone_preference,[]);
    const selectedArchetype=STRUCTURE_ARCHETYPES[selectedArchetypeKey];
    const personalityVariant=selectPersonalityVariant([]);
    const casingProfile=randomItem(casingProfiles);
    const includeDoctorName=Math.random()<0.45;
    const allowEmoji=rating>=4&&Math.random()<0.45;

    const allKeywords=unique([...digest.high_priority_keywords,...digest.medium_keywords,...digest.low_keywords,...digest.selected_chips],10);
    const selectedConcern=rating>=4&&digest.patient_concerns.length?randomItem(digest.patient_concerns):null;
    const selectedUSP=digest.usp_points.length?randomItem(digest.usp_points):null;

    // Blocked phrases
    const blockedPhrases=[
      'sharing genuine','overall good','highly satisfied','recently visited','my experience was',
      'I would definitely recommend','five-star','would rate','everything was perfect','best clinic',
      'without a doubt','The appointment felt organised from the start','The reception process was simple',
      'The doctor listened to my concerns carefully','The explanation was calm and clear',
      'The clinic environment felt clean','The staff response was polite','The visit did not feel rushed',
      'I understood the next steps properly','Overall the experience felt comfortable','I felt satisfied with my visit'
    ];

    const prompt=`You are a Google review generator for a clinic. Generate exactly ${TARGET_COUNT} authentic patient reviews.

CLINIC CONTEXT:
- Doctor: ${digest.doctor_name}
- Clinic: ${digest.clinic_name}
- Location: ${digest.primary_area}${digest.secondary_area?`, also serves ${digest.secondary_area}`:''}
- Specialization: ${digest.specialization}

RATING: ${rating} star${rating!==1?'s':''}
LANGUAGE: ${digest.language==='hinglish'?'Hinglish (mix Hindi & English)':'English'}
LENGTH: ${lengthBracket.min}-${lengthBracket.max} lines per review, target ${lengthBracket.target}
STYLE: ${selectedArchetype}
TONE: ${personalityVariant}
CASING: ${casingProfile}

KEYWORDS (MANDATORY - MUST appear 2+ times per review in different sentences):
${digest.high_priority_keywords.map((kw,i)=>`- HIGH PRIORITY ${i+1}: "${kw}" (use in every review, naturally)`).join('\n')}
${digest.selected_chips.length?digest.selected_chips.map((kw,i)=>`- SELECTED ${i+1}: "${kw}"`).join('\n'):''}

REQUIREMENTS:
1. Each keyword marked HIGH PRIORITY must appear 2-3 times per review in different sentences
2. Use selected keywords naturally in context
3. ${digest.patient_name&&digest.patient_locality?`Naturally include exact name "${digest.patient_name}" and locality "${digest.patient_locality}" (use varied placements: opening, middle, or end - NOT always "I am X from Y")`:`Patient context: ${digest.patient_name?`include name "${digest.patient_name}"`:''}${digest.patient_locality?`include locality "${digest.patient_locality}"`:''}. Vary placement patterns.`}
4. ${includeDoctorName?`Include doctor name "${digest.doctor_name}" naturally in ~50% of reviews, combined with a treatment keyword`:'Do not mention any doctor name'}
5. ${selectedConcern?`Subtly address: "${selectedConcern}" (only for positive tone)`:''}
6. ${selectedUSP?`Naturally mention: "${selectedUSP}" (once if relevant)`:''}
7. Real patient voice - no robotic lists, natural flow, varying sentence lengths
8. ${allowEmoji?'Allow max 1 contextual emoji per review (👍 🦷 ⭐)':"No emoji"}
9. NEVER use these exact phrases: ${blockedPhrases.map(p=>`"${p}"`).join(', ')}
10. Rating must match tone: ${rating===1?'honest complaints':''}${rating===2?'disappointed but fair':''}${rating===3?'neutral/mixed':''}${rating>=4?'positive & authentic':''}

OUTPUT FORMAT:
Return exactly ${TARGET_COUNT} reviews as JSON:
[
  {"review": "review text here"},
  {"review": "review text here"},
  {"review": "review text here"}
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
        maxOutputTokens:Math.min(lengthBracket.max*25*TARGET_COUNT+100,2000),
        responseMimeType:'application/json',
      },
    };

    console.log('📤 Sending to Gemini prompt with keywords:',digest.high_priority_keywords);
    console.log('Prompt length:',prompt.length,'chars');

    const geminiStartMs=Date.now();
    const response=await fetchWithSla(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(geminiPayload)},GEMINI_TIMEOUT_MS);
    const geminiMs=Date.now()-geminiStartMs;
    console.log(`⏱️  Gemini API call: ${geminiMs}ms`);

    if(!response.ok){
      const errText=await response.text();
      console.error('❌ GEMINI API ERROR',{status:response.status,error:errText.slice(0,500)});
      void logSystemError(db,doctorId,`Gemini ${response.status}: ${errText.slice(0,300)}`);
      const fallback=emergencyDrafts(language,rating,digest.selected_chips);
      console.log('⚠️  USING FALLBACK (API ERROR) - emergencyDrafts called with keywords:',digest.selected_chips);
      return reply({reviews:fallback,target_count:TARGET_COUNT,quality:{fallback:true,api_error:true}});
    }

    const envelope=await response.json() as any;
    const parts=envelope?.candidates?.[0]?.content?.parts;
    if(!Array.isArray(parts)){
      console.error('❌ INVALID RESPONSE STRUCTURE - parts is not array',{parts});
      const fallback=emergencyDrafts(language,rating,digest.selected_chips);
      console.log('⚠️  USING FALLBACK (PARSE ERROR) - emergencyDrafts called with keywords:',digest.selected_chips);
      return reply({reviews:fallback,target_count:TARGET_COUNT,quality:{fallback:true,parse_error:true}});
    }

    const modelText=parts.map((p:any)=>typeof p.text==='string'?p.text:'').filter(Boolean).join('\n');
    console.log('📥 RAW GEMINI RESPONSE (first 500 chars):\n',modelText.slice(0,500));

    let reviews=parseReviews(modelText,TARGET_COUNT);
    console.log('✅ PARSED',reviews.length,'reviews from Gemini');

    // Lightweight duplicate check - only check first line
    if(reviews.length===TARGET_COUNT){
      console.log('🔍 Checking duplicates against',recentReviews.length,'recent reviews');
      const recentFirstLines=recentReviews.map(r=>{
        const firstLine=(typeof r.content==='string'?r.content:'').split(/\n/)[0]?.toLowerCase()||'';
        return firstLine.split(/\s+/).slice(0,6).join(' ');
      });

      // NOTE: Duplicate retry disabled to prevent timeout (was making second API call)
      // Duplicates will be handled by fallback if needed
      let duplicateCount=0;
      for(let i=0;i<reviews.length;i++){
        const newFirstLine=reviews[i].split(/\n/)[0]?.toLowerCase().split(/\s+/).slice(0,6).join(' ')||'';
        for(const recentLine of recentFirstLines){
          const common=newFirstLine.split(/\s+/).filter(w=>recentLine.includes(w)).length;
          const similarity=common/Math.max(newFirstLine.split(/\s+/).length,1);
          if(similarity>0.65){duplicateCount++;break}
        }
      }
      if(duplicateCount>0)console.log('ℹ️  Detected',duplicateCount,'potential duplicates (retry disabled for performance)');
    }

    // Fallback if not enough reviews
    if(reviews.length<TARGET_COUNT){
      console.log('⚠️  Only',reviews.length,'reviews from Gemini, using emergencyDrafts with keywords:',digest.selected_chips);
      reviews=[...reviews,...emergencyDrafts(language,rating,digest.selected_chips)].slice(0,TARGET_COUNT);
      console.log('ℹ️  Total after fallback:',reviews.length);
    }else{
      console.log('✅ All',reviews.length,'reviews from Gemini (no fallback needed)');
    }

    // Post-processing (name/area injection, doctor name injection)
    console.log('📝 Before post-processing:');
    reviews.forEach((r,i)=>console.log(`Review ${i}: ${r.slice(0,100)}...`));

    reviews=reviews.map(review=>{
      let processed=review;
      if(includeDoctorName&&!normalize(processed).includes(normalize(digest.doctor_name))){
        processed=injectDoctorName(processed,digest.doctor_name,rating,language,lengthBracket);
      }
      if((digest.patient_name||digest.patient_locality)&&!normalize(processed).includes(normalize(digest.patient_name+' '+digest.patient_locality))){
        processed=injectPatientContext(processed,digest.patient_name,digest.patient_locality,rating,language,lengthBracket);
      }
      return processed;
    });

    console.log('📋 FINAL OUTPUT - 3 reviews being returned:');
    reviews.forEach((r,i)=>{
      console.log(`\n=== REVIEW ${i+1} ===`);
      console.log(r);
      console.log('---');
      console.log('Contains high-priority keywords:');
      digest.high_priority_keywords.forEach(kw=>{
        const count=(r.match(new RegExp(kw,'gi'))||[]).length;
        console.log(`  "${kw}": ${count} times`);
      });
    });

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
      const {error}=await db.from('review_generation_meta').insert({
        doctor_id:doctorId,
        rating,
        language,
        structure_archetype_key:selectedArchetypeKey,
        structure_archetype:selectedArchetype,
        personality_variant:personalityVariant,
        casing_profile:casingProfile,
        created_at:new Date().toISOString(),
      });
      if(error)console.error('Meta persist failed',error);
    }catch(error){console.error('Meta persist threw',error)}

    const totalMs=Date.now()-requestStartMs;
    console.log(`⏱️  TOTAL REQUEST TIME: ${totalMs}ms (DB: ${dbMs}ms + Gemini: ${geminiMs}ms + overhead)`);

    return reply({reviews,target_count:TARGET_COUNT,quality:{...metadata,timing_ms:totalMs}});

  }catch(error){
    const totalMs=Date.now()-requestStartMs;
    console.error('❌ Unhandled error after',totalMs,'ms:',error);
    void logSystemError(db,doctorIdForAudit,error instanceof Error?error.message:String(error));
    return reply({reviews:emergencyDrafts('english'),target_count:TARGET_COUNT,quality:{fallback:true,error_after_ms:totalMs}});
  }
});
