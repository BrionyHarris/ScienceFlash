import { useState, useEffect, useRef } from "react";
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ── SUPABASE ──
const SB_URL = "https://qglbenrgjxjjygtoslge.supabase.co";
const SB_KEY = "sb_publishable_iKBrFrvnDdgyngPF1mEahA_cUN1Yqa5";
async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}`, "Content-Type":"application/json", ...opts.headers } });
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function sbDelete(k) {
  const r = await fetch(`${SB_URL}/rest/v1/kv_store?key=eq.${encodeURIComponent(k)}`, { method:"DELETE", headers:{ "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}`, "Prefer":"return=representation" } });
  const t = await r.text(); let data=null; try{data=t?JSON.parse(t):null}catch{}
  return { ok: r.ok, status: r.status, deleted: Array.isArray(data)?data.length:0, body: t };
}
async function sbSet(k, v) { await sbFetch("kv_store?on_conflict=key", { method:"POST", headers:{"Prefer":"resolution=merge-duplicates,return=representation"}, body:JSON.stringify({key:k,value:JSON.stringify(v)}) }); }
async function sbGet(k) { const r = await sbFetch(`kv_store?key=eq.${encodeURIComponent(k)}&select=value`); if(!r||!r.length) return null; try{return JSON.parse(r[0].value)}catch{return r[0].value} }
async function sbList(prefix) { const r = await sbFetch(`kv_store?key=like.${encodeURIComponent(prefix+"%")}&select=key,value`); return r || []; }
const PFX = "sci_progress_";
const CQ_KEY = "sci_custom_questions";
async function loadProgress(uid) { try{return await sbGet(PFX+uid)||{}}catch{return{}} }
async function saveProgress(uid, p) { try{await sbSet(PFX+uid, p)}catch(e){console.error(e)} }
async function loadCustomQs() { try{return await sbGet(CQ_KEY)||[]}catch{return[]} }
async function saveCustomQs(qs) { try{await sbSet(CQ_KEY, qs)}catch(e){console.error(e)} }
async function loadAllProgress() {
  try { const rows = await sbList(PFX); return rows.map(r => { const name = r.key.replace(PFX,"").replace(/_/g," "); let prog={}; try{prog=JSON.parse(r.value)}catch{} return {name,progress:prog}; }); } catch{return[]}
}

// ── SPACED REPETITION ──
const IV = [1,2,4,7,14,21];
function nextIv(cur,q){if(q>=.8){const i=IV.indexOf(cur);return i>=0&&i<IV.length-1?IV[i+1]:cur}if(q>=.4)return cur;return 1}
function isDue(ts){if(!ts?.nextDate)return true;return new Date()>=new Date(ts.nextDate)}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r.toISOString()}
function getConf(ts){if(!ts||!ts.total)return"not started";const p=ts.total>0?ts.correct/ts.total:0;if(p>=.8&&(ts.interval||1)>=7)return"confident";if(p>=.5)return"getting there";return"needs work"}

// ── ANSWER CHECKING ──
const FILL=new Set(["a","an","the","is","are","it","its","they","them","their","that","this","these","those","of","to","in","by","for","from","with","and","or","be","been","being","was","were","has","have","had","do","does","did","will","would","can","could","should","may","might","shall","also","very","much","more","most","some","any","all","each","every","both","which","what","when","where","how","who","whom","whose","there","here","then","than","so","as","at","on","up","into","out","about","because","if","but","not","no","yes","called","known","used","using","allows","causes","means"]);
function norm(s){return s.toLowerCase().trim().replace(/\s+/g," ").replace(/['']/g,"'").replace(/[""]/g,'"').replace(/\.$/,"")}
function strip(s){return s.split(/\s+/).filter(w=>!FILL.has(w)).join(" ")}
function kws(s){return norm(s).split(/[\s,;:.()\-/]+/).filter(w=>w.length>1&&!FILL.has(w))}
function levDist(a,b){if(!a.length)return b.length;if(!b.length)return a.length;const m=[];for(let i=0;i<=b.length;i++)m[i]=[i];for(let j=0;j<=a.length;j++)m[0][j]=j;for(let i=1;i<=b.length;i++)for(let j=1;j<=a.length;j++){if(b[i-1]===a[j-1])m[i][j]=m[i-1][j-1];else m[i][j]=Math.min(m[i-1][j-1]+1,m[i][j-1]+1,m[i-1][j]+1)}return m[b.length][a.length]}
function fuzzyMatch(a,b){const la=a.length,lb=b.length;if(la<3||lb<3)return a===b;const maxLen=Math.max(la,lb);const d=levDist(a,b);const allow=maxLen<=5?1:maxLen<=10?2:Math.floor(maxLen*0.2);return d<=allow}
function fuzzyKws(s){return norm(s).split(/[\s,;:.()\-/]+/).filter(w=>w.length>1)}
function checkAns(ur,cr,alts=[]){
  const u=norm(ur);if(!u)return false;
  for(const c of[cr,...alts]){const n=norm(c);if(u===n)return true;if(u.replace(/[\s,.\-;:()]/g,"")===n.replace(/[\s,.\-;:()]/g,""))return true;const us=strip(u),cs=strip(n);if(us&&cs&&us===cs)return true;if(us&&cs&&us.replace(/[\s,.\-;:()]/g,"")===cs.replace(/[\s,.\-;:()]/g,""))return true}
  for(const c of[cr,...alts]){const ck=kws(c);if(ck.length<=2)continue;const uk=kws(ur);let m=0;for(const k of ck){if(uk.some(u2=>u2===k||u2.startsWith(k.slice(0,-1))||k.startsWith(u2.slice(0,-1))))m++}if(m/ck.length>=.75&&m>=2)return true}
  for(const c of[cr,...alts]){if(fuzzyMatch(u,norm(c)))return true;if(fuzzyMatch(strip(u),strip(norm(c))))return true;const uk=fuzzyKws(ur),ck=fuzzyKws(c);if(ck.length>=2&&uk.length>=2){let m=0;for(const k of ck){if(uk.some(u2=>fuzzyMatch(u2,k)))m++}if(m/ck.length>=.75&&m>=2)return true}}
  return false;
}

// ── REVISION LINKS ──
const LINKS = [
  {name:"Cognito",url:"https://cognitoedu.org/home",desc:"Free videos & past papers — sign up to track progress",emoji:"🎓",color:"#6366f1"},
  {name:"Free Science Lessons",url:"https://www.freesciencelessons.co.uk/",desc:"GCSE science videos organised by topic",emoji:"🎬",color:"#22c55e"},
  {name:"Mr Exham (YouTube)",url:"https://www.youtube.com/c/MrExham/videos",desc:"Biology revision videos",emoji:"🧬",color:"#ef4444"},
  {name:"The Heart",url:"https://www.youtube.com/watch?v=X9ZZ6tcxArI",desc:"GCSE Biology — Heart structure & function",emoji:"❤️",color:"#be123c"},
  {name:"Blood",url:"https://www.youtube.com/watch?v=00qWGFKFEEI",desc:"GCSE Biology — Blood components",emoji:"🩸",color:"#dc2626"},
  {name:"Blood Vessels",url:"https://www.youtube.com/watch?v=v43ej5lCeBo",desc:"GCSE Biology — Arteries, veins, capillaries",emoji:"🔴",color:"#ea580c"},
  {name:"Transpiration",url:"https://www.youtube.com/watch?v=SHSQOPsZooo",desc:"GCSE Biology — Transport in plants",emoji:"🌿",color:"#16a34a"},
  {name:"The Eye",url:"https://youtu.be/CsKuHp4bPkQ",desc:"GCSE Biology — Eye structure & accommodation",emoji:"👁️",color:"#7c3aed"},
  {name:"Reflexes",url:"https://youtu.be/btdVcSLTfDk",desc:"GCSE Biology — Reflex arcs",emoji:"⚡",color:"#0891b2"},
  {name:"Photosynthesis",url:"https://www.youtube.com/watch?v=CMiGKzIIzM0",desc:"GCSE Biology — Photosynthesis explained",emoji:"🌱",color:"#15803d"},
  {name:"Photosynthesis Experiments",url:"https://www.youtube.com/watch?v=X5JFHru7MoM",desc:"GCSE Biology — Starch test & pondweed",emoji:"🧪",color:"#9333ea"},
];

// ── SUBJECTS & TOPICS ──
const SUBJECTS = [
  {id:"biology",name:"Biology",emoji:"🧬",color:"#22c55e",grad:"linear-gradient(135deg,#166534,#15803d)"},
  {id:"chemistry",name:"Chemistry",emoji:"⚗️",color:"#f59e0b",grad:"linear-gradient(135deg,#92400e,#b45309)"},
  {id:"physics",name:"Physics",emoji:"⚡",color:"#3b82f6",grad:"linear-gradient(135deg,#1e3a8a,#1d4ed8)"},
];

const TOPICS = [
  {id:"gas_exchange",subject:"biology",name:"Gas Exchange & Transpiration",emoji:"🌿",color:"#16a34a",questions:[
    {q:"What is gas exchange in plants?",answer:"The diffusion of oxygen and carbon dioxide in and out of the leaf through the stomata",alts:["diffusion of O2 and CO2 through stomata"],hint:"What moves in and out of leaves"},
    {q:"What process requires CO2 to diffuse into a leaf?",answer:"Photosynthesis",alts:[],hint:"Makes glucose using light"},
    {q:"What process requires oxygen to diffuse into a leaf?",answer:"Aerobic respiration",alts:["respiration"],hint:"Releases energy from glucose"},
    {q:"Name the cells that open and close the stomata.",answer:"Guard cells",alts:[],hint:"They 'guard' the openings"},
    {q:"Name four factors that affect transpiration rate.",answer:"Light intensity, temperature, wind speed, humidity",alts:["light, temperature, wind, humidity"],hint:"What helps washing dry faster?"},
    {q:"What colour does hydrogen carbonate indicator turn in high CO2?",answer:"Yellow",alts:[],hint:"CO2 makes it more acidic"},
    {q:"What colour does hydrogen carbonate indicator turn in low CO2?",answer:"Purple",alts:[],hint:"Less CO2 = less acidic"},
    {q:"What is transpiration?",answer:"The loss of water from a plant's leaves by evaporation and diffusion",alts:["evaporation of water from leaves","loss of water from leaves"],hint:"Water escapes through stomata"},
    {q:"What happens to transpiration when it gets warmer?",answer:"It gets faster because water particles have more energy to evaporate",alts:["it increases"],hint:"Think about what warmth does to evaporation"},
    {q:"What happens to transpiration when humidity is high?",answer:"It decreases because there is less difference in water concentration between inside and outside the leaf",alts:["it decreases","it slows down"],hint:"Diffusion is fastest when there's a big difference"},
    {q:"What happens to transpiration rate when wind speed is low?",answer:"It decreases because water vapour surrounds the leaf and doesn't move away",alts:["it decreases"],hint:"The vapour builds up around the leaf"},
    {q:"What piece of apparatus measures transpiration rate?",answer:"A potometer",alts:["potometer"],hint:"It actually measures water uptake"},
    {q:"Why do stomata close in the dark?",answer:"Photosynthesis can't happen in the dark so they don't need to be open for CO2",alts:["no photosynthesis in the dark"],hint:"What process needs open stomata?"},
    {q:"What happens to transpiration when stomata close?",answer:"Very little water can escape",alts:["transpiration decreases","it stops"],hint:"Stomata are the main exit for water"},
    {q:"During the day, do plants take in or release more CO2?",answer:"They take in more CO2 because photosynthesis uses more than respiration produces",alts:["take in more CO2"],hint:"Photosynthesis dominates in daylight"},
    {q:"At night, what gases do plants exchange?",answer:"They take in oxygen and release carbon dioxide, just like animals",alts:["take in oxygen, release CO2"],hint:"Only respiration happens at night"},
    {q:"Why are leaves broad and flat?",answer:"To provide a large surface area for diffusion and light absorption",alts:["large surface area"],hint:"More area means more gas exchange"},
    {q:"Why are leaves thin?",answer:"So gases only have to travel a short distance to reach cells",alts:["short diffusion distance"],hint:"Short diffusion distance"},
    {q:"What are the air spaces inside a leaf for?",answer:"They let gases like CO2 and O2 move easily between cells and increase surface area for gas exchange",alts:["gas exchange between cells"],hint:"Gaps between the spongy mesophyll cells"},
    {q:"Why do stomata close when water supplies are low?",answer:"To stop the plant drying out, even though this stops photosynthesis",alts:["to prevent water loss"],hint:"Survival is more important than making food"},
    {q:"What controls the opening and closing of stomata?",answer:"Guard cells which change shape and volume",alts:["guard cells"],hint:"They swell to open and shrink to close"},
    {q:"What do xylem vessels transport?",answer:"Water and mineral ions up from the roots",alts:["water and minerals"],hint:"Dead cells with lignin walls"},
    {q:"What do phloem vessels transport?",answer:"Sucrose and amino acids up and down the plant",alts:["sugars and amino acids"],hint:"Made of living cells with sieve plates"},
    {q:"What is the transpiration stream?",answer:"The continuous movement of water up the xylem from roots to leaves, pulled by water loss during transpiration",alts:["continuous movement of water up the xylem"],hint:"Water is pulled upwards"},
    {q:"Name three functions of the transpiration stream.",answer:"Supplies water for photosynthesis, carries mineral ions to leaves, keeps cells turgid",alts:["water for photosynthesis, mineral transport, keeps cells turgid"],hint:"Water does several jobs on its journey up"},
    {q:"How are root hair cells adapted for absorbing water?",answer:"Large surface area and lots of mitochondria for active transport of minerals",alts:["large surface area"],hint:"Long thin extensions increase the surface"},
    {q:"How does water enter a root hair cell?",answer:"By osmosis from high water potential in the soil to low water potential in the cell",alts:["by osmosis"],hint:"Water moves down the concentration gradient"},
    {q:"How do mineral ions enter the root?",answer:"By active transport against the concentration gradient using energy",alts:["active transport"],hint:"The opposite direction to normal diffusion"},
    {q:"What is the difference between xylem and phloem structure?",answer:"Xylem is made of dead cells with lignin and no sieve plates; phloem is made of living cells with sieve plates",alts:["xylem dead with lignin, phloem living with sieve plates"],hint:"One is dead and strong, the other is alive"},
    {q:"What is a vascular bundle?",answer:"The grouping of xylem and phloem together in a root or stem",alts:["xylem and phloem grouped together"],hint:"The plant's transport pipes bundled together"},
    {q:"Why does increasing light intensity increase transpiration?",answer:"Stomata open wider in bright light to let in more CO2 for photosynthesis, which lets more water escape",alts:["stomata open more in bright light"],hint:"More light means more open stomata"},
  ]},
  {id:"blood_immunity",subject:"biology",name:"Blood & Immunity",emoji:"🩸",color:"#dc2626",questions:[
    {q:"What are the four components of blood?",answer:"Plasma, red blood cells, white blood cells, platelets",alts:["red blood cells, white blood cells, platelets, plasma"],hint:"A liquid, two cell types, cell fragments"},
    {q:"What molecule in red blood cells binds to oxygen?",answer:"Haemoglobin",alts:["hemoglobin"],hint:"Contains iron, gives blood red colour"},
    {q:"Name the two types of white blood cell.",answer:"Phagocytes and lymphocytes",alts:["lymphocytes and phagocytes"],hint:"One engulfs, one makes antibodies"},
    {q:"How do phagocytes destroy pathogens?",answer:"They engulf and digest them",alts:["phagocytosis"],hint:"They eat pathogens"},
    {q:"How do lymphocytes destroy pathogens?",answer:"They produce antibodies that bind to antigens",alts:["produce antibodies"],hint:"Proteins that lock onto invaders"},
    {q:"What is the function of platelets?",answer:"Form blood clots",alts:["clot the blood","blood clotting"],hint:"What happens when you get a cut?"},
    {q:"What is the active ingredient in a vaccination?",answer:"A dead or inactive pathogen",alts:["dead pathogen","inactive pathogen"],hint:"Triggers immunity without disease"},
    {q:"What is plasma?",answer:"The pale yellow liquid part of blood that carries everything",alts:["liquid part of blood"],hint:"It's basically blood minus the cells"},
    {q:"Name four things that plasma transports.",answer:"Red and white blood cells, digested food products, carbon dioxide, urea, hormones, heat energy",alts:["blood cells, food, CO2, urea, hormones, heat"],hint:"It carries almost everything around the body"},
    {q:"What protein holds a blood clot together?",answer:"Fibrin",alts:[],hint:"Forms a mesh of protein"},
    {q:"Why do red blood cells have a biconcave shape?",answer:"To give a large surface area for absorbing and releasing oxygen",alts:["large surface area for oxygen"],hint:"Think about what shape increases surface area"},
    {q:"Why don't red blood cells have a nucleus?",answer:"To free up space for more haemoglobin so they can carry more oxygen",alts:["more room for haemoglobin"],hint:"More room for the oxygen-carrying molecule"},
    {q:"What are antigens?",answer:"Unique molecules on the surface of every pathogen",alts:["molecules on pathogen surface"],hint:"They trigger an immune response"},
    {q:"What are memory cells?",answer:"White blood cells that remember a specific antigen and can reproduce quickly if the same pathogen returns",alts:["cells that remember antigens"],hint:"Why you're immune after the first infection"},
    {q:"How does vaccination work?",answer:"Dead or inactive pathogens are injected, lymphocytes produce antibodies, and memory cells are made without the person getting ill",alts:["inject dead pathogen, body makes antibodies and memory cells"],hint:"Triggers immunity without the disease"},
    {q:"Name four substances that need to move in and out of cells.",answer:"Oxygen, carbon dioxide, glucose, urea",alts:["O2, CO2, glucose, urea"],hint:"Two gases and two dissolved substances"},
    {q:"Why do multicellular organisms need a transport system?",answer:"They are large with a low surface area to volume ratio and long diffusion pathways",alts:["too big for diffusion alone"],hint:"Too big for diffusion alone"},
    {q:"What are the three components of the circulatory system?",answer:"Blood, blood vessels, and the heart",alts:["blood, blood vessels, heart"],hint:"The liquid, the tubes, and the pump"},
    {q:"Why are blood clots important for defence?",answer:"They prevent blood loss and stop pathogens entering through wounds",alts:["prevent blood loss and infection"],hint:"Seal the gap quickly"},
    {q:"What happens when someone is infected by a pathogen they are vaccinated against?",answer:"Memory cells quickly produce a large quantity of antibodies to fight the pathogen",alts:["memory cells produce antibodies quickly"],hint:"The body remembers and responds faster"},
  ]},
  {id:"heart",subject:"biology",name:"The Heart",emoji:"❤️",color:"#be123c",questions:[
    {q:"What is the function of the heart?",answer:"To pump blood around the body",alts:["pump blood"],hint:"Muscular pump"},
    {q:"Which side of the heart contains oxygenated blood?",answer:"The left side",alts:["left"],hint:"Blood comes from lungs to left"},
    {q:"Why is the left ventricle wall thicker?",answer:"It needs to generate higher pressure to pump blood to the whole body",alts:["to pump blood further"],hint:"Which journey is longer?"},
    {q:"What is the function of the heart's valves?",answer:"Prevent the backflow of blood",alts:["prevent backflow"],hint:"Only let blood flow one way"},
    {q:"Which vessel carries deoxygenated blood from body to heart?",answer:"The vena cava",alts:["vena cava"],hint:"Largest vein"},
    {q:"Which vessel carries blood from heart to lungs?",answer:"The pulmonary artery",alts:["pulmonary artery"],hint:"Pulmonary = lungs"},
    {q:"Which vessel carries blood from heart to body?",answer:"The aorta",alts:["aorta"],hint:"Largest artery"},
    {q:"What hormone causes heart rate to increase?",answer:"Adrenaline",alts:["adrenalin"],hint:"Fight or flight"},
    {q:"Name the four chambers of the heart.",answer:"Right atrium, right ventricle, left atrium, left ventricle",alts:["left atrium, left ventricle, right atrium, right ventricle"],hint:"Two atria on top, two ventricles below"},
    {q:"Which chamber receives deoxygenated blood from the body?",answer:"The right atrium",alts:["right atrium"],hint:"Blood returns via the vena cava"},
    {q:"Which vessel carries oxygenated blood from the lungs to the heart?",answer:"The pulmonary vein",alts:["pulmonary vein"],hint:"The exception — a vein carrying oxygenated blood"},
    {q:"What is coronary heart disease?",answer:"When the coronary arteries get blocked by layers of fatty material building up",alts:["blocked coronary arteries"],hint:"Fatty deposits in the heart's own blood supply"},
    {q:"Name three risk factors for coronary heart disease.",answer:"High saturated fat diet, smoking, being inactive",alts:["diet, smoking, inactivity"],hint:"Lifestyle choices"},
    {q:"How does exercise affect heart rate?",answer:"It increases because muscles need more oxygen and energy",alts:["it increases"],hint:"More activity means more demand"},
    {q:"How does the body detect that more CO2 is in the blood during exercise?",answer:"Receptors in the aorta and carotid artery detect high CO2 levels",alts:["receptors in aorta and carotid artery"],hint:"Special sensors in major blood vessels"},
    {q:"How does adrenaline affect the heart?",answer:"It binds to receptors on the heart causing it to contract more frequently and with more force",alts:["makes heart beat faster and harder"],hint:"Fight or flight hormone"},
    {q:"What separates the left and right sides of the heart?",answer:"The septum",alts:["septum"],hint:"A wall of muscle down the middle"},
    {q:"Which valve separates the right atrium and right ventricle?",answer:"The tricuspid valve",alts:["tricuspid"],hint:"Tri means three — it has three flaps"},
    {q:"What is the difference between blood on the right and left side of the heart?",answer:"Right side has deoxygenated blood, left side has oxygenated blood",alts:["right deoxygenated, left oxygenated"],hint:"Right goes to lungs, left goes to body"},
  ]},
  {id:"blood_vessels",subject:"biology",name:"Blood Vessels",emoji:"🔴",color:"#ea580c",questions:[
    {q:"Name the three types of blood vessel.",answer:"Arteries, veins, capillaries",alts:["arteries, capillaries, veins"],hint:"Away, back, through tissues"},
    {q:"Which direction do arteries carry blood?",answer:"Away from the heart",alts:["away from heart"],hint:"A for Away, A for Artery"},
    {q:"Why do arteries have thick, elastic walls?",answer:"To withstand high blood pressure",alts:["to cope with high pressure"],hint:"Blood leaves heart under force"},
    {q:"Why do veins have valves?",answer:"To prevent backflow of blood at low pressure",alts:["prevent backflow"],hint:"Low pressure in veins"},
    {q:"Why are capillary walls only one cell thick?",answer:"Short diffusion distance for exchanging substances",alts:["short diffusion distance"],hint:"Substances pass through walls"},
    {q:"What does 'hepatic' mean?",answer:"Related to the liver",alts:["to do with the liver","liver"],hint:"Think hepatitis"},
    {q:"What does 'renal' mean?",answer:"Related to the kidneys",alts:["to do with the kidneys","kidneys"],hint:"Renal failure = kidney failure"},
    {q:"Why do capillaries have permeable walls?",answer:"So substances like food and oxygen can diffuse in and out",alts:["so substances can diffuse through"],hint:"Things need to pass through"},
    {q:"Why do veins have a bigger lumen than arteries?",answer:"To help blood flow at lower pressure",alts:["to allow blood flow at low pressure"],hint:"Less pressure needs a wider opening"},
    {q:"What is the largest artery in the body?",answer:"The aorta",alts:["aorta"],hint:"Carries blood from the heart to the body"},
    {q:"What is the largest vein in the body?",answer:"The vena cava",alts:["vena cava"],hint:"Carries blood back to the heart"},
    {q:"What does pulmonary mean?",answer:"Related to the lungs",alts:["to do with the lungs","lungs"],hint:"Pulmonary artery goes to the lungs"},
  ]},
  {id:"eye",subject:"biology",name:"The Eye",emoji:"👁️",color:"#7c3aed",questions:[
    {q:"What is the function of the cornea?",answer:"Refracts (bends) light into the eye",alts:["refracts light","bends light"],hint:"Transparent front part"},
    {q:"What is the function of the lens?",answer:"Focuses light onto the retina",alts:["refracts light onto retina"],hint:"Changes shape to focus"},
    {q:"What is accommodation?",answer:"Changing the shape of the lens to focus on near or far objects",alts:["adjusting lens shape to focus"],hint:"How the eye switches focus"},
    {q:"For near objects, what do ciliary muscles do?",answer:"Contract",alts:["they contract"],hint:"Tighten to make lens fatter"},
    {q:"For far objects, what shape does the lens become?",answer:"Thinner",alts:["thin","flat","flatter"],hint:"Less refraction needed"},
    {q:"In bright light, which iris muscles contract?",answer:"Circular muscles",alts:["the circular muscles"],hint:"Make pupil smaller"},
    {q:"In dim light, which iris muscles contract?",answer:"Radial muscles",alts:["the radial muscles"],hint:"Pull pupil open wider"},
    {q:"What does the conjunctiva do?",answer:"Lubricates and protects the surface of the eye",alts:["protects the eye surface"],hint:"A protective membrane"},
    {q:"What does the sclera do?",answer:"It is the tough outer layer that protects the eye",alts:["protects the eye"],hint:"The white of the eye"},
    {q:"What does the iris do?",answer:"Controls the diameter of the pupil to regulate how much light enters",alts:["controls pupil size"],hint:"The coloured part"},
    {q:"What does the retina do?",answer:"Contains light-sensitive receptors called rods and cones",alts:["detects light"],hint:"Where the image is formed"},
    {q:"What is the difference between rods and cones?",answer:"Rods are sensitive in dim light but can't sense colour, cones sense colour but aren't good in dim light",alts:["rods for dim light, cones for colour"],hint:"One for dark, one for colour"},
    {q:"Where are most cones found?",answer:"At the fovea",alts:["the fovea"],hint:"The centre of the retina"},
    {q:"What does the optic nerve do?",answer:"Carries impulses from the receptors in the retina to the brain",alts:["carries signals from retina to brain"],hint:"The connection from eye to brain"},
    {q:"For near objects, what happens to the suspensory ligaments?",answer:"They slacken",alts:["they go slack","loosen"],hint:"Ciliary muscles contract and release tension"},
    {q:"What is short-sightedness?",answer:"When you can see near objects clearly but not distant objects",alts:["can't see far away"],hint:"The image focuses in front of the retina"},
    {q:"What is long-sightedness?",answer:"When you can see distant objects clearly but not near objects",alts:["can't see close up"],hint:"The image focuses behind the retina"},
    {q:"What is the function of the choroid?",answer:"It supplies the eye tissues with oxygen and glucose via blood vessels, and its pigment prevents light reflecting inside the eye",alts:["blood supply and prevents internal reflection"],hint:"Nutrition and stopping internal reflections"},
    {q:"Why is it important that pupils constrict quickly in bright light?",answer:"To prevent light damaging the retina",alts:["to protect the retina"],hint:"Too much light is harmful"},
    {q:"In bright light, what happens to the iris muscles?",answer:"Circular muscles contract and radial muscles relax, causing the pupil to constrict",alts:["circular contract, radial relax"],hint:"Circular squeeze the pupil smaller"},
    {q:"In dim light, what happens to the iris muscles?",answer:"Radial muscles contract and circular muscles relax, causing the pupil to dilate",alts:["radial contract, circular relax"],hint:"Radial pull the pupil open"},
    {q:"When focusing on a near object, what happens to the ciliary muscles and lens?",answer:"Ciliary muscles contract, suspensory ligaments slacken, and the lens becomes rounder and thicker",alts:["ciliary muscles contract, lens gets fatter"],hint:"Muscles tighten, ligaments loosen, lens fattens"},
  ]},
  {id:"reflexes",subject:"biology",name:"Reflexes & Nervous System",emoji:"⚡",color:"#0891b2",questions:[
    {q:"What is a stimulus?",answer:"A change in the environment",alts:[],hint:"Triggers a response"},
    {q:"Name the three types of neurone.",answer:"Sensory, relay, motor",alts:["sensory neurone, relay neurone, motor neurone"],hint:"Detect, connect, act"},
    {q:"What two organs make up the CNS?",answer:"The brain and spinal cord",alts:["brain and spinal cord"],hint:"Control centre"},
    {q:"What are synapses?",answer:"Gaps between neurones",alts:["junctions between neurones"],hint:"Signals must cross these"},
    {q:"How do signals cross a synapse?",answer:"Neurotransmitters diffuse across the gap",alts:["by neurotransmitters"],hint:"Chemical messengers"},
    {q:"What is a reflex action?",answer:"A rapid, automatic, involuntary response to a stimulus",alts:["an automatic response"],hint:"You don't think about it"},
    {q:"What is homeostasis?",answer:"The maintenance of a constant internal environment to maintain optimal cell function",alts:["keeping internal conditions constant"],hint:"Keeping things balanced"},
    {q:"What are receptors?",answer:"Groups of cells that detect stimuli in sense organs like eyes, ears, nose, tongue and skin",alts:["cells that detect stimuli"],hint:"They detect changes in the environment"},
    {q:"What are effectors?",answer:"Cells that carry out a response — muscle cells and gland cells",alts:["muscles and glands"],hint:"Muscles contract, glands secrete"},
    {q:"What is a reflex arc?",answer:"The pathway from receptor to effector in a reflex: stimulus, receptor, sensory neurone, CNS, relay neurone, motor neurone, effector, response",alts:["the nerve pathway of a reflex"],hint:"The route a reflex signal takes"},
    {q:"Why are reflex actions faster than normal responses?",answer:"Because they don't involve the conscious part of the brain so you don't have to think",alts:["they bypass the conscious brain"],hint:"Automatic means quicker"},
    {q:"What is the correct order of neurones in a reflex arc?",answer:"Sensory neurone, relay neurone, motor neurone",alts:["sensory, relay, motor"],hint:"Sense it, relay it, move it"},
    {q:"What are the two communication systems in the human body?",answer:"The nervous system and the endocrine system",alts:["nervous and endocrine"],hint:"One uses electrical impulses, one uses hormones"},
    {q:"How does the nervous system send information?",answer:"As electrical impulses along neurones",alts:["electrical impulses"],hint:"Fast electrical signals"},
    {q:"How does the endocrine system send information?",answer:"As hormones through the blood stream",alts:["hormones in the blood"],hint:"Chemical messengers in the blood"},
    {q:"Which system produces faster responses — nervous or endocrine?",answer:"The nervous system — its responses are rapid but short-lived",alts:["nervous system"],hint:"Electrical is faster than chemical"},
    {q:"What is the peripheral nervous system?",answer:"All the neurones in the body outside the CNS",alts:["neurones outside the brain and spinal cord"],hint:"Everything except the brain and spinal cord"},
    {q:"Why do neurones have lots of dendrons and dendrites?",answer:"So they can connect to many other neurones to transmit information",alts:["to connect to many neurones"],hint:"More connections means better communication"},
    {q:"What are neurotransmitters?",answer:"Chemicals produced in the presynaptic neurone that carry signals across synapses",alts:["chemicals that cross synapses"],hint:"Chemical messengers that cross the gap"},
    {q:"Describe how a signal crosses a synapse.",answer:"The impulse arrives, neurotransmitters are released into the synaptic cleft, they diffuse across and bind to receptors on the postsynaptic neurone triggering a new impulse",alts:["neurotransmitters released, diffuse across, bind to receptors"],hint:"Release, diffuse, bind, fire"},
    {q:"Why is it important that reflex actions are rapid and involuntary?",answer:"To reduce the chance of a stimulus damaging the body",alts:["to prevent damage"],hint:"No time to think when danger is near"},
    {q:"Name two examples of homeostasis in humans.",answer:"Maintenance of constant body temperature and constant water concentration in the blood",alts:["body temperature and water balance"],hint:"Temperature and water balance"},
  ]},
  {id:"photosynthesis",subject:"biology",name:"Photosynthesis",emoji:"🌱",color:"#15803d",questions:[
    {q:"What are the reactants of photosynthesis?",answer:"Carbon dioxide and water",alts:["CO2 and water"],hint:"What goes IN"},
    {q:"What are the products of photosynthesis?",answer:"Glucose and oxygen",alts:["oxygen and glucose"],hint:"What comes OUT"},
    {q:"Where in the cell does photosynthesis happen?",answer:"Chloroplasts",alts:["in the chloroplasts"],hint:"Contain green pigment"},
    {q:"What pigment absorbs light for photosynthesis?",answer:"Chlorophyll",alts:[],hint:"Gives leaves green colour"},
    {q:"Name the three limiting factors of photosynthesis.",answer:"Light intensity, CO2 concentration, temperature",alts:["light, CO2, temperature"],hint:"Three things that slow it down"},
    {q:"What chemical tests a leaf for starch?",answer:"Iodine solution",alts:["iodine"],hint:"Turns specific colour with starch"},
    {q:"What colour does iodine turn if starch IS present?",answer:"Blue-black",alts:["dark blue","blue black"],hint:"Dramatic dark colour"},
    {q:"Why put a leaf in ethanol when testing for starch?",answer:"To remove the chlorophyll",alts:["remove chlorophyll","to decolourise the leaf"],hint:"Green would hide result"},
    {q:"What is the word equation for photosynthesis?",answer:"Carbon dioxide + water → glucose + oxygen",alts:["CO2 + water → glucose + oxygen"],hint:"Light and chlorophyll are needed"},
    {q:"What is the symbol equation for photosynthesis?",answer:"6CO2 + 6H2O → C6H12O6 + 6O2",alts:[],hint:"Six of each reactant"},
    {q:"How is glucose stored in plants?",answer:"As starch",alts:["starch"],hint:"Tested using iodine"},
    {q:"Where in the leaf are most chloroplasts found?",answer:"The palisade mesophyll layer",alts:["palisade layer","palisade mesophyll"],hint:"Near the top of the leaf to get the most light"},
    {q:"Why is the upper epidermis transparent?",answer:"So light can pass through to the palisade layer below",alts:["to let light through"],hint:"Light needs to reach the chloroplasts"},
    {q:"What is the function of vascular bundles in a leaf?",answer:"Xylem delivers water and phloem takes away glucose",alts:["transport water in and glucose out"],hint:"Transport vessels"},
    {q:"What does the waxy cuticle do?",answer:"Reduces water loss by evaporation",alts:["prevents water loss"],hint:"A waxy waterproof layer"},
    {q:"What happens to the rate of photosynthesis above 45°C?",answer:"It rapidly decreases because enzymes are denatured",alts:["it decreases, enzymes denatured"],hint:"Enzymes are destroyed at high temperatures"},
    {q:"What is a limiting factor?",answer:"Something that stops photosynthesis from happening any faster",alts:["the factor in shortest supply"],hint:"The factor in shortest supply"},
    {q:"How can you show that light is needed for photosynthesis?",answer:"Keep a plant in the dark for 48 hours, test a leaf for starch with iodine — it won't turn blue-black",alts:["dark plant produces no starch"],hint:"No light means no starch"},
    {q:"How can you show CO2 is needed for photosynthesis?",answer:"Put a plant in a sealed jar with soda lime which absorbs CO2, then test for starch — the leaf won't turn blue-black",alts:["remove CO2 with soda lime, no starch made"],hint:"Soda lime removes the CO2"},
    {q:"How do you use pondweed to measure rate of photosynthesis?",answer:"Count oxygen bubbles or measure the length of gas collected at different light distances",alts:["count bubbles at different distances"],hint:"More light means more bubbles"},
    {q:"What colour does hydrogen-carbonate indicator go in normal CO2?",answer:"Orange",alts:[],hint:"It's the starting colour"},
    {q:"In the hydrogen-carbonate indicator experiment, what colour would you expect in the tube wrapped in foil?",answer:"Yellow because only respiration happens, increasing CO2 concentration",alts:["yellow"],hint:"No light means no photosynthesis"},
    {q:"What is the function of the palisade mesophyll tissue?",answer:"It is the main site of photosynthesis — cells are tightly packed with lots of chloroplasts just below the upper epidermis",alts:["main site of photosynthesis"],hint:"Top layer of cells with the most chloroplasts"},
    {q:"What is the function of the spongy mesophyll tissue?",answer:"Site of gas exchange — has air spaces for gases to diffuse between cells",alts:["gas exchange"],hint:"Spongy because of all the air gaps"},
  ]},
  {id:"atomic_structure",subject:"chemistry",name:"Atomic Structure",emoji:"⚛️",color:"#f59e0b",questions:[
    {q:"What are the three subatomic particles?",answer:"Protons, neutrons, electrons",alts:["proton, neutron, electron"],hint:"Two in nucleus, one orbiting"},
    {q:"What is the charge of a proton?",answer:"Positive (+1)",alts:["+1","positive","+"],hint:"In the nucleus, positive"},
    {q:"What is the charge of an electron?",answer:"Negative (-1)",alts:["-1","negative","-"],hint:"Orbits the nucleus"},
    {q:"What is the charge of a neutron?",answer:"Zero (neutral)",alts:["0","zero","no charge","neutral"],hint:"Clue is in the name"},
    {q:"What does the atomic number tell you?",answer:"The number of protons",alts:["number of protons"],hint:"Smaller number on periodic table"},
    {q:"What does the mass number tell you?",answer:"The total number of protons and neutrons",alts:["protons plus neutrons"],hint:"The larger number"},
    {q:"How do you calculate neutrons?",answer:"Mass number minus atomic number",alts:["mass number - atomic number"],hint:"Big minus small"},
    {q:"What are isotopes?",answer:"Atoms of the same element with different numbers of neutrons",alts:["same element, different neutrons"],hint:"Same element, different mass"},
    {q:"What do elements in the same group have in common?",answer:"The same number of electrons in their outer shell",alts:["same number of outer electrons"],hint:"Groups are columns"},
  ]},
  {id:"organic_chemistry",subject:"chemistry",name:"Organic Chemistry",emoji:"🛢️",color:"#a16207",questions:[
    {q:"What is a hydrocarbon?",answer:"A compound containing only hydrogen and carbon atoms",alts:["molecule with only carbon and hydrogen"],hint:"Two elements only"},
    {q:"What is the general formula for alkanes?",answer:"CnH2n+2",alts:[],hint:"Single bonds only"},
    {q:"What is the general formula for alkenes?",answer:"CnH2n",alts:[],hint:"They have a double bond"},
    {q:"Name the first four alkanes.",answer:"Methane, ethane, propane, butane",alts:[],hint:"Meth=1, Eth=2, Prop=3, But=4"},
    {q:"What bond makes alkenes different from alkanes?",answer:"A carbon-carbon double bond",alts:["double bond","C=C double bond"],hint:"Makes them unsaturated"},
    {q:"What happens to boiling point as chain length increases?",answer:"Boiling point increases",alts:["it increases","increases"],hint:"Longer chains = stronger forces"},
    {q:"What test distinguishes alkenes from alkanes?",answer:"Bromine water — turns from orange to colourless with alkenes",alts:["bromine water","bromine water test"],hint:"Orange solution colour change"},
    {q:"What is the molecular formula of methane?",answer:"CH4",alts:[],hint:"1 carbon, CnH2n+2"},
    {q:"What is the molecular formula of ethene?",answer:"C2H4",alts:[],hint:"2 carbons, CnH2n"},
  ]},
  {id:"bonding",subject:"chemistry",name:"Bonding & Structure",emoji:"🔗",color:"#d97706",questions:[
    {q:"What is ionic bonding?",answer:"The transfer of electrons from a metal to a non-metal, forming ions",alts:["transfer of electrons between metal and non-metal"],hint:"One gives, other receives"},
    {q:"What is covalent bonding?",answer:"The sharing of electrons between non-metal atoms",alts:["sharing electrons between non-metals"],hint:"Both atoms share"},
    {q:"Why do ionic compounds have high melting points?",answer:"Strong electrostatic forces between ions require lots of energy to overcome",alts:["strong ionic bonds","strong forces between ions"],hint:"Strong + and - attraction"},
    {q:"When can ionic compounds conduct electricity?",answer:"When dissolved or molten, because ions are free to move",alts:["when dissolved or molten"],hint:"Ions need to move"},
    {q:"Why do simple molecular substances have low melting points?",answer:"Weak intermolecular forces are easy to overcome",alts:["weak forces between molecules"],hint:"Forces BETWEEN molecules are weak"},
  ]},
  {id:"energetics",subject:"chemistry",name:"Energetics",emoji:"🔥",color:"#ef4444",questions:[
    {q:"What is an exothermic reaction?",answer:"A reaction that releases energy to the surroundings",alts:["releases energy","gives out heat"],hint:"Ex = exit"},
    {q:"What is an endothermic reaction?",answer:"A reaction that takes in energy from the surroundings",alts:["absorbs heat","takes in energy"],hint:"En = enter"},
    {q:"Give an example of an exothermic reaction.",answer:"Combustion",alts:["burning","neutralisation","respiration"],hint:"Burning is the classic"},
    {q:"Give an example of an endothermic reaction.",answer:"Thermal decomposition",alts:["photosynthesis"],hint:"Needs continuous heating"},
  ]},
  {id:"reactivity_series",subject:"chemistry",name:"Reactivity Series",emoji:"📊",color:"#8b5cf6",questions:[
    {q:"What happens when a more reactive metal meets a less reactive metal's salt solution?",answer:"A displacement reaction occurs",alts:["displacement reaction"],hint:"More reactive pushes out less reactive"},
    {q:"How are metals above carbon extracted?",answer:"Electrolysis",alts:["by electrolysis"],hint:"Using electricity"},
    {q:"What is oxidation in terms of oxygen?",answer:"Gaining oxygen",alts:["addition of oxygen"],hint:"OIL RIG"},
    {q:"What is reduction in terms of oxygen?",answer:"Losing oxygen",alts:["removal of oxygen","loss of oxygen"],hint:"OIL RIG"},
  ]},
  {id:"acids_bases",subject:"chemistry",name:"Acids & Bases",emoji:"🧪",color:"#06b6d4",questions:[
    {q:"What pH range is acidic?",answer:"Below 7 (0-6)",alts:["0 to 6","less than 7","below 7"],hint:"Lower = stronger acid"},
    {q:"What pH is neutral?",answer:"7",alts:[],hint:"Right in the middle"},
    {q:"What is produced when acid reacts with a base?",answer:"A salt and water",alts:["salt and water"],hint:"Neutralisation"},
    {q:"What is produced when acid reacts with a metal?",answer:"A salt and hydrogen gas",alts:["salt and hydrogen"],hint:"Burning splint test"},
    {q:"What is produced when acid reacts with a carbonate?",answer:"A salt, water and carbon dioxide",alts:["salt, water and CO2"],hint:"Three products"},
    {q:"Chemical formula for hydrochloric acid?",answer:"HCl",alts:[],hint:"Hydrogen + chlorine"},
    {q:"Chemical formula for sulfuric acid?",answer:"H2SO4",alts:[],hint:"Hydrogen + sulfate"},
  ]},
  {id:"chem_calculations",subject:"chemistry",name:"Chemical Calculations",emoji:"🔢",color:"#0d9488",questions:[
    {q:"What is relative atomic mass (RAM)?",answer:"The average mass of an atom compared to 1/12 the mass of carbon-12",alts:["average mass of atoms of an element"],hint:"On the periodic table"},
    {q:"Calculate Mr of water (H2O). H=1, O=16",answer:"18",alts:[],hint:"(2x1) + 16"},
    {q:"Calculate Mr of CO2. C=12, O=16",answer:"44",alts:[],hint:"12 + (2x16)"},
    {q:"How do you calculate moles?",answer:"Moles = mass / relative formula mass",alts:["mass divided by Mr","mass / Mr"],hint:"Mass on top, Mr on bottom"},
    {q:"Calculate moles in 36g of water (Mr=18)",answer:"2 moles",alts:["2","2 mol"],hint:"36 / 18"},
    {q:"What is an empirical formula?",answer:"The simplest whole number ratio of atoms of each element in a compound",alts:["simplest ratio of atoms"],hint:"Simplest ratio"},
  ]},
  {id:"forces_motion",subject:"physics",name:"Forces & Motion",emoji:"🚀",color:"#3b82f6",questions:[
    {q:"Formula for average speed?",answer:"Speed = distance / time",alts:["s = d/t","distance / time"],hint:"How far / how long"},
    {q:"Formula for acceleration?",answer:"Acceleration = change in velocity / time",alts:["a = (v-u)/t"],hint:"How quickly speed changes"},
    {q:"What does the gradient of a distance-time graph show?",answer:"Speed",alts:["velocity"],hint:"Steeper = faster"},
    {q:"What does the gradient of a velocity-time graph show?",answer:"Acceleration",alts:[],hint:"Steeper = accelerating faster"},
    {q:"What does the area under a velocity-time graph show?",answer:"Distance travelled",alts:["distance"],hint:"Calculate the area"},
    {q:"State Newton's second law as a formula.",answer:"Force = mass x acceleration",alts:["F = ma","F = m x a"],hint:"F = ma"},
    {q:"Formula for weight?",answer:"Weight = mass x gravitational field strength",alts:["W = mg","W = m x g"],hint:"W = mg"},
    {q:"What is terminal velocity?",answer:"The constant speed when drag equals weight",alts:["when air resistance equals weight"],hint:"Forces balanced"},
    {q:"Formula for momentum?",answer:"Momentum = mass x velocity",alts:["p = mv"],hint:"p = mv"},
    {q:"What is stopping distance made up of?",answer:"Thinking distance + braking distance",alts:["thinking distance plus braking distance"],hint:"Reaction then friction"},
    {q:"Formula for moment of a force?",answer:"Moment = force x perpendicular distance from pivot",alts:["M = F x d"],hint:"Turning effect"},
  ]},
  {id:"electricity",subject:"physics",name:"Electricity",emoji:"💡",color:"#6366f1",questions:[
    {q:"Formula linking voltage, current, resistance?",answer:"Voltage = current x resistance",alts:["V = IR","V = I x R"],hint:"V = IR (Ohm's law)"},
    {q:"Formula for electrical power?",answer:"Power = current x voltage",alts:["P = IV","P = I x V"],hint:"P = IV"},
    {q:"Formula linking charge, current, time?",answer:"Charge = current x time",alts:["Q = It","Q = I x t"],hint:"Q = It"},
    {q:"In a series circuit, what happens to current?",answer:"It is the same everywhere",alts:["same throughout"],hint:"Only one path"},
    {q:"In a parallel circuit, what happens to voltage?",answer:"It is the same across each branch",alts:["same across each branch"],hint:"Each branch gets full voltage"},
    {q:"Difference between AC and DC?",answer:"AC changes direction, DC flows in one direction only",alts:["AC alternates, DC is constant direction"],hint:"Alternating vs Direct"},
    {q:"What does an LDR do as light increases?",answer:"Its resistance decreases",alts:["resistance decreases"],hint:"More Light = Less Resistance"},
    {q:"What does a thermistor do as temperature increases?",answer:"Its resistance decreases",alts:["resistance decreases"],hint:"Hotter = less resistance"},
    {q:"What is current?",answer:"The rate of flow of charge",alts:["flow of charge"],hint:"Measured in amps"},
    {q:"What is voltage?",answer:"The energy transferred per unit charge",alts:["energy per coulomb"],hint:"Joule per coulomb"},
  ]},
  {id:"waves",subject:"physics",name:"Waves",emoji:"🌊",color:"#0ea5e9",questions:[
    {q:"Wave speed formula?",answer:"Wave speed = frequency x wavelength",alts:["v = f lambda","v = f x wavelength"],hint:"v = f x wavelength"},
    {q:"Formula linking frequency and time period?",answer:"Frequency = 1 / time period",alts:["f = 1/T"],hint:"Reciprocals"},
    {q:"Name the EM spectrum in order of decreasing wavelength.",answer:"Radio, microwave, infrared, visible, ultraviolet, X-ray, gamma",alts:["radio, microwave, IR, visible, UV, X-ray, gamma"],hint:"Running Men In Vests Use X-ray Glasses"},
    {q:"What do all EM waves travel at in a vacuum?",answer:"The speed of light",alts:["speed of light","3 x 10^8 m/s"],hint:"All same speed"},
    {q:"What is the law of reflection?",answer:"Angle of incidence = angle of reflection",alts:["angle of incidence equals angle of reflection"],hint:"Angles are equal"},
    {q:"Formula for refractive index?",answer:"n = sin i / sin r",alts:["refractive index = sin i / sin r"],hint:"Snell's law"},
    {q:"What is total internal reflection?",answer:"When light hits a boundary above the critical angle, all light is reflected back",alts:["light reflected when angle exceeds critical angle"],hint:"Used in optical fibres"},
    {q:"Give two uses of microwaves.",answer:"Cooking and satellite transmissions",alts:["cooking, satellite communications"],hint:"Kitchen + space"},
  ]},
  {id:"astrophysics",subject:"physics",name:"Astrophysics",emoji:"🌌",color:"#8b5cf6",questions:[
    {q:"What is a galaxy?",answer:"A large collection of billions of stars",alts:["billions of stars"],hint:"We live in the Milky Way"},
    {q:"Formula for orbital speed?",answer:"Orbital speed = 2 x pi x r / T",alts:["v = 2 pi r / T"],hint:"Circumference / time period"},
    {q:"What causes planets to orbit the Sun?",answer:"Gravitational force",alts:["gravity"],hint:"Attractive force between masses"},
    {q:"Describe the shape of a comet's orbit.",answer:"A highly elliptical (elongated) orbit",alts:["elliptical"],hint:"Not circular — stretched"},
    {q:"How is star colour related to temperature?",answer:"Hotter stars are blue/white, cooler stars are red",alts:["blue = hottest, red = coolest"],hint:"Blue = hot, red = cool"},
    {q:"Stellar evolution for a sun-sized star?",answer:"Nebula, main sequence star, red giant, white dwarf",alts:["nebula, main sequence, red giant, white dwarf"],hint:"Ends as white dwarf"},
    {q:"For a massive star, what comes after red supergiant?",answer:"Supernova, then neutron star or black hole",alts:["supernova, neutron star or black hole"],hint:"Explosion then collapse"},
  ]},
  {id:"physics_equations",subject:"physics",name:"Physics Equations",emoji:"📐",color:"#2563eb",questions:[
    {q:"Formula for kinetic energy?",answer:"KE = half x m x v squared",alts:["KE = 0.5 x m x v^2","KE = 1/2 mv^2","KE = half mv squared"],hint:"Half mv squared"},
    {q:"Formula for gravitational potential energy?",answer:"GPE = mgh",alts:["GPE = m x g x h"],hint:"Mass x gravity x height"},
    {q:"Formula for work done?",answer:"Work done = force x distance",alts:["W = Fd","W = F x d"],hint:"W = Fd"},
    {q:"Formula for power?",answer:"Power = work done / time",alts:["P = W/t"],hint:"How quickly energy transfers"},
    {q:"Formula for efficiency?",answer:"Efficiency = useful output / total input x 100%",alts:["useful energy output / total energy input x 100"],hint:"Useful out / total in"},
    {q:"Formula for density?",answer:"Density = mass / volume",alts:["rho = m/V","density = m/V"],hint:"rho = m/V"},
    {q:"Formula for pressure?",answer:"Pressure = force / area",alts:["p = F/A"],hint:"p = F/A"},
    {q:"Formula for pressure in a liquid column?",answer:"Pressure = height x density x g",alts:["p = h rho g","p = h x rho x g"],hint:"p = h rho g"},
  ]},
];

// ── DESIGN ──
const D={bg:"#0f172a",card:"#1e293b",border:"#334155",text:"#f1f5f9",muted:"#94a3b8",accent:"#22c55e",font:"'DM Sans',system-ui,sans-serif",display:"'Bricolage Grotesque',system-ui,sans-serif"};
const FONTS="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap";
const CSS=`*{box-sizing:border-box;margin:0;padding:0}input:focus,textarea:focus{outline:2px solid ${D.accent};outline-offset:2px}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.fadeIn{animation:fadeIn .3s ease-out}.pulse{animation:pulse .4s ease}.shake{animation:shake .3s ease}`;

// ── APP ──
export default function App(){
  const [screen,setScreen]=useState("login");
  const [user,setUser]=useState(null);
  const [progress,setProgress]=useState({});
  const [curTopic,setCurTopic]=useState(null);
  const [curQ,setCurQ]=useState(null);
  const [answer,setAnswer]=useState("");
  const [feedback,setFeedback]=useState(null);
  const [streak,setStreak]=useState(0);
  const [attempt,setAttempt]=useState(0);
  const [showHint,setShowHint]=useState(false);
  const [session,setSession]=useState({correct:0,total:0});
  const [focus,setFocus]=useState(null); // null | {type:"subject",id} | {type:"topics",ids:[]}
  const [selected,setSelected]=useState(new Set()); // topic ids selected on progress screen
  const [parentData,setParentData]=useState(null);
  const [parentLoading,setParentLoading]=useState(false);
  const [parentExpanded,setParentExpanded]=useState(null);
  const [mergeMode,setMergeMode]=useState(false);
  const [mergeSelected,setMergeSelected]=useState(new Set());
  const [mergeTarget,setMergeTarget]=useState("");
  const [mergeBusy,setMergeBusy]=useState(false);
  const [customQs,setCustomQs]=useState([]);
  const [customLoaded,setCustomLoaded]=useState(false);
  const [aqTab,setAqTab]=useState("single");
  const [aqSubject,setAqSubject]=useState("biology");
  const [aqTopic,setAqTopic]=useState("");
  const [aqNewTopic,setAqNewTopic]=useState("");
  const [aqQ,setAqQ]=useState("");
  const [aqA,setAqA]=useState("");
  const [aqAlts,setAqAlts]=useState("");
  const [aqHint,setAqHint]=useState("");
  const [aqBulk,setAqBulk]=useState("");
  const [aqMsg,setAqMsg]=useState(null);
  const [aqSaving,setAqSaving]=useState(false);
  const inputRef=useRef(null);
  const recentQs=useRef([]);
  const uid=user?user.name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""):null;
  const [loginName,setLoginName]=useState("");
  const [loginLoading,setLoginLoading]=useState(false);
const [listening,setListening]=useState(false);const recogRef=useRef(null);const micMode=useRef(false);
  function startMic(){if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window))return;const SR=window.SpeechRecognition||window.webkitSpeechRecognition;const r=new SR();r.lang='en-GB';r.continuous=true;r.interimResults=true;recogRef.current=r;const baseText='';r.onstart=()=>setListening(true);r.onend=()=>{setListening(false);recogRef.current=null};r.onresult=e=>{let full='';for(let x=0;x<e.results.length;x++){full+=e.results[x][0].transcript}setAnswer(full.trim())};r.onerror=()=>{setListening(false);recogRef.current=null};r.start()}
  function stopMic(){if(recogRef.current){try{recogRef.current.stop()}catch(e){}recogRef.current=null;setListening(false)}}
  function getAllTopics(cqs=customQs){
    if(!cqs||!cqs.length)return TOPICS;
    const merged=TOPICS.map(t=>{const extra=cqs.filter(q=>q.topicId===t.id);if(!extra.length)return t;return{...t,questions:[...t.questions,...extra.map(q=>({q:q.q,answer:q.answer,alts:q.alts||[],hint:q.hint||""}))]}});
    const customTopicIds=[...new Set(cqs.filter(q=>q.customTopic).map(q=>q.topicId))];
    const customTopics=customTopicIds.map(id=>{const tqs=cqs.filter(q=>q.topicId===id);const first=tqs[0];return{id,subject:first.subject||"biology",name:first.topicName||id,emoji:first.topicEmoji||"📝",color:first.topicColor||"#6366f1",questions:tqs.map(q=>({q:q.q,answer:q.answer,alts:q.alts||[],hint:q.hint||""}))}});
    return[...merged,...customTopics];
  }
  function getPool(f=focus){
    const all=getAllTopics();
    if(!f)return all;
    if(f.type==="subject")return all.filter(t=>t.subject===f.id);
    if(f.type==="topics")return all.filter(t=>f.ids.includes(t.id));
    return TOPICS;
  }
  function getFocusLabel(f=focus){
    if(!f)return null;
    if(f.type==="subject"){const s=SUBJECTS.find(s=>s.id===f.id);return s?`${s.emoji} ${s.name}`:null}
    if(f.type==="topics"){
      const all=getAllTopics();
      if(f.ids.length===1){const t=all.find(t=>t.id===f.ids[0]);return t?`${t.emoji} ${t.name}`:null}
      return `${f.ids.length} topics selected`;
    }
    return null;
  }
  function toggleSelect(topicId){
    setSelected(prev=>{const n=new Set(prev);if(n.has(topicId))n.delete(topicId);else n.add(topicId);return n});
  }
  function selectSubject(subjectId){
    const ids=getAllTopics().filter(t=>t.subject===subjectId).map(t=>t.id);
    setSelected(prev=>{const n=new Set(prev);const allSelected=ids.every(id=>n.has(id));ids.forEach(id=>{if(allSelected)n.delete(id);else n.add(id)});return n});
  }
  function startSelected(){
    if(selected.size===0)return;
    const f={type:"topics",ids:[...selected]};
    setFocus(f);pickQuestion(progress,f);setSelected(new Set());setScreen("quiz");
  }
  async function handleLogin(){
    if(!loginName.trim())return;setLoginLoading(true);
    const name=loginName.trim(),id=name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    const prog=await loadProgress(id);
    const cqs=await loadCustomQs();setCustomQs(cqs);setCustomLoaded(true);
    setUser({name,id});setProgress(prog);pickQuestion(prog,null,cqs);setScreen("quiz");setLoginLoading(false);
  }
  async function openParent(){setParentLoading(true);setScreen("parent");const all=await loadAllProgress();setParentData(all);setParentLoading(false)}
  function pickQuestion(prog=progress,f=focus){
    const pool=getPool(f);const due=pool.filter(t=>isDue(prog[t.id]));const from=due.length>0?due:pool;
    const topic=pick(from);let q,tries=0;
    do{q=pick(topic.questions);tries++}while(recentQs.current.includes(q.q)&&tries<15);
    recentQs.current=[...recentQs.current.slice(-8),q.q];
    setCurTopic(topic);setCurQ(q);setAnswer("");setFeedback(null);setShowHint(false);setAttempt(0);
    setTimeout(()=>{inputRef.current?.focus();if(micMode.current)startMic()},300);
  }
  function startSubject(id){const f={type:"subject",id};setFocus(f);pickQuestion(progress,f);setSelected(new Set());setScreen("quiz")}
  function clearFocus(){setFocus(null);pickQuestion(progress,null)}
  async function submitAnswer(){
    stopMic();
    if(!answer.trim()||(feedback&&feedback.type!=="tryagain"))return;
    const ok=checkAns(answer,curQ.answer,curQ.alts||[]);
    if(ok){
      const sc=attempt===0?1:.5;const prev=progress[curTopic.id]||{correct:0,total:0,interval:1};const iv=nextIv(prev.interval||1,sc);
      const up={...progress,[curTopic.id]:{correct:(prev.correct||0)+(attempt===0?1:0),total:(prev.total||0)+1,interval:iv,nextDate:addDays(new Date(),iv),lastSeen:new Date().toISOString()}};
      setProgress(up);setSession(s=>({correct:s.correct+1,total:s.total+1}));setStreak(s=>s+1);
      setFeedback({type:"correct",msg:attempt===0?"Correct! 🎉":"Got it on second try! 👍"});if(uid)saveProgress(uid,up);
    }else if(attempt===0){
      setAttempt(1);setFeedback({type:"tryagain",msg:"Not quite — have another go!"});setAnswer("");setTimeout(()=>inputRef.current?.focus(),100);return;
    }else{
      const prev=progress[curTopic.id]||{correct:0,total:0,interval:1};
      const up={...progress,[curTopic.id]:{correct:prev.correct||0,total:(prev.total||0)+1,interval:1,nextDate:addDays(new Date(),1),lastSeen:new Date().toISOString()}};
      setProgress(up);setSession(s=>({...s,total:s.total+1}));setStreak(0);
      setFeedback({type:"wrong",msg:`The answer was: ${curQ.answer}`});if(uid)saveProgress(uid,up);
    }
  }

  const b=(bg,c="white")=>({padding:"12px 24px",background:bg,color:c,border:"none",borderRadius:"12px",cursor:"pointer",fontFamily:D.font,fontWeight:700,fontSize:"15px",transition:"all .15s"});
  const cd={background:D.card,borderRadius:"16px",padding:"24px",border:`1px solid ${D.border}`};
  const wr={minHeight:"100vh",background:D.bg,color:D.text,fontFamily:D.font,padding:"20px"};
  const confCol=c=>c==="confident"?"#22c55e":c==="getting there"?"#f59e0b":c==="needs work"?"#ef4444":D.muted;

  // ═══ LOGIN ═══
  if(screen==="login")return(
    <div style={{...wr,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
      <div style={{maxWidth:400,width:"100%",marginTop:"15vh",textAlign:"center"}} className="fadeIn">
        <div style={{fontSize:"48px",marginBottom:"8px"}}>🔬</div>
        <h1 style={{fontFamily:D.display,fontSize:"32px",fontWeight:800,marginBottom:"8px",background:"linear-gradient(135deg,#22c55e,#06b6d4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>ScienceFlash</h1>
        <p style={{color:D.muted,fontSize:"14px",marginBottom:"32px"}}>IGCSE Science Revision</p>
        <div style={cd}>
          <label style={{fontSize:"13px",fontWeight:600,color:D.muted,display:"block",marginBottom:"8px",textAlign:"left"}}>What's your name?</label>
          <input value={loginName} onChange={e=>setLoginName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="Enter your name..." style={{width:"100%",padding:"14px 16px",fontSize:"16px",background:D.bg,border:`1px solid ${D.border}`,borderRadius:"10px",color:D.text,fontFamily:D.font,marginBottom:"16px"}}/>
          <button onClick={handleLogin} disabled={loginLoading} style={{...b(D.accent,"#052e16"),width:"100%",opacity:loginLoading?.6:1}}>{loginLoading?"Loading...":"Start Revising →"}</button>
        </div>
        <button onClick={openParent} style={{marginTop:"24px",background:"transparent",border:`1px solid ${D.border}`,borderRadius:"10px",padding:"10px 20px",color:D.muted,fontFamily:D.font,fontWeight:600,fontSize:"13px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=D.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>👨‍👩‍👦 Parent Dashboard</button>
      </div>
    </div>
  );

  // ═══ PARENT ═══
  if(screen==="parent"){
    return(
      <div style={wr}><link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
        <div style={{maxWidth:960,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <h2 style={{fontFamily:D.display,fontWeight:800,fontSize:"24px"}}>👨‍👩‍👦 Parent Dashboard</h2>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              {!mergeMode&&parentData&&parentData.length>1&&<button onClick={()=>{setMergeMode(true);setMergeSelected(new Set());setMergeTarget("")}} style={{...b("transparent","#6366f1"),border:`1px solid #6366f144`,padding:"10px 16px",fontSize:"13px"}}>🔀 Merge accounts</button>}
              {mergeMode&&<button onClick={()=>{setMergeMode(false);setMergeSelected(new Set());setMergeTarget("")}} style={{...b("transparent",D.muted),border:`1px solid ${D.border}`,padding:"10px 16px",fontSize:"13px"}}>✕ Cancel merge</button>}
              <button onClick={()=>setScreen("login")} style={{...b("transparent",D.muted),border:`1px solid ${D.border}`}}>← Back</button>
            </div>
          </div>

          {mergeMode&&<div style={{...cd,marginBottom:"16px",padding:"16px 20px",background:"#6366f122",borderColor:"#6366f144"}}>
            <div style={{fontSize:"13px",fontWeight:700,color:"#a5b4fc",marginBottom:"10px"}}>🔀 Merge mode: tick 2 or more students, then choose which name to keep.</div>
            {mergeSelected.size>=2&&<div style={{marginTop:"10px"}}>
              <div style={{fontSize:"12px",color:D.muted,marginBottom:"6px"}}>Keep under name:</div>
              <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"10px"}}>
                {[...mergeSelected].map(name=><button key={name} onClick={()=>setMergeTarget(name)} style={{padding:"8px 14px",background:mergeTarget===name?"#6366f1":D.bg,color:mergeTarget===name?"white":D.text,border:`1px solid ${mergeTarget===name?"#6366f1":D.border}`,borderRadius:"8px",fontFamily:D.font,fontWeight:700,fontSize:"13px",cursor:"pointer",textTransform:"capitalize"}}>{name}</button>)}
              </div>
              {mergeTarget&&<button disabled={mergeBusy} onClick={async()=>{
                if(!confirm(`Merge ${mergeSelected.size} accounts into "${mergeTarget}"? The other accounts will be deleted.`))return;
                setMergeBusy(true);
                const names=[...mergeSelected];
                const merged={};
                for(const n of names){const s=parentData.find(x=>x.name===n);if(!s)continue;for(const[tid,tp] of Object.entries(s.progress||{})){const ex=merged[tid];if(!ex){merged[tid]={...tp}}else{merged[tid]={correct:(ex.correct||0)+(tp.correct||0),total:(ex.total||0)+(tp.total||0),interval:Math.max(ex.interval||1,tp.interval||1),lastSeen:(!ex.lastSeen||(tp.lastSeen&&new Date(tp.lastSeen)>new Date(ex.lastSeen)))?tp.lastSeen:ex.lastSeen,nextDate:(!ex.nextDate||(tp.nextDate&&new Date(tp.nextDate)<new Date(ex.nextDate)))?tp.nextDate:ex.nextDate}}}}
                const targetId=mergeTarget.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
                await saveProgress(targetId,merged);
                for(const n of names){if(n===mergeTarget)continue;const id=n.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");await sbDelete(PFX+id)}
                const fresh=await loadAllProgress();setParentData(fresh);
                setMergeMode(false);setMergeSelected(new Set());setMergeTarget("");setMergeBusy(false);
              }} style={{...b("#6366f1","white"),opacity:mergeBusy?.6:1}}>{mergeBusy?"Merging...":`✓ Merge into "${mergeTarget}"`}</button>}
            </div>}
          </div>}

          {parentLoading?<div style={{textAlign:"center",padding:"60px",color:D.muted}}>⏳ Loading...</div>
          :!parentData||parentData.length===0?<div style={{...cd,textAlign:"center",padding:"40px"}}><p style={{color:D.muted}}>📭 No students yet.</p></div>
          :<div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
            {parentData.map((student,si)=>{
              const prog=student.progress;const totalQs=TOPICS.reduce((s,t)=>s+(prog[t.id]?.total||0),0);const totalC=TOPICS.reduce((s,t)=>s+(prog[t.id]?.correct||0),0);
              const pct=totalQs>0?Math.round(100*totalC/totalQs):0;const topicsDone=TOPICS.filter(t=>prog[t.id]?.total>0).length;
              const confN=TOPICS.filter(t=>getConf(prog[t.id])==="confident").length;const needsN=TOPICS.filter(t=>prog[t.id]?.total>0&&getConf(prog[t.id])==="needs work").length;
              const dueN=TOPICS.filter(t=>isDue(prog[t.id])).length;
              const lastActive=TOPICS.reduce((l,t)=>{const ls=prog[t.id]?.lastSeen;return ls&&(!l||new Date(ls)>new Date(l))?ls:l},null);
              const isExp=parentExpanded===si;
              return(<div key={si} style={{borderRadius:"16px",overflow:"hidden",border:`1px solid ${mergeMode&&mergeSelected.has(student.name)?"#6366f1":D.border}`}}>
                <div onClick={()=>{if(mergeMode){setMergeSelected(prev=>{const n=new Set(prev);if(n.has(student.name)){n.delete(student.name);if(mergeTarget===student.name)setMergeTarget("")}else n.add(student.name);return n})}else{setParentExpanded(isExp?null:si)}}} style={{background:mergeMode&&mergeSelected.has(student.name)?"#6366f122":D.card,padding:"20px 24px",cursor:"pointer",transition:"background .15s"}} onMouseEnter={e=>{if(!(mergeMode&&mergeSelected.has(student.name)))e.currentTarget.style.background=D.border}} onMouseLeave={e=>{e.currentTarget.style.background=mergeMode&&mergeSelected.has(student.name)?"#6366f122":D.card}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"12px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"14px"}}>
                      {mergeMode&&<div style={{width:"22px",height:"22px",borderRadius:"6px",border:`2px solid ${mergeSelected.has(student.name)?"#6366f1":D.border}`,background:mergeSelected.has(student.name)?"#6366f1":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",color:"white",flexShrink:0}}>{mergeSelected.has(student.name)?"✓":""}</div>}
                      <div style={{width:"48px",height:"48px",borderRadius:"50%",background:`linear-gradient(135deg,${D.accent},#06b6d4)`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"20px",fontWeight:800,color:"#052e16"}}>{student.name.charAt(0).toUpperCase()}</div>
                      <div><div style={{fontWeight:800,fontSize:"18px",fontFamily:D.display,textTransform:"capitalize"}}>{student.name}</div><div style={{fontSize:"12px",color:D.muted}}>{lastActive?`Last active: ${new Date(lastActive).toLocaleDateString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}`:"Not started"}</div></div>
                    </div>
                    <div style={{display:"flex",gap:"16px",alignItems:"center",flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}><div style={{fontWeight:800,fontSize:"20px",color:D.accent}}>{totalQs}</div><div style={{fontSize:"10px",color:D.muted}}>Answers</div></div>
                      <div style={{textAlign:"center"}}><div style={{fontWeight:800,fontSize:"20px",color:pct>=70?"#22c55e":pct>=40?"#f59e0b":"#ef4444"}}>{pct}%</div><div style={{fontSize:"10px",color:D.muted}}>Accuracy</div></div>
                      <div style={{textAlign:"center"}}><div style={{fontWeight:800,fontSize:"20px"}}>{topicsDone}/{TOPICS.length}</div><div style={{fontSize:"10px",color:D.muted}}>Topics</div></div>
                      <div style={{textAlign:"center"}}><div style={{fontWeight:800,fontSize:"20px",color:"#22c55e"}}>{confN}</div><div style={{fontSize:"10px",color:D.muted}}>Confident</div></div>
                      <span style={{fontSize:"18px",color:D.muted,transition:"transform .2s",transform:isExp?"rotate(180deg)":"none"}}>▼</span>
                      <button onClick={async(e)=>{e.stopPropagation();if(!confirm("Delete all data for "+student.name+"? This cannot be undone."))return;const key=PFX+student.name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");const res=await sbDelete(key);if(!res.ok){alert(`Delete failed (HTTP ${res.status}). Your Supabase anon key may not have DELETE permissions. Details: ${res.body||"(empty)"}`);return}if(res.deleted===0){alert(`No row was deleted. The key "${key}" may not exist, or RLS is blocking DELETE. Check the Supabase dashboard.`);return}setParentData(prev=>prev.filter(s=>s.name!==student.name))}} style={{background:"transparent",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"16px",padding:"4px 8px",opacity:.5,transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=.5} title="Delete student">🗑️</button>
                    </div>
                  </div>
                </div>
                {isExp&&<div style={{background:D.bg,padding:"16px 24px"}}>
                  <div style={{display:"flex",gap:"10px",flexWrap:"wrap",marginBottom:"16px"}}>
                    {needsN>0&&<span style={{background:"#ef444422",color:"#ef4444",padding:"4px 12px",borderRadius:"20px",fontSize:"12px",fontWeight:700}}>💪 {needsN} need work</span>}
                    <span style={{background:"#f59e0b22",color:"#f59e0b",padding:"4px 12px",borderRadius:"20px",fontSize:"12px",fontWeight:700}}>📅 {dueN} due</span>
                    {confN>0&&<span style={{background:"#22c55e22",color:"#22c55e",padding:"4px 12px",borderRadius:"20px",fontSize:"12px",fontWeight:700}}>✅ {confN} confident</span>}
                  </div>
                  {SUBJECTS.map(sub=>{
                    const st=TOPICS.filter(t=>t.subject===sub.id);const sq=st.reduce((s,t)=>s+(prog[t.id]?.total||0),0);const sc=st.reduce((s,t)=>s+(prog[t.id]?.correct||0),0);
                    if(sq===0)return<div key={sub.id} style={{marginBottom:"12px",padding:"12px 16px",borderRadius:"10px",border:`1px solid ${D.border}`,opacity:.5}}><span>{sub.emoji}</span> <span style={{fontWeight:700,fontSize:"14px",marginLeft:"8px"}}>{sub.name}</span><span style={{fontSize:"12px",color:D.muted,marginLeft:"12px"}}>Not started</span></div>;
                    return<div key={sub.id} style={{marginBottom:"12px",borderRadius:"10px",border:`1px solid ${D.border}`,overflow:"hidden"}}>
                      <div style={{background:sub.grad,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:700,fontSize:"14px"}}>{sub.emoji} {sub.name}</span><span style={{fontWeight:800,fontSize:"13px"}}>{sq} answers · {Math.round(100*sc/sq)}%</span></div>
                      <div style={{padding:"10px 16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:"6px"}}>
                        {st.map(topic=>{const tp=prog[topic.id];if(!tp?.total)return<div key={topic.id} style={{fontSize:"12px",color:D.muted,padding:"6px 10px",borderRadius:"6px",background:D.card}}>{topic.emoji} {topic.name} — <em>not started</em></div>;
                          const conf=getConf(tp);const c2=confCol(conf);const p2=Math.round(100*tp.correct/tp.total);
                          return<div key={topic.id} style={{fontSize:"12px",padding:"8px 10px",borderRadius:"8px",background:D.card,display:"flex",justifyContent:"space-between",alignItems:"center",borderLeft:`3px solid ${c2}`}}><div><div style={{fontWeight:700,marginBottom:"2px"}}>{topic.emoji} {topic.name}</div><div style={{color:D.muted}}>{tp.total} Qs · <span style={{color:c2,fontWeight:700}}>{conf}</span></div></div><div style={{fontWeight:800,color:c2,fontSize:"14px"}}>{p2}%</div></div>
                        })}
                      </div>
                    </div>
                  })}
                </div>}
              </div>);
            })}
          </div>}
        </div>
      </div>
    );
  }

  // ═══ PROGRESS ═══
  if(screen==="progress"){
    const dc=getAllTopics().filter(t=>isDue(progress[t.id])).length;
    return(
      <div style={wr}><link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
        <div style={{maxWidth:960,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <h2 style={{fontFamily:D.display,fontWeight:800,fontSize:"24px"}}>📊 Progress — {user?.name}</h2>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              {selected.size>0&&<button onClick={startSelected} style={{...b("#6366f1","white"),padding:"10px 20px",fontSize:"14px"}}>▶ Quiz {selected.size} topic{selected.size>1?"s":""}</button>}
              {selected.size>0&&<button onClick={()=>setSelected(new Set())} style={{...b("transparent",D.muted),padding:"10px 16px",fontSize:"13px",border:`1px solid ${D.border}`}}>Clear</button>}
              <button onClick={()=>{setFocus(null);setSelected(new Set());pickQuestion(progress,null);setScreen("quiz")}} style={b(D.accent,"#052e16")}>Quiz All</button>
              <button onClick={()=>{const ft=getAllTopics().filter(t=>t.subject===aqSubject);setAqTopic(ft[0]?.id||"__new__");setAqMsg(null);setScreen("addqs")}} style={{...b("transparent",D.muted),padding:"10px 16px",fontSize:"13px",border:`1px solid ${D.border}`}}>➕ Add Questions</button>
            </div>
          </div>

          {selected.size>0&&<div style={{...cd,marginBottom:"16px",padding:"14px 20px",background:"#6366f122",borderColor:"#6366f144"}}>
            <div style={{fontSize:"13px",color:"#a5b4fc",fontWeight:600}}>✅ Selected: {[...selected].map(id=>{const t=getAllTopics().find(t=>t.id===id);return t?t.name:id}).join(", ")}</div>
          </div>}

          <div style={{...cd,marginBottom:"24px",display:"flex",gap:"32px",justifyContent:"center",flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display,color:D.accent}}>{session.correct}</div><div style={{fontSize:"12px",color:D.muted}}>Correct (session)</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display}}>{session.total}</div><div style={{fontSize:"12px",color:D.muted}}>Attempted (session)</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display,color:"#f59e0b"}}>{dc}</div><div style={{fontSize:"12px",color:D.muted}}>Due</div></div>
          </div>

          {SUBJECTS.map(sub=>{
            const st=getAllTopics().filter(t=>t.subject===sub.id);const tq=st.reduce((s,t)=>s+(progress[t.id]?.total||0),0);const tc=st.reduce((s,t)=>s+(progress[t.id]?.correct||0),0);const sd=st.filter(t=>isDue(progress[t.id])).length;
            const allSubSelected=st.every(t=>selected.has(t.id));const someSubSelected=st.some(t=>selected.has(t.id));
            return(
              <div key={sub.id} style={{marginBottom:"20px",borderRadius:"16px",overflow:"hidden",border:`1px solid ${D.border}`}}>
                <div style={{background:sub.grad,padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                    <span style={{fontSize:"28px"}}>{sub.emoji}</span>
                    <div><div style={{fontWeight:800,fontSize:"18px",fontFamily:D.display}}>{sub.name}</div><div style={{fontSize:"12px",opacity:.8}}>{st.length} topics · {tq} answers · {sd} due</div></div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    {tq>0&&<div style={{background:"rgba(255,255,255,.2)",borderRadius:"10px",padding:"6px 14px",fontWeight:800,fontSize:"14px"}}>{Math.round(100*tc/tq)}%</div>}
                    <button onClick={()=>selectSubject(sub.id)} style={{background:allSubSelected?"rgba(255,255,255,.35)":"rgba(255,255,255,.15)",borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:700,border:"none",color:"white",cursor:"pointer",transition:"all .15s"}}>{allSubSelected?"✓ All selected":"☐ Select all"}</button>
                    <button onClick={()=>startSubject(sub.id)} style={{background:"rgba(255,255,255,.25)",borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:700,border:"none",color:"white",cursor:"pointer"}}>▶ Quiz</button>
                  </div>
                </div>
                <div style={{background:D.card,padding:"16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:"10px"}}>
                  {st.map(topic=>{const tp=progress[topic.id];const conf=getConf(tp);const c2=confCol(conf);const pct=tp?.total?Math.round(100*tp.correct/tp.total):0;const due=isDue(tp);const isSel=selected.has(topic.id);
                    return<div key={topic.id} onClick={()=>toggleSelect(topic.id)} style={{background:isSel?"#6366f118":D.bg,borderRadius:"12px",padding:"14px 16px",border:`2px solid ${isSel?"#6366f1":D.border}`,display:"flex",alignItems:"center",gap:"12px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{if(!isSel)e.currentTarget.style.borderColor=topic.color}} onMouseLeave={e=>{if(!isSel)e.currentTarget.style.borderColor=D.border}}>
                      <div style={{width:"22px",height:"22px",borderRadius:"6px",border:`2px solid ${isSel?"#6366f1":D.border}`,background:isSel?"#6366f1":"transparent",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"14px",color:"white",flexShrink:0,transition:"all .15s"}}>{isSel?"✓":""}</div>
                      <span style={{fontSize:"20px"}}>{topic.emoji}</span>
                      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:"13px",marginBottom:"3px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{topic.name}</div><div style={{display:"flex",gap:"8px",fontSize:"11px",color:D.muted,flexWrap:"wrap"}}><span style={{color:c2,fontWeight:700}}>{conf}</span>{tp?.total>0&&<span>{pct}%</span>}{due&&<span style={{color:"#f59e0b"}}>📅</span>}</div></div>
                      {tp?.total>0&&<div style={{width:"38px",height:"38px",borderRadius:"50%",border:`3px solid ${c2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,color:c2,flexShrink:0}}>{pct}%</div>}
                    </div>
                  })}
                </div>
              </div>
            );
          })}

          {/* REVISION LINKS */}
          <div style={{marginTop:"8px",borderRadius:"16px",overflow:"hidden",border:`1px solid ${D.border}`}}>
            <div style={{background:"linear-gradient(135deg,#1e293b,#334155)",padding:"16px 24px"}}><div style={{fontWeight:800,fontSize:"18px",fontFamily:D.display}}>📚 Revision Resources</div><div style={{fontSize:"12px",color:D.muted,marginTop:"4px"}}>Recommended by your teachers</div></div>
            <div style={{background:D.card,padding:"16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"10px"}}>
              {LINKS.map((lk,i)=><a key={i} href={lk.url} target="_blank" rel="noopener noreferrer" style={{background:D.bg,borderRadius:"12px",padding:"14px 16px",border:`1px solid ${D.border}`,display:"flex",alignItems:"center",gap:"12px",textDecoration:"none",color:D.text,transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=lk.color;e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=D.border;e.currentTarget.style.transform="none"}}><span style={{fontSize:"24px"}}>{lk.emoji}</span><div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:"13px",color:lk.color}}>{lk.name} ↗</div><div style={{fontSize:"11px",color:D.muted,marginTop:"2px"}}>{lk.desc}</div></div></a>)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══ ADD QUESTIONS ═══
  if(screen==="addqs"){
    const allTopics=getAllTopics();
    const subTopics=allTopics.filter(t=>t.subject===aqSubject);

    async function addSingle(){
      if(!aqQ.trim()||!aqA.trim()){setAqMsg({type:"err",text:"Question and answer are required"});return}
      setAqSaving(true);
      const isNew=aqTopic==="__new__";
      const topicId=isNew?aqNewTopic.trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""):aqTopic;
      if(isNew&&!aqNewTopic.trim()){setAqMsg({type:"err",text:"Enter a topic name"});setAqSaving(false);return}
      const newQ={q:aqQ.trim(),answer:aqA.trim(),alts:aqAlts.trim()?aqAlts.split(",").map(s=>s.trim()).filter(Boolean):[],hint:aqHint.trim(),topicId,subject:aqSubject,customTopic:isNew,topicName:isNew?aqNewTopic.trim():undefined,topicEmoji:isNew?"📝":undefined,topicColor:isNew?SUBJECTS.find(s=>s.id===aqSubject)?.color||"#6366f1":undefined,addedAt:new Date().toISOString()};
      const updated=[...customQs,newQ];
      await saveCustomQs(updated);setCustomQs(updated);
      setAqQ("");setAqA("");setAqAlts("");setAqHint("");
      setAqMsg({type:"ok",text:"Question added!"});setAqSaving(false);
    }

    async function addBulk(){
      if(!aqBulk.trim()){setAqMsg({type:"err",text:"Paste some questions first"});return}
      setAqSaving(true);
      const lines=aqBulk.trim().split("\n").map(l=>l.trim()).filter(Boolean);
      const parsed=[];let cur={};
      for(const line of lines){
        const lower=line.toLowerCase();
        if(lower.startsWith("q:")||lower.startsWith("question:")){if(cur.q&&cur.answer)parsed.push(cur);cur={q:line.replace(/^(q|question):\s*/i,"").trim()}}
        else if(lower.startsWith("a:")||lower.startsWith("answer:")){cur.answer=line.replace(/^(a|answer):\s*/i,"").trim()}
        else if(lower.startsWith("h:")||lower.startsWith("hint:")){cur.hint=line.replace(/^(h|hint):\s*/i,"").trim()}
        else if(lower.startsWith("alt:")||lower.startsWith("alts:")){cur.alts=line.replace(/^(alt|alts):\s*/i,"").split(",").map(s=>s.trim()).filter(Boolean)}
        else if(cur.q&&!cur.answer){cur.answer=line}
      }
      if(cur.q&&cur.answer)parsed.push(cur);
      if(!parsed.length){setAqMsg({type:"err",text:"Couldn't find any Q/A pairs. Use the format:\nQ: question\nA: answer"});setAqSaving(false);return}
      const isNew=aqTopic==="__new__";
      const topicId=isNew?aqNewTopic.trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,""):aqTopic;
      if(isNew&&!aqNewTopic.trim()){setAqMsg({type:"err",text:"Enter a topic name"});setAqSaving(false);return}
      const newQs=parsed.map(p=>({q:p.q,answer:p.answer,alts:p.alts||[],hint:p.hint||"",topicId,subject:aqSubject,customTopic:isNew,topicName:isNew?aqNewTopic.trim():undefined,topicEmoji:isNew?"📝":undefined,topicColor:isNew?SUBJECTS.find(s=>s.id===aqSubject)?.color||"#6366f1":undefined,addedAt:new Date().toISOString()}));
      const updated=[...customQs,...newQs];
      await saveCustomQs(updated);setCustomQs(updated);
      setAqBulk("");
      setAqMsg({type:"ok",text:`Added ${newQs.length} question${newQs.length>1?"s":""}!`});setAqSaving(false);
    }

    async function deleteCustomQ(idx){
      const updated=customQs.filter((_,i)=>i!==idx);
      await saveCustomQs(updated);setCustomQs(updated);
      setAqMsg({type:"ok",text:"Question deleted"});
    }

    const inp={width:"100%",padding:"12px 14px",fontSize:"14px",background:D.bg,border:`1px solid ${D.border}`,borderRadius:"10px",color:D.text,fontFamily:D.font,marginBottom:"10px",boxSizing:"border-box"};
    const lbl={fontSize:"12px",fontWeight:700,color:D.muted,marginBottom:"4px",display:"block"};
    return(
      <div style={wr}><link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
        <div style={{maxWidth:700,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <h2 style={{fontFamily:D.display,fontWeight:800,fontSize:"24px"}}>➕ Add Questions</h2>
            <button onClick={()=>setScreen("progress")} style={{...b("transparent",D.muted),border:`1px solid ${D.border}`}}>← Back</button>
          </div>

          {/* Tabs */}
          <div style={{display:"flex",gap:"4px",marginBottom:"20px"}}>
            {[["single","✏️ Single"],["bulk","📋 Paste Bulk"],["manage","🗂️ My Questions"]].map(([id,label])=>
              <button key={id} onClick={()=>{setAqTab(id);setAqMsg(null)}} style={{padding:"10px 18px",background:aqTab===id?"#6366f1":D.card,color:aqTab===id?"white":D.text,border:`1px solid ${aqTab===id?"#6366f1":D.border}`,borderRadius:"10px",fontFamily:D.font,fontWeight:700,fontSize:"13px",cursor:"pointer"}}>{label}</button>
            )}
          </div>

          {/* Subject + Topic picker — shared by single and bulk */}
          {aqTab!=="manage"&&<div style={{...cd,marginBottom:"16px"}}>
            <label style={lbl}>Subject</label>
            <div style={{display:"flex",gap:"8px",marginBottom:"14px"}}>
              {SUBJECTS.map(s=><button key={s.id} onClick={()=>{setAqSubject(s.id);const ft=allTopics.filter(t=>t.subject===s.id);setAqTopic(ft[0]?.id||"__new__")}} style={{padding:"8px 16px",background:aqSubject===s.id?s.color+"33":D.bg,border:`1px solid ${aqSubject===s.id?s.color:D.border}`,borderRadius:"8px",color:aqSubject===s.id?s.color:D.muted,fontFamily:D.font,fontWeight:700,fontSize:"13px",cursor:"pointer"}}>{s.emoji} {s.name}</button>)}
            </div>
            <label style={lbl}>Topic</label>
            <select value={aqTopic} onChange={e=>setAqTopic(e.target.value)} style={{...inp,cursor:"pointer"}}>
              {subTopics.map(t=><option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
              <option value="__new__">➕ New topic...</option>
            </select>
            {aqTopic==="__new__"&&<input value={aqNewTopic} onChange={e=>setAqNewTopic(e.target.value)} placeholder="New topic name..." style={inp}/>}
          </div>}

          {/* Single question form */}
          {aqTab==="single"&&<div style={cd}>
            <label style={lbl}>Question</label>
            <textarea value={aqQ} onChange={e=>setAqQ(e.target.value)} placeholder="e.g. What is the function of the mitochondria?" rows={2} style={{...inp,resize:"vertical"}}/>
            <label style={lbl}>Answer</label>
            <textarea value={aqA} onChange={e=>setAqA(e.target.value)} placeholder="e.g. To produce energy through aerobic respiration" rows={2} style={{...inp,resize:"vertical"}}/>
            <label style={lbl}>Alternative answers <span style={{fontWeight:400,color:D.muted}}>(comma-separated, optional)</span></label>
            <input value={aqAlts} onChange={e=>setAqAlts(e.target.value)} placeholder="e.g. produces energy, site of respiration" style={inp}/>
            <label style={lbl}>Hint <span style={{fontWeight:400,color:D.muted}}>(optional)</span></label>
            <input value={aqHint} onChange={e=>setAqHint(e.target.value)} placeholder="e.g. The powerhouse of the cell" style={inp}/>
            <button onClick={addSingle} disabled={aqSaving} style={{...b(D.accent,"#052e16"),width:"100%",opacity:aqSaving?.6:1,marginTop:"6px"}}>{aqSaving?"Saving...":"Add Question"}</button>
          </div>}

          {/* Bulk paste */}
          {aqTab==="bulk"&&<div style={cd}>
            <div style={{background:D.bg,borderRadius:"10px",padding:"12px 16px",marginBottom:"14px",fontSize:"12px",color:D.muted,lineHeight:1.6}}>
              Paste questions in this format:<br/>
              <span style={{color:D.accent,fontWeight:700}}>Q:</span> What is osmosis?<br/>
              <span style={{color:D.accent,fontWeight:700}}>A:</span> Movement of water from dilute to concentrated solution through a partially permeable membrane<br/>
              <span style={{color:D.accent,fontWeight:700}}>H:</span> Think about water and membranes<br/>
              <span style={{color:D.muted}}>(H: hint line is optional — repeat Q/A/H blocks for multiple questions)</span>
            </div>
            <textarea value={aqBulk} onChange={e=>setAqBulk(e.target.value)} placeholder={"Q: First question\nA: First answer\nH: Optional hint\n\nQ: Second question\nA: Second answer"} rows={10} style={{...inp,resize:"vertical",fontFamily:"monospace",fontSize:"13px"}}/>
            <button onClick={addBulk} disabled={aqSaving} style={{...b(D.accent,"#052e16"),width:"100%",opacity:aqSaving?.6:1,marginTop:"6px"}}>{aqSaving?"Importing...":"Import Questions"}</button>
          </div>}

          {/* Manage existing custom questions */}
          {aqTab==="manage"&&<div>
            {customQs.length===0?<div style={{...cd,textAlign:"center",padding:"40px",color:D.muted}}>No custom questions yet — add some using the tabs above!</div>
            :SUBJECTS.map(sub=>{
              const subQs=customQs.map((q,i)=>({...q,_idx:i})).filter(q=>q.subject===sub.id);
              if(!subQs.length)return null;
              const byTopic={};subQs.forEach(q=>{const k=q.topicName||allTopics.find(t=>t.id===q.topicId)?.name||q.topicId;if(!byTopic[k])byTopic[k]=[];byTopic[k].push(q)});
              return<div key={sub.id} style={{marginBottom:"16px"}}>
                <div style={{fontWeight:800,fontSize:"14px",color:sub.color,marginBottom:"8px"}}>{sub.emoji} {sub.name}</div>
                {Object.entries(byTopic).map(([tName,tQs])=><div key={tName} style={{...cd,marginBottom:"10px"}}>
                  <div style={{fontWeight:700,fontSize:"13px",marginBottom:"10px",color:D.text}}>{tName}</div>
                  {tQs.map(q=><div key={q._idx} style={{display:"flex",alignItems:"flex-start",gap:"10px",padding:"8px 0",borderTop:`1px solid ${D.border}`}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:"13px",fontWeight:600}}>{q.q}</div>
                      <div style={{fontSize:"12px",color:D.accent,marginTop:"2px"}}>{q.answer}</div>
                    </div>
                    <button onClick={()=>deleteCustomQ(q._idx)} style={{background:"transparent",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"16px",padding:"4px",flexShrink:0}}>🗑️</button>
                  </div>)}
                </div>)}
              </div>
            })}
          </div>}

          {/* Feedback message */}
          {aqMsg&&<div className="fadeIn" style={{marginTop:"16px",padding:"12px 16px",borderRadius:"10px",background:aqMsg.type==="ok"?"#22c55e22":"#ef444422",color:aqMsg.type==="ok"?"#22c55e":"#fca5a5",fontWeight:700,fontSize:"13px",whiteSpace:"pre-line"}}>{aqMsg.text}</div>}
        </div>
      </div>
    );
  }

  // ═══ QUIZ ═══
  const pool=getPool();const dc2=pool.filter(t=>isDue(progress[t.id])).length;
  const cs=curTopic?SUBJECTS.find(s=>s.id===curTopic.subject):null;const focusLabel=getFocusLabel();
  return(
    <div style={{...wr,display:"flex",flexDirection:"column",alignItems:"center"}}><link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
      <div style={{maxWidth:540,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
          <div><span style={{fontSize:"13px",color:D.muted}}>👋 {user?.name}</span>{streak>=3&&<span style={{marginLeft:"12px",fontSize:"13px",color:"#f59e0b",fontWeight:700}}>🔥 {streak}</span>}</div>
          <button onClick={()=>setScreen("progress")} style={{...b("transparent",D.muted),padding:"8px 14px",fontSize:"13px",border:`1px solid ${D.border}`}}>📊 Progress</button>
        </div>
        {focusLabel&&<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:(cs?.color||"#6366f1")+"18",border:`1px solid ${(cs?.color||"#6366f1")}44`,borderRadius:"12px",padding:"10px 16px",marginBottom:"16px",fontSize:"13px"}}><span style={{fontWeight:700,color:cs?.color||"#6366f1"}}>Focused: {focusLabel}</span><button onClick={clearFocus} style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:D.font,fontWeight:700,fontSize:"13px",padding:"4px 8px"}}>✕ Quiz All</button></div>}
        <div style={{display:"flex",gap:"16px",marginBottom:"20px",fontSize:"13px",color:D.muted}}>
          <span>✅ {session.correct}/{session.total}</span><span>📅 {dc2} due{focusLabel?"":" (all)"}</span>{!focusLabel&&cs&&<span style={{color:cs.color,fontWeight:700}}>{cs.emoji} {cs.name}</span>}
        </div>
        {curQ&&curTopic&&(
          <div className={feedback?.type==="wrong"?"shake":feedback?.type==="correct"?"pulse":"fadeIn"} style={{...cd,borderLeft:`4px solid ${curTopic.color}`,marginBottom:"16px"}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:curTopic.color+"22",color:curTopic.color,padding:"4px 12px",borderRadius:"20px",fontSize:"12px",fontWeight:700,marginBottom:"16px"}}>{curTopic.emoji} {curTopic.name}</div>
            <p style={{fontSize:"18px",fontWeight:600,lineHeight:1.5,marginBottom:"20px",fontFamily:D.display}}>{curQ.q}</p>
            {showHint&&curQ.hint&&<div className="fadeIn" style={{background:"#fef3c7",color:"#92400e",padding:"10px 14px",borderRadius:"10px",fontSize:"13px",marginBottom:"16px"}}>💡 {curQ.hint}</div>}
            {(!feedback||feedback.type==="tryagain")?(
              <div>
                {feedback?.type==="tryagain"&&<div style={{background:"#f59e0b22",color:"#f59e0b",padding:"10px 14px",borderRadius:"10px",fontSize:"13px",marginBottom:"12px",fontWeight:600}}>{feedback.msg}</div>}
                <textarea ref={inputRef} value={answer} onChange={e=>setAnswer(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submitAnswer()}}} placeholder={attempt===1?"Try again...":"Type your answer..."} rows={2} style={{width:"100%",padding:"14px",fontSize:"15px",background:D.bg,border:`2px solid ${attempt===1?"#f59e0b":D.border}`,borderRadius:"10px",color:D.text,fontFamily:D.font,resize:"none",marginBottom:"12px"}}/>
                <div style={{display:"flex",gap:"8px"}}><button onClick={submitAnswer} style={{...b(D.accent,"#052e16"),flex:1}}>Check Answer</button>{!showHint&&<button onClick={()=>setShowHint(true)} style={{...b("transparent","#f59e0b"),border:"1px solid #f59e0b44",padding:"12px 16px"}}>💡</button>}
<button onClick={()=>{if(listening){stopMic();micMode.current=false;return}micMode.current=true;startMic()}} style={{...b("transparent",listening?"#ef4444":micMode.current?"#6366f1":"#94a3b8"),border:`1px solid ${listening?"#ef444444":micMode.current?"#6366f144":"#33415544"}`,padding:"12px 16px",animation:listening?"pulse 1s infinite":"none"}}>{listening?"⏹":"🎤"}</button></div>
              </div>
            ):(
              <div className="fadeIn">
                <div style={{padding:"14px 18px",borderRadius:"10px",marginBottom:"14px",fontWeight:700,background:feedback.type==="correct"?"#22c55e22":"#ef444422",color:feedback.type==="correct"?"#22c55e":"#fca5a5",border:`1px solid ${feedback.type==="correct"?"#22c55e44":"#ef444444"}`,fontSize:feedback.type==="wrong"?"14px":"15px",lineHeight:1.5}}>{feedback.msg}</div>
               <button autoFocus onClick={()=>pickQuestion(progress,focus)} onKeyDown={e=>{if(e.key==="Enter")pickQuestion(progress,focus)}} style={{...b(D.accent,"#052e16"),width:"100%"}}>Next Question →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
