// generate-mock
// Calls Claude to produce site copy as JSON, then assembles a complete
// self-contained HTML page and uploads it to the public mock-sites bucket.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT =
  "You are a professional web designer and copywriter creating content for a real local business website. Return ONLY a single valid raw JSON object. No markdown. No code fences. No explanation text. Start with { and end with }. Nothing before, nothing after.";

const SYSTEM_PROMPT_STRICT =
  SYSTEM_PROMPT +
  " Your previous response could not be parsed as JSON. Respond with ONLY the raw JSON object — no prose, no commentary, no code fences, no leading or trailing characters. Just the object.";

type LeadInput = {
  business_name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  niche: string | null;
  rating: number | null;
  review_count: number | null;
  address: string | null;
  website_goal: string | null;
  email: string | null;
};

type GeneratedCopy = {
  hero_tagline: string;
  hero_subheading: string;
  services: { name: string; description: string }[];
  about: string;
  testimonials: { reviewer: string; review: string }[];
  cta_phrase: string;
  meta_description: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
};

function buildUserPrompt(lead: LeadInput, extraContext?: string | null): string {
  return [
    `Business name: ${lead.business_name}`,
    `City: ${lead.city ?? ""}`,
    `State: ${lead.state ?? ""}`,
    `Category: ${lead.niche ?? ""}`,
    `Star rating: ${lead.rating ?? ""}`,
    `Review count: ${lead.review_count ?? ""}`,
    `Phone: ${lead.phone ?? ""}`,
    `Website goal (the owner's stated goal — let this shape every section): ${
      lead.website_goal ?? "(not provided — write a balanced general-purpose site)"
    }`,
    extraContext && extraContext.trim()
      ? `Operator's additional context (treat as high-priority direction from a human reviewer): ${extraContext.trim()}`
      : "",
    "",
    "Use the website goal AND any operator context to shape every piece of content. If they want calls, make the phone number the hero focus. If they want bookings, make the CTA about booking. If they want credibility, lead with reviews and trust signals.",
    "",
    "Return ONLY raw JSON with EXACTLY these fields:",
    `{
  "hero_tagline": "5 to 7 words. Bold specific promise written for THIS exact business type. Looks great on a work truck.",
  "hero_subheading": "35 to 45 words speaking directly to what this business does, who they serve, why they are the right choice in their specific city. Warm and confident.",
  "services": [ { "name": "...", "description": "Two specific sentences for THIS business category. Never generic." } ],   // EXACTLY 6 items
  "about": "EXACTLY 70 words in first person as the business owner. Sounds human, experienced, community rooted. Mentions the city by name. Ends with what makes them genuinely different.",
  "testimonials": [ { "reviewer": "First name + last initial", "review": "Specific believable one sentence five-star review mentioning something concrete." } ],  // EXACTLY 3 items
  "cta_phrase": "4 to 6 words. Urgent and specific. Never 'Contact Us' or 'Learn More'.",
  "meta_description": "150 characters max. Includes the city and category.",
  "primary_color": "#HEX",
  "secondary_color": "#HEX",
  "accent_color": "#HEX"
}`,
    "",
    "Color rules — choose the primary color from the rules below, then pick a harmonious secondary and a high-contrast accent for buttons/highlights:",
    "- roofing and contractors: #D2691E",
    "- legal and financial: #1B2A4A",
    "- landscaping: #2D5A27",
    "- medical and wellness: #2E86AB",
    "- automotive: #C0392B",
    "- food and restaurants: #E8553E",
    "- beauty and salon: #6B3FA0",
    "- retail and general: #3D5A80",
  ].filter(Boolean).join("\n");
}

async function callClaude(apiKey: string, system: string, user: string, timeoutMs = 30000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-3-5-20251001",
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Claude error ${res.status}: ${t}`);
    }
    const d = await res.json();
    return (d?.content?.[0]?.text ?? "").trim();
  } finally {
    clearTimeout(timer);
  }
}

function fallbackCopy(lead: LeadInput): GeneratedCopy {
  const niche = (lead.niche ?? "local business").toLowerCase();
  const city = lead.city ?? "your area";
  const colorMap: Record<string, [string, string, string]> = {
    roof: ["#D2691E", "#1A1A2E", "#EF9F27"],
    contractor: ["#D2691E", "#1A1A2E", "#EF9F27"],
    legal: ["#1B2A4A", "#0F172A", "#C9A84C"],
    law: ["#1B2A4A", "#0F172A", "#C9A84C"],
    financ: ["#1B2A4A", "#0F172A", "#C9A84C"],
    landscape: ["#2D5A27", "#1A1A2E", "#EF9F27"],
    medical: ["#2E86AB", "#0F172A", "#EF9F27"],
    dental: ["#2E86AB", "#0F172A", "#EF9F27"],
    auto: ["#C0392B", "#1A1A2E", "#EF9F27"],
    restaurant: ["#E8553E", "#1A1A2E", "#EF9F27"],
    cafe: ["#E8553E", "#1A1A2E", "#EF9F27"],
    salon: ["#6B3FA0", "#1A1A2E", "#EF9F27"],
    barber: ["#6B3FA0", "#1A1A2E", "#EF9F27"],
  };
  let primary = "#3D5A80", secondary = "#1A1A2E", accent = "#EF9F27";
  for (const k of Object.keys(colorMap)) {
    if (niche.includes(k)) { [primary, secondary, accent] = colorMap[k]; break; }
  }
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const owner = lead.business_name;
  return {
    hero_tagline: `Trusted ${cap(niche)} in ${city}`,
    hero_subheading: `${owner} proudly serves ${city} with reliable, professional service. We treat every customer like a neighbor and stand behind our work — that's why locals keep coming back and recommending us to friends and family.`,
    services: [
      { name: "Professional Service", description: `Honest, dependable ${niche} work delivered on time. We handle every job with the same care, big or small.` },
      { name: "Free Estimates", description: `Get a clear no-pressure quote before any work begins. We'll walk you through your options so you can decide what's right for you.` },
      { name: "Local & Trusted", description: `Born and raised in ${city}. We're not a faceless chain — we're your neighbors and we stand behind every job.` },
      { name: "Fair Pricing", description: `Straight-forward pricing with no surprises at the end. What we quote is what you pay.` },
      { name: "Quality Guarantee", description: `If you're not happy, we make it right. Our reputation in ${city} is everything to us.` },
      { name: "Quick Response", description: `Fast scheduling and clear communication from the first call to the final handshake.` },
    ],
    about: `I'm proud to run ${owner} right here in ${city}. After years in this business, I've learned that what people really want is someone who shows up on time, does honest work, and treats them with respect. That's how I run things and that's how my team runs things. We're not the biggest — we just care more.`,
    testimonials: [
      { reviewer: "Sarah M.", review: `${owner} did a fantastic job — on time, fair price, and the quality was excellent.` },
      { reviewer: "Mike T.", review: `Best ${niche} I've worked with in ${city}. Honest, professional, and they actually care.` },
      { reviewer: "Jessica L.", review: `Friendly, fast, and reasonable. Highly recommend to anyone in the area.` },
    ],
    cta_phrase: lead.phone ? "Call Today For Free Quote" : "Get Your Free Quote",
    meta_description: `${owner} — trusted ${niche} serving ${city}. Honest work, fair prices, satisfaction guaranteed.`.slice(0, 155),
    primary_color: primary,
    secondary_color: secondary,
    accent_color: accent,
  };
}

function tryParseJson(text: string): GeneratedCopy | null {
  if (!text) return null;
  // Strip code fences if present, then trim
  let t = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  // If there's leading prose, find the first { and last }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  try {
    return JSON.parse(t) as GeneratedCopy;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function escapeBg(s: string): string {
  // For CSS url() — keep it simple, no quote chars allowed
  return String(s ?? "").replace(/['"\\]/g, "");
}

const SERVICE_EMOJI_BY_NICHE: Record<string, string[]> = {
  roof: ["🏠", "🔨", "🛡️", "🪜", "⛈️", "✅"],
  contractor: ["🏗️", "🔨", "📐", "🪚", "🧱", "✅"],
  restaurant: ["🍽️", "🥗", "🍝", "🍷", "👨‍🍳", "⭐"],
  cafe: ["☕", "🥐", "🍰", "🥪", "🫖", "⭐"],
  salon: ["✂️", "💇", "💅", "🎨", "💆", "✨"],
  barber: ["✂️", "💈", "🪒", "🧔", "💇‍♂️", "✨"],
  landscape: ["🌿", "🌳", "🌷", "🪴", "💧", "🌞"],
  dental: ["🦷", "😁", "✨", "🪥", "🩺", "❤️"],
  doctor: ["🩺", "❤️", "💊", "🏥", "👩‍⚕️", "✅"],
  auto: ["🚗", "🔧", "🛠️", "🔩", "⛽", "🛞"],
  mechanic: ["🔧", "🛠️", "🚗", "🔩", "⚙️", "✅"],
  plumb: ["🚿", "🔧", "💧", "🛁", "🪠", "✅"],
  electric: ["⚡", "💡", "🔌", "🔋", "🛠️", "✅"],
  hvac: ["❄️", "🔥", "🌡️", "🌬️", "🛠️", "✅"],
  fitness: ["💪", "🏋️", "🧘", "🏃", "🥗", "❤️"],
  gym: ["💪", "🏋️", "🥊", "🏃", "🧘", "❤️"],
  pet: ["🐶", "🐾", "✂️", "🛁", "❤️", "✅"],
  vet: ["🐾", "🩺", "❤️", "🐶", "🐱", "✅"],
  law: ["⚖️", "📜", "🏛️", "🤝", "📑", "✅"],
  account: ["📊", "💼", "🧾", "💰", "📈", "✅"],
  realestate: ["🏡", "🔑", "📍", "📷", "🤝", "✅"],
  photo: ["📷", "🎞️", "🌅", "💍", "👨‍👩‍👧", "✨"],
  clean: ["🧹", "🧽", "✨", "🪣", "🧼", "✅"],
};

function pickEmojis(niche: string | null | undefined): string[] {
  const n = (niche || "").toLowerCase();
  for (const k of Object.keys(SERVICE_EMOJI_BY_NICHE)) {
    if (n.includes(k)) return SERVICE_EMOJI_BY_NICHE[k];
  }
  return ["⭐", "✅", "🤝", "🛠️", "📍", "❤️"];
}

function buildHtml(lead: LeadInput, copy: GeneratedCopy, images: string[]): string {
  const businessName = lead.business_name;
  const phone = lead.phone || "";
  const phoneHref = phone.replace(/[^\d+]/g, "");
  const city = lead.city || "";
  const rating = lead.rating != null ? Number(lead.rating).toFixed(1) : "5.0";
  const reviews = lead.review_count != null ? String(lead.review_count) : "—";
  const heroBg = images[0] || "";
  const aboutImg = images[2] || "";
  const testimonialBg = images[1] || "";
  const emojis = pickEmojis(lead.niche);
  const primary = copy.primary_color || "#3D5A80";
  const secondary = copy.secondary_color || "#1A1A2E";
  const accent = copy.accent_color || "#EF9F27";
  const firstLetter = (businessName.match(/[A-Za-z]/)?.[0] ?? "B").toUpperCase();

  const services = (copy.services ?? []).slice(0, 6);
  const testimonials = (copy.testimonials ?? []).slice(0, 3);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(businessName)}</title>
<meta name="description" content="${escapeAttr(copy.meta_description ?? "")}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;900&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html{scroll-behavior:smooth}
  body{font-family:'Inter',sans-serif;color:#1A1A2E;line-height:1.6;background:#fff;-webkit-font-smoothing:antialiased}
  h1,h2,h3,h4{font-family:'Playfair Display',serif;line-height:1.2}
  a{color:inherit;text-decoration:none}
  img{max-width:100%;display:block}
  :root{--primary:${primary};--secondary:${secondary};--accent:${accent}}

  /* Sections fade-in */
  section{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease}
  section.visible{opacity:1;transform:none}
  section.visible .stagger > *{opacity:1;transform:none}
  .stagger > *{opacity:0;transform:translateY(20px);transition:opacity .6s ease,transform .6s ease}
  .stagger > *:nth-child(1){transition-delay:.05s}
  .stagger > *:nth-child(2){transition-delay:.15s}
  .stagger > *:nth-child(3){transition-delay:.25s}
  .stagger > *:nth-child(4){transition-delay:.35s}
  .stagger > *:nth-child(5){transition-delay:.45s}
  .stagger > *:nth-child(6){transition-delay:.55s}

  /* Nav */
  nav{position:fixed;top:0;left:0;width:100%;z-index:1000;height:64px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);box-shadow:0 2px 12px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:space-between;padding:0 32px;transition:box-shadow .3s ease}
  nav.scrolled{box-shadow:0 6px 24px rgba(0,0,0,.12)}
  nav .brand{font-family:'Playfair Display',serif;font-size:20px;font-weight:700;color:var(--primary)}
  nav .pill{background:var(--accent);color:#fff;font-size:14px;padding:8px 20px;border-radius:999px;font-weight:600;transition:transform .2s ease,filter .2s ease}
  nav .pill:hover{transform:translateY(-1px);filter:brightness(1.05)}
  nav .pill .label-mobile{display:none}

  /* Hero */
  .hero{position:relative;min-height:100vh;padding:80px 20px 60px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;overflow:hidden;opacity:1;transform:none}
  .hero .bg{position:absolute;inset:0;background:${heroBg ? `url('${escapeBg(heroBg)}') center/cover no-repeat` : "transparent"};z-index:0}
  .hero .overlay{position:absolute;inset:0;background:linear-gradient(135deg,${primary},${secondary});opacity:${heroBg ? 0.75 : 1};z-index:1}
  .hero .inner{position:relative;z-index:2;max-width:820px;display:flex;flex-direction:column;align-items:center}
  .hero h1{font-size:56px;font-weight:700;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.3)}
  .hero .tagline{font-family:'Playfair Display',serif;font-size:30px;font-weight:400;color:#fff;opacity:.92;margin-top:12px}
  .hero .sub{font-size:18px;font-weight:300;color:#fff;opacity:.8;max-width:620px;margin-top:16px;line-height:1.6}
  .hero .cta{background:#fff;color:var(--accent);font-size:18px;font-weight:600;padding:16px 44px;border-radius:8px;margin-top:36px;border:none;cursor:pointer;animation:pulse 2s ease-in-out infinite;transition:transform .2s ease}
  .hero .cta:hover{transform:translateY(-2px)}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
  .scroll-indicator{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);color:#fff;opacity:.7;font-size:24px;animation:bob 2s ease-in-out infinite;z-index:2}
  @keyframes bob{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,8px)}}

  /* Social proof */
  .social{background:#111827;padding:20px 40px;display:flex;justify-content:space-evenly;align-items:center;gap:20px}
  .social .item{text-align:center;color:#fff}
  .social .num{font-size:40px;font-weight:700;color:#EF9F27;line-height:1}
  .social .lbl{font-size:12px;color:rgba(255,255,255,.6);margin-top:6px;letter-spacing:.04em;text-transform:uppercase}
  .social .check{font-size:40px;color:var(--accent);line-height:1}

  /* Sections base */
  .section-pad{padding:96px 40px}
  .section-light{background:#F8F8F8}
  .section-white{background:#fff}
  .section-title{font-size:44px;font-weight:700;color:#1A1A2E;text-align:center;margin-bottom:16px}
  .section-sub{font-size:18px;color:#666;text-align:center;margin-bottom:56px}

  /* Services */
  .grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;max-width:1180px;margin:0 auto}
  .card{background:#fff;border-radius:16px;padding:36px;box-shadow:0 4px 24px rgba(0,0,0,.06);transition:transform .25s ease,box-shadow .25s ease}
  .card:hover{transform:translateY(-6px);box-shadow:0 12px 40px rgba(0,0,0,.10)}
  .icon-tile{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px}
  .card h3{font-size:20px;font-weight:600;color:#1A1A2E;margin-top:16px}
  .card p{font-size:15px;color:#555;line-height:1.7;margin-top:8px}

  /* Why choose us */
  .why{background:var(--primary);color:#fff;padding:80px 40px;text-align:center}
  .why h2{color:#fff;font-size:44px;font-weight:700;margin-bottom:56px}
  .why .row{display:flex;gap:32px;max-width:1100px;margin:0 auto}
  .why .block{flex:1;padding:24px}
  .why .big{font-size:80px;font-weight:800;color:#fff;line-height:1}
  .why .big.accent{color:var(--accent)}
  .why .lbl{font-size:16px;color:rgba(255,255,255,.85);margin-top:12px}

  /* Testimonials */
  .testimonials{position:relative}
  .testimonials .bg{position:absolute;inset:0;background:${
    testimonialBg ? `url('${escapeBg(testimonialBg)}') center/cover no-repeat` : "transparent"
  };z-index:0}
  .testimonials .ovly{position:absolute;inset:0;background:rgba(255,255,255,.95);z-index:1}
  .testimonials .inner{position:relative;z-index:2}
  .t-card{background:#F8F8F8;border-radius:16px;padding:36px}
  .t-stars{font-size:18px;color:#EF9F27;letter-spacing:2px}
  .t-card p{font-size:16px;color:#333;font-style:italic;line-height:1.8;margin-top:16px}
  .t-card .who{font-size:13px;font-weight:600;color:#888;letter-spacing:.08em;text-transform:uppercase;margin-top:16px}

  /* About */
  .about-grid{display:grid;grid-template-columns:1fr 1fr;gap:64px;max-width:1180px;margin:0 auto;align-items:center}
  .about-left{position:relative;min-height:380px}
  .about-letter{position:absolute;top:50%;left:0;transform:translateY(-50%);font-family:'Playfair Display',serif;font-size:320px;font-weight:900;color:var(--primary);opacity:.06;line-height:1;pointer-events:none;user-select:none}
  .about-img{position:relative;z-index:1;border-radius:16px;width:100%;height:380px;object-fit:cover;box-shadow:0 12px 40px rgba(0,0,0,.10)}
  .about-right h2{font-size:40px;font-weight:700;color:#1A1A2E;margin-bottom:24px}
  .about-right p{font-size:18px;color:#444;line-height:1.9}

  /* Contact */
  .contact{background:var(--primary);color:#fff;padding:80px 40px;text-align:center}
  .contact h2{color:#fff;font-size:44px;font-weight:700;margin-bottom:16px}
  .contact .sub{font-size:18px;color:rgba(255,255,255,.85);margin-bottom:40px}
  .contact .phone-btn{display:inline-block;background:#fff;color:var(--primary);font-size:36px;font-weight:700;padding:16px 56px;border-radius:10px;margin-bottom:40px;font-family:'Inter',sans-serif;transition:transform .2s ease,box-shadow .2s ease}
  .contact .phone-btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,0,0,.20)}
  .contact form{max-width:520px;margin:0 auto;display:flex;flex-direction:column}
  .contact input,.contact textarea{width:100%;background:#fff;border:none;border-radius:10px;padding:16px;font:400 16px 'Inter',sans-serif;margin-bottom:14px;color:#1A1A2E}
  .contact textarea{resize:vertical;min-height:120px}
  .contact button{background:var(--accent);color:#fff;font-size:18px;font-weight:600;padding:16px;border-radius:10px;border:none;cursor:pointer;transition:filter .2s ease}
  .contact button:hover{filter:brightness(1.06)}

  /* Footer */
  footer{background:#0F172A;padding:48px 40px;text-align:center;color:#fff}
  footer .name{font-family:'Playfair Display',serif;font-size:26px;font-weight:700;margin-bottom:12px}
  footer .meta{font-size:13px;color:#888;max-width:500px;margin:0 auto 24px}
  footer .copy{font-size:12px;color:#666}
  footer .credit{font-size:11px;color:#444;margin-top:6px}

  /* Floating mobile call */
  .float-call{display:none}
  @media (max-width:768px){
    nav{padding:0 16px}
    nav .pill .label-desktop{display:none}
    nav .pill .label-mobile{display:inline}
    .hero h1{font-size:36px}
    .hero .tagline{font-size:22px}
    .hero .sub{font-size:15px}
    .hero .cta{font-size:16px;padding:14px 32px}
    .section-pad{padding:48px 20px}
    .section-title{font-size:32px}
    .grid-3{grid-template-columns:1fr}
    .why .row{flex-direction:column;gap:8px}
    .why .big{font-size:56px}
    .about-grid{grid-template-columns:1fr;gap:32px}
    .about-letter{font-size:200px}
    .about-img{height:240px}
    .social{flex-direction:column;gap:16px}
    .contact{padding-bottom:120px}
    .contact .phone-btn{font-size:24px;padding:14px 32px}
    .float-call{display:flex;position:fixed;bottom:0;left:0;width:100%;z-index:9999;background:var(--accent);padding:18px;align-items:center;justify-content:center;gap:12px;color:#fff;font-size:18px;font-weight:700;box-shadow:0 -4px 16px rgba(0,0,0,.2)}
  }
  @media (min-width:769px) and (max-width:1024px){
    .grid-3{grid-template-columns:repeat(2,1fr)}
  }
</style>
</head>
<body>

<nav id="topnav">
  <div class="brand">${escapeHtml(businessName)}</div>
  ${
    phoneHref
      ? `<a class="pill" href="tel:${escapeAttr(phoneHref)}">
           <span class="label-desktop">${escapeHtml(phone)}</span>
           <span class="label-mobile">📞 Call</span>
         </a>`
      : ""
  }
</nav>

<section class="hero" id="hero">
  <div class="bg" aria-hidden="true"></div>
  <div class="overlay" aria-hidden="true"></div>
  <div class="inner stagger">
    <h1>${escapeHtml(businessName)}</h1>
    <div class="tagline">${escapeHtml(copy.hero_tagline)}</div>
    <p class="sub">${escapeHtml(copy.hero_subheading)}</p>
    ${
      phoneHref
        ? `<a href="tel:${escapeAttr(phoneHref)}"><button class="cta">${escapeHtml(copy.cta_phrase)}</button></a>`
        : `<button class="cta">${escapeHtml(copy.cta_phrase)}</button>`
    }
  </div>
  <div class="scroll-indicator">⌄</div>
</section>

<section class="social">
  <div class="item"><div class="num">${escapeHtml(rating)}★</div><div class="lbl">Five Star Rated</div></div>
  <div class="item"><div class="num">${escapeHtml(reviews)}</div><div class="lbl">Verified Reviews</div></div>
  <div class="item"><div class="check">✓</div><div class="lbl" style="color:rgba(255,255,255,.7);margin-top:6px">Satisfaction Guaranteed</div></div>
</section>

<section class="section-pad section-light" id="services">
  <h2 class="section-title">What We Do</h2>
  <p class="section-sub">${escapeHtml(`Trusted ${lead.niche ?? "service"} in ${city || "your area"}`)}</p>
  <div class="grid-3 stagger">
    ${services
      .map(
        (s, i) => `
      <div class="card">
        <div class="icon-tile" style="background:${primary}1F;color:${primary}">${emojis[i] ?? "★"}</div>
        <h3>${escapeHtml(s.name)}</h3>
        <p>${escapeHtml(s.description)}</p>
      </div>`
      )
      .join("")}
  </div>
</section>

<section class="why">
  <h2>Why ${escapeHtml(businessName)}</h2>
  <div class="row stagger">
    <div class="block"><div class="big">${escapeHtml(rating)}★</div><div class="lbl">Five Star Rated</div></div>
    <div class="block"><div class="big">${escapeHtml(reviews)}</div><div class="lbl">Verified Reviews</div></div>
    <div class="block"><div class="big accent">✓</div><div class="lbl">Satisfaction Guaranteed</div></div>
  </div>
</section>

<section class="section-pad section-white testimonials" id="testimonials">
  <div class="bg" aria-hidden="true"></div>
  <div class="ovly" aria-hidden="true"></div>
  <div class="inner">
    <h2 class="section-title">What Our Customers Say</h2>
    <div class="grid-3 stagger">
      ${testimonials
        .map(
          (t) => `
        <div class="t-card">
          <div class="t-stars">★★★★★</div>
          <p>"${escapeHtml(t.review)}"</p>
          <div class="who">— ${escapeHtml(t.reviewer)}</div>
        </div>`
        )
        .join("")}
    </div>
  </div>
</section>

<section class="section-pad section-white" id="about">
  <div class="about-grid">
    <div class="about-left">
      <div class="about-letter">${escapeHtml(firstLetter)}</div>
      ${aboutImg ? `<img class="about-img" src="${escapeAttr(aboutImg)}" alt="${escapeAttr(businessName)}" />` : ""}
    </div>
    <div class="about-right">
      <h2>Our Story</h2>
      <p>${escapeHtml(copy.about)}</p>
    </div>
  </div>
</section>

<section class="contact" id="contact">
  <h2>Ready To Get Started</h2>
  <div class="sub">Serving ${escapeHtml(city || "your community")} and surrounding areas</div>
  ${
    phoneHref
      ? `<a class="phone-btn" href="tel:${escapeAttr(phoneHref)}">${escapeHtml(phone)}</a>`
      : ""
  }
  <form onsubmit="event.preventDefault();alert('Thanks — we will be in touch shortly.');">
    <input type="text" placeholder="Your name" required />
    <input type="email" placeholder="Email address" required />
    <textarea rows="4" placeholder="How can we help?" required></textarea>
    <button type="submit">${escapeHtml(copy.cta_phrase)}</button>
  </form>
</section>

<footer>
  <div class="name">${escapeHtml(businessName)}</div>
  <div class="meta">${escapeHtml(copy.meta_description ?? "")}</div>
  <div class="copy">© ${new Date().getFullYear()} ${escapeHtml(businessName)}. All rights reserved.</div>
  <div class="credit">Website by BH Sites — bhsites.com</div>
</footer>

${
  phoneHref
    ? `<a class="float-call" href="tel:${escapeAttr(phoneHref)}"><span style="font-size:22px">📞</span><span>${escapeHtml(phone)}</span></a>`
    : ""
}

<script>
  // Nav shadow on scroll
  var nav = document.getElementById('topnav');
  window.addEventListener('scroll', function(){
    if (window.scrollY > 8) nav.classList.add('scrolled'); else nav.classList.remove('scrolled');
  }, {passive:true});

  // Reveal on scroll
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.12 });
  document.querySelectorAll('section').forEach(function(s){ io.observe(s); });
  // Hero starts visible
  document.getElementById('hero').classList.add('visible');
</script>

</body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const leadId: string = body.lead_id;
    const selectedImages: string[] = Array.isArray(body.selected_images) ? body.selected_images : [];
    if (!leadId) {
      return new Response(JSON.stringify({ error: "lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_KEY) {
      return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Pull the lead
    const { data: leadRow, error: leadErr } = await supabase
      .from("leads")
      .select(
        "id,business_name,phone,email,city,state,niche,rating,review_count,address,website_goal,client_assets"
      )
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr || !leadRow) {
      return new Response(JSON.stringify({ error: "lead not found", detail: leadErr?.message }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lead: LeadInput = leadRow as LeadInput;

    // Mark generating
    await supabase.from("leads").update({ status: "generating" }).eq("id", leadId);
    const { data: existingMock } = await supabase
      .from("mock_sites")
      .select("id, notes")
      .eq("lead_id", leadId)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingMock?.id) {
      await supabase.from("mock_sites").update({ status: "generating" }).eq("id", existingMock.id);
    } else {
      await supabase.from("mock_sites").insert({
        lead_id: leadId,
        status: "generating",
        requested_at: new Date().toISOString(),
      });
    }

    const operatorNotes: string | null = (existingMock as any)?.notes ?? null;

    // Step 3 — call Claude with retry on parse failure, fall back to template if it fails
    const userPrompt = buildUserPrompt(lead, operatorNotes);
    let raw = "";
    let copy: GeneratedCopy | null = null;
    let usedFallback = false;
    try {
      raw = await callClaude(ANTHROPIC_KEY, SYSTEM_PROMPT, userPrompt);
      copy = tryParseJson(raw);
    } catch (e) {
      console.error("[generate-mock] claude call 1 failed", e);
    }
    if (!copy) {
      try {
        raw = await callClaude(ANTHROPIC_KEY, SYSTEM_PROMPT_STRICT, userPrompt);
        copy = tryParseJson(raw);
      } catch (e) {
        console.error("[generate-mock] claude call 2 failed", e);
      }
    }
    if (!copy) {
      // Fall back to a templated mock so the operator still gets a real hosted page
      console.warn("[generate-mock] using fallback template — Claude unavailable or unparseable");
      copy = fallbackCopy(lead);
      usedFallback = true;
      await supabase.from("activity_log").insert({
        action_type: "mock_generated",
        business_name: lead.business_name,
        lead_id: leadId,
        detail: "Mock generated using fallback template — Claude API unavailable",
        outcome: "warning",
      });
    }

    // Step 5 — build HTML
    const html = buildHtml(lead, copy, selectedImages);

    // Step 6 — upload to storage
    const filename = `lead-${leadId}-${Date.now()}.html`;
    const { error: upErr } = await supabase.storage
      .from("mock-sites")
      .upload(filename, new Blob([html], { type: "text/html;charset=utf-8" }), {
        contentType: "text/html;charset=utf-8",
        upsert: true,
      });
    if (upErr) {
      console.error("[generate-mock] storage upload failed", upErr);
      await supabase.from("leads").update({ status: "mock-requested" }).eq("id", leadId);
      return new Response(JSON.stringify({ error: "storage upload failed", detail: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: pub } = supabase.storage.from("mock-sites").getPublicUrl(filename);
    const publicUrl = pub.publicUrl;

    const nowIso = new Date().toISOString();
    if (existingMock?.id) {
      await supabase
        .from("mock_sites")
        .update({
          status: "ready",
          preview_url: publicUrl,
          generated_at: nowIso,
        })
        .eq("id", existingMock.id);
    } else {
      await supabase.from("mock_sites").insert({
        lead_id: leadId,
        status: "ready",
        preview_url: publicUrl,
        generated_at: nowIso,
        requested_at: nowIso,
      });
    }
    await supabase.from("leads").update({ status: "mock-ready" }).eq("id", leadId);

    await supabase.from("activity_log").insert({
      action_type: "mock_generated",
      business_name: lead.business_name,
      lead_id: leadId,
      detail: usedFallback
        ? `Mock generated using fallback template (Claude unavailable): ${publicUrl}`
        : `Mock generated and uploaded: ${publicUrl}`,
      outcome: usedFallback ? "warning" : "success",
    });

    return new Response(
      JSON.stringify({ success: true, preview_url: publicUrl, copy, fallback: usedFallback }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[generate-mock] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
