import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Users, Building2, BarChart3, Plus, X, ArrowUp, ChevronRight, Check, Sparkles, Info, Settings, Trash2, Cloud, Eye, AlertCircle, HelpCircle, MessageSquare, TrendingUp,
  Crown, Cog, Palette, Search, Camera, Code, Monitor, Wrench, FlaskConical, Package,
  ClipboardList, Calendar, Wallet, Map, Target, Heart, Megaphone, Smartphone, Lightbulb, Layers, BarChart3 as ChartIcon, Brain, Zap,
} from "lucide-react";

const STORAGE_ENDPOINT = "/api/state";

const localStore = {
  get(key) {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  set(key, value) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value);
  },
};

async function fetchRemoteState() {
  const response = await fetch(STORAGE_ENDPOINT);
  if (!response.ok) {
    throw new Error(`Remote state fetch failed (${response.status})`);
  }
  return response.json();
}

async function saveRemoteState(patch) {
  const response = await fetch(STORAGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Remote state save failed (${response.status})`);
  }
  return response.json();
}

const storageAdapter = {
  _remoteState: null,
  _remoteLoaded: false,

  async ensureRemoteLoaded() {
    if (this._remoteLoaded) return this._remoteState;
    try {
      this._remoteState = await fetchRemoteState();
      this._remoteLoaded = true;
      return this._remoteState;
    } catch (_error) {
      this._remoteLoaded = true;
      this._remoteState = null;
      return null;
    }
  },

  async get(key) {
    if (typeof window === "undefined") return { value: null };

    const remoteState = await this.ensureRemoteLoaded();
    if (remoteState) {
      if (key === "agencyos:config" && remoteState.config) {
        const value = JSON.stringify(remoteState.config);
        localStore.set(key, value);
        return { value };
      }
      if (key === "agencyos:workspace" && remoteState.messages && remoteState.kpis) {
        const value = JSON.stringify({
          messages: remoteState.messages,
          kpis: remoteState.kpis,
          lastId: remoteState.lastId || 0,
        });
        localStore.set(key, value);
        return { value };
      }
    }

    return { value: localStore.get(key) };
  },

  async set(key, value) {
    if (typeof window === "undefined") return;

    localStore.set(key, value);

    try {
      const parsed = JSON.parse(value);
      if (key === "agencyos:config") {
        this._remoteState = await saveRemoteState({ config: parsed });
      } else if (key === "agencyos:workspace") {
        this._remoteState = await saveRemoteState({
          messages: parsed.messages || [],
          kpis: parsed.kpis || {},
          lastId: parsed.lastId || 0,
        });
      }
      this._remoteLoaded = true;
    } catch (_error) {
      // Keep local persistence even if remote sync fails.
    }
  },
};

// ══════════════════════════════════════════════════════════════════════
// AGENTS (original 22 + 6 new specialists)
// ══════════════════════════════════════════════════════════════════════

const AGENTS = {
  // Core 22
  ceo:             { name: "Le Capitaine",   role: "CEO & Stratégie",        desc: "Garde le cap. Transforme idées en stratégie et répartit le travail.",                  color: "#E8A33D", Icon: Crown,         skin: 1, hair: 0, hairStyle: "short" },
  dirProd:         { name: "Chef de prod",   role: "Directeur de production", desc: "Chef d'orchestre. Qualité et délais.",                                              color: "#5B9BD5", Icon: Cog,           skin: 3, hair: 3, hairStyle: "short" },
  dirArt:          { name: "L'artiste",      role: "Directeur artistique",    desc: "L'œil créatif. Univers visuel.",                                                   color: "#E879A6", Icon: Palette,       skin: 0, hair: 6, hairStyle: "bun" },
  uxDesigner:      { name: "Le guide",       role: "UX Designer",             desc: "Rend les sites simples et clairs.",                                                 color: "#9B8CE0", Icon: Search,        skin: 2, hair: 1, hairStyle: "curly" },
  uiDesigner:      { name: "L'esthète",      role: "UI Designer",             desc: "Interfaces belles et soignées.",                                                    color: "#B98CE0", Icon: Sparkles,      skin: 0, hair: 2, hairStyle: "long" },
  graphiste:       { name: "Le créatif",     role: "Graphiste & motion",      desc: "Photos, vidéos, animations.",                                                      color: "#EC8FB8", Icon: Camera,        skin: 4, hair: 0, hairStyle: "curly" },
  leadDev:         { name: "L'architecte",   role: "Lead développeur",        desc: "Cerveau technique. Choisit les solutions.",                                         color: "#3FBFB6", Icon: Code,          skin: 2, hair: 3, hairStyle: "buzz" },
  devFront:        { name: "Le bâtisseur",   role: "Dev front",               desc: "Construit ce que vous voyez.",                                                      color: "#5BC8C0", Icon: Monitor,       skin: 1, hair: 0, hairStyle: "short" },
  devBack:         { name: "Le mécano",      role: "Dev back",                desc: "Fait tourner les coulisses.",                                                      color: "#52C29A", Icon: Wrench,        skin: 3, hair: 5, hairStyle: "short" },
  testeur:         { name: "Le détective",   role: "Testeur qualité",         desc: "Traque les bugs avant les clients.",                                               color: "#7FCB7A", Icon: FlaskConical,  skin: 0, hair: 4, hairStyle: "long" },
  livreur:         { name: "Le livreur",     role: "Mise en ligne",           desc: "Déploie et accompagne.",                                                           color: "#9ED186", Icon: Package,       skin: 2, hair: 0, hairStyle: "short" },
  dirConseil:      { name: "Le conseiller",  role: "Directeur conseil",       desc: "Cadre les projets.",                                                               color: "#EBB94A", Icon: ClipboardList, skin: 1, hair: 3, hairStyle: "short" },
  chefProjet:      { name: "L'organisateur", role: "Chef de projet",          desc: "Tient le planning.",                                                               color: "#F0CB66", Icon: Calendar,      skin: 4, hair: 2, hairStyle: "bun" },
  dirVentes:       { name: "Le développeur", role: "Directeur des ventes",    desc: "Fait grandir le chiffre d'affaires.",                                              color: "#4DBE88", Icon: Wallet,        skin: 2, hair: 0, hairStyle: "short" },
  dirTourVentes:   { name: "Le coach",       role: "Pilote prospection",      desc: "Organise la prospection.",                                                         color: "#66CCA0", Icon: Map,           skin: 3, hair: 1, hairStyle: "curly" },
  leadChecker:     { name: "L'éclaireur",    role: "Chasseur de leads",       desc: "Déniche les clients idéaux.",                                                      color: "#86D6AE", Icon: Target,        skin: 0, hair: 6, hairStyle: "long" },
  vendeur:         { name: "L'ambassadeur",  role: "Commercial",              desc: "Présente, négocie, conclut.",                                                      color: "#57B97C", Icon: Heart,         skin: 1, hair: 0, hairStyle: "buzz" },
  dirCom:          { name: "Le porte-voix",  role: "Directeur communication", desc: "Soigne l'image de marque.",                                                        color: "#EE9159", Icon: Megaphone,     skin: 4, hair: 3, hairStyle: "short" },
  chargeCom:       { name: "L'animateur",    role: "Chargé de com",           desc: "Crée contenu et anime réseaux.",                                                    color: "#F2A877", Icon: Smartphone,    skin: 0, hair: 2, hairStyle: "curly" },
  dirOffres:       { name: "L'inventeur",    role: "Directeur des offres",    desc: "Imagine offres et prix.",                                                          color: "#B58CE0", Icon: Lightbulb,     skin: 2, hair: 0, hairStyle: "short" },
  analyste:        { name: "L'observateur",  role: "Analyste de marché",      desc: "Étudie marché et tendances.",                                                      color: "#C6A0E8", Icon: ChartIcon,     skin: 3, hair: 4, hairStyle: "long" },
  concepteurOffre: { name: "Le formaliste",  role: "Concepteur d'offres",     desc: "Met en forme offres claires.",                                                      color: "#CDA8E5", Icon: Layers,        skin: 1, hair: 1, hairStyle: "bun" },
  
  // 6 new specialists (Phase 3)
  seaSpec:         { name: "L'adman",        role: "Spécialiste SEA/Ads",     desc: "Optimise les budgets pub et les conversions.",                                      color: "#FF6B9D", Icon: Zap,           skin: 2, hair: 2, hairStyle: "buzz" },
  analyticsEng:    { name: "L'analyste BI",  role: "Analytics Engineer",      desc: "Mesure, dashboards, KPIs.",                                                       color: "#06B6D4", Icon: TrendingUp,    skin: 1, hair: 4, hairStyle: "short" },
  contentWriter:   { name: "L'écrivain",     role: "Content Creator",         desc: "Blog, articles, copywriting.",                                                     color: "#F97316", Icon: Brain,         skin: 3, hair: 1, hairStyle: "long" },
  supportAgent:    { name: "L'empathique",   role: "Support & Client",        desc: "Écoute clients et résout problèmes.",                                             color: "#8B5CF6", Icon: Heart,         skin: 0, hair: 3, hairStyle: "curly" },
  opsLead:         { name: "L'organisatrice",role: "Ops & Processus",         desc: "Automatise workflows et ops.",                                                      color: "#10B981", Icon: Settings,      skin: 4, hair: 0, hairStyle: "short" },
  financeController: { name: "Le comptable", role: "Finance & Budget",        desc: "Contrôle budgets et rentabilité.",                                                 color: "#059669", Icon: Wallet,        skin: 2, hair: 5, hairStyle: "buzz" },
};
Object.keys(AGENTS).forEach((k) => (AGENTS[k].id = k));

const HIERARCHY = {
  ceo: ["dirProd", "dirVentes", "dirCom", "dirOffres", "seaSpec", "opsLead"],
  dirProd: ["dirArt", "leadDev", "dirConseil"],
  dirArt: ["uxDesigner", "uiDesigner", "graphiste"],
  leadDev: ["devFront", "devBack", "testeur", "livreur"],
  dirConseil: ["chefProjet"],
  dirVentes: ["dirTourVentes"],
  dirTourVentes: ["leadChecker", "vendeur"],
  dirCom: ["chargeCom", "contentWriter"],
  dirOffres: ["analyste", "concepteurOffre"],
  seaSpec: ["analyticsEng"],
  opsLead: [],
  financeController: [],
  supportAgent: [],
};

const DEPARTMENTS = [
  { name: "La direction",            color: "#E8A33D", agents: ["ceo"] },
  { name: "L'atelier de production", color: "#5B9BD5", agents: ["dirProd", "dirArt", "uxDesigner", "uiDesigner", "graphiste", "leadDev", "devFront", "devBack", "testeur", "livreur", "dirConseil", "chefProjet"] },
  { name: "L'équipe commerciale",    color: "#4DBE88", agents: ["dirVentes", "dirTourVentes", "leadChecker", "vendeur"] },
  { name: "La communication",        color: "#EE9159", agents: ["dirCom", "chargeCom", "contentWriter"] },
  { name: "Les offres & le marché",  color: "#B58CE0", agents: ["dirOffres", "analyste", "concepteurOffre"] },
  { name: "La croissance & tech",    color: "#06B6D4", agents: ["seaSpec", "analyticsEng", "opsLead", "financeController", "supportAgent"] },
];

const SKIN = ["#FFD9B8", "#F4C18C", "#E3A86E", "#C68C5A", "#A06B43"];
const HAIRC = ["#4A3528", "#7A5638", "#C9A45C", "#262320", "#A85A35", "#8A8A8A", "#3A2C45"];

const QUICK = [
  { label: "Améliorer nos offres", target: "dirOffres", cmd: "Analysez nos offres et notre marché. Proposez 3 améliorations concrètes et 2 nouvelles offres pour 2026." },
  { label: "Trouver des clients", target: "dirTourVentes", cmd: "Trouvez 10 prospects idéaux selon nos clients cibles. Classez par potentiel et proposez une approche de contact." },
  { label: "Plan LinkedIn 3 mois", target: "dirCom", cmd: "Cadrez un plan LinkedIn sur 3 mois. Commencez par définir la stratégie, puis déléguez l'exécution détaillée à l'animateur et proposez ensuite une mise en forme design si utile." },
  { label: "Argumentaire de vente", target: "dirVentes", cmd: "Préparez un argumentaire clair pour notre offre principale. Listez objections courantes et réponses." },
];

const METIERS = [
  {
    id: "da", name: "Direction artistique", Icon: Palette, color: "#E879A6",
    agents: ["dirArt", "uiDesigner", "uxDesigner", "graphiste"],
    fields: [
      { key: "logo", label: "Lien du logo", type: "text", placeholder: "https://…" },
      { key: "colors", label: "Couleurs de marque", type: "chips", placeholder: "#1A1A1A, #FF7A59…" },
      { key: "fonts", label: "Typographies", type: "chips", placeholder: "Fredoka, Nunito…" },
      { key: "dsm", label: "Design system complet (DSM)", type: "long", placeholder: "Principes, composants, espacements, do & don't…" },
      { key: "tone", label: "Style visuel", type: "text", placeholder: "Épuré, premium, chaleureux…" },
    ],
  },
  {
    id: "com", name: "Communication & LinkedIn", Icon: Megaphone, color: "#EE9159",
    agents: ["dirCom", "chargeCom", "contentWriter"],
    fields: [
      { key: "linkedinUrl", label: "Page LinkedIn", type: "text", placeholder: "https://linkedin.com/company/…" },
      { key: "linkedinApi", label: "Clé API LinkedIn", type: "text", placeholder: "Token (optionnel)" },
      { key: "channels", label: "Canaux actifs", type: "chips", placeholder: "LinkedIn, Instagram, Newsletter…" },
      { key: "editorial", label: "Ligne éditoriale", type: "long", placeholder: "Sujets, ton, fréquence, formats…" },
    ],
  },
  {
    id: "commercial", name: "Commercial & Offres", Icon: Wallet, color: "#4DBE88",
    agents: ["dirVentes", "dirTourVentes", "vendeur", "leadChecker", "dirOffres", "concepteurOffre"],
    fields: [
      { key: "offers", label: "Catalogue d'offres", type: "offers" },
      { key: "process", label: "Processus de vente", type: "long", placeholder: "Étapes, durée, qui fait quoi…" },
      { key: "crm", label: "CRM (lien ou clé)", type: "text", placeholder: "HubSpot, Pipedrive…" },
    ],
  },
  {
    id: "sea", name: "Publicité (SEA / Ads)", Icon: Zap, color: "#FF6B9D",
    agents: ["seaSpec", "analyticsEng", "dirCom"],
    fields: [
      { key: "adsAccount", label: "Compte Google Ads", type: "text", placeholder: "123-456-7890" },
      { key: "budget", label: "Budget mensuel", type: "text", placeholder: "2 000 €" },
      { key: "platforms", label: "Plateformes", type: "chips", placeholder: "Google, Meta, LinkedIn…" },
      { key: "kpis", label: "Objectifs (CPA, ROAS…)", type: "text", placeholder: "CPA < 40€, ROAS x4" },
    ],
  },
  {
    id: "seo", name: "Référencement (SEO)", Icon: Search, color: "#5B9BD5",
    agents: ["devFront", "leadDev", "chargeCom", "contentWriter"],
    fields: [
      { key: "site", label: "Site web", type: "text", placeholder: "https://…" },
      { key: "keywords", label: "Mots-clés cibles", type: "chips", placeholder: "agence web, …" },
      { key: "tools", label: "Outils & accès", type: "long", placeholder: "Search Console, Analytics…" },
    ],
  },
  {
    id: "tech", name: "Technique & hébergement", Icon: Code, color: "#3FBFB6",
    agents: ["leadDev", "devFront", "devBack", "livreur", "opsLead"],
    fields: [
      { key: "stack", label: "Stack technique", type: "chips", placeholder: "WordPress, React, Next.js…" },
      { key: "hosting", label: "Hébergement", type: "text", placeholder: "OVH, Vercel…" },
      { key: "repo", label: "Dépôt de code", type: "text", placeholder: "https://github.com/…" },
    ],
  },
];

const DEFAULT_CONFIG = {
  company: { name: "", type: "", location: "", mission: "", values: [], targets: [], poles: [], brand: "", objectives: "" },
  metiers: {},
  knowledge: {},
  decisions: [],
};

const DEFAULT_KPIS = {
  total: 0,
  completed: 0,
  deliverables: [],
  flags: [],
  activity: {},
};

// ══════════════════════════════════════════════════════════════════════
// AUTO-EXTRACTION PATTERNS
// ══════════════════════════════════════════════════════════════════════

function extractFromLivrable(livrable, agentId) {
  const extractions = [];

  // Pattern: "Nouvelle offre : [Nom] ([€Prix]) : [Desc]"
  const offerRegex = /(?:Nouvelle offre|Offre supplémentaire)\s*:\s*([^(]+?)\s*\(\s*(€?\d+[^\)]*)\s*\)\s*(?::|—)\s*([^\n]+)/gi;
  let m;
  while ((m = offerRegex.exec(livrable))) {
    extractions.push({ type: "offer", data: { name: m[1].trim(), price: m[2].trim(), desc: m[3].trim() } });
  }

  // Pattern: "Nouvelle valeur : X, Y, Z" or "Ajouter valeur : X"
  const valueRegex = /(?:Nouvelle? valeur|Ajouter valeur)\s*:\s*([^.\n]+)/gi;
  while ((m = valueRegex.exec(livrable))) {
    const vals = m[1].split(/[,;]/).map((v) => v.trim()).filter((v) => v);
    extractions.push({ type: "values", data: vals });
  }

  // Pattern: "Analyse du marché : ..." or "Marché : ..."
  const marketRegex = /(?:Analyse du marché|Étude marché|Contexte marché)\s*:\s*([^\n]{20,}?)(?:\n\n|$)/i;
  if ((m = marketRegex.exec(livrable))) {
    extractions.push({ type: "knowledge", subkey: "market", data: m[1].trim() });
  }

  // Pattern: "Concurrents : ..." or "Concurrence : ..."
  const compRegex = /(?:Concurrents|Concurrence)\s*:\s*([^\n]{20,}?)(?:\n\n|$)/i;
  if ((m = compRegex.exec(livrable))) {
    extractions.push({ type: "knowledge", subkey: "competitors", data: m[1].trim() });
  }

  // Pattern: "Stratégie de vente : ..." or "Approche commerciale : ..."
  const strategyRegex = /(?:Stratégie (?:de vente|commerciale|linkedin)|Approche (?:vente|commerciale))\s*:\s*([^\n]{20,}?)(?:\n\n|$)/i;
  if ((m = strategyRegex.exec(livrable))) {
    extractions.push({ type: "knowledge", subkey: "salesStrategy", data: m[1].trim() });
  }

  return extractions;
}

// ══════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════

const tint = (c) => c + "26";

function buildBrief(config, agentId, currentAgents = []) {
  const c = config.company || {};
  const parts = [];
  const comp = [];

  if (c.name) comp.push(`Entreprise : ${c.name}${c.type ? " — " + c.type : ""}${c.location ? ", à " + c.location : ""}.`);
  if (c.mission) comp.push(`Mission : ${c.mission}`);
  if (c.values?.length) comp.push(`Valeurs : ${c.values.join(", ")}.`);
  if (c.targets?.length) comp.push(`Clients idéaux : ${c.targets.join(" ; ")}.`);
  if (c.poles?.length) comp.push(`Services/pôles : ${c.poles.map((p) => p.name + (p.desc ? ` (${p.desc})` : "")).join(" ; ")}.`);
  if (c.brand) comp.push(`ADN de marque : ${c.brand}`);
  if (c.objectives) comp.push(`Objectifs : ${c.objectives}`);

  if (comp.length) parts.push("ENTREPRISE :\n" + comp.map((x) => "• " + x).join("\n"));

  // Agents actuellement au travail
  if (currentAgents.length > 0) {
    const names = currentAgents.map((id) => AGENTS[id]?.name || id).join(", ");
    parts.push(`AGENTS ACTUELLEMENT AU TRAVAIL : ${names}. Évite de les redéléguer, ils sont occupés.`);
  }

  // Knowledge base persistée
  if (config.knowledge && Object.keys(config.knowledge).length > 0) {
    const kb = [];
    if (config.knowledge.market) kb.push(`• Marché (dernière analyse) : ${config.knowledge.market.substring(0, 150)}…`);
    if (config.knowledge.competitors) kb.push(`• Concurrents : ${config.knowledge.competitors.substring(0, 150)}…`);
    if (config.knowledge.salesStrategy) kb.push(`• Stratégie de vente : ${config.knowledge.salesStrategy.substring(0, 150)}…`);
    if (kb.length > 0) parts.push("MÉMOIRE DE L'ENTREPRISE :\n" + kb.join("\n"));
  }

  // Métiers relevants
  METIERS.forEach((m) => {
    if (!m.agents.includes(agentId)) return;
    const data = (config.metiers && config.metiers[m.id]) || {};
    const lines = [];
    m.fields.forEach((f) => {
      const v = data[f.key];
      if (f.type === "chips" && v?.length) lines.push(`${f.label} : ${v.join(", ")}`);
      else if (f.type === "offers" && v?.length) lines.push(`${f.label} :\n` + v.map((o) => `   - ${o.name || "(offre)"}${o.price ? ` — ${o.price}` : ""}${o.desc ? ` : ${o.desc}` : ""}`).join("\n"));
      else if ((f.type === "text" || f.type === "long") && v) lines.push(`${f.label} : ${v}`);
    });
    if (lines.length) parts.push(`DONNÉES MÉTIER — ${m.name} :\n` + lines.map((x) => "• " + x).join("\n"));
  });

  if (!parts.length) return "L'entreprise n'a pas encore renseigné sa fiche. Fais au mieux et signale les infos manquantes.";
  return parts.join("\n\n");
}

async function callAgent(agentId, task, context, brief) {
  const BACKEND_URL = import.meta.env.VITE_API_URL || "/api/llm";
  
  console.log("📡 Calling backend:", BACKEND_URL);

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, brief, context })
    });

    console.log("📡 Backend response status:", response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("📡 Backend error:", errorData);
      return { thinking: "", response: `API error ${response.status}`, deliverable: "", question: null, delegations: [], flags: ["BLOCKER"] };
    }

    const data = await response.json();
    console.log("📡 Backend success:", data.response?.substring(0, 100));
    return data;
  } catch (error) {
    console.error("📡 Backend fetch error:", error.message);
    return { thinking: "", response: "Connection error: " + error.message, deliverable: "", question: null, delegations: [], flags: ["BLOCKER"] };
  }
}

function buildMissionContext(messages, missionId) {
  if (!missionId) return "";
  const scoped = messages.filter((m) => m.missionId === missionId).slice(-12);
  if (!scoped.length) return "";

  return scoped.map((m) => {
    if (m.type === "command") return `Utilisateur -> ${AGENTS[m.target]?.name || m.target}: ${m.content}`;
    if (m.type === "response") return `${AGENTS[m.agentId]?.name || m.agentId}: ${m.content}`;
    if (m.type === "delegation") return `${AGENTS[m.from]?.name || m.from} delegue a ${AGENTS[m.to]?.name || m.to}`;
    return "";
  }).filter(Boolean).join("\n");
}

function buildSuggestedActions(message) {
  if (!message || message.type !== "response") return [];
  const text = `${message.content || ""}\n${message.deliverable || ""}`.toLowerCase();
  const actions = [];

  if ((message.agentId === "dirCom" || message.agentId === "chargeCom") && text.includes("linkedin")) {
    actions.push({
      label: "Envoyer au designer",
      target: "graphiste",
      cmd: "Transforme ce plan LinkedIn en proposition de carrousel. Donne 3 concepts de slides, la structure de chaque slide et une direction visuelle prête à produire.",
    });
  }

  if (message.agentId === "graphiste" || message.agentId === "dirArt") {
    actions.push({
      label: "Faire valider par la com",
      target: "dirCom",
      cmd: "Relis cette proposition créative, valide-la ou demande 3 ajustements concrets avant production.",
    });
  }

  if (message.agentId === "chargeCom") {
    actions.push({
      label: "Demander validation direction",
      target: "dirCom",
      cmd: "Valide ce livrable de communication, affine l'angle si nécessaire et décide de la suite à produire.",
    });
  }

  return actions;
}

function getMissionLabel(message) {
  return (message?.content || "Mission sans titre").replace(/\s+/g, " ").trim();
}

function summarizeMission(messages, missionId) {
  const missionMessages = messages.filter((m) => m.missionId === missionId);
  const command = missionMessages.find((m) => m.type === "command");
  const finalResponse = [...missionMessages].reverse().find((m) => m.type === "response" && m.phase === "final_validation");
  const latestResponse = [...missionMessages].reverse().find((m) => m.type === "response");
  const archived = missionMessages.some((m) => m.type === "mission_archived");

  return {
    id: missionId,
    title: getMissionLabel(command),
    target: command?.target || latestResponse?.agentId || "ceo",
    createdAt: command?.ts || missionMessages[0]?.ts || new Date(),
    updatedAt: missionMessages[missionMessages.length - 1]?.ts || command?.ts || new Date(),
    command,
    finalResponse,
    latestResponse,
    archived,
    hasFinalDeliverable: Boolean(finalResponse?.deliverable?.trim() || finalResponse?.content?.trim()),
    messages: missionMessages,
  };
}

function buildMissionList(messages) {
  const ids = Array.from(new Set(messages.filter((m) => m.missionId).map((m) => m.missionId)));
  return ids.map((id) => summarizeMission(messages, id)).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

const ROUTING_RULES = [
  { agentId: "dirCom", keywords: ["linkedin", "post", "publication", "reseaux", "réseaux", "carrousel", "communication", "contenu"] },
  { agentId: "dirOffres", keywords: ["offre", "pricing", "prix", "proposition de valeur", "pack", "positionnement"] },
  { agentId: "dirVentes", keywords: ["vente", "prospect", "lead", "commercial", "crm", "closing"] },
  { agentId: "seaSpec", keywords: ["ads", "sea", "google ads", "meta ads", "campagne", "roas", "cpa"] },
  { agentId: "leadDev", keywords: ["site", "app", "application", "technique", "bug", "fonctionnalité", "react", "api"] },
  { agentId: "dirArt", keywords: ["design", "visuel", "charte", "branding", "maquette", "identité"] },
  { agentId: "dirConseil", keywords: ["planning", "cadrage", "atelier", "roadmap", "projet"] },
];

function routeObjectiveToLead(task) {
  const text = (task || "").toLowerCase();
  for (const rule of ROUTING_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.agentId;
    }
  }
  return "ceo";
}

function buildExecutionPlan(agentId, task) {
  const text = (task || "").toLowerCase();

  if (agentId === "dirCom") {
    const plan = [
      {
        agentId: "dirCom",
        task: `Tu es responsable de mission. Reformule l'objectif, définis la stratégie de communication, les critères de succès et ce que ton équipe doit produire pour répondre à cette demande : ${task}`,
        kind: "strategy",
      },
      {
        agentId: "chargeCom",
        task: `À partir de la stratégie validée par le directeur de la communication, prépare le plan opérationnel détaillé : formats, calendrier, canaux, nombre de contenus, séquençage et consignes d'exécution pour cette demande : ${task}`,
        kind: "production",
      },
    ];

    if (text.includes("linkedin") || text.includes("post") || text.includes("contenu")) {
      plan.push({
        agentId: "contentWriter",
        task: `Rédige les contenus finaux ou brouillons des publications à partir du plan validé. Fournis un texte concret, structuré et prêt à être relu pour cette demande : ${task}`,
        kind: "copy",
      });
    }

    if (text.includes("linkedin") || text.includes("carrousel") || text.includes("visuel") || text.includes("design")) {
      plan.push({
        agentId: "graphiste",
        task: `Propose la direction créative finale à partir du contenu et du plan : format, structure des slides/posts, style visuel, éléments graphiques et indications prêtes à produire pour cette demande : ${task}`,
        kind: "design",
      });
    }

    plan.push({
      agentId: "dirCom",
      task: `Tu es en validation finale. Vérifie que la stratégie, le contenu et le design répondent bien à l'objectif initial. Si quelque chose manque, signale-le clairement. Sinon, livre une synthèse finale prête pour le donneur d'ordre pour cette demande : ${task}`,
      kind: "final_validation",
    });

    return plan;
  }

  if (agentId === "dirOffres") {
    return [
      { agentId: "dirOffres", task: `Cadre stratégiquement cette demande et définis les livrables nécessaires : ${task}`, kind: "strategy" },
      { agentId: "analyste", task: `Apporte les éléments marché, concurrents et opportunités pour cette demande : ${task}`, kind: "analysis" },
      { agentId: "concepteurOffre", task: `Formalise la proposition concrète, claire et structurée pour cette demande : ${task}`, kind: "production" },
      { agentId: "dirOffres", task: `Valide la cohérence et livre la version finale pour cette demande : ${task}`, kind: "final_validation" },
    ];
  }

  if (agentId === "leadDev") {
    return [
      { agentId: "leadDev", task: `Cadre techniquement l'objectif, découpe le travail et définis les critères de réussite : ${task}`, kind: "strategy" },
      { agentId: "devFront", task: `Traite la partie interface ou expérience visible si nécessaire pour cette demande : ${task}`, kind: "production" },
      { agentId: "devBack", task: `Traite la partie logique, données ou backend si nécessaire pour cette demande : ${task}`, kind: "production" },
      { agentId: "testeur", task: `Valide les risques, bugs, points de vigilance ou cas de test pour cette demande : ${task}`, kind: "validation" },
      { agentId: "leadDev", task: `Fais la validation technique finale et livre une synthèse finale pour cette demande : ${task}`, kind: "final_validation" },
    ];
  }

  if (agentId === "dirVentes") {
    return [
      { agentId: "dirVentes", task: `Cadre commercialement cette demande et définis la stratégie d'approche : ${task}`, kind: "strategy" },
      { agentId: "dirTourVentes", task: `Découpe le plan de prospection ou de vente et organise les étapes pour cette demande : ${task}`, kind: "production" },
      { agentId: "leadChecker", task: `Identifie les leads, cibles ou segments les plus pertinents pour cette demande : ${task}`, kind: "analysis" },
      { agentId: "vendeur", task: `Prépare le discours, la prise de contact ou la proposition commerciale pour cette demande : ${task}`, kind: "production" },
      { agentId: "dirVentes", task: `Valide la cohérence finale et livre la réponse commerciale pour cette demande : ${task}`, kind: "final_validation" },
    ];
  }

  return [
    { agentId, task: `Cadre cette demande, organise le travail de ton équipe si nécessaire, puis livre une réponse finale alignée avec l'objectif : ${task}`, kind: "strategy" },
  ];
}

const ST = {
  card: { background: "#fff", borderRadius: 20, border: "1px solid #F0E8DB", boxShadow: "0 4px 20px rgba(120,90,50,0.05)" },
  input: { width: "100%", background: "#FBF6EE", border: "1.5px solid #EFE7DA", borderRadius: 12, padding: "11px 13px", fontFamily: "Nunito, sans-serif", fontSize: 16, color: "#3D3A4E", lineHeight: 1.5 },
  label: { fontSize: 12, fontWeight: 700, color: "#A89A86", fontFamily: "Nunito, sans-serif", marginBottom: 6, display: "block" },
};

// ══════════════════════════════════════════════════════════════════════
// MODULE-LEVEL COMPONENTS
// ══════════════════════════════════════════════════════════════════════

function Hair({ style, color }) {
  const base = <path d="M28,45 C25,18 75,18 72,45 C72,31 63,26 50,26 C37,26 28,31 28,45 Z" fill={color} />;
  if (style === "bun") return (<g>{base}<circle cx="50" cy="19" r="7" fill={color} /></g>);
  if (style === "curly") return (<g fill={color}><circle cx="31" cy="34" r="9" /><circle cx="43" cy="26" r="10" /><circle cx="57" cy="26" r="10" /><circle cx="69" cy="34" r="9" /><path d="M28,46 C28,33 72,33 72,46 C72,40 28,40 28,46 Z" /></g>);
  if (style === "long") return (<g fill={color}>{base}<rect x="25" y="40" width="8" height="28" rx="4" /><rect x="67" y="40" width="8" height="28" rx="4" /></g>);
  if (style === "buzz") return <path d="M30,42 Q30,29 50,29 Q70,29 70,42 Q70,37 50,37 Q30,37 30,42 Z" fill={color} />;
  return base;
}

function Character({ id, size = 60, radius = "50%", status = "idle", badge = false }) {
  const a = AGENTS[id];
  const skin = SKIN[a.skin], hair = HAIRC[a.hair], shirt = a.color;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {status === "thinking" && <span style={{ position: "absolute", inset: -4, borderRadius: radius, border: `3px solid ${shirt}`, animation: "ring 1.2s ease-out infinite" }} />}
      <div style={{ width: size, height: size, borderRadius: radius, background: tint(shirt), overflow: "hidden" }}>
        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
          <path d="M8,100 C8,77 27,69 50,69 C73,69 92,77 92,100 Z" fill={shirt} />
          <path d="M44,59 h12 v9 q-6,5 -12,0 Z" fill={skin} />
          <circle cx="50" cy="43" r="20" fill={skin} />
          <circle cx="30" cy="45" r="3.5" fill={skin} />
          <circle cx="70" cy="45" r="3.5" fill={skin} />
          <Hair style={a.hairStyle} color={hair} />
          <circle cx="42.5" cy="44" r="2.5" fill="#4a4458" />
          <circle cx="57.5" cy="44" r="2.5" fill="#4a4458" />
          <circle cx="37" cy="50" r="3" fill="#FF9D8A" opacity="0.5" />
          <circle cx="63" cy="50" r="3" fill="#FF9D8A" opacity="0.5" />
          <path d="M43.5,51 Q50,57 56.5,51" fill="none" stroke="#4a4458" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>
      {badge && (
        <span style={{ position: "absolute", bottom: -3, right: -3, minWidth: 20, minHeight: 20, width: size * 0.42, height: size * 0.42, borderRadius: "50%", background: "#fff", border: `2px solid ${shirt}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px rgba(80,60,40,0.15)" }}>
          <a.Icon size={Math.max(11, size * 0.2)} color={shirt} strokeWidth={2.4} />
        </span>
      )}
      {status === "done" && (
        <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#5BC77F", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Check size={10} color="#fff" strokeWidth={3.5} />
        </span>
      )}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, multiline, rows = 3 }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <span style={ST.label}>{label}</span>}
      {multiline
        ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={ST.input} />
        : <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={ST.input} />}
    </div>
  );
}

function ChipsField({ label, items = [], onChange, color = "#F2785C", placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => { const v = draft.trim(); if (!v) return; onChange([...(items || []), v]); setDraft(""); };
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <span style={ST.label}>{label}</span>}
      {items?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 9 }}>
          {items.map((v, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${color}14`, border: `1.5px solid ${color}40`, color: "#5A5568", borderRadius: 20, padding: "6px 8px 6px 12px", fontSize: 13, fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>
              {v}
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: `${color}25`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={11} color={color} strokeWidth={3} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={placeholder || "Ajouter…"} style={{ ...ST.input, flex: 1 }} />
        <button onClick={add} style={{ width: 44, borderRadius: 12, border: "none", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Plus size={20} strokeWidth={2.5} /></button>
      </div>
    </div>
  );
}

function OffersField({ label, items = [], onChange, color = "#4DBE88" }) {
  const upd = (i, k, v) => onChange(items.map((o, j) => (j === i ? { ...o, [k]: v } : o)));
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <span style={ST.label}>{label}</span>}
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {(items || []).map((o, i) => (
          <div key={i} style={{ background: "#FBF6EE", borderRadius: 13, padding: 11, border: "1px solid #EFE7DA" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
              <input value={o.name || ""} onChange={(e) => upd(i, "name", e.target.value)} placeholder="Nom de l'offre" style={{ ...ST.input, background: "#fff", flex: 2, fontWeight: 700 }} />
              <input value={o.price || ""} onChange={(e) => upd(i, "price", e.target.value)} placeholder="€" style={{ ...ST.input, background: "#fff", flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={o.desc || ""} onChange={(e) => upd(i, "desc", e.target.value)} placeholder="Description" style={{ ...ST.input, background: "#fff", flex: 1 }} />
              <button onClick={() => onChange(items.filter((_, j) => j !== i))} style={{ width: 40, borderRadius: 12, border: "1px solid #F0DDD8", background: "#FFF1EE", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Trash2 size={16} color="#E0654E" /></button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => onChange([...(items || []), { name: "", price: "", desc: "" }])} style={{ marginTop: 9, width: "100%", padding: "10px", borderRadius: 12, border: `1.5px dashed ${color}60`, background: `${color}0C`, color, fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Plus size={17} strokeWidth={2.5} /> Ajouter une offre</button>
    </div>
  );
}

function Field({ field, value, onChange, color }) {
  if (field.type === "chips") return <ChipsField label={field.label} items={value} onChange={onChange} color={color} placeholder={field.placeholder} />;
  if (field.type === "offers") return <OffersField label={field.label} items={value} onChange={onChange} color={color} />;
  return <TextField label={field.label} value={value} onChange={onChange} placeholder={field.placeholder} multiline={field.type === "long"} rows={4} />;
}

function NavBtn({ t, active, onClick }) {
  const Icon = t.icon;
  return (
    <button onClick={onClick} style={{ flex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "2px 0", WebkitTapHighlightColor: "transparent" }}>
      <div style={{ position: "relative" }}>
        <Icon size={22} color={active ? "#F2785C" : "#C3B8A6"} strokeWidth={active ? 2.5 : 2} />
        {t.badge > 0 && <span style={{ position: "absolute", top: -5, right: -8, minWidth: 16, height: 16, padding: "0 4px", borderRadius: 8, background: "#F2785C", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Nunito, sans-serif", border: "2px solid #fff" }}>{t.badge}</span>}
      </div>
      <span style={{ fontSize: 10.5, color: active ? "#F2785C" : "#B3A892", fontWeight: active ? 800 : 600, fontFamily: "Nunito, sans-serif" }}>{t.label}</span>
    </button>
  );
}

function Typing({ id }) {
  const a = AGENTS[id];
  return (
    <div className="pop" style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 14 }}>
      <Character id={id} size={36} />
      <div style={{ background: "#fff", border: "1px solid #F0E8DB", borderRadius: "16px 16px 16px 5px", padding: "13px 15px", display: "flex", gap: 5 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: a.color, animation: `bounce 1.2s ${i * 0.15}s infinite` }} />)}
      </div>
    </div>
  );
}

function FeedMsg({ m, expanded, setExpanded, onValidate, onContinueMission, onAction, compact = false }) {
  const time = m.ts?.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (m.type === "command") {
    const t = AGENTS[m.target];
    return (
      <div className="pop" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, color: "#B3A892", fontFamily: "Nunito, sans-serif", marginBottom: 5, marginRight: 4, fontWeight: 600 }}>Vous, pour {t?.name} · {time}</div>
        <div style={{ maxWidth: "86%", background: "linear-gradient(135deg, #FF8A66, #F2785C)", color: "#fff", borderRadius: "20px 20px 6px 20px", padding: "12px 16px", fontSize: 14.5, lineHeight: 1.55, fontWeight: 600, fontFamily: "Nunito, sans-serif", boxShadow: "0 6px 18px rgba(242,120,92,0.25)" }}>{m.content}</div>
      </div>
    );
  }
  if (m.type === "delegation") {
    const t = AGENTS[m.to];
    return (
      <div className="pop" style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px 6px 8px", background: "#fff", border: "1px solid #F0E8DB", borderRadius: 30, boxShadow: "0 2px 10px rgba(120,90,50,0.05)" }}>
          <Character id={m.from} size={26} />
          <span style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>passe le relais à</span>
          <Character id={m.to} size={26} />
          <span style={{ fontSize: 12.5, color: t?.color, fontWeight: 800, fontFamily: "Fredoka, sans-serif" }}>{t?.name}</span>
        </div>
      </div>
    );
  }
  if (m.type === "error") {
    return (
      <div className="pop" style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 16 }}>
        <Character id={m.agentId} size={36} />
        <div style={{ background: "#FFF1EE", border: "1px solid #FAD4CB", borderRadius: "16px 16px 16px 5px", padding: "11px 14px", fontSize: 13, color: "#E0654E", fontFamily: "Nunito, sans-serif" }}>Oups : {m.content}</div>
      </div>
    );
  }
  if (m.type === "auto_saved") {
    return (
      <div className="pop" style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 30, fontSize: 12, color: "#047857", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
          <Check size={14} /> {m.content}
        </div>
      </div>
    );
  }
  const a = AGENTS[m.agentId];
  const suggestedActions = buildSuggestedActions(m);
  return (
    <div className="pop" style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 16, marginLeft: Math.min(m.depth || 0, 2) * 12 }}>
      <Character id={m.agentId} size={36} badge />
      <div style={{ maxWidth: "84%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5, marginLeft: 3, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: a.color, fontFamily: "Fredoka, sans-serif" }}>{a.name}</span>
          <span style={{ fontSize: 11, color: "#C3B8A6", fontFamily: "Nunito, sans-serif" }}>{a.role}</span>
          {m.flags?.includes("VALIDATION_REQUIRED") && <span style={{ fontSize: 10, color: "#E8A33D", background: "#FCF3E1", border: "1px solid #F2DDAE", borderRadius: 20, padding: "2px 9px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>À valider</span>}
          {m.flags?.includes("BLOCKER") && <span style={{ fontSize: 10, color: "#E0654E", background: "#FFF1EE", border: "1px solid #FAD4CB", borderRadius: 20, padding: "2px 9px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Bloqué</span>}
        </div>
        <div style={{ background: "#fff", border: "1px solid #F0E8DB", borderRadius: "16px 16px 16px 5px", padding: "12px 15px", fontSize: 14, lineHeight: 1.6, color: "#4A4658", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-wrap", boxShadow: "0 3px 14px rgba(120,90,50,0.04)" }}>
          {compact ? `${(m.content || "").slice(0, 220)}${(m.content || "").length > 220 ? "…" : ""}` : m.content}
        </div>
        {m.extractions && m.extractions.length > 0 && (
          <div style={{ marginTop: 9, padding: "10px 13px", background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#0369A1", fontFamily: "Nunito, sans-serif", marginBottom: 7 }}>Extractions détectées à valider :</div>
            {m.extractions.map((ex, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, padding: "8px 10px", background: "#fff", borderRadius: 9, border: "1px solid #E0F2FE" }}>
                <div style={{ flex: 1, fontSize: 12, color: "#334155", fontFamily: "Nunito, sans-serif" }}>
                  {ex.type === "offer" && <b>Offre : </b>}
                  {ex.type === "values" && <b>Valeurs : </b>}
                  {ex.type === "knowledge" && <b>{ex.subkey} : </b>}
                  {JSON.stringify(ex.data).substring(0, 100)}…
                </div>
                <button onClick={() => onValidate(m.id, i, true)} style={{ padding: "4px 10px", borderRadius: 7, border: "1px solid #10B981", background: "#ECFDF5", color: "#047857", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Nunito, sans-serif" }}>Valider</button>
              </div>
            ))}
          </div>
        )}
        {m.deliverable?.trim() && (
          <button onClick={() => setExpanded(expanded === m.id ? null : m.id)} style={{ marginTop: 7, width: "100%", textAlign: "left", background: `${a.color}10`, border: `1.5px solid ${a.color}40`, borderRadius: 14, padding: "10px 13px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <Package size={15} color={a.color} />
              <span style={{ fontSize: 12.5, color: a.color, fontFamily: "Fredoka, sans-serif", fontWeight: 600, flex: 1 }}>Livrable</span>
              <ChevronRight size={16} color={a.color} style={{ transform: expanded === m.id ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
            </div>
            {expanded === m.id && <div style={{ marginTop: 9, fontSize: 13.5, lineHeight: 1.6, color: "#5A5568", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-wrap" }}>{m.deliverable}</div>}
          </button>
        )}
        {!compact && (m.type === "response" || m.type === "command") && m.phase === "final_validation" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <button onClick={() => onContinueMission(m)} style={{ padding: "8px 12px", borderRadius: 20, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 12.5, fontFamily: "Nunito, sans-serif", fontWeight: 700, cursor: "pointer" }}>
              Continuer cette mission
            </button>
            {suggestedActions.map((action) => (
              <button key={action.label} onClick={() => onAction(m, action)} style={{ padding: "8px 12px", borderRadius: 20, border: `1px solid ${a.color}55`, background: `${a.color}10`, color: a.color, fontSize: 12.5, fontFamily: "Nunito, sans-serif", fontWeight: 700, cursor: "pointer" }}>
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Screens ──────────────────────────────────────────────

function SectionCard({ icon: Icon, color, title, hint, children }) {
  return (
    <div style={{ ...ST.card, padding: 16, marginBottom: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: hint ? 4 : 12 }}>
        <span style={{ width: 34, height: 34, borderRadius: 11, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={18} color={color} strokeWidth={2.2} /></span>
        <span style={{ fontSize: 16, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{title}</span>
      </div>
      {hint && <div style={{ fontSize: 12, color: "#B3A892", fontFamily: "Nunito, sans-serif", marginBottom: 12, marginLeft: 44, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  );
}

function MissionListItem({ mission, selected, onOpen }) {
  const agent = AGENTS[mission.target];
  return (
    <button onClick={() => onOpen(mission.id)} style={{ ...ST.card, width: "100%", padding: 14, marginBottom: 10, textAlign: "left", cursor: "pointer" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <Character id={mission.target} size={44} badge />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mission.title}</span>
            {selected && <span style={{ fontSize: 10.5, color: "#F2785C", background: "#FFF1EC", borderRadius: 20, padding: "2px 7px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Ouverte</span>}
          </div>
          <div style={{ fontSize: 11.5, color: agent.color, fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 4 }}>{agent.name} · {agent.role}</div>
          <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", lineHeight: 1.4 }}>
            {mission.finalResponse ? "Livrable final prêt" : "Travail en cours"} · {new Date(mission.updatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </button>
  );
}

function MissionDetail({ mission, expanded, setExpanded, onValidate, onContinueMission, onAction, onArchive, onBack }) {
  const finalResponse = mission.finalResponse || mission.latestResponse;
  const processMessages = mission.messages.filter((m) => m.type !== "command" && m.id !== finalResponse?.id && m.type !== "mission_archived");
  const [showProcess, setShowProcess] = useState(false);

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <button onClick={onBack} style={{ marginBottom: 12, border: "none", background: "transparent", color: "#9A93A8", fontSize: 12.5, fontWeight: 700, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
        ← Retour aux missions
      </button>
      <div style={{ ...ST.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <Character id={mission.target} size={48} badge />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{mission.title}</div>
            <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>
              {mission.archived ? "Mission archivée" : "Mission en cours"} · {new Date(mission.updatedAt).toLocaleString("fr-FR")}
            </div>
          </div>
        </div>
        {mission.command && (
          <div style={{ background: "#FBF6EE", borderRadius: 14, padding: "12px 14px", fontSize: 13.5, color: "#5A5568", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
            {mission.command.content}
          </div>
        )}
      </div>

      {finalResponse ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>Réponse finale</div>
          <FeedMsg m={finalResponse} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} />
        </div>
      ) : (
        <div style={{ ...ST.card, padding: 16, marginBottom: 12, fontSize: 13.5, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>
          L'équipe travaille encore. Le livrable final n'a pas encore été validé.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {!mission.archived && (
          <button onClick={() => onArchive(mission.id)} disabled={!mission.hasFinalDeliverable} style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "none", background: mission.hasFinalDeliverable ? "linear-gradient(135deg, #5BC77F, #42B76B)" : "#EDE4D5", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: mission.hasFinalDeliverable ? "pointer" : "not-allowed" }}>
            Terminer et archiver
          </button>
        )}
        <button onClick={() => onContinueMission(finalResponse || mission.command)} style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
          Donner un retour
        </button>
      </div>

      <button onClick={() => setShowProcess((p) => !p)} style={{ width: "100%", marginBottom: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer", textAlign: "left" }}>
        {showProcess ? "Masquer" : "Voir"} le process interne ({processMessages.length})
      </button>

      {showProcess && (
        <div>
          {processMessages.map((m) => <FeedMsg key={m.id} m={m} compact expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} />)}
        </div>
      )}
    </div>
  );
}

function MissionsScreen({ messages, expanded, setExpanded, onQuick, onValidate, onContinueMission, onAction, selectedMissionId, setSelectedMissionId, onArchiveMission }) {
  const [segment, setSegment] = useState("active");
  const missions = buildMissionList(messages);
  const activeMissions = missions.filter((m) => !m.archived);
  const archivedMissions = missions.filter((m) => m.archived);
  const displayed = segment === "active" ? activeMissions : archivedMissions;
  const selectedMission = missions.find((m) => m.id === selectedMissionId);

  if (selectedMission) {
    return <MissionDetail mission={selectedMission} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} onArchive={onArchiveMission} onBack={() => setSelectedMissionId(null)} />;
  }

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ display: "flex", gap: 6, padding: 4, background: "#fff", border: "1px solid #F0E8DB", borderRadius: 12, marginBottom: 14 }}>
        {[{ id: "active", label: "En cours" }, { id: "archived", label: "Archivé" }].map((seg) => (
          <button key={seg.id} onClick={() => setSegment(seg.id)} style={{ flex: 1, padding: "8px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 700, fontFamily: "Nunito, sans-serif", background: segment === seg.id ? "#F2785C" : "#fff", color: segment === seg.id ? "#fff" : "#9A93A8" }}>
            {seg.label}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div style={{ padding: "20px 0" }}>
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 6 }}>{segment === "active" ? "Aucune mission en cours" : "Aucune mission archivée"}</div>
            <div style={{ fontSize: 14, color: "#9A93A8", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>{segment === "active" ? "Lance une nouvelle mission et l'outil choisira automatiquement la meilleure équipe." : "Les missions terminées apparaîtront ici."}</div>
          </div>
          {segment === "active" && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#A89A86", fontFamily: "Nunito, sans-serif", marginBottom: 10 }}>Idées de départ</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {QUICK.map((q, i) => (
                  <button key={i} onClick={() => onQuick(q)} style={{ ...ST.card, display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", cursor: "pointer", textAlign: "left" }}>
                    <Character id={q.target} size={44} badge />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{q.label}</div>
                      <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", marginTop: 1 }}>L'app choisira ensuite automatiquement les meilleurs experts</div>
                    </div>
                    <ChevronRight size={18} color="#D8CDBD" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        displayed.map((mission) => <MissionListItem key={mission.id} mission={mission} onOpen={setSelectedMissionId} />)
      )}
    </div>
  );
}

function TeamScreen({ statuses, activity, onOpen }) {
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ fontSize: 13.5, color: "#9A93A8", fontFamily: "Nunito, sans-serif", marginBottom: 18, textAlign: "center", lineHeight: 1.5 }}>Voici les {Object.keys(AGENTS).length} membres de votre équipe.<br />Touchez quelqu'un pour lui confier une mission.</div>
      {DEPARTMENTS.map((dept) => (
        <div key={dept.name} style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: dept.color }} />
            <span style={{ fontSize: 15, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{dept.name}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {dept.agents.map((id) => {
              const a = AGENTS[id], c = activity[id] || 0;
              return (
                <button key={id} onClick={() => onOpen(id)} style={{ ...ST.card, display: "flex", alignItems: "center", gap: 13, padding: "11px 13px", cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}>
                  <Character id={id} size={50} status={statuses[id]} badge />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{a.name}</span>
                      {c > 0 && <span style={{ fontSize: 10.5, color: a.color, background: `${a.color}18`, borderRadius: 20, padding: "1px 8px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>{c}</span>}
                    </div>
                    <div style={{ fontSize: 11.5, color: a.color, fontFamily: "Nunito, sans-serif", fontWeight: 600, marginBottom: 2 }}>{a.role}</div>
                    <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", lineHeight: 1.4 }}>{a.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ObservatoryScreen({ events, thinking, config }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter || (filter === "thinking" && thinking.includes(e.agentId)));
  const unique = Array.from(new Set(events.map((e) => e.type)));
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ fontSize: 17, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 4 }}>Observer votre équipe</div>
      <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", marginBottom: 16 }}>Voyez en temps réel comment elle pense, décide et crée.</div>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, marginBottom: 14 }}>
        {[{ id: "all", label: "Tout" }, { id: "thinking", label: "Réflexions" }, ...unique.map((t) => ({ id: t, label: t.replace(/_/g, " ") }))].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 20, border: "1px solid " + (filter === f.id ? "#F2785C" : "#F0E8DB"), background: filter === f.id ? "#F2785C" : "#fff", color: filter === f.id ? "#fff" : "#7A7488", fontSize: 12.5, fontFamily: "Nunito, sans-serif", fontWeight: 700, cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "#C3B8A6", fontSize: 13.5, fontFamily: "Nunito, sans-serif", padding: "40px 20px" }}>Aucun événement pour ce filtre.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...filtered].reverse().map((e, i) => {
            const a = AGENTS[e.agentId];
            const icon = e.type === "auto_saved" ? Check : (e.type === "thinking" ? Brain : Eye);
            const Icon = e.type === "auto_saved" ? Check : (e.type === "thinking" ? Brain : Eye);
            const color = e.type === "auto_saved" ? "#10B981" : (e.type === "thinking" ? "#F59E0B" : (e.type === "delegation" ? "#8B5CF6" : a?.color || "#666"));
            return (
              <div key={i} style={{ ...ST.card, padding: 13, borderLeft: `4px solid ${color}` }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 }}>
                  {a ? <Character id={e.agentId} size={34} /> : <div style={{ width: 34, height: 34, borderRadius: "50%", background: color + "20" }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: "Fredoka, sans-serif" }}>
                      {a?.name || "Système"} — {e.type.replace(/_/g, " ")}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", fontFamily: "Nunito, sans-serif" }}>{e.ts?.toLocaleTimeString("fr-FR") || "..."}</div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: "#5A5568", fontFamily: "Nunito, sans-serif", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.content || JSON.stringify(e.data)?.substring(0, 150)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigScreen({ config, updateCompany, updateMetier, saved, decisions }) {
  const [seg, setSeg] = useState("company");
  const c = config.company;

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ display: "flex", gap: 6, padding: 4, background: "#fff", border: "1px solid #F0E8DB", borderRadius: 14, marginBottom: 14 }}>
        {[{ id: "company", label: "Mon entreprise", Icon: Building2 }, { id: "metiers", label: "Mes métiers", Icon: Settings }].map((s) => (
          <button key={s.id} onClick={() => setSeg(s.id)} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "none", cursor: "pointer", fontSize: 13.5, fontWeight: 700, fontFamily: "Nunito, sans-serif", background: seg === s.id ? "#FBEFE0" : "transparent", color: seg === s.id ? "#E8923D" : "#9A93A8", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, WebkitTapHighlightColor: "transparent" }}>
            <s.Icon size={16} /> {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", marginBottom: 14, fontSize: 12, color: "#9CCBA6", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>
        <Cloud size={14} color="#7FC78F" /> {saved ? "Enregistré automatiquement" : "Synchronisation…"}
      </div>

      {seg === "company" ? (
        <>
          <div style={{ background: "linear-gradient(135deg, #FFF4E8, #FBEFE0)", border: "1px solid #F2E2CC", borderRadius: 18, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(120,90,50,0.08)" }}><Info size={19} color="#E8A33D" /></span>
            <div style={{ fontSize: 13, color: "#7A6B52", fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }}>
              <b style={{ fontFamily: "Fredoka, sans-serif", fontWeight: 600, color: "#5A4A33" }}>Votre identité d'entreprise.</b> Tous vos agents la lisent avant chaque mission.
            </div>
          </div>

          <SectionCard icon={Building2} color="#E8A33D" title="Identité">
            <TextField label="Nom" value={c.name} onChange={(v) => updateCompany("name", v)} placeholder="Ex : Studio Lumen" />
            <TextField label="Type d'activité" value={c.type} onChange={(v) => updateCompany("type", v)} placeholder="Ex : agence web…" />
            <TextField label="Ville" value={c.location} onChange={(v) => updateCompany("location", v)} placeholder="Ex : Lyon" />
          </SectionCard>

          <SectionCard icon={Target} color="#F2785C" title="Mission" hint="Pourquoi votre entreprise existe.">
            <TextField value={c.mission} onChange={(v) => updateCompany("mission", v)} placeholder="Nous aidons …" multiline />
          </SectionCard>

          <SectionCard icon={Heart} color="#E879A6" title="Valeurs" hint="Ce qui guide vos choix.">
            <ChipsField items={c.values} onChange={(v) => updateCompany("values", v)} color="#E879A6" placeholder="Ex : excellence…" />
          </SectionCard>

          <SectionCard icon={Users} color="#4DBE88" title="Clients idéaux">
            <ChipsField items={c.targets} onChange={(v) => updateCompany("targets", v)} color="#4DBE88" placeholder="Ex : PME industrielles…" />
          </SectionCard>

          <SectionCard icon={Layers} color="#5B9BD5" title="Services">
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {c.poles.map((p, i) => (
                <div key={i} style={{ background: "#FBF6EE", borderRadius: 13, padding: 11, border: "1px solid #EFE7DA" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 7 }}>
                    <input value={p.name} onChange={(e) => updateCompany("poles", c.poles.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Nom" style={{ ...ST.input, background: "#fff", fontWeight: 700, flex: 1 }} />
                    <button onClick={() => updateCompany("poles", c.poles.filter((_, j) => j !== i))} style={{ width: 40, borderRadius: 12, border: "1px solid #F0DDD8", background: "#FFF1EE", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}><Trash2 size={16} color="#E0654E" /></button>
                  </div>
                  <input value={p.desc} onChange={(e) => updateCompany("poles", c.poles.map((x, j) => j === i ? { ...x, desc: e.target.value } : x))} placeholder="Description" style={{ ...ST.input, background: "#fff" }} />
                </div>
              ))}
            </div>
            <button onClick={() => updateCompany("poles", [...c.poles, { name: "", desc: "" }])} style={{ marginTop: 9, width: "100%", padding: "10px", borderRadius: 12, border: "1.5px dashed #5B9BD560", background: "#5B9BD50C", color: "#5B9BD5", fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><Plus size={17} /> Ajouter</button>
          </SectionCard>

          <SectionCard icon={Palette} color="#B58CE0" title="ADN de marque" hint="Style et ton.">
            <TextField value={c.brand} onChange={(v) => updateCompany("brand", v)} placeholder="Ton, esthétique…" multiline rows={4} />
          </SectionCard>

          <SectionCard icon={Lightbulb} color="#5BC77F" title="Objectifs">
            <TextField value={c.objectives} onChange={(v) => updateCompany("objectives", v)} placeholder="Vos priorités…" multiline />
          </SectionCard>

          {decisions.length > 0 && (
            <SectionCard icon={AlertCircle} color="#E8A33D" title="Historique des décisions">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {decisions.slice(-10).reverse().map((d, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#5A5568", fontFamily: "Nunito, sans-serif", padding: "8px 10px", background: "#FBF6EE", borderRadius: 9 }}>
                    <b>{d.decision}</b> — {d.ts?.toLocaleString("fr-FR") || ""}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </>
      ) : (
        <>
          {METIERS.map((m) => {
            const data = config.metiers[m.id] || {};
            const filled = m.fields.filter((f) => { const v = data[f.key]; return Array.isArray(v) ? v.length : (v && String(v).trim()); }).length;
            return (
              <div key={m.id} style={{ ...ST.card, marginBottom: 11 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 15px", borderBottom: "1px solid #F0E8DB" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 12, background: `${m.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><m.Icon size={20} color={m.color} strokeWidth={2.2} /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{m.name}</div>
                    <div style={{ fontSize: 11.5, color: filled ? m.color : "#B3A892", fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>{filled ? `${filled} info${filled > 1 ? "s" : ""}` : "À compléter"}</div>
                  </div>
                </div>
                <div style={{ padding: "13px 15px" }}>
                  {m.fields.map((f) => (
                    <Field key={f.key} field={f} value={data[f.key]} color={m.color} onChange={(v) => updateMetier(m.id, f.key, v)} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function BilanScreen({ kpis, activity, leaderboard, maxAct }) {
  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ fontSize: 19, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 4 }}>Bilan de votre équipe</div>
      <div style={{ fontSize: 13, color: "#9A93A8", fontFamily: "Nunito, sans-serif", marginBottom: 16 }}>Ce que tout le monde a accompli ensemble.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 18 }}>
        {[
          { label: "Échanges", value: kpis.total, color: "#5B9BD5" },
          { label: "Missions finies", value: kpis.completed, color: "#5BC77F" },
          { label: "Documents", value: kpis.deliverables.length, color: "#E8A33D" },
          { label: "À revoir", value: kpis.flags.length, color: "#F2785C" },
        ].map((s) => (
          <div key={s.label} style={{ ...ST.card, padding: 16, background: `linear-gradient(135deg, ${s.color}12, #fff)` }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: s.color, fontFamily: "Fredoka, sans-serif", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: "#9A93A8", marginTop: 6, fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {leaderboard[0] && (
        <div style={{ ...ST.card, padding: 15, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(135deg, ${AGENTS[leaderboard[0][0]].color}15, #fff)` }}>
          <Character id={leaderboard[0][0]} size={52} badge />
          <div>
            <div style={{ fontSize: 12, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Le plus impliqué</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{AGENTS[leaderboard[0][0]].name}</div>
            <div style={{ fontSize: 12.5, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>{leaderboard[0][1]} contribution{leaderboard[0][1] > 1 ? "s" : ""}</div>
          </div>
        </div>
      )}

      {kpis.deliverables.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 12 }}>Documents créés</div>
          {kpis.deliverables.map((d, i) => {
            const a = AGENTS[d.agentId];
            return (
              <div key={i} style={{ ...ST.card, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <Character id={d.agentId} size={32} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{a.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#C3B8A6", fontFamily: "Nunito, sans-serif" }}>{d.ts?.toLocaleTimeString("fr-FR")}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#5A5568", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-wrap" }}>{d.content.substring(0, 200)}…</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MissionSheet({ command, setCommand, onSend, onClose }) {
  const suggestedLead = routeObjectiveToLead(command);
  const a = AGENTS[suggestedLead];
  return (
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(60,45,30,0.35)", backdropFilter: "blur(2px)", animation: "fadeBg 0.25s ease", zIndex: 10 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#FBF6EE", borderRadius: "28px 28px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)", animation: "sheetUp 0.4s cubic-bezier(0.34,1.4,0.64,1)", zIndex: 11, maxHeight: "88%", overflowY: "auto" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "#E5DAC8", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>Nouvelle mission</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", border: "1px solid #F0E8DB", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={17} color="#9A93A8" /></button>
        </div>

        <div style={{ display: "flex", gap: 11, alignItems: "center", padding: "12px 14px", background: `${a.color}12`, border: `1.5px solid ${a.color}35`, borderRadius: 16, marginBottom: 14 }}>
          <Character id={suggestedLead} size={42} badge />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: a.color, fontFamily: "Fredoka, sans-serif" }}>Responsable suggéré · {a.role}</div>
            <div style={{ fontSize: 12, color: "#7A7488", fontFamily: "Nunito, sans-serif", lineHeight: 1.4, marginTop: 2 }}>{a.desc}</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, marginBottom: 6 }}>
          {QUICK.map((q, i) => (
            <button key={i} onClick={() => setCommand(q.cmd)} style={{ flexShrink: 0, padding: "8px 14px", background: "#fff", border: "1px solid #F0E8DB", borderRadius: 30, color: "#7A7488", fontSize: 12.5, fontFamily: "Nunito, sans-serif", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", WebkitTapHighlightColor: "transparent" }}>{q.label}</button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <textarea value={command} onChange={(e) => setCommand(e.target.value)} placeholder="Votre mission…" rows={3} style={{ flex: 1, background: "#fff", border: "1.5px solid #EFE7DA", borderRadius: 16, padding: "13px 15px", color: "#3D3A4E", fontSize: 16, fontFamily: "Nunito, sans-serif", lineHeight: 1.5 }} />
          <button onClick={onSend} disabled={!command.trim()} style={{ width: 54, height: 54, borderRadius: 16, border: "none", flexShrink: 0, cursor: command.trim() ? "pointer" : "not-allowed", background: command.trim() ? "linear-gradient(135deg, #FF9466, #F2785C)" : "#EDE4D5", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: command.trim() ? "0 6px 16px rgba(242,120,92,0.35)" : "none", WebkitTapHighlightColor: "transparent" }}>
            <ArrowUp size={23} color={command.trim() ? "#fff" : "#C3B8A6"} strokeWidth={2.6} />
          </button>
        </div>
        <div style={{ marginTop: 11, fontSize: 12, color: "#B3A892", fontFamily: "Nunito, sans-serif", textAlign: "center" }}>Votre équipe s'auto-organise.</div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════

export default function AgencySaaS() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [messages, setMessages] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [kpis, setKpis] = useState(DEFAULT_KPIS);
  const [command, setCommand] = useState("");
  const [target, setTarget] = useState("ceo");
  const [processing, setProcessing] = useState(false);
  const [tab, setTab] = useState("missions");
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [saved, setSaved] = useState(true);
  const [events, setEvents] = useState([]);
  const [thinking, setThinking] = useState([]);
  const [selectedMissionId, setSelectedMissionId] = useState(null);

  const idRef = useRef(0);
  const configRef = useRef(config);
  const hydrated = useRef(false);
  configRef.current = config;

  // Load from storage
  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== "undefined") {
          const r = await storageAdapter.get("agencyos:config");
          if (r?.value) setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(r.value) });
        }
      } catch (e) { }
      try {
        if (typeof window !== "undefined") {
          const w = await storageAdapter.get("agencyos:workspace");
          if (w?.value) {
            const ws = JSON.parse(w.value);
            if (ws.messages) setMessages(ws.messages.map((m) => ({ ...m, ts: m.ts ? new Date(m.ts) : new Date() })));
            if (ws.kpis) {
              setKpis({
                ...DEFAULT_KPIS,
                ...ws.kpis,
                deliverables: (ws.kpis.deliverables || []).map((d) => ({ ...d, ts: new Date(d.ts) })),
                flags: (ws.kpis.flags || []).map((f) => ({ ...f, ts: new Date(f.ts) })),
                activity: ws.kpis.activity || {},
              });
            }
            idRef.current = ws.lastId || 0;
          }
        }
      } catch (e) { }
      hydrated.current = true;
    })();
  }, []);

  // Save config
  useEffect(() => {
    if (!hydrated.current) return;
    setSaved(false);
    const t = setTimeout(async () => {
      try {
        if (typeof window !== "undefined") await storageAdapter.set("agencyos:config", JSON.stringify(config));
        setSaved(true);
      } catch (e) { setSaved(true); }
    }, 700);
    return () => clearTimeout(t);
  }, [config]);

  // Save workspace
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(async () => {
      try {
        if (typeof window !== "undefined") {
          const trimmed = messages.slice(-150);
          await storageAdapter.set("agencyos:workspace", JSON.stringify({ messages: trimmed, kpis, lastId: idRef.current }));
        }
      } catch (e) { }
    }, 900);
    return () => clearTimeout(t);
  }, [messages, kpis]);

  const addEvent = useCallback((type, agentId, data) => {
    setEvents((p) => [...p.slice(-200), { ts: new Date(), type, agentId, content: "", data }]);
  }, []);

  const addMsg = useCallback((msg) => {
    const id = ++idRef.current;
    setMessages((p) => [...p, { id, ts: new Date(), ...msg }]);
    if (msg.type === "response") setKpis((p) => ({ ...p, total: p.total + 1, activity: { ...p.activity, [msg.agentId]: (p.activity[msg.agentId] || 0) + 1 } }));
  }, []);

  const setStatus = useCallback((id, s) => {
    setStatuses((p) => ({ ...p, [id]: s }));
    if (s === "thinking") setThinking((p) => [...p, id]);
    else setThinking((p) => p.filter((x) => x !== id));
  }, []);

  const updateCompany = useCallback((key, value) => setConfig((p) => ({ ...p, company: { ...p.company, [key]: value } })), []);
  const updateMetier = useCallback((mid, key, value) => setConfig((p) => ({ ...p, metiers: { ...p.metiers, [mid]: { ...(p.metiers[mid] || {}), [key]: value } } })), []);

  const runAgent = useCallback(async (agentId, task, depth, context, missionId, phase = "step") => {
    if (depth > 3 || !AGENTS[agentId]) return;
    
    setStatus(agentId, "thinking");
    addEvent("thinking", agentId, { depth });

    try {
      const currentWorking = thinking.filter((id) => id !== agentId);
      const brief = buildBrief(configRef.current, agentId, currentWorking);
      const missionContext = buildMissionContext(messages, missionId);
      const mergedContext = [missionContext, context].filter(Boolean).join("\n\n");
      const res = await callAgent(agentId, task, mergedContext, brief);

      addEvent("response", agentId, { response: res.response.substring(0, 150) });
      
      setStatus(agentId, "done");
      
      // Extract from livrable
      let extractions = [];
      if (res.deliverable?.trim()) {
        extractions = extractFromLivrable(res.deliverable, agentId);
      }

      const finalDeliverable = phase === "final_validation" ? (res.deliverable?.trim() ? res.deliverable : res.response) : res.deliverable;
      addMsg({ type: "response", agentId, content: res.response, deliverable: finalDeliverable, flags: res.flags || [], depth, extractions, missionId, phase });

      if (finalDeliverable?.trim()) {
        setKpis((p) => ({ ...p, deliverables: [...p.deliverables, { agentId, content: finalDeliverable, ts: new Date(), task }] }));
        
        // Auto-save extractions with VALIDATION flag
        extractions.forEach((ex) => {
          addEvent("auto_saved", agentId, { extraction: ex });
        });
      }

      if (res.flags?.length) setKpis((p) => ({ ...p, flags: [...p.flags, { agentId, flags: res.flags, context: res.response, ts: new Date() }] }));

      if (res.delegations?.length && depth < 3) {
        for (const d of res.delegations) {
          if (AGENTS[d.agentId]) {
            await new Promise((r) => setTimeout(r, 350));
            addEvent("delegation", agentId, { to: d.agentId, task: d.task });
            addMsg({ type: "delegation", from: agentId, to: d.agentId, missionId });
            await runAgent(d.agentId, d.task, depth + 1, res.response, missionId, "step");
          }
        }
      }

      setKpis((p) => ({ ...p, completed: p.completed + 1 }));
    } catch (e) {
      setStatus(agentId, "error");
      addMsg({ type: "error", agentId, content: e.message });
    }
    setTimeout(() => setStatus(agentId, "idle"), 2500);
  }, [addEvent, addMsg, setStatus, thinking, messages]);

  const handleSend = useCallback(async () => {
    if (!command.trim() || processing) return;
    const cmd = command.trim();
    const missionId = selectedMissionId || `mission-${Date.now()}`;
    const leadAgentId = routeObjectiveToLead(cmd);
    const plan = buildExecutionPlan(leadAgentId, cmd);
    setCommand(""); setSheet(false); setTab("missions"); setProcessing(true);
    setSelectedMissionId(missionId);
    addMsg({ type: "command", target: leadAgentId, content: cmd, missionId });
    addMsg({ type: "auto_saved", content: `Mission routée vers ${AGENTS[leadAgentId].name}. ${plan.length > 1 ? `${plan.length} étapes prévues.` : "Exécution directe."}`, missionId });
    addEvent("command_received", leadAgentId, { cmd });
    for (let i = 0; i < plan.length; i += 1) {
      const step = plan[i];
      if (i > 0) {
        addEvent("delegation", leadAgentId, { to: step.agentId, task: step.task });
        addMsg({ type: "delegation", from: plan[i - 1].agentId, to: step.agentId, missionId });
      }
      await runAgent(step.agentId, step.task, i, "", missionId, step.kind);
    }
    setProcessing(false);
  }, [command, processing, addMsg, addEvent, runAgent, selectedMissionId]);

  const handleContinueMission = useCallback((message) => {
    setSelectedMissionId(message.missionId || null);
    setCommand("");
    setSheet(true);
  }, []);

  const handleSuggestedAction = useCallback((message, action) => {
    setSelectedMissionId(message.missionId || null);
    setCommand(action.cmd);
    setSheet(true);
  }, []);

  const handleArchiveMission = useCallback((missionId) => {
    addMsg({ type: "mission_archived", missionId, content: "Mission archivée" });
    setSelectedMissionId(null);
  }, [addMsg]);

  const handleValidate = (msgId, exIdx, approved) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg || !msg.extractions || !msg.extractions[exIdx]) return;
    
    const ex = msg.extractions[exIdx];
    if (approved) {
      // Apply to config
      if (ex.type === "offer") {
        updateMetier("commercial", "offers", [...(config.metiers.commercial?.offers || []), ex.data]);
        addEvent("extraction_validated", msg.agentId, { type: "offer", data: ex.data });
      } else if (ex.type === "values") {
        updateCompany("values", [...(config.company.values || []), ...(ex.data || [])]);
      } else if (ex.type === "knowledge") {
        setConfig((p) => ({ ...p, knowledge: { ...p.knowledge, [ex.subkey]: ex.data } }));
      }
      addMsg({ type: "auto_saved", content: `${ex.type} validée et sauvegardée` });
    }
  };

  const activity = kpis.activity;
  const maxAct = Math.max(...Object.values(activity), 1);
  const leaderboard = Object.entries(activity).sort(([, a], [, b]) => b - a);

  const TABS = [
    { id: "missions", icon: Home, label: "Missions" },
    { id: "team", icon: Users, label: "Équipe" },
    { id: "company", icon: Settings, label: "Réglages" },
    { id: "bilan", icon: BarChart3, label: "Bilan", badge: kpis.deliverables.length + kpis.flags.length },
  ];

  const studioName = config.company.name || "Mon studio";

  return (
    <div style={{ height: "100dvh", width: "100%", background: "#FBF6EE", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", fontFamily: "Nunito, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes ring { 0%{transform:scale(1);opacity:0.7;} 100%{transform:scale(1.3);opacity:0;} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);} 30%{transform:translateY(-6px);} }
        @keyframes pop { from{opacity:0;transform:translateY(12px) scale(0.97);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes sheetUp { from{transform:translateY(100%);} to{transform:translateY(0);} }
        @keyframes fadeBg { from{opacity:0;} to{opacity:1;} }
        .pop { animation: pop 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        textarea:focus, input:focus, button:focus { outline: none; }
        textarea { resize: none; }
        input::placeholder, textarea::placeholder { color: #C3B8A6; }
        button:active { transform: scale(0.97); }
      `}</style>

      {/* Header */}
      <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px 13px", flexShrink: 0, background: "#fff", borderBottom: "1px solid #F0E8DB", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 13, background: "linear-gradient(135deg, #FFB877, #F2785C)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(242,120,92,0.25)" }}>
          <Sparkles size={21} color="#fff" fill="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{studioName}</div>
          <div style={{ fontSize: 12.5, color: "#9A93A8", fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>Votre équipe, prête à travailler</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", background: processing ? "#FFF1EC" : "#F0FAF2", borderRadius: 30 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: processing ? "#F2785C" : "#5BC77F", animation: processing ? "bounce 0.8s infinite" : "none" }} />
          <span style={{ fontSize: 11.5, color: processing ? "#F2785C" : "#5BC77F", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>{processing ? "Au travail" : "Disponible"}</span>
        </div>
      </div>

      {/* Screen */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {tab === "missions" && <MissionsScreen messages={messages} expanded={expanded} setExpanded={setExpanded} onQuick={(q) => { setCommand(q.cmd); setSheet(true); }} onValidate={handleValidate} onContinueMission={handleContinueMission} onAction={handleSuggestedAction} selectedMissionId={selectedMissionId} setSelectedMissionId={setSelectedMissionId} onArchiveMission={handleArchiveMission} />}
        {tab === "team" && <TeamScreen statuses={statuses} activity={activity} onOpen={() => {}} />}
        {tab === "company" && <ConfigScreen config={config} updateCompany={updateCompany} updateMetier={updateMetier} saved={saved} decisions={config.decisions || []} />}
        {tab === "bilan" && <BilanScreen kpis={kpis} activity={activity} leaderboard={leaderboard} maxAct={maxAct} />}
      </div>

      {/* Bottom nav */}
      <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #F0E8DB", display: "flex", alignItems: "flex-start", paddingTop: 11, paddingBottom: "env(safe-area-inset-bottom, 0px)", minHeight: 76, position: "relative", boxShadow: "0 -4px 20px rgba(120,90,50,0.04)" }}>
        {TABS.slice(0, 2).map((t) => <NavBtn key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <button onClick={() => setSheet(true)} style={{ width: 60, height: 60, borderRadius: "50%", border: "none", marginTop: -24, background: "linear-gradient(135deg, #FF9466, #F2785C)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "0 8px 22px rgba(242,120,92,0.4)", WebkitTapHighlightColor: "transparent" }}>
            <Plus size={28} color="#fff" strokeWidth={2.6} />
          </button>
        </div>
        {TABS.slice(2).map((t) => <NavBtn key={t.id} t={t} active={tab === t.id} onClick={() => setTab(t.id)} />)}
      </div>

      {sheet && <MissionSheet command={command} setCommand={setCommand} onSend={handleSend} onClose={() => setSheet(false)} />}
    </div>
  );
}
