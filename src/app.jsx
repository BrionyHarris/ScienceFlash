import { useState, useEffect, useRef } from "react";

// ============================================================
// HELPERS
// ============================================================
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const today = () => new Date().toISOString().slice(0, 10);

// ============================================================
// SUPABASE CONFIG — same project as FlashBack, different key prefixes
// ============================================================
const SUPABASE_URL = "https://qglbenrgjxjjygtoslge.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iKBrFrvnDdgyngPF1mEahA_cUN1Yqa5";

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      "apikey": SUPABASE_ANON_KEY,
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function sbSet(key, value) {
  await sbFetch("kv_store?on_conflict=key", {
    method: "POST",
    headers: { "Prefer": "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key, value: JSON.stringify(value) })
  });
}

async function sbGet(key) {
  const rows = await sbFetch(`kv_store?key=eq.${encodeURIComponent(key)}&select=value`);
  if (!rows || rows.length === 0) return null;
  try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
}

// Key prefixes — different from FlashBack to avoid collisions
const PROGRESS_PREFIX = "sci_progress_";
const SETTINGS_KEY = "sci_settings";
const REGISTER_KEY = "sci_register";

async function loadProgress(uid) {
  try { return await sbGet(PROGRESS_PREFIX + uid) || {}; } catch { return {}; }
}
async function saveProgress(uid, prog) {
  try { await sbSet(PROGRESS_PREFIX + uid, prog); } catch(e) { console.error(e); }
}
async function loadRegister() {
  try { return await sbGet(REGISTER_KEY) || { users: [] }; } catch { return { users: [] }; }
}
async function saveRegister(reg) {
  try { await sbSet(REGISTER_KEY, reg); } catch(e) { console.error(e); }
}
async function loadSettings() {
  try { return await sbGet(SETTINGS_KEY) || { disabledTopics: [] }; } catch { return { disabledTopics: [] }; }
}
async function saveSettings(s) {
  try { await sbSet(SETTINGS_KEY, s); } catch(e) { console.error(e); }
}

// ============================================================
// SPACED REPETITION
// ============================================================
const INTERVALS = [1, 2, 4, 7, 14, 21];
function getNextInterval(current, quality) {
  if (quality >= 0.8) {
    const idx = INTERVALS.indexOf(current);
    return idx >= 0 && idx < INTERVALS.length - 1 ? INTERVALS[idx + 1] : current;
  }
  if (quality >= 0.4) return current;
  return 1;
}
function isDue(ts) {
  if (!ts?.nextDate) return true;
  return new Date() >= new Date(ts.nextDate);
}
function addDays(d, n) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString();
}
function getConfidence(ts) {
  if (!ts || !ts.total) return "not started";
  const pct = ts.total > 0 ? ts.correct / ts.total : 0;
  if (pct >= 0.8 && (ts.interval || 1) >= 7) return "confident";
  if (pct >= 0.5) return "getting there";
  return "needs work";
}

// ============================================================
// ANSWER CHECKING
// ============================================================
function normalise(s) {
  return s.toLowerCase().trim()
    .replace(/\s+/g, " ")
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\.$/, "");
}
function checkAnswer(userRaw, correctRaw, alts = []) {
  const u = normalise(userRaw);
  if (!u) return false;
  const candidates = [correctRaw, ...alts].map(normalise);
  for (const c of candidates) {
    if (u === c) return true;
    // Ignore spaces/punctuation
    if (u.replace(/[\s,.\-]/g, "") === c.replace(/[\s,.\-]/g, "")) return true;
  }
  return false;
}

// ============================================================
// BIOLOGY TOPICS & QUESTIONS
// ============================================================
const TOPICS = [
  {
    id: "gas_exchange", name: "Gas Exchange & Transpiration", emoji: "🌿", color: "#16a34a",
    questions: [
      { q: "What is gas exchange in plants?", answer: "The diffusion of oxygen and carbon dioxide in and out of the leaf through the stomata", alts: ["diffusion of O2 and CO2 through stomata"], hint: "Think about what moves in and out of leaves" },
      { q: "What process requires carbon dioxide to diffuse into a leaf?", answer: "Photosynthesis", alts: [], hint: "The process that makes glucose using light" },
      { q: "What process requires oxygen to diffuse into a leaf?", answer: "Aerobic respiration", alts: ["respiration"], hint: "The process that releases energy from glucose" },
      { q: "Name the cells that open and close the stomata.", answer: "Guard cells", alts: [], hint: "They 'guard' the openings on the leaf surface" },
      { q: "When are a plant's stomata open?", answer: "During the day", alts: ["daytime", "in the day", "day"], hint: "When is photosynthesis happening?" },
      { q: "Why do plants close their stomata at night?", answer: "To prevent water loss, as they don't need CO2 for photosynthesis in the dark", alts: ["to prevent water loss"], hint: "No photosynthesis happens in the dark" },
      { q: "Name the four factors that affect transpiration rate.", answer: "Light intensity, temperature, wind speed, humidity", alts: ["light, temperature, wind, humidity", "light intensity, temperature, wind speed and humidity"], hint: "Think about what helps washing dry faster" },
      { q: "What colour does hydrogen carbonate indicator turn in high CO2?", answer: "Yellow", alts: [], hint: "CO2 makes it more acidic" },
      { q: "What colour does hydrogen carbonate indicator turn in low CO2?", answer: "Purple", alts: [], hint: "Less CO2 means less acidic" },
      { q: "What colour is hydrogen carbonate indicator at normal CO2 levels?", answer: "Orange", alts: [], hint: "It's between yellow and purple" },
      { q: "What is transpiration?", answer: "The loss of water from a plant's leaves by evaporation and diffusion", alts: ["evaporation of water from leaves", "loss of water from leaves"], hint: "Water escapes through the stomata" },
      { q: "How does increasing temperature affect transpiration rate?", answer: "It increases the rate of transpiration", alts: ["increases it", "transpiration increases"], hint: "Warm water particles have more energy to evaporate" },
      { q: "How does increasing humidity affect transpiration rate?", answer: "It decreases the rate of transpiration", alts: ["decreases it", "transpiration decreases"], hint: "If the air is already moist, less water can escape" },
    ]
  },
  {
    id: "blood_immunity", name: "Blood & Immunity", emoji: "🩸", color: "#dc2626",
    questions: [
      { q: "What are the four components of blood?", answer: "Plasma, red blood cells, white blood cells, platelets", alts: ["red blood cells, white blood cells, platelets, plasma"], hint: "A liquid, two cell types, and cell fragments" },
      { q: "What is the function of plasma?", answer: "Carries substances around the body", alts: ["transports substances around the body"], hint: "It's the liquid part" },
      { q: "Name three substances carried in plasma.", answer: "Carbon dioxide, hormones, urea", alts: ["CO2, hormones, urea", "hormones, urea, carbon dioxide"], hint: "Waste products and chemical messengers" },
      { q: "What is the function of red blood cells?", answer: "Carry oxygen around the body", alts: ["transport oxygen"], hint: "What gas do we need in every cell?" },
      { q: "What molecule in red blood cells binds to oxygen?", answer: "Haemoglobin", alts: ["hemoglobin"], hint: "Contains iron, gives blood its red colour" },
      { q: "Give three ways red blood cells are adapted.", answer: "Biconcave shape for large surface area, no nucleus for more space, contain haemoglobin", alts: ["biconcave, no nucleus, haemoglobin"], hint: "Shape, what's missing, what they contain" },
      { q: "What is the function of white blood cells?", answer: "Form the immune system that destroys pathogens", alts: ["fight pathogens", "destroy pathogens"], hint: "They protect you from disease" },
      { q: "Name the two types of white blood cell.", answer: "Phagocytes and lymphocytes", alts: ["lymphocytes and phagocytes"], hint: "One engulfs, one makes antibodies" },
      { q: "How do phagocytes destroy pathogens?", answer: "They engulf and digest them", alts: ["phagocytosis", "engulf pathogens and digest them using enzymes"], hint: "They 'eat' the pathogens" },
      { q: "How do lymphocytes destroy pathogens?", answer: "They produce antibodies that bind to antigens on the pathogen", alts: ["produce antibodies"], hint: "Special proteins that lock onto invaders" },
      { q: "What is the function of platelets?", answer: "Form blood clots", alts: ["clot the blood", "blood clotting"], hint: "What happens when you get a cut?" },
      { q: "What is the active ingredient in a vaccination?", answer: "A dead or inactive pathogen", alts: ["dead pathogen", "inactive pathogen"], hint: "Triggers immunity without causing disease" },
    ]
  },
  {
    id: "heart", name: "The Heart", emoji: "❤️", color: "#be123c",
    questions: [
      { q: "What is the function of the heart?", answer: "To pump blood around the body", alts: ["pump blood"], hint: "It's a muscular pump" },
      { q: "Which side of the heart contains oxygenated blood?", answer: "The left side", alts: ["left"], hint: "Where does blood come from the lungs?" },
      { q: "Where does the right ventricle pump blood?", answer: "To the lungs", alts: ["lungs"], hint: "Blood needs to pick up oxygen" },
      { q: "Where does the left ventricle pump blood?", answer: "To the whole body", alts: ["the body", "around the body"], hint: "It's the most powerful chamber" },
      { q: "Why is the left ventricle wall thicker than the right?", answer: "It needs to generate higher pressure to pump blood to the whole body", alts: ["to pump blood further", "needs more force"], hint: "Which journey is longer?" },
      { q: "What is the function of the heart's valves?", answer: "Prevent the backflow of blood", alts: ["prevent backflow", "stop blood flowing backwards"], hint: "They only let blood flow one way" },
      { q: "What structure separates the left and right sides of the heart?", answer: "The septum", alts: ["septum"], hint: "A wall of muscle down the middle" },
      { q: "Which blood vessel carries deoxygenated blood from the body to the heart?", answer: "The vena cava", alts: ["vena cava"], hint: "The largest vein" },
      { q: "Which blood vessel carries blood from the heart to the lungs?", answer: "The pulmonary artery", alts: ["pulmonary artery"], hint: "'Pulmonary' = lungs" },
      { q: "Which blood vessel carries blood from the lungs to the heart?", answer: "The pulmonary vein", alts: ["pulmonary vein"], hint: "Oxygenated blood back to the left atrium" },
      { q: "Which blood vessel carries blood from the heart to the body?", answer: "The aorta", alts: ["aorta"], hint: "The largest artery" },
      { q: "What hormone causes heart rate to increase?", answer: "Adrenaline", alts: ["adrenalin"], hint: "The 'fight or flight' hormone" },
      { q: "Which part of the brain coordinates heart rate?", answer: "The medulla", alts: ["medulla"], hint: "Lower part of the brain" },
    ]
  },
  {
    id: "blood_vessels", name: "Blood Vessels", emoji: "🔴", color: "#ea580c",
    questions: [
      { q: "Name the three types of blood vessel.", answer: "Arteries, veins, capillaries", alts: ["arteries, capillaries, veins"], hint: "Away, back, and through tissues" },
      { q: "Which direction do arteries carry blood?", answer: "Away from the heart", alts: ["away from heart"], hint: "A for Away, A for Artery" },
      { q: "Which direction do veins carry blood?", answer: "Towards the heart", alts: ["to the heart", "back to the heart"], hint: "They return blood" },
      { q: "Why do arteries have thick, elastic walls?", answer: "To withstand the high blood pressure from the heart", alts: ["to cope with high pressure"], hint: "Blood leaves the heart under force" },
      { q: "Why do veins have valves?", answer: "To prevent backflow of blood at low pressure", alts: ["prevent backflow"], hint: "Blood pressure is low in veins" },
      { q: "Why are capillary walls only one cell thick?", answer: "To provide a short diffusion distance for exchanging substances", alts: ["short diffusion distance"], hint: "Substances pass through the walls" },
      { q: "What is the function of capillaries?", answer: "Exchange substances between blood and cells", alts: ["allow exchange of substances"], hint: "They connect arteries to veins" },
      { q: "Compare blood pressure in arteries and veins.", answer: "Arteries have high pressure, veins have low pressure", alts: ["high in arteries, low in veins"], hint: "Which are closer to the heart?" },
      { q: "What does 'hepatic' mean?", answer: "Related to the liver", alts: ["to do with the liver", "liver"], hint: "Think hepatitis" },
      { q: "What does 'renal' mean?", answer: "Related to the kidneys", alts: ["to do with the kidneys", "kidneys"], hint: "Renal failure affects which organs?" },
      { q: "Name the blood vessel that carries blood from the digestive system to the liver.", answer: "The hepatic portal vein", alts: ["hepatic portal vein"], hint: "Carries nutrient-rich blood for processing" },
    ]
  },
  {
    id: "eye", name: "The Eye", emoji: "👁️", color: "#7c3aed",
    questions: [
      { q: "What is the function of the cornea?", answer: "Refracts (bends) light into the eye", alts: ["refracts light", "bends light"], hint: "Transparent front part" },
      { q: "What is the function of the iris?", answer: "Controls how much light enters the eye", alts: ["controls amount of light", "controls pupil size"], hint: "The coloured part" },
      { q: "What is the function of the lens?", answer: "Focuses light onto the retina", alts: ["refracts light onto retina"], hint: "Changes shape to focus" },
      { q: "What is the function of the retina?", answer: "Contains photoreceptors (rods and cones) that detect light", alts: ["detects light"], hint: "At the back of the eye" },
      { q: "What is the function of the optic nerve?", answer: "Carries electrical impulses from the retina to the brain", alts: ["sends impulses to brain"], hint: "The cable connecting eye to brain" },
      { q: "What is accommodation?", answer: "Changing the shape of the lens to focus on near or far objects", alts: ["adjusting lens shape to focus"], hint: "How does the eye switch focus?" },
      { q: "For near objects, what do the ciliary muscles do?", answer: "Contract", alts: ["they contract"], hint: "They tighten to make the lens fatter" },
      { q: "For near objects, what shape does the lens become?", answer: "Rounder and thicker", alts: ["fat", "round", "thicker", "more curved"], hint: "Needs to refract light more" },
      { q: "For far objects, what do the ciliary muscles do?", answer: "Relax", alts: ["they relax"], hint: "Opposite of near objects" },
      { q: "For far objects, what shape does the lens become?", answer: "Thinner", alts: ["thin", "flat", "flatter"], hint: "Less refraction needed" },
      { q: "In bright light, which iris muscles contract?", answer: "Circular muscles", alts: ["the circular muscles"], hint: "They make the pupil smaller" },
      { q: "In dim light, which iris muscles contract?", answer: "Radial muscles", alts: ["the radial muscles"], hint: "They pull the pupil open wider" },
    ]
  },
  {
    id: "reflexes", name: "Reflexes & Nervous System", emoji: "⚡", color: "#0891b2",
    questions: [
      { q: "What is a stimulus?", answer: "A change in the environment", alts: ["a change in the internal or external environment"], hint: "Triggers a response" },
      { q: "What is a response?", answer: "A reaction to a stimulus", alts: [], hint: "What the body does when it detects a change" },
      { q: "Name the two communication systems in the body.", answer: "The nervous system and the endocrine system", alts: ["nervous and endocrine"], hint: "One uses electrical signals, one uses hormones" },
      { q: "Name the three types of neurone.", answer: "Sensory, relay, motor", alts: ["sensory neurone, relay neurone, motor neurone"], hint: "Detect, connect, act" },
      { q: "What two organs make up the CNS?", answer: "The brain and spinal cord", alts: ["brain and spinal cord"], hint: "The control centre" },
      { q: "Where do sensory neurones carry impulses?", answer: "From receptors to the CNS", alts: ["from sense organs to the CNS"], hint: "Detect and send inward" },
      { q: "Where do motor neurones carry impulses?", answer: "From the CNS to effectors", alts: ["from the central nervous system to effectors"], hint: "Send commands outward" },
      { q: "What are synapses?", answer: "Gaps between neurones", alts: ["junctions between neurones"], hint: "Signals must cross these" },
      { q: "How do signals cross a synapse?", answer: "Neurotransmitters diffuse across the gap", alts: ["by neurotransmitters", "chemicals diffuse across"], hint: "Chemical messengers" },
      { q: "What is a reflex action?", answer: "A rapid, automatic, involuntary response to a stimulus", alts: ["an automatic response", "involuntary response"], hint: "You don't think about it" },
      { q: "Put the reflex arc in order: Effector, CNS, Receptor, Motor neurone, Sensory neurone", answer: "Receptor, Sensory neurone, CNS, Motor neurone, Effector", alts: ["receptor, sensory neurone, relay neurone, motor neurone, effector"], hint: "Start with detecting, end with responding" },
      { q: "What is homeostasis?", answer: "The maintenance of a constant internal environment", alts: ["maintaining a constant internal environment", "keeping internal conditions constant"], hint: "Keeping things balanced" },
    ]
  },
  {
    id: "photosynthesis", name: "Photosynthesis", emoji: "🌱", color: "#15803d",
    questions: [
      { q: "What is photosynthesis?", answer: "The process where plants use light to convert CO2 and water into glucose and oxygen", alts: ["making food using sunlight"], hint: "How plants make their own food" },
      { q: "What are the reactants of photosynthesis?", answer: "Carbon dioxide and water", alts: ["CO2 and water", "CO2 and H2O"], hint: "What goes IN" },
      { q: "What are the products of photosynthesis?", answer: "Glucose and oxygen", alts: ["oxygen and glucose"], hint: "What comes OUT" },
      { q: "Where in the cell does photosynthesis happen?", answer: "Chloroplasts", alts: ["in the chloroplasts"], hint: "They contain a green pigment" },
      { q: "What pigment absorbs light for photosynthesis?", answer: "Chlorophyll", alts: [], hint: "Gives leaves their green colour" },
      { q: "In which leaf layer are most chloroplasts found?", answer: "The palisade layer", alts: ["palisade layer", "palisade mesophyll"], hint: "Near the top of the leaf" },
      { q: "Why is the upper epidermis transparent?", answer: "To let light pass through to the palisade layer", alts: ["to let light through"], hint: "Light needs to reach the chloroplasts" },
      { q: "What is the function of vascular bundles in a leaf?", answer: "Transport water and nutrients via xylem and phloem", alts: ["carry water and minerals"], hint: "The leaf's plumbing" },
    ]
  },
  {
    id: "rate_photosynthesis", name: "Rate of Photosynthesis", emoji: "📈", color: "#ca8a04",
    questions: [
      { q: "Name the three limiting factors of photosynthesis.", answer: "Light intensity, CO2 concentration, temperature", alts: ["light, CO2, temperature"], hint: "Three things that can slow it down" },
      { q: "What is a limiting factor?", answer: "A factor that stops photosynthesis happening any faster", alts: ["something that prevents the rate increasing"], hint: "It holds everything back" },
      { q: "What happens to the rate if light intensity increases?", answer: "The rate increases, up to a point", alts: ["it increases"], hint: "More light = more energy, but only so far" },
      { q: "What happens if temperature exceeds about 45°C?", answer: "Enzymes are denatured and the rate rapidly decreases", alts: ["enzymes denature"], hint: "High heat damages biological catalysts" },
      { q: "If light and CO2 are plentiful, what is likely the limiting factor?", answer: "Temperature", alts: [], hint: "The third factor affecting enzyme activity" },
      { q: "At night, what is the limiting factor?", answer: "Light intensity", alts: ["light"], hint: "What's missing in the dark?" },
    ]
  },
  {
    id: "photo_experiments", name: "Photosynthesis Experiments", emoji: "🧪", color: "#9333ea",
    questions: [
      { q: "What chemical is used to test a leaf for starch?", answer: "Iodine solution", alts: ["iodine"], hint: "Turns a specific colour with starch" },
      { q: "What colour does iodine turn if starch IS present?", answer: "Blue-black", alts: ["dark blue", "blue black", "black"], hint: "A dramatic dark colour" },
      { q: "Why do you boil the leaf in water first?", answer: "To stop chemical reactions inside the leaf", alts: ["to kill the leaf", "to denature enzymes"], hint: "Freeze the leaf's chemistry" },
      { q: "Why do you put the leaf in ethanol?", answer: "To remove the chlorophyll", alts: ["remove chlorophyll", "to decolourise the leaf"], hint: "Green colour would hide the result" },
      { q: "How can you show light is needed for photosynthesis?", answer: "Keep a plant in the dark for 48 hours, then test a leaf for starch — it won't turn blue-black", alts: ["destarch then keep in dark and test for starch"], hint: "Remove the variable and test" },
      { q: "How can you show CO2 is needed for photosynthesis?", answer: "Use soda lime to absorb CO2, then test the leaf for starch", alts: ["use soda lime to remove CO2 then test for starch"], hint: "Use a chemical to remove CO2" },
      { q: "How can you measure the rate of photosynthesis using pondweed?", answer: "Count oxygen bubbles per minute at different light distances", alts: ["count bubbles of oxygen"], hint: "Oxygen is a visible product" },
      { q: "In a pondweed experiment, what two variables should be kept constant?", answer: "Temperature and CO2 concentration", alts: ["temperature and CO2", "CO2 and temperature"], hint: "The other two limiting factors" },
    ]
  },
  {
    id: "chd", name: "Coronary Heart Disease", emoji: "💔", color: "#b91c1c",
    questions: [
      { q: "What are the coronary arteries?", answer: "Arteries that supply the heart muscle with blood", alts: ["blood vessels that supply the heart"], hint: "The heart needs its own blood supply" },
      { q: "What is coronary heart disease?", answer: "A condition where coronary arteries become blocked by fatty deposits", alts: ["blocked coronary arteries"], hint: "Something builds up inside blood vessels" },
      { q: "What substance builds up in the coronary arteries?", answer: "Fatty deposits (plaque)", alts: ["plaque", "fatty deposits", "fat"], hint: "Narrows the arteries" },
      { q: "Name three risk factors for CHD.", answer: "Smoking, high blood pressure, diet high in saturated fat", alts: ["smoking, diet, lack of exercise"], hint: "Lifestyle and genetics" },
      { q: "Name three symptoms of CHD.", answer: "Chest pain, shortness of breath, feeling faint", alts: ["chest pain, breathlessness, dizziness"], hint: "Heart not getting enough oxygen" },
    ]
  }
];

// ============================================================
// DESIGN TOKENS
// ============================================================
const D = {
  bg: "#0f172a", card: "#1e293b", cardHover: "#334155",
  text: "#f1f5f9", muted: "#94a3b8", border: "#334155",
  accent: "#22c55e", accentDim: "#166534",
  font: "'DM Sans', system-ui, sans-serif",
  display: "'Bricolage Grotesque', system-ui, sans-serif",
};

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [progress, setProgress] = useState({});
  const [currentTopic, setCurrentTopic] = useState(null);
  const [currentQ, setCurrentQ] = useState(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [streak, setStreak] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [session, setSession] = useState({ correct: 0, total: 0 });
  const inputRef = useRef(null);
  const recentQs = useRef([]);

  const userId = user ? user.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") : null;

  // ── Login ─────────────────────────────────────────────
  const [loginName, setLoginName] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  async function handleLogin() {
    if (!loginName.trim()) return;
    setLoginLoading(true);
    const name = loginName.trim();
    const id = name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const prog = await loadProgress(id);
    setUser({ name, id });
    setProgress(prog);
    pickQuestion(prog);
    setScreen("quiz");
    setLoginLoading(false);
  }

  // ── Question Picking ──────────────────────────────────
  function pickQuestion(prog = progress) {
    const due = TOPICS.filter(t => isDue(prog[t.id]));
    const pool = due.length > 0 ? due : TOPICS;
    const topic = pick(pool);
    let q, tries = 0;
    do {
      q = pick(topic.questions);
      tries++;
    } while (recentQs.current.includes(q.q) && tries < 15);
    recentQs.current = [...recentQs.current.slice(-8), q.q];
    setCurrentTopic(topic);
    setCurrentQ(q);
    setAnswer("");
    setFeedback(null);
    setShowHint(false);
    setAttempt(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  // ── Answer Submission ─────────────────────────────────
  async function submitAnswer() {
    if (!answer.trim() || (feedback && feedback.type !== "tryagain")) return;
    const isCorrect = checkAnswer(answer, currentQ.answer, currentQ.alts || []);

    if (isCorrect) {
      const score = attempt === 0 ? 1.0 : 0.5;
      const prev = progress[currentTopic.id] || { correct: 0, total: 0, interval: 1 };
      const interval = getNextInterval(prev.interval || 1, score);
      const updated = {
        ...progress,
        [currentTopic.id]: {
          correct: (prev.correct || 0) + (attempt === 0 ? 1 : 0),
          total: (prev.total || 0) + 1,
          interval,
          nextDate: addDays(new Date(), interval),
          lastSeen: new Date().toISOString()
        }
      };
      setProgress(updated);
      setSession(s => ({ correct: s.correct + 1, total: s.total + 1 }));
      setStreak(s => s + 1);
      setFeedback({ type: "correct", msg: attempt === 0 ? "Correct! 🎉" : "Got it on second try! 👍" });
      if (userId) saveProgress(userId, updated);
    } else if (attempt === 0) {
      setAttempt(1);
      setFeedback({ type: "tryagain", msg: "Not quite — have another go!" });
      setAnswer("");
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    } else {
      const prev = progress[currentTopic.id] || { correct: 0, total: 0, interval: 1 };
      const updated = {
        ...progress,
        [currentTopic.id]: {
          correct: prev.correct || 0,
          total: (prev.total || 0) + 1,
          interval: 1,
          nextDate: addDays(new Date(), 1),
          lastSeen: new Date().toISOString()
        }
      };
      setProgress(updated);
      setSession(s => ({ ...s, total: s.total + 1 }));
      setStreak(0);
      setFeedback({ type: "wrong", msg: `The answer was: ${currentQ.answer}` });
      if (userId) saveProgress(userId, updated);
    }
  }

  // ── Shared Styles ─────────────────────────────────────
  const btnStyle = (bg, color = "white") => ({
    padding: "12px 24px", background: bg, color, border: "none",
    borderRadius: "12px", cursor: "pointer", fontFamily: D.font,
    fontWeight: 700, fontSize: "15px", transition: "all 0.15s",
  });
  const cardStyle = {
    background: D.card, borderRadius: "16px", padding: "24px",
    border: `1px solid ${D.border}`,
  };
  const wrapper = {
    minHeight: "100vh", background: D.bg, color: D.text,
    fontFamily: D.font, padding: "20px",
    display: "flex", flexDirection: "column", alignItems: "center",
  };

  // ═══════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ═══════════════════════════════════════════════════════
  if (screen === "login") return (
    <div style={wrapper}>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, textarea:focus { outline: 2px solid ${D.accent}; outline-offset: 2px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        .fadeIn { animation: fadeIn 0.3s ease-out; }
      `}</style>
      <div style={{ maxWidth: 400, width: "100%", marginTop: "15vh", textAlign: "center" }} className="fadeIn">
        <div style={{ fontSize: "48px", marginBottom: "8px" }}>🔬</div>
        <h1 style={{ fontFamily: D.display, fontSize: "32px", fontWeight: 800, marginBottom: "8px", background: "linear-gradient(135deg, #22c55e, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          ScienceFlash
        </h1>
        <p style={{ color: D.muted, fontSize: "14px", marginBottom: "32px" }}>IGCSE Science Revision</p>
        <div style={cardStyle}>
          <label style={{ fontSize: "13px", fontWeight: 600, color: D.muted, display: "block", marginBottom: "8px", textAlign: "left" }}>
            What's your name?
          </label>
          <input
            value={loginName}
            onChange={e => setLoginName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            placeholder="Enter your name..."
            style={{ width: "100%", padding: "14px 16px", fontSize: "16px", background: D.bg, border: `1px solid ${D.border}`, borderRadius: "10px", color: D.text, fontFamily: D.font, marginBottom: "16px" }}
          />
          <button onClick={handleLogin} disabled={loginLoading} style={{ ...btnStyle(D.accent, "#052e16"), width: "100%", opacity: loginLoading ? 0.6 : 1 }}>
            {loginLoading ? "Loading..." : "Start Revising →"}
          </button>
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════════════
  // PROGRESS SCREEN
  // ═══════════════════════════════════════════════════════
  if (screen === "progress") {
    const dueCount = TOPICS.filter(t => isDue(progress[t.id])).length;
    return (
      <div style={wrapper}>
        <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <style>{`* { box-sizing: border-box; margin: 0; padding: 0; } @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } } .fadeIn { animation: fadeIn 0.3s ease-out; }`}</style>
        <div style={{ maxWidth: 500, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
            <h2 style={{ fontFamily: D.display, fontWeight: 800, fontSize: "24px" }}>📊 Progress</h2>
            <button onClick={() => { pickQuestion(); setScreen("quiz"); }} style={btnStyle(D.accent, "#052e16")}>
              Back to Quiz
            </button>
          </div>

          <div style={{ ...cardStyle, marginBottom: "16px", display: "flex", gap: "24px", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: D.display, color: D.accent }}>{session.correct}</div>
              <div style={{ fontSize: "12px", color: D.muted }}>Correct today</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: D.display }}>{session.total}</div>
              <div style={{ fontSize: "12px", color: D.muted }}>Attempted</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "28px", fontWeight: 800, fontFamily: D.display, color: "#f59e0b" }}>{dueCount}</div>
              <div style={{ fontSize: "12px", color: D.muted }}>Topics due</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {TOPICS.map(topic => {
              const tp = progress[topic.id];
              const conf = getConfidence(tp);
              const confColor = conf === "confident" ? "#22c55e" : conf === "getting there" ? "#f59e0b" : conf === "needs work" ? "#ef4444" : D.muted;
              const pct = tp?.total ? Math.round(100 * tp.correct / tp.total) : 0;
              const due = isDue(tp);
              return (
                <div key={topic.id} className="fadeIn" style={{ ...cardStyle, padding: "16px 20px", display: "flex", alignItems: "center", gap: "14px" }}>
                  <span style={{ fontSize: "24px" }}>{topic.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>{topic.name}</div>
                    <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: D.muted, flexWrap: "wrap" }}>
                      <span style={{ color: confColor, fontWeight: 700 }}>{conf}</span>
                      {tp?.total > 0 && <span>{pct}% · {tp.total} Qs</span>}
                      {due && <span style={{ color: "#f59e0b" }}>📅 Due</span>}
                    </div>
                  </div>
                  {tp?.total > 0 && (
                    <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: `3px solid ${confColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, color: confColor }}>
                      {pct}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // QUIZ SCREEN
  // ═══════════════════════════════════════════════════════
  const dueCount = TOPICS.filter(t => isDue(progress[t.id])).length;
  return (
    <div style={wrapper}>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus, textarea:focus { outline: 2px solid ${D.accent}; outline-offset: 2px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }
        @keyframes pulse { 0%,100% { transform:scale(1) } 50% { transform:scale(1.02) } }
        @keyframes shake { 0%,100% { transform:translateX(0) } 25% { transform:translateX(-4px) } 75% { transform:translateX(4px) } }
        .fadeIn { animation: fadeIn 0.3s ease-out; }
        .pulse { animation: pulse 0.4s ease; }
        .shake { animation: shake 0.3s ease; }
      `}</style>
      <div style={{ maxWidth: 540, width: "100%" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <span style={{ fontSize: "13px", color: D.muted }}>👋 {user?.name}</span>
            {streak >= 3 && <span style={{ marginLeft: "12px", fontSize: "13px", color: "#f59e0b", fontWeight: 700 }}>🔥 {streak} streak</span>}
          </div>
          <button onClick={() => setScreen("progress")} style={{ ...btnStyle("transparent", D.muted), padding: "8px 14px", fontSize: "13px", border: `1px solid ${D.border}` }}>
            📊 Progress
          </button>
        </div>

        {/* Session bar */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "20px", fontSize: "13px", color: D.muted }}>
          <span>✅ {session.correct}/{session.total}</span>
          <span>📅 {dueCount} topic{dueCount !== 1 ? "s" : ""} due</span>
        </div>

        {/* Question Card */}
        {currentQ && currentTopic && (
          <div className={feedback?.type === "wrong" ? "shake" : feedback?.type === "correct" ? "pulse" : "fadeIn"} style={{ ...cardStyle, borderLeft: `4px solid ${currentTopic.color}`, marginBottom: "16px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: currentTopic.color + "22", color: currentTopic.color, padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, marginBottom: "16px" }}>
              {currentTopic.emoji} {currentTopic.name}
            </div>

            <p style={{ fontSize: "18px", fontWeight: 600, lineHeight: 1.5, marginBottom: "20px", fontFamily: D.display }}>
              {currentQ.q}
            </p>

            {showHint && currentQ.hint && (
              <div className="fadeIn" style={{ background: "#fef3c7", color: "#92400e", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", marginBottom: "16px" }}>
                💡 {currentQ.hint}
              </div>
            )}

            {(!feedback || feedback.type === "tryagain") ? (
              <div>
                {feedback?.type === "tryagain" && (
                  <div style={{ background: "#f59e0b22", color: "#f59e0b", padding: "10px 14px", borderRadius: "10px", fontSize: "13px", marginBottom: "12px", fontWeight: 600 }}>
                    {feedback.msg}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAnswer(); } }}
                  placeholder={attempt === 1 ? "Try again..." : "Type your answer..."}
                  rows={2}
                  style={{ width: "100%", padding: "14px", fontSize: "15px", background: D.bg, border: `2px solid ${attempt === 1 ? "#f59e0b" : D.border}`, borderRadius: "10px", color: D.text, fontFamily: D.font, resize: "none", marginBottom: "12px" }}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={submitAnswer} style={{ ...btnStyle(D.accent, "#052e16"), flex: 1 }}>
                    Check Answer
                  </button>
                  {!showHint && <button onClick={() => setShowHint(true)} style={{ ...btnStyle("transparent", "#f59e0b"), border: "1px solid #f59e0b44", padding: "12px 16px" }}>💡</button>}
                </div>
              </div>
            ) : (
              <div className="fadeIn">
                <div style={{
                  padding: "14px 18px", borderRadius: "10px", marginBottom: "14px", fontWeight: 700,
                  background: feedback.type === "correct" ? "#22c55e22" : "#ef444422",
                  color: feedback.type === "correct" ? "#22c55e" : "#fca5a5",
                  border: `1px solid ${feedback.type === "correct" ? "#22c55e44" : "#ef444444"}`,
                  fontSize: feedback.type === "wrong" ? "14px" : "15px",
                  lineHeight: 1.5,
                }}>
                  {feedback.msg}
                </div>
                <button onClick={() => pickQuestion()} style={{ ...btnStyle(D.accent, "#052e16"), width: "100%" }}>
                  Next Question →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
