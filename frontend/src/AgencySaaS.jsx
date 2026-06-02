import {
    AlertCircle,
    ArrowUp,
    BarChart3,
    Brain,
    Building2,
    Calendar,
    Camera,
    BarChart3 as ChartIcon,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Cloud,
    Code,
    Cog,
    Crown,
    Eye,
    FlaskConical,
    Heart,
    Home,
    Info,
    Layers,
    Lightbulb,
    LoaderCircle,
    Map as MapIcon,
    Megaphone,
    Monitor,
    Package,
    Palette,
    Plus,
    Search,
    Settings,
    Smartphone,
    Sparkles,
    Target,
    Trash2,
    TrendingUp,
    Users,
    Wallet,
    Wrench,
    X,
    Zap
} from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_ENDPOINT = "/api/state";
const IMAGE_ENDPOINT = "/api/image";

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

function isPlainRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeAssets(assets) {
  if (!Array.isArray(assets)) return [];
  return assets
    .filter(isPlainRecord)
    .map((asset, index) => ({
      ...asset,
      url: typeof asset.url === "string" ? asset.url : "",
      alt: typeof asset.alt === "string" ? asset.alt : "",
      index: Number.isFinite(asset.index) ? asset.index : index,
    }))
    .filter((asset) => asset.url);
}

function normalizeMessageRecord(message) {
  if (!isPlainRecord(message)) return null;
  return {
    ...message,
    ts: message?.ts ? new Date(message.ts) : new Date(),
    assets: normalizeAssets(message.assets),
    flags: Array.isArray(message.flags) ? message.flags.filter(Boolean) : [],
    extractions: Array.isArray(message.extractions) ? message.extractions.filter(isPlainRecord) : [],
  };
}

function normalizeDeliverableRecord(deliverable) {
  if (!isPlainRecord(deliverable)) return null;
  const content = typeof deliverable.content === "string" ? deliverable.content : String(deliverable.content || "");
  const title = deliverable.title || extractDeliverableTitle(content, "Livrable");
  const assets = normalizeAssets(deliverable.assets);
  return {
    ...deliverable,
    missionId: typeof deliverable.missionId === "string" ? deliverable.missionId : null,
    messageId: Number.isFinite(deliverable.messageId) ? deliverable.messageId : null,
    agentId: typeof deliverable.agentId === "string" ? deliverable.agentId : "ceo",
    title,
    snippet: deliverable.snippet || buildSnippet(content, title),
    content,
    ts: deliverable?.ts ? new Date(deliverable.ts) : new Date(),
    task: typeof deliverable.task === "string" ? deliverable.task : "",
    imageUrl: typeof deliverable.imageUrl === "string" ? deliverable.imageUrl : "",
    hasAssets: Boolean(deliverable.hasAssets || deliverable.assetCount || assets.length || deliverable.imageUrl),
    assetCount: Number.isFinite(deliverable.assetCount) ? deliverable.assetCount : assets.length,
    assets,
  };
}

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

async function requestSingleImage(prompt, conversationId, messageId, references, exactCount, slideIndex) {
  const response = await fetch(IMAGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      count: 1,
      conversationId,
      messageId,
      references,
      exactCount,
      slideIndex,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

async function callImageGenerator(prompt, count = 1, conversationId = null, messageId = null, options = {}) {
  const slideCount = Number.isFinite(count) ? Math.max(1, Math.min(10, count)) : 1;
  const references = Array.isArray(options.references) ? options.references : [];
  const exactCount = Number.isFinite(options.exactCount) ? options.exactCount : slideCount;

  if (slideCount === 1) {
    return requestSingleImage(prompt, conversationId, messageId, references, exactCount, null);
  }

  // Generate one slide per request so each call stays within the serverless timeout.
  const images = [];
  let lastResult = null;
  for (let slideIndex = 0; slideIndex < slideCount; slideIndex += 1) {
    const result = await requestSingleImage(prompt, conversationId, messageId, references, exactCount, slideIndex);
    lastResult = result;
    const url = result?.imageUrl || result?.images?.[0];
    if (url) images.push(url);
  }

  return { ...(lastResult || {}), images, imageUrl: images[0] || null };
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
  dirTourVentes:   { name: "Le coach",       role: "Pilote prospection",      desc: "Organise la prospection.",                                                         color: "#66CCA0", Icon: MapIcon,       skin: 3, hair: 1, hairStyle: "curly" },
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
      { key: "logo", label: "Logos", type: "images", placeholder: "" },
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
  company: {
    name: "",
    type: "",
    location: "",
    website: "",
    contactEmail: "",
    contactPhone: "",
    mission: "",
    values: [],
    targets: [],
    poles: [],
    brand: "",
    objectives: "",
  },
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
  if (c.website) comp.push(`Site web : ${c.website}`);
  if (c.contactEmail) comp.push(`Email de contact : ${c.contactEmail}`);
  if (c.contactPhone) comp.push(`Téléphone de contact : ${c.contactPhone}`);
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

  if (!parts.length) {
    parts.push("L'entreprise n'a pas encore renseigné sa fiche. Fais au mieux et signale les infos manquantes.");
  }
  parts.push("RÈGLES DE SORTIE :\n• Réponds exclusivement en français naturel.\n• Aucun franglais.\n• Utilise des formulations prêtes à être relues par un client francophone.\n• Quand tu proposes un livrable, donne un titre clair en français dès la première ligne.");
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

function renderInlineRichText(text, keyPrefix = "rt") {
  return String(text || "").split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${keyPrefix}-b-${index}`} style={{ fontWeight: 800 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={`${keyPrefix}-i-${index}`} style={{ fontStyle: "italic" }}>{part.slice(1, -1)}</em>;
    }
    return <span key={`${keyPrefix}-t-${index}`}>{part}</span>;
  });
}

function RichText({ text, color = "#4A4658" }) {
  const blocks = String(text || "").split(/\n{2,}/).filter(Boolean);
  return (
    <div style={{ color, fontFamily: "Nunito, sans-serif", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
      {blocks.map((block, index) => {
        const lines = block.split("\n").filter(Boolean);
        if (lines.every((line) => /^\s*[-•]\s+/.test(line))) {
          return (
            <ul key={`ul-${index}`} style={{ margin: "0 0 10px 18px", padding: 0 }}>
              {lines.map((line, lineIndex) => <li key={`li-${index}-${lineIndex}`} style={{ marginBottom: 4 }}>{renderInlineRichText(line.replace(/^\s*[-•]\s+/, ""), `li-${index}-${lineIndex}`)}</li>)}
            </ul>
          );
        }
        if (/^#{1,3}\s+/.test(block)) {
          return <div key={`h-${index}`} style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 8 }}>{renderInlineRichText(block.replace(/^#{1,3}\s+/, ""), `h-${index}`)}</div>;
        }
        return (
          <p key={`p-${index}`} style={{ margin: "0 0 10px 0" }}>
            {lines.map((line, lineIndex) => (
              <span key={`line-${index}-${lineIndex}`}>
                {renderInlineRichText(line, `p-${index}-${lineIndex}`)}
                {lineIndex < lines.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function buildMissionContext(messages, missionId) {
  if (!missionId) return "";
  const scoped = (Array.isArray(messages) ? messages : [])
    .filter((m) => isPlainRecord(m) && m.missionId === missionId)
    .slice(-12);
  if (!scoped.length) return "";

  return scoped.map((m) => {
    if (m.type === "command") return `Utilisateur -> ${AGENTS[m.target]?.name || m.target}: ${m.content}`;
    if (m.type === "response") {
      const payload = [m.content, m.deliverable ? `Livrable: ${m.deliverable}` : "", m.assets?.length ? `Visuels générés: ${m.assets.length}` : ""].filter(Boolean).join("\n");
      return `${AGENTS[m.agentId]?.name || m.agentId}: ${payload}`;
    }
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

function cleanDisplayLine(line) {
  return String(line || "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\s*[-•]\s+/, "")
    .replace(/^\s*\d+\.\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstMeaningfulLine(text) {
  const lines = String(text || "")
    .split("\n")
    .map((line) => cleanDisplayLine(line))
    .filter(Boolean);
  return lines[0] || "";
}

function extractDeliverableTitle(text, fallback = "Livrable") {
  const firstLine = getFirstMeaningfulLine(text);
  if (!firstLine) return fallback;

  const colonMatch = firstLine.match(/^(?:titre|livrable|document|proposition)\s*:\s*(.+)$/i);
  const candidate = colonMatch?.[1]?.trim() || firstLine;
  return candidate.length > 84 ? `${candidate.slice(0, 81).trim()}…` : candidate;
}

function buildSnippet(text, title = "") {
  const normalized = String(text || "")
    .split("\n")
    .map((line) => cleanDisplayLine(line))
    .filter(Boolean);

  if (!normalized.length) return "";

  const filtered = title && normalized[0] === title ? normalized.slice(1) : normalized;
  const body = filtered.join(" ");
  if (!body) return "";
  return body.length > 220 ? `${body.slice(0, 217).trim()}…` : body;
}

function countStructuredVisualSections(text) {
  const matches = [...String(text || "").matchAll(/(?:^|\n)\s*(?:slide|diapo(?:sitive)?|visuel|image|page|carte)\s*(?:n[o°]\s*)?(?:#\s*)?(\d{1,2})\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!matches.length) return null;
  const unique = [...new Set(matches)].sort((a, b) => a - b);
  const sequential = unique.every((value, index) => value === index + 1);
  return sequential ? unique.length : Math.max(...unique);
}

function extractExplicitVisualCount(text) {
  const source = String(text || "").toLowerCase();
  const patterns = [
    /\b(?:carrousel|carousel|serie|série|suite)\s+(?:de\s+)?(10|[1-9])\s+(?:slides?|diapos?(?:itives)?|visuels?|images?|cartes?)\b/,
    /\b(10|[1-9])\s+(?:slides?|diapos?(?:itives)?|visuels?|images?|cartes?)\b/,
    /\b(?:comprend|comporte|prévoit|prevoyez|prévois|prevu|prévu|avec)\s+(10|[1-9])\s+(?:slides?|diapos?(?:itives)?|visuels?|images?|cartes?)\b/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return Math.max(1, Math.min(10, Number(match[1])));
  }
  return null;
}

function inferVisualPlan(task, response, context = "") {
  const responseText = `${response?.deliverable || ""}\n${response?.response || ""}`;
  const taskText = String(task || "");
  const contextText = String(context || "");
  const contextCount = extractExplicitVisualCount(contextText) || countStructuredVisualSections(contextText);
  const responseCount = countStructuredVisualSections(responseText) || extractExplicitVisualCount(responseText);
  const taskCount = extractExplicitVisualCount(taskText) || countStructuredVisualSections(taskText);
  const exactCount = contextCount || responseCount || taskCount || (/carrousel|carousel/i.test(`${contextText}\n${taskText}\n${responseText}`) ? 4 : 1);
  return {
    exactCount: Math.max(1, Math.min(10, Number(exactCount) || 1)),
    contextCount,
    responseCount,
    taskCount,
  };
}

function getResponseTitle(message) {
  if (!message) return "Réponse";
  if (message.phase === "final_validation") return "Livrable final";
  if (message.phase === "strategy") return "Cadrage stratégique";
  if (message.phase === "production") return "Préparation opérationnelle";
  if (message.phase === "copy") return "Rédaction";
  if (message.phase === "design") return "Direction créative";
  if (message.phase === "analysis") return "Analyse";
  return "Contribution";
}

function formatDateTime(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function normalizeWorkspacePayload(rawWorkspace = {}) {
  const rawMessages = Array.isArray(rawWorkspace.messages) ? rawWorkspace.messages : [];
  const rawKpis = rawWorkspace.kpis && typeof rawWorkspace.kpis === "object" ? rawWorkspace.kpis : {};
  const rawDeliverables = Array.isArray(rawKpis.deliverables) ? rawKpis.deliverables : [];
  const rawActivity = rawKpis.activity && typeof rawKpis.activity === "object" ? rawKpis.activity : {};
  const normalizedActivity = Object.fromEntries(
    Object.entries(rawActivity)
      .filter(([key]) => typeof key === "string" && key)
      .map(([key, value]) => [key, Number.isFinite(value) ? value : Number(value) || 0])
  );

  return {
    messages: rawMessages.map(normalizeMessageRecord).filter(Boolean),
    kpis: {
      ...DEFAULT_KPIS,
      ...rawKpis,
      total: Number.isFinite(rawKpis.total) ? rawKpis.total : Number(rawKpis.total) || 0,
      completed: Number.isFinite(rawKpis.completed) ? rawKpis.completed : Number(rawKpis.completed) || 0,
      deliverables: rawDeliverables.map(normalizeDeliverableRecord).filter(Boolean),
      flags: Array.isArray(rawKpis.flags)
        ? rawKpis.flags
          .filter(isPlainRecord)
          .map((f) => ({ ...f, ts: f?.ts ? new Date(f.ts) : new Date() }))
        : [],
      activity: normalizedActivity,
    },
    lastId: Number.isFinite(rawWorkspace.lastId) ? rawWorkspace.lastId : 0,
  };
}

function getProgressLabel(agentId, phase) {
  const name = AGENTS[agentId]?.name || "L'équipe";
  if (phase === "strategy") return `Analyse de ${name} en cours`;
  if (phase === "production") return `Réponse de ${name} en cours`;
  if (phase === "copy") return "Rédaction du livrable en cours";
  if (phase === "design") return "Direction visuelle en cours";
  if (phase === "image_generation") return "Génération des images en cours";
  if (phase === "final_validation") return `Validation finale par ${name} en cours`;
  return `Traitement par ${name} en cours`;
}

function resolveMissionTitle(command, finalResponse, latestResponse, archived) {
  const titleSource = finalResponse?.deliverable || finalResponse?.content || (archived ? latestResponse?.deliverable || latestResponse?.content : "");
  if (titleSource?.trim()) {
    return extractDeliverableTitle(titleSource, "Livrable");
  }

  const commandTitle = cleanDisplayLine(command?.content || "Mission sans titre");
  return commandTitle.length > 84 ? `${commandTitle.slice(0, 81).trim()}…` : commandTitle;
}

function resolveDeliverableMissionId(messages, deliverable) {
  if (deliverable?.missionId) return deliverable.missionId;

  const safeMessages = Array.isArray(messages) ? messages.filter(isPlainRecord) : [];
  const matchByContent = safeMessages.find((message) => message.type === "response" && message.deliverable === deliverable?.content);
  if (matchByContent?.missionId) return matchByContent.missionId;

  const matchByTask = safeMessages.find((message) => message.type === "response" && message.deliverable && deliverable?.task && message.deliverable.includes(deliverable.task.slice(0, 40)));
  return matchByTask?.missionId || null;
}

function resolveDeliverableMessageId(messages, deliverable) {
  if (deliverable?.messageId) return deliverable.messageId;

  const safeMessages = Array.isArray(messages) ? messages.filter(isPlainRecord) : [];
  const matchByContent = safeMessages.find((message) => message.type === "response" && message.deliverable === deliverable?.content);
  return matchByContent?.id || null;
}

function deliverableHasImages(deliverable) {
  return Boolean(deliverable?.hasAssets || deliverable?.assetCount || deliverable?.assets?.length || deliverable?.imageUrl);
}

function buildLatestImageGallery(deliverables = []) {
  const items = Array.isArray(deliverables) ? deliverables : [];
  const latestByMission = new globalThis.Map();

  items.forEach((deliverable) => {
    if (!deliverableHasImages(deliverable) || !deliverable?.missionId) return;
    const current = latestByMission.get(deliverable.missionId);
    const nextTs = new Date(deliverable.ts || 0).getTime();
    const currentTs = current ? new Date(current.ts || 0).getTime() : 0;
    if (!current || nextTs >= currentTs) {
      latestByMission.set(deliverable.missionId, deliverable);
    }
  });

  return [...latestByMission.values()].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
}

function shouldGenerateDesignerImage(agentId, phase, task, response) {
  if (!["graphiste", "dirArt"].includes(agentId)) return false;
  const text = `${task || ""}\n${response?.deliverable || ""}\n${response?.response || ""}`.toLowerCase();
  return phase === "design" || ["linkedin", "carrousel", "visuel", "design", "slide", "post", "image", "illustration"].some((keyword) => text.includes(keyword));
}

function buildDesignerImagePrompt(config, task, response, context = "") {
  const company = config.company || {};
  const visualStyle = config.metiers?.da || {};
  const comStyle = config.metiers?.com || {};
  const logoAssets = Array.isArray(visualStyle.logo) ? visualStyle.logo : [];
  const visualPlan = inferVisualPlan(task, response, context);
  const contactLine = [company.website, company.contactEmail, company.contactPhone].filter(Boolean).join(" · ");

  const brandBits = [
    company.name ? `Entreprise : ${company.name}.` : "",
    company.mission ? `Mission : ${company.mission}.` : "",
    company.brand ? `ADN de marque : ${company.brand}.` : "",
    company.website ? `Site : ${company.website}.` : "",
    company.contactEmail ? `Email de contact : ${company.contactEmail}.` : "",
    company.contactPhone ? `Téléphone de contact : ${company.contactPhone}.` : "",
    company.values?.length ? `Valeurs : ${company.values.join(", ")}.` : "",
    visualStyle.colors?.length ? `Couleurs : ${visualStyle.colors.join(", ")}.` : "",
    visualStyle.fonts?.length ? `Typographies : ${visualStyle.fonts.join(", ")}.` : "",
    visualStyle.tone ? `Style visuel : ${visualStyle.tone}.` : "",
    logoAssets.length ? "Un ou plusieurs logos de reference sont joints a cette demande. Reprends leur signe, leur composition et leur palette autant que possible." : "",
    comStyle.editorial ? `Ligne éditoriale : ${comStyle.editorial}.` : "",
  ].filter(Boolean);

  const carouselLike = /carrousel|carousel|slides?|linkedin/i.test(`${task || ""}\n${response?.deliverable || ""}\n${response?.response || ""}`);

  return [
    "Crée un visuel marketing premium, crédible et prêt à présenter à un client.",
    "Le rendu doit être élégant, contemporain, lisible sur mobile et cohérent avec une communication B2B haut de gamme.",
    "Évite les blocs de texte trop denses et privilégie une composition forte, claire et éditoriale.",
    "Si plusieurs visuels sont demandés, génère une image autonome par visuel. Jamais de collage, jamais plusieurs publications dans une seule image.",
    visualPlan.exactCount > 1 ? `Nombre exact de slides a produire : ${visualPlan.exactCount}. Produis exactement ${visualPlan.exactCount} images, ni plus ni moins. Une image = une slide.` : "",
    visualPlan.contextCount && visualPlan.responseCount && visualPlan.contextCount !== visualPlan.responseCount ? `Le planning amont fixe ${visualPlan.contextCount} slides. Ignore tout decompte contradictoire apparu plus tard et respecte strictement ${visualPlan.contextCount} slides.` : "",
    carouselLike ? "Pour un carrousel, conserve une structure persistante sur toutes les slides : header, logo, navigation, footer, marges, grille et système typographique cohérents d'une slide à l'autre." : "",
    carouselLike ? "La pagination, le footer, le header et la position du logo doivent rester constants sur toutes les slides." : "",
    carouselLike && contactLine ? `Le footer doit reprendre de facon persistante les coordonnees de marque si cela reste lisible : ${contactLine}.` : "",
    carouselLike ? "Ne change d'une slide à l'autre que le contenu éditorial, l'illustration principale et les accents utiles. L'habillage de base doit rester stable et reconnaissable." : "",
    carouselLike ? "Respecte strictement le nombre de slides demande dans le brief amont. N'en retire aucune et n'en fusionne aucune." : "",
    carouselLike ? "Si le brief contient une structure slide par slide, chaque image doit suivre uniquement le contenu de sa slide correspondante." : "",
    task ? `Objectif utilisateur : ${task}` : "",
    response?.deliverable ? `Direction créative à suivre : ${response.deliverable}` : "",
    response?.response ? `Contexte complémentaire : ${response.response}` : "",
    context ? `Contexte amont a respecter : ${context}` : "",
    brandBits.length ? `Contraintes de marque : ${brandBits.join(" ")}` : "",
  ].filter(Boolean).join("\n\n");
}

async function maybeGenerateDesignerAssets(config, agentId, task, phase, response, missionId, context = "") {
  if (!shouldGenerateDesignerImage(agentId, phase, task, response)) {
    return { assets: [], error: "" };
  }

  try {
    const visualPlan = inferVisualPlan(task, response, context);
    const logoReferences = (Array.isArray(config.metiers?.da?.logo) ? config.metiers.da.logo : [])
      .filter((item) => item?.url)
      .slice(0, 2);
    const result = await callImageGenerator(
      buildDesignerImagePrompt(config, task, response, context),
      visualPlan.exactCount,
      missionId,
      null,
      { references: logoReferences, exactCount: visualPlan.exactCount }
    );
    const images = result?.images?.length ? result.images : (result?.imageUrl ? [result.imageUrl] : []);
    return {
      assets: images.map((url, index) => ({
        kind: "image",
        url,
        alt: `${extractDeliverableTitle(response?.deliverable || response?.response || task, "Visuel généré")}${images.length > 1 ? ` · visuel ${index + 1}` : ""}`,
        revisedPrompt: result.revisedPrompt || "",
        prompt: result.prompt || "",
        model: result.model || "",
        index,
      })),
      error: images.length ? "" : "Aucun visuel n'a ete retourne par l'API image.",
    };
  } catch (error) {
    console.error("Designer image generation failed", error);
    return { assets: [], error: error?.message || "La generation d'images a echoue sans message detaille." };
  }
}

function summarizeMission(messages, missionId) {
  const missionMessages = (Array.isArray(messages) ? messages : []).filter((m) => isPlainRecord(m) && m.missionId === missionId);
  const command = missionMessages.find((m) => m.type === "command");
  const finalResponse = [...missionMessages].reverse().find((m) => m.type === "response" && m.phase === "final_validation");
  const latestResponse = [...missionMessages].reverse().find((m) => m.type === "response");
  const latestCompletedResponse = [...missionMessages].reverse().find((m) => m.type === "response" && (m.deliverable?.trim() || m.assets?.length || m.content?.trim()));
  const latestProgress = [...missionMessages].reverse().find((m) => m.type === "progress");
  const latestDelegation = [...missionMessages].reverse().find((m) => m.type === "delegation");
  const lastLifecycle = [...missionMessages].reverse().find((m) => m.type === "mission_archived" || m.type === "mission_restored" || m.type === "mission_deleted");
  const archived = lastLifecycle?.type === "mission_archived";
  const deleted = lastLifecycle?.type === "mission_deleted";
  const latestResponseTs = latestCompletedResponse ? new Date(latestCompletedResponse.ts || 0).getTime() : 0;
  const latestProgressTs = latestProgress ? new Date(latestProgress.ts || 0).getTime() : 0;
  const latestDelegationTs = latestDelegation ? new Date(latestDelegation.ts || 0).getTime() : 0;
  const latestResponseHasOutput = Boolean(latestCompletedResponse);
  const latestResponseLooksFinal = Boolean(
    latestResponseHasOutput &&
    latestResponseTs >= latestProgressTs &&
    latestResponseTs >= latestDelegationTs
  );
  const resolvedFinalResponse = finalResponse || (latestResponseLooksFinal ? latestCompletedResponse : (archived ? latestCompletedResponse || latestResponse : null));
  const latestVisualResponse = [...missionMessages].reverse().find((m) => m.type === "response" && m.assets?.length);
  const relayPreview = !resolvedFinalResponse && (latestCompletedResponse || latestResponse) ? (latestCompletedResponse || latestResponse) : null;

  return {
    id: missionId,
    title: resolveMissionTitle(command, resolvedFinalResponse, latestResponse, archived),
    target: command?.target || resolvedFinalResponse?.agentId || latestResponse?.agentId || "ceo",
    createdAt: command?.ts || missionMessages[0]?.ts || new Date(),
    updatedAt: missionMessages[missionMessages.length - 1]?.ts || command?.ts || new Date(),
    command,
    finalResponse: resolvedFinalResponse,
    latestResponse,
    latestCompletedResponse,
    latestVisualResponse,
    relayPreview,
    latestProgress,
    archived,
    deleted,
    hasFinalDeliverable: Boolean(resolvedFinalResponse?.deliverable?.trim() || resolvedFinalResponse?.assets?.length || resolvedFinalResponse?.content?.trim()),
    messages: missionMessages,
  };
}

function buildMissionList(messages) {
  const safeMessages = Array.isArray(messages) ? messages.filter((m) => isPlainRecord(m) && m.missionId) : [];
  const ids = Array.from(new Set(safeMessages.map((m) => m.missionId)));
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
        task: `À partir de la stratégie validée par le directeur de la communication, prépare le plan opérationnel détaillé : formats, calendrier, canaux, nombre de contenus, séquençage et consignes d'exécution pour cette demande : ${task}. Si c'est un carrousel, fixe un nombre exact de slides et garde ce nombre inchangé dans toute la suite de la mission.`,
        kind: "production",
      },
    ];

    if (text.includes("linkedin") || text.includes("post") || text.includes("contenu")) {
      plan.push({
        agentId: "contentWriter",
        task: `Rédige les contenus finaux ou brouillons des publications à partir du plan validé. Fournis un texte concret, structuré et prêt à être relu en français impeccable pour cette demande : ${task}. Si le plan prévoit un carrousel, écris une structure slide par slide, numérotée, sans changer le nombre exact de slides décidé en amont.`,
        kind: "copy",
      });
    }

    if (text.includes("linkedin") || text.includes("carrousel") || text.includes("visuel") || text.includes("design")) {
      plan.push({
        agentId: "graphiste",
        task: `Propose la direction créative finale à partir du contenu et du plan : format, structure des visuels ou des slides, style visuel, éléments graphiques et indications prêtes à produire pour cette demande : ${task}. Respecte strictement le nombre de slides ou visuels déjà définis en amont. Décris chaque slide une par une avec sa numérotation exacte. Conserve un header, un logo, une navigation, une pagination et un footer persistants sur toute la série.`,
        kind: "design",
      });
    }

    plan.push({
      agentId: "dirCom",
      task: `Tu es en validation finale. Vérifie que la stratégie, le contenu et le design répondent bien à l'objectif initial. Vérifie notamment la cohérence du nombre de slides ou visuels entre les étapes. Si quelque chose manque, signale-le clairement. Sinon, livre une synthèse finale prête pour le donneur d'ordre pour cette demande : ${task}`,
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
  const a = AGENTS[id] || AGENTS.ceo;
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

function MissionStatusPill({ active, label }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 12px", background: active ? "#FFF1EC" : "#F0FAF2", borderRadius: 30 }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? "#F2785C" : "#5BC77F", animation: active ? "bounce 0.8s infinite" : "none" }} />
      <span style={{ fontSize: 11.5, color: active ? "#F2785C" : "#5BC77F", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>{label}</span>
    </div>
  );
}

function AssetGallery({ assets = [], onOpen }) {
  if (!assets.length) return null;

  const mainAsset = assets[0];
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 12.5, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 7 }}>Visuels générés</div>
      <button onClick={() => onOpen?.(assets, 0)} style={{ width: "100%", border: "none", padding: 0, background: "transparent", cursor: "pointer", textAlign: "left" }}>
        <div style={{ position: "relative", background: "#fff", border: "1px solid #F0E8DB", borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 16px rgba(120,90,50,0.06)" }}>
          <img src={mainAsset.url} alt={mainAsset.alt || "Visuel généré"} style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover", background: "#F7F1E6" }} />
          {assets.length > 1 && (
            <div style={{ position: "absolute", right: 10, bottom: 10, padding: "6px 10px", borderRadius: 999, background: "rgba(61,58,78,0.8)", color: "#fff", fontSize: 11.5, fontWeight: 800, fontFamily: "Nunito, sans-serif" }}>
              {assets.length} visuels
            </div>
          )}
        </div>
      </button>
      {assets.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingTop: 8 }}>
          {assets.map((asset, index) => (
            <button key={`${asset.url}-${index}`} onClick={() => onOpen?.(assets, index)} style={{ border: "none", padding: 0, background: "transparent", cursor: "pointer", display: "block", flexShrink: 0 }}>
              <div style={{ width: 74, borderRadius: 14, overflow: "hidden", border: "1px solid #F0E8DB", background: "#fff" }}>
                <img src={asset.url} alt={asset.alt || "Miniature visuelle"} style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetLightbox({ group, onClose, onReviseAsset = null }) {
  const [index, setIndex] = useState(group?.index || 0);
  const startX = useRef(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setIndex(group?.index || 0);
    setClosing(false);
  }, [group]);

  if (!group?.assets?.length) return null;

  const assets = group.assets;
  const asset = assets[index];
  const canPrev = index > 0;
  const canNext = index < assets.length - 1;

  const move = (delta) => {
    setIndex((current) => Math.max(0, Math.min(assets.length - 1, current + delta)));
  };

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), 220);
  };

  return (
    <>
      <div onClick={requestClose} style={{ position: "absolute", inset: 0, background: "rgba(35,28,20,0.78)", backdropFilter: "blur(8px)", animation: `${closing ? "fadeBgOut" : "fadeBg"} 0.22s ease forwards`, zIndex: 25 }} />
      <div onClick={requestClose} style={{ position: "absolute", inset: 0, zIndex: 26, display: "flex", flexDirection: "column", justifyContent: "center", padding: "calc(env(safe-area-inset-top, 0px) + 20px) 16px calc(env(safe-area-inset-bottom, 0px) + 20px)", animation: `${closing ? "lightboxOut" : "pop"} 0.22s ease forwards` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ color: "#fff", fontFamily: "Fredoka, sans-serif", fontSize: 16, fontWeight: 600 }}>{asset.alt || "Visuel généré"}</div>
          <button onClick={requestClose} style={{ width: 38, height: 38, minWidth: 38, minHeight: 38, borderRadius: "999px", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", aspectRatio: "1 / 1" }}>
            <X size={18} />
          </button>
        </div>
        <div
          onClick={(event) => event.stopPropagation()}
          onTouchStart={(event) => { startX.current = event.touches[0].clientX; }}
          onTouchEnd={(event) => {
            const delta = event.changedTouches[0].clientX - startX.current;
            if (delta > 40) move(-1);
            if (delta < -40) move(1);
          }}
          style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {canPrev && (
            <button onClick={() => move(-1)} style={{ position: "absolute", left: 0, zIndex: 1, width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronLeft size={18} />
            </button>
          )}
          <img src={asset.url} alt={asset.alt || "Visuel généré"} style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 22, objectFit: "contain", boxShadow: "0 18px 50px rgba(0,0,0,0.35)" }} />
          {canNext && (
            <button onClick={() => move(1)} style={{ position: "absolute", right: 0, zIndex: 1, width: 42, height: 42, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.08)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
              <ChevronRight size={18} />
            </button>
          )}
        </div>
        {assets.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
            {assets.map((item, itemIndex) => (
              <button key={`${item.url}-${itemIndex}`} onClick={() => setIndex(itemIndex)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer" }}>
                <span style={{ display: "block", width: itemIndex === index ? 24 : 8, height: 8, borderRadius: 999, background: itemIndex === index ? "#fff" : "rgba(255,255,255,0.35)", transition: "all 0.2s ease" }} />
              </button>
            ))}
          </div>
        )}
        {onReviseAsset && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <button onClick={() => onReviseAsset(asset, index)} style={{ padding: "10px 16px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: "rgba(255,255,255,0.12)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
              Modifier ce visuel
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function ConfirmDialog({ dialog, onCancel, onConfirm }) {
  if (!dialog) return null;
  const requestCancel = () => {
    onCancel?.();
  };

  return (
    <>
      <div onClick={requestCancel} style={{ position: "absolute", inset: 0, background: "rgba(60,45,30,0.35)", backdropFilter: "blur(5px)", animation: "fadeBg 0.22s ease", zIndex: 20 }} />
      <div style={{ position: "absolute", left: 16, right: 16, bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)", zIndex: 21, background: "#fff", borderRadius: 26, border: "1px solid #F0E8DB", boxShadow: "0 18px 44px rgba(61,58,78,0.16)", padding: 18, animation: "modalUp 0.22s ease" }}>
        <div style={{ width: 46, height: 46, borderRadius: 16, background: "#FFF1EE", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
          <Trash2 size={20} color="#E0654E" />
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 6 }}>{dialog.title}</div>
        <div style={{ fontSize: 13.5, color: "#7A7488", fontFamily: "Nunito, sans-serif", lineHeight: 1.55, marginBottom: 16 }}>{dialog.message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={requestCancel} style={{ flex: 1, padding: "12px 14px", borderRadius: 14, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
            Annuler
          </button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px 14px", borderRadius: 14, border: "none", background: "#E0654E", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
            Supprimer
          </button>
        </div>
      </div>
    </>
  );
}

function MissionProgressPanel({ mission }) {
  const progressEntries = mission.messages.filter((message) => message.type === "progress").slice(-4);
  if (!progressEntries.length) return null;

  return (
    <div style={{ ...ST.card, padding: 14, marginBottom: 12, background: "linear-gradient(135deg, #FFF8F3, #fff)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <LoaderCircle size={16} color="#F2785C" style={{ animation: "spin 1.1s linear infinite" }} />
        <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>Mission en cours</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {progressEntries.map((entry) => (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 9, color: "#7A7488", fontSize: 13, fontFamily: "Nunito, sans-serif" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#F2785C", animation: "bounce 1s infinite" }} />
            <span>{entry.content}</span>
          </div>
        ))}
      </div>
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
  if (field.type === "images") {
    const items = Array.isArray(value) ? value : [];
    return (
      <div style={{ marginBottom: 12 }}>
        {field.label && <span style={ST.label}>{field.label}</span>}
        <label style={{ display: "block", width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px dashed ${color}66`, background: `${color}0F`, color, fontFamily: "Nunito, sans-serif", fontWeight: 700, fontSize: 13.5, cursor: "pointer", textAlign: "center" }}>
          Importer une ou plusieurs images
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              if (!files.length) return;
              const next = await Promise.all(files.map(async (file) => ({
                name: file.name,
                url: await readFileAsDataUrl(file),
              })));
              onChange([...(items || []), ...next]);
              event.target.value = "";
            }}
          />
        </label>
        {items.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingTop: 10 }}>
            {items.map((item, index) => (
              <div key={`${item.url}-${index}`} style={{ flexShrink: 0 }}>
                <div style={{ width: 88, borderRadius: 14, overflow: "hidden", border: "1px solid #F0E8DB", background: "#fff", marginBottom: 6 }}>
                  <img src={item.url} alt={item.name || `Logo ${index + 1}`} style={{ display: "block", width: "100%", aspectRatio: "1 / 1", objectFit: "cover" }} />
                </div>
                <button onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} style={{ width: 88, padding: "6px 0", borderRadius: 10, border: "1px solid #F0DDD8", background: "#FFF1EE", color: "#E0654E", fontSize: 11, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                  Retirer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
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
  const a = AGENTS[id] || AGENTS.ceo;
  return (
    <div className="pop" style={{ display: "flex", gap: 9, alignItems: "flex-end", marginBottom: 14 }}>
      <Character id={id} size={36} />
      <div style={{ background: "#fff", border: "1px solid #F0E8DB", borderRadius: "16px 16px 16px 5px", padding: "13px 15px", display: "flex", gap: 5 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: a.color, animation: `bounce 1.2s ${i * 0.15}s infinite` }} />)}
      </div>
    </div>
  );
}

function FeedMsg({ m, expanded, setExpanded, onValidate, onContinueMission, onAction, compact = false, title, muted = false, onOpenAssets, messageRef = null }) {
  const timestamp = m.ts?.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (m.type === "command") {
    const t = AGENTS[m.target] || AGENTS.ceo;
    return (
      <div className="pop" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ fontSize: 11.5, color: "#B3A892", fontFamily: "Nunito, sans-serif", marginBottom: 5, marginRight: 4, fontWeight: 600 }}>Vous, pour {t?.name}</div>
        <div style={{ fontSize: 10.5, color: "#C3B8A6", fontFamily: "Nunito, sans-serif", marginBottom: 6, marginRight: 4 }}>{timestamp}</div>
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
      <div className="pop" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
          <Character id={m.agentId} size={32} />
          <div style={{ fontSize: 13.5, fontWeight: 700, color: AGENTS[m.agentId]?.color, fontFamily: "Fredoka, sans-serif" }}>{AGENTS[m.agentId]?.name}</div>
        </div>
        <div style={{ background: "#FFF1EE", border: "1px solid #FAD4CB", borderRadius: 18, padding: "11px 14px", fontSize: 13, color: "#E0654E", fontFamily: "Nunito, sans-serif" }}>Oups : {m.content}</div>
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
  if (m.type === "progress") {
    return (
      <div className="pop" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", background: "#FFF8F3", border: "1px solid #F7D8C7", borderRadius: 18 }}>
          <LoaderCircle size={16} color="#F2785C" style={{ animation: "spin 1.1s linear infinite" }} />
          <div style={{ fontSize: 13, color: "#7A7488", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>{m.content}</div>
        </div>
      </div>
    );
  }
  const a = AGENTS[m.agentId] || AGENTS.ceo;
  return (
    <div ref={messageRef} className="pop" style={{ marginBottom: 16, opacity: muted ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6, flexWrap: "wrap" }}>
        <Character id={m.agentId} size={32} badge />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: a.color, fontFamily: "Fredoka, sans-serif" }}>{a.name}</span>
            {title && <span style={{ fontSize: 10.5, color: "#7A7488", background: "#F7F1E6", borderRadius: 999, padding: "3px 8px", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>{title}</span>}
            <span style={{ fontSize: 11, color: "#C3B8A6", fontFamily: "Nunito, sans-serif" }}>{a.role}</span>
            {m.flags?.includes("VALIDATION_REQUIRED") && <span style={{ fontSize: 10, color: "#E8A33D", background: "#FCF3E1", border: "1px solid #F2DDAE", borderRadius: 20, padding: "2px 9px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>À valider</span>}
            {m.flags?.includes("BLOCKER") && <span style={{ fontSize: 10, color: "#E0654E", background: "#FFF1EE", border: "1px solid #FAD4CB", borderRadius: 20, padding: "2px 9px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Bloqué</span>}
          </div>
          <div style={{ fontSize: 10.5, color: "#C3B8A6", fontFamily: "Nunito, sans-serif", marginTop: 2 }}>{timestamp}</div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ background: "#fff", border: "1px solid #F0E8DB", borderRadius: "16px 16px 16px 5px", padding: "12px 15px", color: "#4A4658", boxShadow: "0 3px 14px rgba(120,90,50,0.04)", width: "100%", overflowWrap: "anywhere", wordBreak: "break-word" }}>
          {compact ? `${(m.content || "").slice(0, 220)}${(m.content || "").length > 220 ? "…" : ""}` : <RichText text={m.content} />}
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
              <span style={{ fontSize: 12.5, color: a.color, fontFamily: "Fredoka, sans-serif", fontWeight: 600, flex: 1 }}>{extractDeliverableTitle(m.deliverable, "Livrable")}</span>
              <ChevronRight size={16} color={a.color} style={{ transform: expanded === m.id ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
            </div>
            {expanded === m.id && <div style={{ marginTop: 9 }}><RichText text={m.deliverable} color="#5A5568" /></div>}
          </button>
        )}
        {!compact && m.missionId && m.phase === "final_validation" && (
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            <button onClick={() => onContinueMission?.(m, { type: "full" })} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #F2DDAE", background: "#FCF3E1", color: "#A76B00", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "Nunito, sans-serif" }}>
              Revoir le livrable
            </button>
          </div>
        )}
        {!compact && <AssetGallery assets={m.assets || []} onOpen={onOpenAssets} />}
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

function MissionListItem({ mission, selected, onOpen, onAction, isProcessing }) {
  const agent = AGENTS[mission.target] || AGENTS.ceo;
  const actionWidth = 204;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startOffsetRef = useRef(0);
  const movedRef = useRef(false);

  const handleTouchStart = (event) => {
    startXRef.current = event.touches[0].clientX;
    startOffsetRef.current = offset;
    movedRef.current = false;
    setDragging(true);
  };

  const handleTouchMove = (event) => {
    if (!dragging) return;
    const delta = event.touches[0].clientX - startXRef.current;
    if (Math.abs(delta) > 6) movedRef.current = true;
    const next = Math.max(-actionWidth, Math.min(0, startOffsetRef.current + delta));
    setOffset(next);
  };

  const handleTouchEnd = () => {
    if (!dragging) return;
    setDragging(false);
    setOffset(Math.abs(offset) > actionWidth * 0.35 ? -actionWidth : 0);
  };

  const handlePointerDown = (event) => {
    startXRef.current = event.clientX;
    startOffsetRef.current = offset;
    movedRef.current = false;
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragging) return;
    const delta = event.clientX - startXRef.current;
    if (Math.abs(delta) > 6) movedRef.current = true;
    const next = Math.max(-actionWidth, Math.min(0, startOffsetRef.current + delta));
    setOffset(next);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    setOffset(Math.abs(offset) > actionWidth * 0.35 ? -actionWidth : 0);
  };

  const triggerAction = (action) => {
    setOffset(0);
    onAction(mission.id, action);
  };

  return (
    <div style={{ position: "relative", marginBottom: 10, overflow: "hidden", borderRadius: 20 }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end", alignItems: "stretch" }}>
        <div style={{ width: actionWidth, display: "flex", justifyContent: "flex-end", height: "100%" }}>
          <button onClick={() => triggerAction("delete")} style={{ width: 102, height: "100%", border: "none", borderRadius: 0, background: "#E0654E", color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}>
            Supprimer
          </button>
          {mission.archived ? (
            <button onClick={() => triggerAction("restore")} style={{ width: 102, height: "100%", border: "none", borderRadius: 0, background: "#F4F1EB", color: "#7A7488", fontSize: 12.5, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
              Rouvrir
            </button>
          ) : (
            <button onClick={() => triggerAction("archive")} style={{ width: 102, height: "100%", border: "none", borderRadius: 0, background: "#42B76B", color: "#fff", fontSize: 12.5, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}>
              Terminer
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => {
          if (Math.abs(offset) > 12 || movedRef.current) {
            setOffset(0);
            return;
          }
          onOpen(mission.id);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{ ...ST.card, width: "100%", padding: 14, textAlign: "left", cursor: "pointer", position: "relative", zIndex: 1, transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.22s ease", touchAction: "pan-y", userSelect: "none" }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Character id={mission.target} size={44} badge />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mission.title}</span>
              {selected && <span style={{ fontSize: 10.5, color: "#F2785C", background: "#FFF1EC", borderRadius: 20, padding: "2px 7px", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Ouverte</span>}
            </div>
            <div style={{ fontSize: 11.5, color: agent.color, fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 4 }}>{agent.name} · {agent.role}</div>
            <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif", lineHeight: 1.4 }}>
              {mission.finalResponse || mission.latestCompletedResponse ? "Livrable prêt" : isProcessing ? "Équipe au travail" : mission.latestResponse ? "En attente de validation" : "Livrable en attente"} · {new Date(mission.updatedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function MissionDetail({ mission, expanded, setExpanded, onValidate, onContinueMission, onAction, onArchive, onBack, onOpenAssets, isProcessing, focusMessageId }) {
  const finalResponse = mission.finalResponse || null;
  const actionableResponse = finalResponse || mission.latestCompletedResponse || mission.latestVisualResponse || mission.latestResponse || null;
  const relayPreview = mission.relayPreview;
  const [openRelayId, setOpenRelayId] = useState(null);
  const messageRefs = useRef({});
  const containerRef = useRef(null);
  const errorEntries = mission.messages.filter((message) => message.type === "error").slice(-3);
  const readyForReview = Boolean(
    !mission.archived &&
    !isProcessing &&
    actionableResponse &&
    (actionableResponse.deliverable?.trim() || actionableResponse.assets?.length || actionableResponse.content?.trim())
  );
  const relays = mission.messages
    .filter((m) => m.type === "delegation")
    .map((relay) => ({
      relay,
      receiverResponse: mission.messages.find((m) => m.type === "response" && m.agentId === relay.to && m.id > relay.id),
    }));

  useEffect(() => {
    const run = () => {
      if (focusMessageId) {
        const node = messageRefs.current[focusMessageId];
        if (node) node.scrollIntoView({ behavior: "smooth", block: "end" });
        return;
      }
      const container = containerRef.current;
      if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    };
    const timer = setTimeout(run, 80);
    return () => clearTimeout(timer);
  }, [focusMessageId, mission.id]);

  return (
    <div ref={containerRef} style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <button onClick={onBack} style={{ marginBottom: 12, border: "none", background: "transparent", color: "#9A93A8", fontSize: 12.5, fontWeight: 700, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
        ← Retour aux missions
      </button>
      <div style={{ ...ST.card, padding: 16, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <Character id={mission.target} size={48} badge />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11.5, color: AGENTS[mission.target]?.color || "#9A93A8", fontFamily: "Nunito, sans-serif", fontWeight: 800, marginBottom: 3 }}>Responsable de mission</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{mission.title}</div>
            <div style={{ fontSize: 12, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>
              {mission.archived ? "Mission archivée" : "Mission en cours"} · {new Date(mission.updatedAt).toLocaleString("fr-FR")}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: mission.command ? 12 : 0 }}>
          <MissionStatusPill active={isProcessing} label={mission.archived ? "Terminée" : readyForReview ? "Prête à relire" : isProcessing ? "En cours" : "En attente"} />
        </div>
        {mission.command && (
          <div style={{ background: "#FBF6EE", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11.5, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 800, marginBottom: 6 }}>Objectif</div>
            <div style={{ color: "#5A5568", fontFamily: "Nunito, sans-serif", fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
              {mission.command.content}
            </div>
          </div>
        )}
      </div>

      {!finalResponse && isProcessing && <MissionProgressPanel mission={mission} />}

      {relays.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>Relais de mission</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {relays.map(({ relay, receiverResponse }) => (
              <div key={relay.id}>
                <button onClick={() => setOpenRelayId(openRelayId === relay.id ? null : relay.id)} style={{ width: "100%", padding: "6px 2px", textAlign: "left", cursor: "pointer", border: "none", background: "transparent" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Character id={relay.from} size={26} />
                    <span style={{ fontSize: 12.5, color: AGENTS[relay.from]?.color || "#7A7488", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>{AGENTS[relay.from]?.name}</span>
                    <ChevronRight size={14} color="#C3B8A6" />
                    <Character id={relay.to} size={26} />
                    <span style={{ fontSize: 12.5, color: AGENTS[relay.to]?.color || "#7A7488", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>{AGENTS[relay.to]?.name}</span>
                  </div>
                </button>
                {openRelayId === relay.id && receiverResponse && (
                  <div style={{ marginTop: 8 }}>
                    <FeedMsg m={receiverResponse} compact={false} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} onOpenAssets={onOpenAssets} title={getResponseTitle(receiverResponse)} messageRef={(node) => { messageRefs.current[receiverResponse.id] = node; }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {errorEntries.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>Points bloquants</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {errorEntries.map((entry) => (
              <FeedMsg
                key={entry.id}
                m={entry}
                expanded={expanded}
                setExpanded={setExpanded}
                onValidate={onValidate}
                onContinueMission={onContinueMission}
                onAction={onAction}
                onOpenAssets={onOpenAssets}
                messageRef={(node) => { messageRefs.current[entry.id] = node; }}
              />
            ))}
          </div>
        </div>
      )}

      {actionableResponse ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>{finalResponse ? "Réponse finale" : "Dernier livrable reçu"}</div>
          <FeedMsg m={actionableResponse} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} onOpenAssets={onOpenAssets} title={finalResponse ? "Livrable final" : getResponseTitle(actionableResponse)} messageRef={(node) => { messageRefs.current[actionableResponse.id] = node; }} />
          {mission.latestVisualResponse && mission.latestVisualResponse.id !== actionableResponse.id && (
            <div style={{ ...ST.card, padding: 14, marginTop: 12 }}>
              <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>Visuels retenus</div>
              <AssetGallery assets={mission.latestVisualResponse.assets || []} onOpen={onOpenAssets} />
            </div>
          )}
        </div>
      ) : (
        <>
          {relayPreview && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700, marginBottom: 8 }}>{isProcessing ? "Dernière contribution en cours de consolidation" : "Dernière contribution reçue"}</div>
              <FeedMsg m={relayPreview} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} onOpenAssets={onOpenAssets} title={getResponseTitle(relayPreview)} muted={isProcessing} messageRef={(node) => { messageRefs.current[relayPreview.id] = node; }} />
            </div>
          )}
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {!mission.archived && readyForReview && (
          <>
            <button onClick={() => onContinueMission(actionableResponse || mission.command, { type: "full" })} style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "1px solid #F2DDAE", background: "#FCF3E1", color: "#A76B00", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
              Demander une revision
            </button>
            <button onClick={() => onArchive(mission.id)} style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "none", background: "linear-gradient(135deg, #5BC77F, #42B76B)", color: "#fff", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
              Valider
            </button>
          </>
        )}
        {!mission.archived && !readyForReview && (
          <div style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "1px solid #F0E8DB", background: "#F9F6F0", color: "#9A93A8", fontSize: 13, fontWeight: 700, fontFamily: "Nunito, sans-serif", textAlign: "center" }}>
            Le livrable n'est pas encore pret pour une validation ou une revision.
          </div>
        )}
        {mission.archived && (
          <button onClick={() => onArchive(mission.id, "restore")} style={{ flex: 1, padding: "11px 14px", borderRadius: 14, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
            Rouvrir
          </button>
        )}
      </div>
    </div>
  );
}

function MissionsScreen({ messages, expanded, setExpanded, onQuick, onValidate, onContinueMission, onAction, selectedMissionId, setSelectedMissionId, onArchiveMission, onOpenAssets, processingMissionId, focusMessageId }) {
  const [segment, setSegment] = useState("active");
  const missions = buildMissionList(messages);
  const activeMissions = missions.filter((m) => !m.archived && !m.deleted);
  const archivedMissions = missions.filter((m) => m.archived && !m.deleted);
  const displayed = segment === "active" ? activeMissions : archivedMissions;
  const selectedMission = missions.find((m) => m.id === selectedMissionId);

  if (selectedMission) {
    return <MissionDetail mission={selectedMission} expanded={expanded} setExpanded={setExpanded} onValidate={onValidate} onContinueMission={onContinueMission} onAction={onAction} onArchive={onArchiveMission} onBack={() => setSelectedMissionId(null)} onOpenAssets={onOpenAssets} isProcessing={processingMissionId === selectedMission.id} focusMessageId={focusMessageId} />;
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
      {displayed.length > 0 && (
        <div style={{ fontSize: 11.5, color: "#B3A892", fontFamily: "Nunito, sans-serif", marginBottom: 10, textAlign: "center" }}>
          {segment === "active" ? "Glisse une mission vers la gauche pour afficher Supprimer puis Terminer." : "Glisse une mission vers la gauche pour afficher Supprimer puis Rouvrir."}
        </div>
      )}

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
        displayed.map((mission) => <MissionListItem key={mission.id} mission={mission} onOpen={setSelectedMissionId} onAction={onArchiveMission} isProcessing={processingMissionId === mission.id} />)
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
            <TextField label="Site web" value={c.website} onChange={(v) => updateCompany("website", v)} placeholder="https://votresite.fr" />
            <TextField label="Email de contact" value={c.contactEmail} onChange={(v) => updateCompany("contactEmail", v)} placeholder="bonjour@votresite.fr" />
            <TextField label="Téléphone de contact" value={c.contactPhone} onChange={(v) => updateCompany("contactPhone", v)} placeholder="+33 6 12 34 56 78" />
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

function BilanScreen({ kpis, messages, activity, leaderboard, maxAct, onOpenMission }) {
  const safeKpis = kpis && typeof kpis === "object" ? kpis : DEFAULT_KPIS;
  const safeMessages = Array.isArray(messages) ? messages.filter(isPlainRecord) : [];
  const deliverablesList = Array.isArray(safeKpis.deliverables)
    ? safeKpis.deliverables.map(normalizeDeliverableRecord).filter(Boolean)
    : [];
  const safeLeaderboard = Array.isArray(leaderboard)
    ? leaderboard.filter((entry) => Array.isArray(entry) && entry.length >= 2 && AGENTS[entry[0]])
    : [];
  const [deliverableFilter, setDeliverableFilter] = useState("content");
  const deliverables = [...deliverablesList].reverse();
  const latestImageGallery = buildLatestImageGallery(deliverablesList).map(normalizeDeliverableRecord).filter(Boolean);
  const filteredDeliverables = deliverables.filter((d) => {
    if (deliverableFilter === "images") return deliverableHasImages(d);
    return !deliverableHasImages(d);
  });

  return (
    <div style={{ height: "100%", overflowY: "auto", padding: "14px 16px 18px" }}>
      <div style={{ fontSize: 19, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 4 }}>Bilan de votre équipe</div>
      <div style={{ fontSize: 13, color: "#9A93A8", fontFamily: "Nunito, sans-serif", marginBottom: 16 }}>Ce que tout le monde a accompli ensemble.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11, marginBottom: 18 }}>
        {[
          { label: "Échanges", value: safeKpis.total || 0, color: "#5B9BD5" },
          { label: "Missions finies", value: safeKpis.completed || 0, color: "#5BC77F" },
          { label: "Documents", value: deliverablesList.length, color: "#E8A33D" },
          { label: "À revoir", value: Array.isArray(safeKpis.flags) ? safeKpis.flags.length : 0, color: "#F2785C" },
        ].map((s) => (
          <div key={s.label} style={{ ...ST.card, padding: 16, background: `linear-gradient(135deg, ${s.color}12, #fff)` }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: s.color, fontFamily: "Fredoka, sans-serif", lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 12.5, color: "#9A93A8", marginTop: 6, fontFamily: "Nunito, sans-serif", fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {safeLeaderboard[0] && AGENTS[safeLeaderboard[0][0]] && (
        <div style={{ ...ST.card, padding: 15, marginBottom: 18, display: "flex", alignItems: "center", gap: 14, background: `linear-gradient(135deg, ${AGENTS[safeLeaderboard[0][0]].color}15, #fff)` }}>
          <Character id={safeLeaderboard[0][0]} size={52} badge />
          <div>
            <div style={{ fontSize: 12, color: "#A89A86", fontFamily: "Nunito, sans-serif", fontWeight: 700 }}>Le plus impliqué</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{AGENTS[safeLeaderboard[0][0]].name}</div>
            <div style={{ fontSize: 12.5, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>{safeLeaderboard[0][1]} contribution{safeLeaderboard[0][1] > 1 ? "s" : ""}</div>
          </div>
        </div>
      )}

      {deliverablesList.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 12 }}>Documents créés</div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10, marginBottom: 8 }}>
            {[
              { id: "content", label: "Contenu" },
              { id: "images", label: "Images" },
            ].map((filter) => (
              <button key={filter.id} onClick={() => setDeliverableFilter(filter.id)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, border: "1px solid #F0E8DB", background: deliverableFilter === filter.id ? "#F2785C" : "#fff", color: deliverableFilter === filter.id ? "#fff" : "#7A7488", fontSize: 12, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
                {filter.label}
              </button>
            ))}
          </div>
          {deliverableFilter !== "images" && filteredDeliverables.map((d, i) => {
            const a = AGENTS[d.agentId] || { name: "Equipe", color: "#9A93A8" };
            const missionId = resolveDeliverableMissionId(safeMessages, d);
            const messageId = resolveDeliverableMessageId(safeMessages, d);
            const title = d.title || extractDeliverableTitle(d.content, "Livrable");
            const snippet = d.snippet || buildSnippet(d.content, title);
            return (
              <button key={i} onClick={() => missionId && onOpenMission(missionId, messageId)} style={{ ...ST.card, width: "100%", padding: 14, marginBottom: 10, textAlign: "left", border: "1px solid #F0E8DB", cursor: missionId ? "pointer" : "default" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                  <Character id={a.id || d.agentId || "ceo"} size={32} />
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>{a.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#C3B8A6", fontFamily: "Nunito, sans-serif" }}>{formatDateTime(d.ts)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                  <span style={{ fontSize: 10.5, color: "#7A7488", background: "#F7F1E6", borderRadius: 999, padding: "3px 8px", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>
                    {deliverableHasImages(d) ? "Images" : "Contenu"}
                  </span>
                  {deliverableHasImages(d) && d.assetCount > 1 && (
                    <span style={{ fontSize: 10.5, color: "#F2785C", background: "#FFF1EC", borderRadius: 999, padding: "3px 8px", fontFamily: "Nunito, sans-serif", fontWeight: 800 }}>
                      {d.assetCount} visuels
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 6 }}>{title}</div>
                {d.assets?.[0]?.url && (
                  <div style={{ marginBottom: 8, overflow: "hidden", borderRadius: 14, border: "1px solid #F0E8DB", background: "#F7F1E6" }}>
                    <img src={d.assets[0].url} alt={d.assets[0].alt || title} style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover" }} />
                  </div>
                )}
                <div style={{ fontSize: 13, lineHeight: 1.5, color: "#5A5568", fontFamily: "Nunito, sans-serif", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "break-word" }}>
                  {snippet || "Ouvrir la mission pour voir le livrable complet."}
                </div>
              </button>
            );
          })}
          {deliverableFilter === "images" && (
            latestImageGallery.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {latestImageGallery.map((d, i) => {
                  const missionId = resolveDeliverableMissionId(safeMessages, d);
                  const messageId = resolveDeliverableMessageId(safeMessages, d);
                  const title = d.title || extractDeliverableTitle(d.content, "Livrable");
                  const cover = d.assets?.[0]?.url || d.imageUrl || "";
                  if (!cover) return null;
                  return (
                    <button key={`${d.missionId}-${i}`} onClick={() => missionId && onOpenMission(missionId, messageId)} style={{ ...ST.card, padding: 0, overflow: "hidden", textAlign: "left", cursor: missionId ? "pointer" : "default" }}>
                      <div style={{ background: "#F7F1E6" }}>
                        <img src={cover} alt={title} style={{ display: "block", width: "100%", aspectRatio: "4 / 5", objectFit: "cover" }} />
                      </div>
                      <div style={{ padding: 10 }}>
                        <div style={{ fontSize: 12.5, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", fontWeight: 700, marginBottom: 4 }}>{title}</div>
                        <div style={{ fontSize: 11, color: "#A89A86", fontFamily: "Nunito, sans-serif" }}>{formatDateTime(d.ts)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ ...ST.card, padding: 16, fontSize: 13, color: "#9A93A8", fontFamily: "Nunito, sans-serif" }}>
                Aucune galerie image disponible pour l'instant.
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function MissionSheet({ command, setCommand, onSend, onClose, revisionMeta = null }) {
  const suggestedLead = routeObjectiveToLead(command);
  const a = AGENTS[suggestedLead];
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setClosing(false);
  }, [revisionMeta, command]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => onClose?.(), 220);
  };

  return (
    <>
      <div onClick={requestClose} style={{ position: "absolute", inset: 0, background: "rgba(60,45,30,0.35)", backdropFilter: "blur(2px)", animation: `${closing ? "fadeBgOut" : "fadeBg"} 0.22s ease forwards`, zIndex: 40 }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#FBF6EE", borderRadius: "28px 28px 0 0", padding: "10px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)", animation: `${closing ? "sheetDown" : "sheetUp"} 0.22s ease forwards`, zIndex: 41, maxHeight: "88%", overflowY: "auto" }}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "#E5DAC8", margin: "0 auto 16px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif" }}>Nouvelle mission</div>
          <button onClick={requestClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "#fff", border: "1px solid #F0E8DB", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={17} color="#9A93A8" /></button>
        </div>
        {revisionMeta && (
          <div style={{ background: "#FCF3E1", border: "1px solid #F2DDAE", borderRadius: 14, padding: "11px 13px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#A76B00", fontWeight: 800, fontFamily: "Nunito, sans-serif", marginBottom: 4 }}>
              {revisionMeta.type === "image" ? `Revision ciblee · visuel ${revisionMeta.assetIndex + 1}` : "Revision du livrable"}
            </div>
            <div style={{ fontSize: 12.5, color: "#7A6B52", fontFamily: "Nunito, sans-serif", lineHeight: 1.45 }}>
              {revisionMeta.type === "image" ? "Seul ce visuel sera regenere. Les autres resteront inchanges et une V2 sera ajoutee a la conversation." : "Une nouvelle version du livrable sera creee dans cette mission."}
            </div>
          </div>
        )}

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

class ScreenErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: error?.message || "" };
  }

  componentDidCatch(error) {
    console.error("Screen render error", error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: "100%", padding: "24px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...ST.card, padding: 18, width: "100%", maxWidth: 420 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#3D3A4E", fontFamily: "Fredoka, sans-serif", marginBottom: 8 }}>Cette vue a rencontre un probleme</div>
            <div style={{ fontSize: 13.5, color: "#7A7488", fontFamily: "Nunito, sans-serif", lineHeight: 1.55 }}>Essaie de revenir a un autre onglet puis de rouvrir cet ecran. Si le probleme persiste, recharge l'application.</div>
            {this.state.errorMessage && (
              <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "#FBF6EE", color: "#9A93A8", fontSize: 12.5, lineHeight: 1.45, fontFamily: "Nunito, sans-serif", overflowWrap: "anywhere" }}>
                Détail technique : {this.state.errorMessage}
              </div>
            )}
            <button onClick={() => this.setState({ hasError: false, errorMessage: "" })} style={{ marginTop: 12, width: "100%", padding: "11px 14px", borderRadius: 12, border: "1px solid #F0E8DB", background: "#fff", color: "#7A7488", fontSize: 13, fontWeight: 800, fontFamily: "Nunito, sans-serif", cursor: "pointer" }}>
              Réessayer
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
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
  const [processingMissionId, setProcessingMissionId] = useState(null);
  const [tab, setTab] = useState("missions");
  const [sheet, setSheet] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [saved, setSaved] = useState(true);
  const [events, setEvents] = useState([]);
  const [thinking, setThinking] = useState([]);
  const [selectedMissionId, setSelectedMissionId] = useState(null);
  const [focusMessageId, setFocusMessageId] = useState(null);
  const [revisionMeta, setRevisionMeta] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [lightbox, setLightbox] = useState(null);

  const idRef = useRef(0);
  const messagesRef = useRef(messages);
  const configRef = useRef(config);
  const hydrated = useRef(false);
  configRef.current = config;
  messagesRef.current = messages;

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
            const ws = normalizeWorkspacePayload(JSON.parse(w.value));
            messagesRef.current = ws.messages;
            setMessages(ws.messages);
            setKpis(ws.kpis);
            idRef.current = ws.lastId || 0;
            try {
              await storageAdapter.set("agencyos:workspace", JSON.stringify({
                messages: ws.messages,
                kpis: ws.kpis,
                lastId: ws.lastId || 0,
              }));
            } catch (_repairError) {
              // Ignore silent repair failures and keep the in-memory state usable.
            }
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
    setMessages((p) => {
      const next = [...p, { id, ts: new Date(), ...msg }];
      messagesRef.current = next;
      return next;
    });
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
    addMsg({ type: "progress", agentId, missionId, phase, content: getProgressLabel(agentId, phase) });

    try {
      const currentWorking = thinking.filter((id) => id !== agentId);
      const brief = buildBrief(configRef.current, agentId, currentWorking);
      const missionContext = buildMissionContext(messagesRef.current, missionId);
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
      const imageRequested = shouldGenerateDesignerImage(agentId, phase, task, { ...res, deliverable: finalDeliverable });
      if (imageRequested) {
        addMsg({ type: "progress", agentId, missionId, phase: "image_generation", content: getProgressLabel(agentId, "image_generation") });
      }
      const imageResult = await maybeGenerateDesignerAssets(configRef.current, agentId, task, phase, { ...res, deliverable: finalDeliverable }, missionId, mergedContext);
      const assets = imageResult.assets || [];
      const imageError = imageResult.error || "";
      if (imageRequested && !assets.length) {
        addMsg({
          type: "error",
          agentId,
          missionId,
          content: imageError || "La génération d'images n'a rien renvoyé. Le prompt créatif est prêt, mais aucun visuel n'a été retourné par l'API image.",
        });
      }
      const responseContent = imageRequested && !assets.length
        ? `${res.response}\n\nNote systeme : la génération d'images a échoué. ${imageError || "Aucun visuel n'a été retourné."}`
        : res.response;
      addMsg({ type: "response", agentId, content: responseContent, deliverable: finalDeliverable, flags: res.flags || [], depth, extractions, missionId, phase, assets });

      if (finalDeliverable?.trim()) {
        const title = extractDeliverableTitle(finalDeliverable, "Livrable");
        setKpis((p) => ({ ...p, deliverables: [...p.deliverables, { missionId, messageId: idRef.current, agentId, title, snippet: buildSnippet(finalDeliverable, title), content: finalDeliverable, ts: new Date(), task, hasAssets: assets.length > 0, assetCount: assets.length, assets }] }));

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
  }, [addEvent, addMsg, setStatus, thinking]);

  const handleSend = useCallback(async () => {
    if (!command.trim() || processing) return;
    const cmd = command.trim();
    if (revisionMeta?.type === "image" && selectedMissionId) {
      const mission = buildMissionList(messagesRef.current).find((m) => m.id === selectedMissionId);
      const sourceMessage = mission?.messages.find((item) => item.id === revisionMeta.messageId) || mission?.latestVisualResponse || null;
      const sourceAssets = sourceMessage?.assets || [];
      const sourceAsset = sourceAssets[revisionMeta.assetIndex];
      if (!sourceMessage || !sourceAsset) {
        setRevisionMeta((current) => current ? { ...current, type: "full", assetIndex: null } : null);
      } else {
        setCommand("");
        setSheet(false);
        setTab("missions");
        setProcessing(true);
        setProcessingMissionId(selectedMissionId);
        setFocusMessageId(null);
        try {
          addMsg({ type: "progress", agentId: sourceMessage.agentId || mission.target, missionId: selectedMissionId, phase: "image_generation", content: "Generation de la V2 du visuel en cours" });
          const revisedPrompt = [
            sourceAsset.prompt || "",
            `Consigne de revision: ${cmd}`,
            sourceMessage.deliverable ? `Conserve le livrable global suivant et ne change que ce visuel: ${sourceMessage.deliverable}` : "",
          ].filter(Boolean).join("\n\n");
          const logoReferences = (Array.isArray(configRef.current.metiers?.da?.logo) ? configRef.current.metiers.da.logo : [])
            .filter((item) => item?.url)
            .slice(0, 2);
          const result = await callImageGenerator(revisedPrompt, 1, selectedMissionId, sourceMessage.id, {
            references: logoReferences,
            exactCount: sourceAssets.length || 1,
          });
          const nextUrl = result?.imageUrl || result?.images?.[0];
          if (!nextUrl) return;

          const nextAssets = sourceAssets.map((asset, index) => (
            index === revisionMeta.assetIndex
              ? { ...asset, url: nextUrl, prompt: revisedPrompt, revisedPrompt: cmd, version: (asset.version || 1) + 1 }
              : asset
          ));
          const title = `${extractDeliverableTitle(sourceMessage.deliverable || sourceMessage.content, "Livrable")} · V2`;
          addMsg({
            type: "response",
            agentId: sourceMessage.agentId || mission.target,
            content: `Revision du visuel ${revisionMeta.assetIndex + 1} effectuee. Les autres elements du livrable sont conserves.`,
            deliverable: sourceMessage.deliverable || sourceMessage.content,
            flags: [],
            missionId: selectedMissionId,
            phase: sourceMessage.phase || "final_validation",
            assets: nextAssets,
          });
          setKpis((p) => ({
            ...p,
            deliverables: [...p.deliverables, {
              missionId: selectedMissionId,
              messageId: idRef.current,
              agentId: sourceMessage.agentId || mission.target,
              title,
              snippet: `V2 du visuel ${revisionMeta.assetIndex + 1}`,
              content: sourceMessage.deliverable || sourceMessage.content,
              ts: new Date(),
              task: cmd,
              hasAssets: true,
              assetCount: nextAssets.length,
              assets: nextAssets,
            }],
          }));
        } finally {
          setRevisionMeta(null);
          setProcessing(false);
          setProcessingMissionId(null);
        }
        return;
      }
    }

    const missionId = selectedMissionId || `mission-${Date.now()}`;
    const existingMission = selectedMissionId ? buildMissionList(messagesRef.current).find((m) => m.id === selectedMissionId) : null;
    const leadAgentId = existingMission?.target || routeObjectiveToLead(cmd);
    const plan = buildExecutionPlan(leadAgentId, cmd);
    setCommand(""); setSheet(false); setTab("missions"); setProcessing(true); setFocusMessageId(null); setRevisionMeta(null);
    setProcessingMissionId(missionId);
    setSelectedMissionId(missionId);
    addMsg({ type: "command", target: leadAgentId, content: cmd, missionId });
    addMsg({ type: "auto_saved", content: `Mission routée vers ${AGENTS[leadAgentId].name}. ${plan.length > 1 ? `${plan.length} étapes prévues.` : "Exécution directe."}`, missionId });
    addEvent("command_received", leadAgentId, { cmd });
    try {
      for (let i = 0; i < plan.length; i += 1) {
        const step = plan[i];
        if (i > 0) {
          addEvent("delegation", leadAgentId, { to: step.agentId, task: step.task });
          addMsg({ type: "delegation", from: plan[i - 1].agentId, to: step.agentId, missionId });
        }
        await runAgent(step.agentId, step.task, i, "", missionId, step.kind);
      }
    } finally {
      setProcessing(false);
      setProcessingMissionId(null);
    }
  }, [command, processing, addMsg, addEvent, runAgent, selectedMissionId, revisionMeta]);

  const handleContinueMission = useCallback((message, options = { type: "full" }) => {
    const fallbackMissionId = selectedMissionId || null;
    const missionId = message?.missionId || fallbackMissionId;
    const mission = buildMissionList(messagesRef.current).find((m) => m.id === missionId);
    if (!missionId && !mission) {
      setRevisionMeta({ missionId: null, messageId: null, type: "full", assetIndex: null });
      setCommand("Merci d'ameliorer ou corriger le livrable selon mon retour : ");
      setSheet(true);
      return;
    }
    setSelectedMissionId(missionId);
    setRevisionMeta({ missionId, messageId: message?.id ?? null, type: options.type || "full", assetIndex: options.assetIndex ?? null });
    setCommand(options.type === "image"
      ? `Regenerer uniquement le visuel ${Number(options.assetIndex) + 1} en conservant tous les autres visuels inchanges. Ajustement souhaite : `
      : `Retour sur le livrable final : merci d'ameliorer, corriger ou completer la mission selon mon retour. Ne modifie que les elements mentionnes : `);
    setFocusMessageId(null);
    if (mission?.target) {
      setTarget(mission.target);
    }
    setSheet(true);
  }, [selectedMissionId]);

  const handleSuggestedAction = useCallback((message, action) => {
    setSelectedMissionId(message.missionId || null);
    setCommand(action.cmd);
    setFocusMessageId(null);
    setSheet(true);
  }, []);

  const performMissionAction = useCallback((missionId, action = "archive") => {
    if (action === "delete") {
      addMsg({ type: "mission_deleted", missionId, content: "Mission supprimée" });
    } else if (action === "restore") {
      addMsg({ type: "mission_restored", missionId, content: "Mission désarchivée" });
    } else {
      addMsg({ type: "mission_archived", missionId, content: "Mission archivée" });
    }
    setSelectedMissionId(null);
  }, [addMsg]);

  const handleArchiveMission = useCallback((missionId, action = "archive") => {
    if (action === "delete") {
      setConfirmDialog({
        missionId,
        action,
        title: "Supprimer la mission ?",
        message: "Cette action retire la mission de la liste. Le livrable et son historique ne seront plus visibles dans l'app.",
      });
      return;
    }
    performMissionAction(missionId, action);
  }, [performMissionAction]);

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

  const activity = kpis?.activity && typeof kpis.activity === "object" ? kpis.activity : {};
  const maxAct = Math.max(...Object.values(activity), 1);
  const leaderboard = Object.entries(activity).sort(([, a], [, b]) => b - a);

  const TABS = [
    { id: "missions", icon: Home, label: "Missions" },
    { id: "team", icon: Users, label: "Équipe" },
    { id: "company", icon: Settings, label: "Réglages" },
    { id: "bilan", icon: BarChart3, label: "Bilan", badge: (Array.isArray(kpis?.deliverables) ? kpis.deliverables.length : 0) + (Array.isArray(kpis?.flags) ? kpis.flags.length : 0) },
  ];

  const studioName = config.company.name || "Mon studio";
  const openMissionFromAnywhere = useCallback((missionId, messageId = null) => {
    setTab("missions");
    setSelectedMissionId(missionId);
    setFocusMessageId(messageId);
  }, []);

  const openAssetPreview = useCallback((assets, index = 0) => {
    setLightbox({ assets, index });
  }, []);

  return (
    <div style={{ height: "100dvh", width: "100%", background: "#FBF6EE", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", fontFamily: "Nunito, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes ring { 0%{transform:scale(1);opacity:0.7;} 100%{transform:scale(1.3);opacity:0;} }
        @keyframes bounce { 0%,60%,100%{transform:translateY(0);} 30%{transform:translateY(-6px);} }
        @keyframes spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
        @keyframes pop { from{opacity:0;transform:translateY(12px) scale(0.97);} to{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes lightboxOut { from{opacity:1;transform:scale(1);} to{opacity:0;transform:scale(0.98);} }
        @keyframes sheetUp { from{transform:translateY(100%);} to{transform:translateY(0);} }
        @keyframes sheetDown { from{transform:translateY(0);} to{transform:translateY(100%);} }
        @keyframes fadeBg { from{opacity:0;} to{opacity:1;} }
        @keyframes fadeBgOut { from{opacity:1;} to{opacity:0;} }
        @keyframes modalUp { from{opacity:0; transform:translateY(16px) scale(0.98);} to{opacity:1; transform:translateY(0) scale(1);} }
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
        <ScreenErrorBoundary resetKey={`${tab}-${messages.length}-${selectedMissionId || "none"}`}>
          {tab === "missions" && <MissionsScreen messages={messages} expanded={expanded} setExpanded={setExpanded} onQuick={(q) => { setSelectedMissionId(null); setFocusMessageId(null); setCommand(q.cmd); setSheet(true); }} onValidate={handleValidate} onContinueMission={handleContinueMission} onAction={handleSuggestedAction} selectedMissionId={selectedMissionId} setSelectedMissionId={setSelectedMissionId} onArchiveMission={handleArchiveMission} onOpenAssets={openAssetPreview} processingMissionId={processingMissionId} focusMessageId={focusMessageId} />}
          {tab === "team" && <TeamScreen statuses={statuses} activity={activity} onOpen={() => {}} />}
          {tab === "company" && <ConfigScreen config={config} updateCompany={updateCompany} updateMetier={updateMetier} saved={saved} decisions={config.decisions || []} />}
          {tab === "bilan" && <BilanScreen kpis={kpis} messages={messages} activity={activity} leaderboard={leaderboard} maxAct={maxAct} onOpenMission={openMissionFromAnywhere} />}
        </ScreenErrorBoundary>
      </div>

      {/* Bottom nav */}
      <div style={{ flexShrink: 0, background: "#fff", borderTop: "1px solid #F0E8DB", display: "flex", alignItems: "flex-start", paddingTop: 11, paddingBottom: "env(safe-area-inset-bottom, 0px)", minHeight: 76, position: "relative", zIndex: 20, boxShadow: "0 -4px 20px rgba(120,90,50,0.04)" }}>
        {TABS.slice(0, 2).map((t) => <NavBtn key={t.id} t={t} active={tab === t.id} onClick={() => {
          setTab(t.id);
          if (t.id === "missions") { setSelectedMissionId(null); setFocusMessageId(null); }
        }} />)}
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <button onClick={() => { setSelectedMissionId(null); setFocusMessageId(null); setCommand(""); setSheet(true); }} style={{ width: 60, height: 60, borderRadius: "50%", border: "none", marginTop: -24, background: "linear-gradient(135deg, #FF9466, #F2785C)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", zIndex: 2, boxShadow: "0 8px 22px rgba(242,120,92,0.4)", WebkitTapHighlightColor: "transparent" }}>
            <Plus size={28} color="#fff" strokeWidth={2.6} />
          </button>
        </div>
        {TABS.slice(2).map((t) => <NavBtn key={t.id} t={t} active={tab === t.id} onClick={() => {
          setTab(t.id);
          if (t.id === "missions") { setSelectedMissionId(null); setFocusMessageId(null); }
        }} />)}
      </div>

      {sheet && <MissionSheet command={command} setCommand={setCommand} onSend={handleSend} onClose={() => { setSheet(false); setRevisionMeta(null); }} revisionMeta={revisionMeta} />}
      <ConfirmDialog dialog={confirmDialog} onCancel={() => setConfirmDialog(null)} onConfirm={() => {
        if (!confirmDialog) return;
        const { missionId, action } = confirmDialog;
        setConfirmDialog(null);
        performMissionAction(missionId, action);
      }} />
      <AssetLightbox group={lightbox} onClose={() => setLightbox(null)} onReviseAsset={(asset, index) => {
        const sourceMessage = messages.find((message) => message.type === "response" && (message.assets || []).some((item) => item.url === asset.url)) || null;
        if (!sourceMessage) return;
        setLightbox(null);
        handleContinueMission(sourceMessage, { type: "image", assetIndex: index, asset });
      }} />
    </div>
  );
}
