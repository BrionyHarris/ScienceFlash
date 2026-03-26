import { useState, useEffect, useRef } from "react";

// ============================================================
// HELPERS
// ============================================================
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ============================================================
// SUPABASE
// ============================================================
const SB_URL = "https://qglbenrgjxjjygtoslge.supabase.co";
const SB_KEY = "sb_publishable_iKBrFrvnDdgyngPF1mEahA_cUN1Yqa5";
async function sbFetch(path, opts = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, headers: { "apikey":SB_KEY, "Authorization":`Bearer ${SB_KEY}`, "Content-Type":"application/json", ...opts.headers } });
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
async function sbSet(k, v) { await sbFetch("kv_store?on_conflict=key", { method:"POST", headers:{"Prefer":"resolution=merge-duplicates,return=representation"}, body:JSON.stringify({key:k,value:JSON.stringify(v)}) }); }
async function sbGet(k) { const r = await sbFetch(`kv_store?key=eq.${encodeURIComponent(k)}&select=value`); if(!r||!r.length) return null; try{return JSON.parse(r[0].value)}catch{return r[0].value} }
const PFX = "sci_progress_";
async function loadProgress(uid) { try{return await sbGet(PFX+uid)||{}}catch{return{}} }
async function saveProgress(uid, p) { try{await sbSet(PFX+uid, p)}catch(e){console.error(e)} }

// ============================================================
// SPACED REPETITION
// ============================================================
const IV = [1,2,4,7,14,21];
function nextIv(cur, q) { if(q>=.8){const i=IV.indexOf(cur);return i>=0&&i<IV.length-1?IV[i+1]:cur} if(q>=.4)return cur; return 1; }
function isDue(ts) { if(!ts?.nextDate) return true; return new Date()>=new Date(ts.nextDate); }
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r.toISOString(); }
function getConf(ts) { if(!ts||!ts.total) return "not started"; const p=ts.total>0?ts.correct/ts.total:0; if(p>=.8&&(ts.interval||1)>=7) return "confident"; if(p>=.5) return "getting there"; return "needs work"; }

// ============================================================
// ANSWER CHECKING
// ============================================================
const FILL = new Set(["a","an","the","is","are","it","its","they","them","their","that","this","these","those","of","to","in","by","for","from","with","and","or","be","been","being","was","were","has","have","had","do","does","did","will","would","can","could","should","may","might","shall","also","very","much","more","most","some","any","all","each","every","both","which","what","when","where","how","who","whom","whose","there","here","then","than","so","as","at","on","up","into","out","about","because","if","but","not","no","yes","called","known","used","using","allows","causes","means"]);
function norm(s) { return s.toLowerCase().trim().replace(/\s+/g," ").replace(/['']/g,"'").replace(/[""]/g,'"').replace(/\.$/,""); }
function strip(s) { return s.split(/\s+/).filter(w=>!FILL.has(w)).join(" "); }
function kws(s) { return norm(s).split(/[\s,;:.()\-/]+/).filter(w=>w.length>1&&!FILL.has(w)); }
function checkAns(ur, cr, alts=[]) {
  const u=norm(ur); if(!u) return false;
  for(const c of [cr,...alts]) { const n=norm(c); if(u===n) return true; if(u.replace(/[\s,.\-;:()]/g,"")===n.replace(/[\s,.\-;:()]/g,"")) return true; const us=strip(u),cs=strip(n); if(us&&cs&&us===cs) return true; if(us&&cs&&us.replace(/[\s,.\-;:()]/g,"")===cs.replace(/[\s,.\-;:()]/g,"")) return true; }
  for(const c of [cr,...alts]) { const ck=kws(c); if(ck.length<=2) continue; const uk=kws(ur); let m=0; for(const k of ck){if(uk.some(u2=>u2===k||u2.startsWith(k.slice(0,-1))||k.startsWith(u2.slice(0,-1))))m++} if(m/ck.length>=.75&&m>=2) return true; }
  return false;
}

// ============================================================
// SUBJECTS & TOPICS
// ============================================================
const SUBJECTS = [
  {id:"biology",name:"Biology",emoji:"🧬",color:"#22c55e",grad:"linear-gradient(135deg,#166534,#15803d)"},
  {id:"chemistry",name:"Chemistry",emoji:"⚗️",color:"#f59e0b",grad:"linear-gradient(135deg,#92400e,#b45309)"},
  {id:"physics",name:"Physics",emoji:"⚡",color:"#3b82f6",grad:"linear-gradient(135deg,#1e3a8a,#1d4ed8)"},
];

const TOPICS = [
  // BIOLOGY
  {id:"gas_exchange",subject:"biology",name:"Gas Exchange & Transpiration",emoji:"🌿",color:"#16a34a",questions:[
    {q:"What is gas exchange in plants?",answer:"The diffusion of oxygen and carbon dioxide in and out of the leaf through the stomata",alts:["diffusion of O2 and CO2 through stomata"],hint:"Think about what moves in and out of leaves"},
    {q:"What process requires carbon dioxide to diffuse into a leaf?",answer:"Photosynthesis",alts:[],hint:"Makes glucose using light"},
    {q:"What process requires oxygen to diffuse into a leaf?",answer:"Aerobic respiration",alts:["respiration"],hint:"Releases energy from glucose"},
    {q:"Name the cells that open and close the stomata.",answer:"Guard cells",alts:[],hint:"They 'guard' the openings"},
    {q:"Name four factors that affect transpiration rate.",answer:"Light intensity, temperature, wind speed, humidity",alts:["light, temperature, wind, humidity"],hint:"What helps washing dry faster?"},
    {q:"What colour does hydrogen carbonate indicator turn in high CO2?",answer:"Yellow",alts:[],hint:"CO2 makes it more acidic"},
    {q:"What colour does hydrogen carbonate indicator turn in low CO2?",answer:"Purple",alts:[],hint:"Less CO2 = less acidic"},
    {q:"What is transpiration?",answer:"The loss of water from a plant's leaves by evaporation and diffusion",alts:["evaporation of water from leaves","loss of water from leaves"],hint:"Water escapes through stomata"},
  ]},
  {id:"blood_immunity",subject:"biology",name:"Blood & Immunity",emoji:"🩸",color:"#dc2626",questions:[
    {q:"What are the four components of blood?",answer:"Plasma, red blood cells, white blood cells, platelets",alts:["red blood cells, white blood cells, platelets, plasma"],hint:"A liquid, two cell types, cell fragments"},
    {q:"What molecule in red blood cells binds to oxygen?",answer:"Haemoglobin",alts:["hemoglobin"],hint:"Contains iron, gives blood red colour"},
    {q:"Name the two types of white blood cell.",answer:"Phagocytes and lymphocytes",alts:["lymphocytes and phagocytes"],hint:"One engulfs, one makes antibodies"},
    {q:"How do phagocytes destroy pathogens?",answer:"They engulf and digest them",alts:["phagocytosis"],hint:"They 'eat' pathogens"},
    {q:"How do lymphocytes destroy pathogens?",answer:"They produce antibodies that bind to antigens",alts:["produce antibodies"],hint:"Proteins that lock onto invaders"},
    {q:"What is the function of platelets?",answer:"Form blood clots",alts:["clot the blood","blood clotting"],hint:"What happens when you get a cut?"},
    {q:"What is the active ingredient in a vaccination?",answer:"A dead or inactive pathogen",alts:["dead pathogen","inactive pathogen"],hint:"Triggers immunity without disease"},
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
  ]},
  {id:"blood_vessels",subject:"biology",name:"Blood Vessels",emoji:"🔴",color:"#ea580c",questions:[
    {q:"Name the three types of blood vessel.",answer:"Arteries, veins, capillaries",alts:["arteries, capillaries, veins"],hint:"Away, back, through tissues"},
    {q:"Which direction do arteries carry blood?",answer:"Away from the heart",alts:["away from heart"],hint:"A for Away, A for Artery"},
    {q:"Why do arteries have thick, elastic walls?",answer:"To withstand high blood pressure",alts:["to cope with high pressure"],hint:"Blood leaves heart under force"},
    {q:"Why do veins have valves?",answer:"To prevent backflow of blood at low pressure",alts:["prevent backflow"],hint:"Low pressure in veins"},
    {q:"Why are capillary walls only one cell thick?",answer:"Short diffusion distance for exchanging substances",alts:["short diffusion distance"],hint:"Substances pass through walls"},
    {q:"What does 'hepatic' mean?",answer:"Related to the liver",alts:["to do with the liver","liver"],hint:"Think hepatitis"},
    {q:"What does 'renal' mean?",answer:"Related to the kidneys",alts:["to do with the kidneys","kidneys"],hint:"Renal failure = kidney failure"},
  ]},
  {id:"eye",subject:"biology",name:"The Eye",emoji:"👁️",color:"#7c3aed",questions:[
    {q:"What is the function of the cornea?",answer:"Refracts (bends) light into the eye",alts:["refracts light","bends light"],hint:"Transparent front part"},
    {q:"What is the function of the lens?",answer:"Focuses light onto the retina",alts:["refracts light onto retina"],hint:"Changes shape to focus"},
    {q:"What is accommodation?",answer:"Changing the shape of the lens to focus on near or far objects",alts:["adjusting lens shape to focus"],hint:"How the eye switches focus"},
    {q:"For near objects, what do ciliary muscles do?",answer:"Contract",alts:["they contract"],hint:"Tighten to make lens fatter"},
    {q:"For far objects, what shape does the lens become?",answer:"Thinner",alts:["thin","flat","flatter"],hint:"Less refraction needed"},
    {q:"In bright light, which iris muscles contract?",answer:"Circular muscles",alts:["the circular muscles"],hint:"Make pupil smaller"},
    {q:"In dim light, which iris muscles contract?",answer:"Radial muscles",alts:["the radial muscles"],hint:"Pull pupil open wider"},
  ]},
  {id:"reflexes",subject:"biology",name:"Reflexes & Nervous System",emoji:"⚡",color:"#0891b2",questions:[
    {q:"What is a stimulus?",answer:"A change in the environment",alts:[],hint:"Triggers a response"},
    {q:"Name the three types of neurone.",answer:"Sensory, relay, motor",alts:["sensory neurone, relay neurone, motor neurone"],hint:"Detect, connect, act"},
    {q:"What two organs make up the CNS?",answer:"The brain and spinal cord",alts:["brain and spinal cord"],hint:"Control centre"},
    {q:"What are synapses?",answer:"Gaps between neurones",alts:["junctions between neurones"],hint:"Signals must cross these"},
    {q:"How do signals cross a synapse?",answer:"Neurotransmitters diffuse across the gap",alts:["by neurotransmitters"],hint:"Chemical messengers"},
    {q:"What is a reflex action?",answer:"A rapid, automatic, involuntary response to a stimulus",alts:["an automatic response"],hint:"You don't think about it"},
    {q:"What is homeostasis?",answer:"The maintenance of a constant internal environment",alts:["keeping internal conditions constant"],hint:"Keeping things balanced"},
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
  ]},
  // CHEMISTRY
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
    {q:"Calculate Mr of water (H2O). H=1, O=16",answer:"18",alts:[],hint:"(2×1) + 16"},
    {q:"Calculate Mr of CO2. C=12, O=16",answer:"44",alts:[],hint:"12 + (2×16)"},
    {q:"How do you calculate moles?",answer:"Moles = mass / relative formula mass",alts:["mass divided by Mr","mass / Mr"],hint:"Mass on top, Mr on bottom"},
    {q:"Calculate moles in 36g of water (Mr=18)",answer:"2 moles",alts:["2","2 mol"],hint:"36 ÷ 18"},
    {q:"What is an empirical formula?",answer:"The simplest whole number ratio of atoms of each element in a compound",alts:["simplest ratio of atoms"],hint:"Simplest ratio"},
  ]},
  // PHYSICS
  {id:"forces_motion",subject:"physics",name:"Forces & Motion",emoji:"🚀",color:"#3b82f6",questions:[
    {q:"Formula for average speed?",answer:"Speed = distance / time",alts:["s = d/t","distance / time"],hint:"How far ÷ how long"},
    {q:"Formula for acceleration?",answer:"Acceleration = change in velocity / time",alts:["a = (v-u)/t"],hint:"How quickly speed changes"},
    {q:"What does the gradient of a distance-time graph show?",answer:"Speed",alts:["velocity"],hint:"Steeper = faster"},
    {q:"What does the gradient of a velocity-time graph show?",answer:"Acceleration",alts:[],hint:"Steeper = accelerating faster"},
    {q:"What does the area under a velocity-time graph show?",answer:"Distance travelled",alts:["distance"],hint:"Calculate the area"},
    {q:"State Newton's second law as a formula.",answer:"Force = mass × acceleration",alts:["F = ma","F = m × a"],hint:"F = ma"},
    {q:"Formula for weight?",answer:"Weight = mass × gravitational field strength",alts:["W = mg","W = m × g"],hint:"W = mg"},
    {q:"What is terminal velocity?",answer:"The constant speed when drag equals weight",alts:["when air resistance equals weight"],hint:"Forces balanced"},
    {q:"Formula for momentum?",answer:"Momentum = mass × velocity",alts:["p = mv"],hint:"p = mv"},
    {q:"What is stopping distance made up of?",answer:"Thinking distance + braking distance",alts:["thinking distance plus braking distance"],hint:"Reaction then friction"},
    {q:"Formula for moment of a force?",answer:"Moment = force × perpendicular distance from pivot",alts:["M = F × d"],hint:"Turning effect"},
  ]},
  {id:"electricity",subject:"physics",name:"Electricity",emoji:"💡",color:"#6366f1",questions:[
    {q:"Formula linking voltage, current, resistance?",answer:"Voltage = current × resistance",alts:["V = IR","V = I × R"],hint:"V = IR (Ohm's law)"},
    {q:"Formula for electrical power?",answer:"Power = current × voltage",alts:["P = IV","P = I × V"],hint:"P = IV"},
    {q:"Formula linking charge, current, time?",answer:"Charge = current × time",alts:["Q = It","Q = I × t"],hint:"Q = It"},
    {q:"In a series circuit, what happens to current?",answer:"It is the same everywhere",alts:["same throughout"],hint:"Only one path"},
    {q:"In a parallel circuit, what happens to voltage?",answer:"It is the same across each branch",alts:["same across each branch"],hint:"Each branch gets full voltage"},
    {q:"Difference between AC and DC?",answer:"AC changes direction, DC flows in one direction only",alts:["AC alternates, DC is constant direction"],hint:"Alternating vs Direct"},
    {q:"What does an LDR do as light increases?",answer:"Its resistance decreases",alts:["resistance decreases"],hint:"More Light = Less Resistance"},
    {q:"What does a thermistor do as temperature increases?",answer:"Its resistance decreases",alts:["resistance decreases"],hint:"Hotter = less resistance"},
    {q:"What is current?",answer:"The rate of flow of charge",alts:["flow of charge"],hint:"Measured in amps"},
    {q:"What is voltage?",answer:"The energy transferred per unit charge",alts:["energy per coulomb"],hint:"Joule per coulomb"},
  ]},
  {id:"waves",subject:"physics",name:"Waves",emoji:"🌊",color:"#0ea5e9",questions:[
    {q:"Wave speed formula?",answer:"Wave speed = frequency × wavelength",alts:["v = fλ"],hint:"v = fλ"},
    {q:"Formula linking frequency and time period?",answer:"Frequency = 1 / time period",alts:["f = 1/T"],hint:"Reciprocals"},
    {q:"Name the EM spectrum in order of decreasing wavelength.",answer:"Radio, microwave, infrared, visible, ultraviolet, X-ray, gamma",alts:["radio, microwave, IR, visible, UV, X-ray, gamma"],hint:"Running Men In Vests Use X-ray Glasses"},
    {q:"What do all EM waves travel at in a vacuum?",answer:"The speed of light (3 × 10⁸ m/s)",alts:["speed of light","3 x 10^8 m/s"],hint:"All same speed"},
    {q:"What is the law of reflection?",answer:"Angle of incidence = angle of reflection",alts:["angle of incidence equals angle of reflection"],hint:"Angles are equal"},
    {q:"Formula for refractive index?",answer:"n = sin i / sin r",alts:["refractive index = sin i / sin r"],hint:"Snell's law"},
    {q:"What is total internal reflection?",answer:"When light hits a boundary above the critical angle, all light is reflected back",alts:["light reflected when angle exceeds critical angle"],hint:"Used in optical fibres"},
    {q:"Give two uses of microwaves.",answer:"Cooking and satellite transmissions",alts:["cooking, satellite communications"],hint:"Kitchen + space"},
  ]},
  {id:"astrophysics",subject:"physics",name:"Astrophysics",emoji:"🌌",color:"#8b5cf6",questions:[
    {q:"What is a galaxy?",answer:"A large collection of billions of stars",alts:["billions of stars"],hint:"We live in the Milky Way"},
    {q:"Formula for orbital speed?",answer:"Orbital speed = 2πr / T",alts:["v = 2πr/T"],hint:"Circumference ÷ time period"},
    {q:"What causes planets to orbit the Sun?",answer:"Gravitational force",alts:["gravity"],hint:"Attractive force between masses"},
    {q:"Describe the shape of a comet's orbit.",answer:"A highly elliptical (elongated) orbit",alts:["elliptical"],hint:"Not circular — stretched"},
    {q:"How is star colour related to temperature?",answer:"Hotter stars are blue/white, cooler stars are red",alts:["blue = hottest, red = coolest"],hint:"Blue = hot, red = cool"},
    {q:"Stellar evolution order for a sun-sized star?",answer:"Nebula, main sequence star, red giant, white dwarf",alts:["nebula → main sequence → red giant → white dwarf"],hint:"Ends as white dwarf"},
    {q:"For a massive star, what comes after red supergiant?",answer:"Supernova, then neutron star or black hole",alts:["supernova → neutron star or black hole"],hint:"Explosion then collapse"},
  ]},
  {id:"physics_equations",subject:"physics",name:"Physics Equations",emoji:"📐",color:"#2563eb",questions:[
    {q:"Formula for kinetic energy?",answer:"KE = ½mv²",alts:["KE = 0.5 × m × v²"],hint:"½mv²"},
    {q:"Formula for gravitational potential energy?",answer:"GPE = mgh",alts:["GPE = m × g × h"],hint:"Mass × gravity × height"},
    {q:"Formula for work done?",answer:"Work done = force × distance",alts:["W = Fd","W = F × d"],hint:"W = Fd"},
    {q:"Formula for power?",answer:"Power = work done / time",alts:["P = W/t"],hint:"How quickly energy transfers"},
    {q:"Formula for efficiency?",answer:"Efficiency = useful output / total input × 100%",alts:["useful energy output / total energy input × 100"],hint:"Useful out ÷ total in"},
    {q:"Formula for density?",answer:"Density = mass / volume",alts:["ρ = m/V"],hint:"ρ = m/V"},
    {q:"Formula for pressure?",answer:"Pressure = force / area",alts:["p = F/A"],hint:"p = F/A"},
    {q:"Formula for pressure in a liquid column?",answer:"Pressure = height × density × g",alts:["p = hρg"],hint:"p = hρg"},
  ]},
];

// ============================================================
// DESIGN
// ============================================================
const D = {bg:"#0f172a",card:"#1e293b",border:"#334155",text:"#f1f5f9",muted:"#94a3b8",accent:"#22c55e",font:"'DM Sans',system-ui,sans-serif",display:"'Bricolage Grotesque',system-ui,sans-serif"};
const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap";
const CSS = `*{box-sizing:border-box;margin:0;padding:0}input:focus,textarea:focus{outline:2px solid ${D.accent};outline-offset:2px}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.fadeIn{animation:fadeIn .3s ease-out}.pulse{animation:pulse .4s ease}.shake{animation:shake .3s ease}`;

// ============================================================
// APP
// ============================================================
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState({});
  const [curTopic, setCurTopic] = useState(null);
  const [curQ, setCurQ] = useState(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [streak, setStreak] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [session, setSession] = useState({correct:0,total:0});
  const [focus, setFocus] = useState(null); // null=all, {type:"subject",id:"biology"} or {type:"topic",id:"heart"}
  const inputRef = useRef(null);
  const recentQs = useRef([]);
  const uid = user ? user.name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"") : null;
  const [loginName, setLoginName] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  function getPool() {
    if (!focus) return TOPICS;
    if (focus.type === "subject") return TOPICS.filter(t => t.subject === focus.id);
    if (focus.type === "topic") return TOPICS.filter(t => t.id === focus.id);
    return TOPICS;
  }

  function getFocusLabel() {
    if (!focus) return null;
    if (focus.type === "subject") { const s = SUBJECTS.find(s=>s.id===focus.id); return s ? `${s.emoji} ${s.name}` : null; }
    if (focus.type === "topic") { const t = TOPICS.find(t=>t.id===focus.id); return t ? `${t.emoji} ${t.name}` : null; }
    return null;
  }

  async function handleLogin() {
    if (!loginName.trim()) return;
    setLoginLoading(true);
    const name = loginName.trim();
    const id = name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    const prog = await loadProgress(id);
    setUser({name,id}); setProgress(prog); pickQuestion(prog, null); setScreen("quiz"); setLoginLoading(false);
  }

  function pickQuestion(prog = progress, f = focus) {
    const pool = f ? (f.type==="subject" ? TOPICS.filter(t=>t.subject===f.id) : TOPICS.filter(t=>t.id===f.id)) : TOPICS;
    const due = pool.filter(t => isDue(prog[t.id]));
    const from = due.length > 0 ? due : pool;
    const topic = pick(from);
    let q, tries = 0;
    do { q = pick(topic.questions); tries++; } while (recentQs.current.includes(q.q) && tries < 15);
    recentQs.current = [...recentQs.current.slice(-8), q.q];
    setCurTopic(topic); setCurQ(q); setAnswer(""); setFeedback(null); setShowHint(false); setAttempt(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function startFocused(type, id) {
    const f = {type, id};
    setFocus(f);
    pickQuestion(progress, f);
    setScreen("quiz");
  }

  function clearFocus() {
    setFocus(null);
    pickQuestion(progress, null);
  }

  async function submitAnswer() {
    if (!answer.trim() || (feedback && feedback.type !== "tryagain")) return;
    const ok = checkAns(answer, curQ.answer, curQ.alts || []);
    if (ok) {
      const sc = attempt===0?1.0:0.5; const prev = progress[curTopic.id]||{correct:0,total:0,interval:1};
      const iv = nextIv(prev.interval||1,sc);
      const up = {...progress,[curTopic.id]:{correct:(prev.correct||0)+(attempt===0?1:0),total:(prev.total||0)+1,interval:iv,nextDate:addDays(new Date(),iv),lastSeen:new Date().toISOString()}};
      setProgress(up); setSession(s=>({correct:s.correct+1,total:s.total+1})); setStreak(s=>s+1);
      setFeedback({type:"correct",msg:attempt===0?"Correct! 🎉":"Got it on second try! 👍"});
      if(uid) saveProgress(uid,up);
    } else if (attempt===0) {
      setAttempt(1); setFeedback({type:"tryagain",msg:"Not quite — have another go!"}); setAnswer("");
      setTimeout(()=>inputRef.current?.focus(),100); return;
    } else {
      const prev = progress[curTopic.id]||{correct:0,total:0,interval:1};
      const up = {...progress,[curTopic.id]:{correct:prev.correct||0,total:(prev.total||0)+1,interval:1,nextDate:addDays(new Date(),1),lastSeen:new Date().toISOString()}};
      setProgress(up); setSession(s=>({...s,total:s.total+1})); setStreak(0);
      setFeedback({type:"wrong",msg:`The answer was: ${curQ.answer}`});
      if(uid) saveProgress(uid,up);
    }
  }

  const b = (bg,c="white")=>({padding:"12px 24px",background:bg,color:c,border:"none",borderRadius:"12px",cursor:"pointer",fontFamily:D.font,fontWeight:700,fontSize:"15px",transition:"all .15s"});
  const cd = {background:D.card,borderRadius:"16px",padding:"24px",border:`1px solid ${D.border}`};
  const wr = {minHeight:"100vh",background:D.bg,color:D.text,fontFamily:D.font,padding:"20px"};
  const confCol = c=>c==="confident"?"#22c55e":c==="getting there"?"#f59e0b":c==="needs work"?"#ef4444":D.muted;

  // ═══════════════════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════════════════
  if (screen==="login") return (
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
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // PROGRESS — full width, subject strips, clickable
  // ═══════════════════════════════════════════════════════
  if (screen==="progress") {
    const dc = TOPICS.filter(t=>isDue(progress[t.id])).length;
    return (
      <div style={wr}>
        <link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
        <div style={{maxWidth:960,margin:"0 auto",width:"100%"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"24px",flexWrap:"wrap",gap:"12px"}}>
            <h2 style={{fontFamily:D.display,fontWeight:800,fontSize:"24px"}}>📊 Progress — {user?.name}</h2>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              <button onClick={()=>{setFocus(null);pickQuestion(progress,null);setScreen("quiz")}} style={b(D.accent,"#052e16")}>Quiz All Topics</button>
            </div>
          </div>
          <div style={{...cd,marginBottom:"24px",display:"flex",gap:"32px",justifyContent:"center",flexWrap:"wrap"}}>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display,color:D.accent}}>{session.correct}</div><div style={{fontSize:"12px",color:D.muted}}>Correct</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display}}>{session.total}</div><div style={{fontSize:"12px",color:D.muted}}>Attempted</div></div>
            <div style={{textAlign:"center"}}><div style={{fontSize:"28px",fontWeight:800,fontFamily:D.display,color:"#f59e0b"}}>{dc}</div><div style={{fontSize:"12px",color:D.muted}}>Due</div></div>
          </div>
          {SUBJECTS.map(sub=>{
            const st=TOPICS.filter(t=>t.subject===sub.id);
            const tq=st.reduce((s,t)=>s+(progress[t.id]?.total||0),0);
            const tc=st.reduce((s,t)=>s+(progress[t.id]?.correct||0),0);
            const sd=st.filter(t=>isDue(progress[t.id])).length;
            return (
              <div key={sub.id} style={{marginBottom:"20px",borderRadius:"16px",overflow:"hidden",border:`1px solid ${D.border}`}}>
                <div onClick={()=>startFocused("subject",sub.id)} style={{background:sub.grad,padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px",cursor:"pointer",transition:"filter .15s"}} onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.15)"} onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                    <span style={{fontSize:"28px"}}>{sub.emoji}</span>
                    <div>
                      <div style={{fontWeight:800,fontSize:"18px",fontFamily:D.display}}>{sub.name}</div>
                      <div style={{fontSize:"12px",opacity:.8}}>{st.length} topics · {tq} answers · {sd} due</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                    {tq>0&&<div style={{background:"rgba(255,255,255,.2)",borderRadius:"10px",padding:"6px 14px",fontWeight:800,fontSize:"14px"}}>{Math.round(100*tc/tq)}%</div>}
                    <div style={{background:"rgba(255,255,255,.25)",borderRadius:"8px",padding:"6px 12px",fontSize:"12px",fontWeight:700}}>▶ Quiz {sub.name}</div>
                  </div>
                </div>
                <div style={{background:D.card,padding:"16px",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(250px,1fr))",gap:"10px"}}>
                  {st.map(topic=>{
                    const tp=progress[topic.id]; const conf=getConf(tp); const c2=confCol(conf);
                    const pct=tp?.total?Math.round(100*tp.correct/tp.total):0; const due=isDue(tp);
                    return (
                      <div key={topic.id} onClick={()=>startFocused("topic",topic.id)} style={{background:D.bg,borderRadius:"12px",padding:"14px 16px",border:`1px solid ${D.border}`,display:"flex",alignItems:"center",gap:"12px",cursor:"pointer",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor=topic.color;e.currentTarget.style.transform="translateY(-2px)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor=D.border;e.currentTarget.style.transform="none"}}>
                        <span style={{fontSize:"20px"}}>{topic.emoji}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:"13px",marginBottom:"3px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{topic.name}</div>
                          <div style={{display:"flex",gap:"8px",fontSize:"11px",color:D.muted,flexWrap:"wrap"}}>
                            <span style={{color:c2,fontWeight:700}}>{conf}</span>
                            {tp?.total>0&&<span>{pct}%</span>}
                            {due&&<span style={{color:"#f59e0b"}}>📅</span>}
                          </div>
                        </div>
                        {tp?.total>0&&<div style={{width:"38px",height:"38px",borderRadius:"50%",border:`3px solid ${c2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"11px",fontWeight:800,color:c2,flexShrink:0}}>{pct}%</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // QUIZ
  // ═══════════════════════════════════════════════════════
  const pool = getPool();
  const dc2 = pool.filter(t=>isDue(progress[t.id])).length;
  const cs = curTopic ? SUBJECTS.find(s=>s.id===curTopic.subject) : null;
  const focusLabel = getFocusLabel();
  return (
    <div style={{...wr,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <link href={FONTS} rel="stylesheet"/><style>{CSS}</style>
      <div style={{maxWidth:540,width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
          <div>
            <span style={{fontSize:"13px",color:D.muted}}>👋 {user?.name}</span>
            {streak>=3&&<span style={{marginLeft:"12px",fontSize:"13px",color:"#f59e0b",fontWeight:700}}>🔥 {streak}</span>}
          </div>
          <button onClick={()=>setScreen("progress")} style={{...b("transparent",D.muted),padding:"8px 14px",fontSize:"13px",border:`1px solid ${D.border}`}}>📊 Progress</button>
        </div>

        {/* Focus bar */}
        {focusLabel && (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:cs?.color+"18",border:`1px solid ${cs?.color}44`,borderRadius:"12px",padding:"10px 16px",marginBottom:"16px",fontSize:"13px"}}>
            <span style={{fontWeight:700,color:cs?.color}}>Focused: {focusLabel}</span>
            <button onClick={clearFocus} style={{background:"transparent",border:"none",color:D.muted,cursor:"pointer",fontFamily:D.font,fontWeight:700,fontSize:"13px",padding:"4px 8px"}}>✕ Quiz All</button>
          </div>
        )}

        <div style={{display:"flex",gap:"16px",marginBottom:"20px",fontSize:"13px",color:D.muted}}>
          <span>✅ {session.correct}/{session.total}</span>
          <span>📅 {dc2} due{focusLabel ? "" : " (all)"}</span>
          {!focusLabel && cs && <span style={{color:cs.color,fontWeight:700}}>{cs.emoji} {cs.name}</span>}
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
                <div style={{display:"flex",gap:"8px"}}>
                  <button onClick={submitAnswer} style={{...b(D.accent,"#052e16"),flex:1}}>Check Answer</button>
                  {!showHint&&<button onClick={()=>setShowHint(true)} style={{...b("transparent","#f59e0b"),border:"1px solid #f59e0b44",padding:"12px 16px"}}>💡</button>}
                </div>
              </div>
            ):(
              <div className="fadeIn">
                <div style={{padding:"14px 18px",borderRadius:"10px",marginBottom:"14px",fontWeight:700,background:feedback.type==="correct"?"#22c55e22":"#ef444422",color:feedback.type==="correct"?"#22c55e":"#fca5a5",border:`1px solid ${feedback.type==="correct"?"#22c55e44":"#ef444444"}`,fontSize:feedback.type==="wrong"?"14px":"15px",lineHeight:1.5}}>{feedback.msg}</div>
                <button onClick={()=>pickQuestion(progress,focus)} style={{...b(D.accent,"#052e16"),width:"100%"}}>Next Question →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
