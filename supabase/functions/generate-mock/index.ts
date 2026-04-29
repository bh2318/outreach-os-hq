// generate-mock
// Receives { businessName, niche, city, state, county, phone, reviewCount, rating, leadId? }.
// Generates a single self-contained HTML mock site (Google Fonts via <link>,
// all CSS inline), uploads to the public mock-sites bucket as
// <slug>-preview.html, inserts a row in mock_sites, returns the public URL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Input = {
  businessName: string;
  niche?: string | null;
  city?: string | null;
  state?: string | null;
  county?: string | null;
  phone?: string | null;
  reviewCount?: number | null;
  rating?: number | null;
  leadId?: string | null;
};

const NICHE_THEME: Record<
  string,
  {
    bg: string;
    accent: string;
    headline: (city: string) => string;
    services: { icon: string; name: string; desc: string }[];
  }
> = {
  plumber: {
    bg: "#0b2a4a",
    accent: "#3aa0ff",
    headline: (c) => `${c}'s Most Trusted Plumber`,
    services: [
      { icon: "🚰", name: "Drain Cleaning", desc: "Fast, no-mess clearing for any clogged drain." },
      { icon: "🔧", name: "Leak Repair", desc: "Stop drips and burst pipes before they cost more." },
      { icon: "🚿", name: "Water Heater Service", desc: "Repair, replace, and maintain — gas or electric." },
      { icon: "🚽", name: "Toilet Install & Repair", desc: "Flush problems for good with quality fixtures." },
      { icon: "🏚️", name: "Sewer Line Service", desc: "Camera inspection and trenchless repair." },
      { icon: "📞", name: "24/7 Emergency", desc: "Real plumbers on call when you need help fast." },
    ],
  },
  roofer: {
    bg: "#1f1f23",
    accent: "#ff8a3d",
    headline: (c) => `${c}'s Roofing Experts`,
    services: [
      { icon: "🏠", name: "Roof Replacement", desc: "Full tear-off and re-roof with quality shingles." },
      { icon: "🛠️", name: "Roof Repair", desc: "Patch leaks, missing shingles, and storm damage." },
      { icon: "🔍", name: "Free Inspection", desc: "Thorough roof check with photo report." },
      { icon: "💧", name: "Gutter Service", desc: "Clean, repair, and install seamless gutters." },
      { icon: "❄️", name: "Storm Damage", desc: "Insurance claim help and emergency tarping." },
      { icon: "🪵", name: "Skylights & Vents", desc: "Install, seal, and replace with no leaks." },
    ],
  },
  landscaper: {
    bg: "#11362a",
    accent: "#7ed957",
    headline: (c) => `${c}'s Premier Landscaping Team`,
    services: [
      { icon: "🌱", name: "Lawn Care", desc: "Mowing, edging, fertilization — weekly or monthly." },
      { icon: "🌳", name: "Tree & Shrub", desc: "Pruning, planting, and removal done right." },
      { icon: "🌷", name: "Garden Design", desc: "Custom beds and seasonal planting plans." },
      { icon: "💦", name: "Irrigation", desc: "Smart sprinkler systems that save water." },
      { icon: "🪨", name: "Hardscaping", desc: "Patios, walkways, and retaining walls." },
      { icon: "🍂", name: "Cleanups", desc: "Spring and fall cleanups, leaf removal." },
    ],
  },
  cleaner: {
    bg: "#0f1d3a",
    accent: "#7cc7ff",
    headline: (c) => `${c}'s Most Loved Cleaning Service`,
    services: [
      { icon: "🏡", name: "Home Cleaning", desc: "Recurring cleans tailored to your home." },
      { icon: "🪟", name: "Deep Cleaning", desc: "Top-to-bottom detail for move-ins or refreshes." },
      { icon: "🏢", name: "Office Cleaning", desc: "After-hours commercial service that shines." },
      { icon: "🚪", name: "Move In / Out", desc: "Get your deposit back with a spotless finish." },
      { icon: "🛁", name: "Bathroom Specialty", desc: "Sanitized, polished, fresh every time." },
      { icon: "✨", name: "Eco-Friendly", desc: "Safe products for kids, pets, and allergies." },
    ],
  },
  hvac: {
    bg: "#2a2f3a",
    accent: "#ffb84d",
    headline: (c) => `${c}'s Trusted HVAC Pros`,
    services: [
      { icon: "❄️", name: "AC Repair", desc: "Cool down fast — same-day service available." },
      { icon: "🔥", name: "Furnace Service", desc: "Heat that works when winter hits hardest." },
      { icon: "🌬️", name: "New Installs", desc: "High-efficiency systems sized for your home." },
      { icon: "🧰", name: "Maintenance Plans", desc: "Catch problems early, extend system life." },
      { icon: "🌡️", name: "Smart Thermostats", desc: "Save on bills with modern controls." },
      { icon: "🏠", name: "Indoor Air Quality", desc: "Filtration, humidifiers, duct cleaning." },
    ],
  },
};

const FALLBACK_THEME = {
  bg: "#1c2230",
  accent: "#5cc8ff",
  headline: (c: string) => `${c}'s Local Experts`,
  services: [
    { icon: "✅", name: "Quality Workmanship", desc: "Done right the first time, every time." },
    { icon: "📞", name: "Quick Response", desc: "We answer the phone and show up on time." },
    { icon: "💬", name: "Honest Pricing", desc: "Clear quotes, no hidden fees, no surprises." },
    { icon: "🛡️", name: "Licensed & Insured", desc: "Fully covered for your peace of mind." },
    { icon: "⭐", name: "5-Star Service", desc: "Locally loved, with reviews that prove it." },
    { icon: "🤝", name: "Satisfaction Guaranteed", desc: "If you're not happy, we make it right." },
  ],
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fakePhone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = 200 + (h % 700);
  const b = 100 + ((h >> 8) % 800);
  const c = 1000 + ((h >> 16) % 9000);
  return `(${a}) ${b}-${c}`;
}

function buildReviews(niche: string, city: string, name: string) {
  const k = niche || "service";
  const map: Record<string, string[]> = {
    plumber: [
      `Called ${name} on a Sunday with a burst pipe and they were here in under an hour. Saved my floors. — Jenna R., ${city}`,
      `Honest pricing and didn't try to upsell me. They just fixed the leak and explained everything. — Mark T., ${city}`,
      `Best plumber in ${city}. Cleaned up after themselves and the work has held up perfectly. — Lisa M.`,
    ],
    roofer: [
      `After the windstorm we had three roofers quote us. ${name} was the only crew that actually showed up on time. — Greg P., ${city}`,
      `They handled the insurance paperwork and finished the whole roof in two days. Spotless cleanup. — Megan K., ${city}`,
      `Five stars. Real craftsmanship and they stand behind their work years later. — Tom B.`,
    ],
    landscaper: [
      `Our yard looks like a magazine cover now. ${name} listened to what we wanted. — Sarah L., ${city}`,
      `Reliable every week, fair prices, and they treat the lawn like it's their own. — David W., ${city}`,
      `They redid our entire backyard hardscape and it's the envy of the neighborhood. — Karen H.`,
    ],
    cleaner: [
      `My house has never been this clean. They notice the little things. — Amanda F., ${city}`,
      `${name} is dependable, friendly, and uses safe products around our pets. — Brian C., ${city}`,
      `Move-out clean got us our full deposit back. Worth every penny. — Priya N.`,
    ],
    hvac: [
      `AC died in July. ${name} had a new unit installed the next morning. Lifesavers. — Carlos M., ${city}`,
      `They serviced our furnace and explained exactly what they did. No upsells. — Jessica D., ${city}`,
      `The maintenance plan paid for itself the first winter. Great team. — Alan S.`,
    ],
  };
  return (
    map[k] ?? [
      `${name} did fantastic work for us. Would hire again. — A. Customer, ${city}`,
      `Professional, on time, and fair pricing. Highly recommend. — B. Local, ${city}`,
      `Best in ${city}. Great communication from start to finish. — C. Resident`,
    ]
  );
}

function buildHtml(input: Input): string {
  const niche = (input.niche || "service").toLowerCase();
  const theme = NICHE_THEME[niche] ?? FALLBACK_THEME;
  const city = input.city || "your area";
  const state = input.state || "";
  const name = input.businessName;
  const reviewCount = input.reviewCount ?? 0;
  const rating = input.rating ?? 5.0;
  const phone = input.phone || fakePhone(name);
  const stars = "★".repeat(Math.round(rating)) + "☆".repeat(5 - Math.round(rating));
  const reviews = buildReviews(niche, city, name);
  const year = new Date().getFullYear();

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(name)} — ${escapeHtml(city)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;font-family:'Inter',system-ui,sans-serif;color:#1a1a1a;background:#fff;line-height:1.55}
h1,h2,h3{font-family:'Montserrat',sans-serif;margin:0 0 .5em;letter-spacing:-.01em}
img{max-width:100%}
a{color:inherit}
.preview-banner{background:#f5f1e8;color:#5a513e;padding:8px 16px;font-size:12px;text-align:center;border-bottom:1px solid #e8e2d0}
.hero{background:${theme.bg};color:#fff;padding:max(80px,10vh) 24px;min-height:80vh;display:flex;align-items:center;justify-content:center;text-align:center;position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 70% 30%, ${theme.accent}22 0%, transparent 60%);pointer-events:none}
.hero-inner{max-width:1100px;margin:0 auto;position:relative;width:100%}
.hero h1{font-size:clamp(40px,6vw,72px);font-weight:900;line-height:1.05;margin-bottom:18px}
.hero .tagline{font-size:clamp(18px,2.2vw,24px);font-weight:500;opacity:.9;margin-bottom:28px}
.hero .social{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.1);padding:10px 18px;border-radius:999px;margin-bottom:36px;font-size:15px}
.hero .stars{color:${theme.accent};font-size:18px;letter-spacing:2px}
.hero .ctas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-block;padding:16px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:16px;transition:transform .15s,box-shadow .15s;border:0;cursor:pointer;font-family:inherit}
.btn-primary{background:${theme.accent};color:#0a0a0a}
.btn-primary:hover{transform:translateY(-1px);box-shadow:0 10px 30px rgba(0,0,0,.25)}
.btn-secondary{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}
.btn-secondary:hover{background:rgba(255,255,255,.1)}
.section{padding:80px 24px;max-width:1100px;margin:0 auto}
.section h2{font-size:clamp(28px,4vw,40px);text-align:center;margin-bottom:12px}
.section .lede{text-align:center;color:#5a5a5a;font-size:17px;max-width:620px;margin:0 auto 48px}
.grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
@media(max-width:820px){.grid-3{grid-template-columns:1fr}}
.card{background:#fafafa;border:1px solid #ececec;border-radius:14px;padding:28px;transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-2px);box-shadow:0 14px 34px rgba(0,0,0,.06)}
.card .icon{font-size:34px;margin-bottom:14px}
.card h3{font-size:20px;margin-bottom:8px}
.card p{margin:0;color:#555;font-size:15px}
.why{background:#f7f5f0}
.pillar{text-align:center;padding:24px}
.pillar .icon{font-size:42px;margin-bottom:14px}
.pillar h3{font-size:22px}
.pillar p{color:#555;margin:0}
.review{background:#fff;border:1px solid #ececec;border-radius:14px;padding:26px}
.review .stars{color:${theme.accent};font-size:16px;letter-spacing:2px;margin-bottom:10px}
.review p{font-style:italic;color:#333;margin:0 0 12px;font-size:15.5px}
.review .name{color:#888;font-size:13px}
.about p{font-size:17px;color:#444;max-width:760px;margin:0 auto;text-align:center;line-height:1.7}
.contact{background:#0e0e10;color:#f3f1ea;padding:80px 24px}
.contact .inner{max-width:1000px;margin:0 auto}
.contact h2{color:#fff;text-align:center;margin-bottom:36px}
.contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:48px}
@media(max-width:820px){.contact-grid{grid-template-columns:1fr}}
.contact-info p{margin:8px 0;font-size:16px}
.contact-info strong{color:${theme.accent}}
.field{display:block;margin-bottom:14px}
.field label{display:block;font-size:13px;margin-bottom:6px;color:#bdb9ad;letter-spacing:.04em;text-transform:uppercase}
.field input,.field textarea{width:100%;padding:14px;background:#1a1a1d;border:1px solid #2a2a2f;border-radius:8px;color:#f3f1ea;font-family:inherit;font-size:15px;outline:none}
.field input:focus,.field textarea:focus{border-color:${theme.accent}}
.field textarea{resize:vertical;min-height:120px}
footer{background:#070708;color:#888;text-align:center;padding:30px 24px;font-size:14px}
footer .name{color:#fff;font-weight:600}
</style></head>
<body>
<div class="preview-banner">This is a free preview created for ${escapeHtml(name)} by Brad Hemminger — reply to the email to get started.</div>

<header class="hero">
  <div class="hero-inner">
    <h1>${escapeHtml(name)}</h1>
    <div class="tagline">${escapeHtml(theme.headline(city))}</div>
    <div class="social"><span class="stars">${stars}</span> <span><strong>${rating}</strong> from ${reviewCount} Google reviews in ${escapeHtml(city)}</span></div>
    <div class="ctas">
      <a href="#contact" class="btn btn-primary">Get a Free Quote</a>
      <a href="tel:${escapeHtml(phone.replace(/\D/g, ""))}" class="btn btn-secondary">📞 Call Now</a>
    </div>
  </div>
</header>

<section class="section">
  <h2>What We Do</h2>
  <p class="lede">Trusted ${escapeHtml(niche)} services for ${escapeHtml(city)} and the surrounding area.</p>
  <div class="grid-3">
    ${theme.services
      .map(
        (s) => `<div class="card"><div class="icon">${s.icon}</div><h3>${escapeHtml(s.name)}</h3><p>${escapeHtml(s.desc)}</p></div>`,
      )
      .join("")}
  </div>
</section>

<section class="why">
  <div class="section" style="padding-top:0;padding-bottom:0">
    <h2>Why ${escapeHtml(city)} Chooses Us</h2>
    <p class="lede">Three things we never compromise on.</p>
    <div class="grid-3">
      <div class="pillar"><div class="icon">🛡️</div><h3>Licensed &amp; Insured</h3><p>Fully licensed, bonded, and insured for your peace of mind.</p></div>
      <div class="pillar"><div class="icon">⏱️</div><h3>Years of Experience</h3><p>Decades of hands-on experience serving ${escapeHtml(city)} families and businesses.</p></div>
      <div class="pillar"><div class="icon">✅</div><h3>Satisfaction Guaranteed</h3><p>If you're not happy with the work, we make it right. Every time.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <h2>What Our Customers Say</h2>
  <p class="lede"><span style="color:${theme.accent};letter-spacing:2px">${stars}</span> &nbsp; <strong>${rating}</strong> average from ${reviewCount} verified reviews</p>
  <div class="grid-3">
    ${reviews
      .map((r) => {
        const dash = r.lastIndexOf("—");
        const quote = dash > 0 ? r.slice(0, dash).trim() : r;
        const who = dash > 0 ? r.slice(dash) : "";
        return `<div class="review"><div class="stars">★★★★★</div><p>"${escapeHtml(quote)}"</p><div class="name">${escapeHtml(who)}</div></div>`;
      })
      .join("")}
  </div>
</section>

<section class="section about">
  <h2>About ${escapeHtml(name)}</h2>
  <p>We're a locally owned ${escapeHtml(niche)} based right here in ${escapeHtml(city)}${state ? ", " + escapeHtml(state) : ""}. We've earned our reputation one customer at a time by showing up when we say we will, doing the job right the first time, and treating every home like our own. When you call us, you're calling neighbors — not a faceless chain.</p>
</section>

<section id="contact" class="contact">
  <div class="inner">
    <h2>Get in Touch</h2>
    <div class="contact-grid">
      <div class="contact-info">
        <p><strong>${escapeHtml(name)}</strong></p>
        <p>📍 ${escapeHtml(city)}${state ? ", " + escapeHtml(state) : ""}</p>
        <p>📞 <a href="tel:${escapeHtml(phone.replace(/\D/g, ""))}" style="color:${theme.accent};text-decoration:none">${escapeHtml(phone)}</a></p>
        <p style="margin-top:24px;color:#bdb9ad">Call, text, or fill out the form — we usually reply within an hour during business hours.</p>
      </div>
      <form onsubmit="event.preventDefault();alert('Thanks! In a real site this would send to your inbox.');">
        <div class="field"><label>Name</label><input type="text" required placeholder="Your name"/></div>
        <div class="field"><label>Phone</label><input type="tel" required placeholder="(555) 123-4567"/></div>
        <div class="field"><label>How can we help?</label><textarea required placeholder="Tell us about the job"></textarea></div>
        <button class="btn btn-primary" type="submit" style="width:100%">Request a Free Quote</button>
      </form>
    </div>
  </div>
</section>

<footer>
  <div><span class="name">${escapeHtml(name)}</span> &nbsp;·&nbsp; ${escapeHtml(city)}${state ? ", " + escapeHtml(state) : ""} &nbsp;·&nbsp; ${escapeHtml(phone)}</div>
  <div style="margin-top:8px">© ${year} ${escapeHtml(name)}. All rights reserved.</div>
</footer>
</body></html>`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const input = (await req.json()) as Input;
    if (!input?.businessName) throw new Error("businessName required");

    const html = buildHtml(input);
    const fileName = `${slugify(input.businessName)}-${Date.now()}-preview.html`;

    const { error: upErr } = await supabase.storage
      .from("mock-sites")
      .upload(fileName, new Blob([html], { type: "text/html" }), {
        upsert: true,
        contentType: "text/html",
        cacheControl: "public, max-age=3600",
      });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

    const { data: pub } = supabase.storage.from("mock-sites").getPublicUrl(fileName);
    const url = pub.publicUrl;

    let mockSiteId: string | null = null;
    if (input.leadId) {
      const { data: mockRow, error: mockErr } = await supabase
        .from("mock_sites")
        .insert({
          lead_id: input.leadId,
          preview_url: url,
          status: "generated",
          generated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (mockErr) console.error("mock_sites insert failed", mockErr);
      else mockSiteId = mockRow?.id ?? null;
    }

    return new Response(
      JSON.stringify({ success: true, url, mockSiteId, fileName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("generate-mock error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
