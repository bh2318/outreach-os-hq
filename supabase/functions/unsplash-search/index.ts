// unsplash-search
// Server-side proxy for the Unsplash Search API. Keeps UNSPLASH_ACCESS_KEY
// off the client. Returns up to 9 photos shaped for the Mock Studio.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Map common business niches to richer search phrases for better results.
function buildQuery(niche: string | null | undefined): string {
  const n = (niche || "").toLowerCase().trim();
  if (!n) return "small business storefront professional";
  const map: Record<string, string> = {
    roofing: "roofing contractor work",
    roofer: "roofing contractor work",
    restaurant: "restaurant interior dining atmosphere",
    cafe: "cafe interior coffee shop",
    coffee: "coffee shop interior",
    bakery: "bakery shop interior",
    salon: "hair salon interior modern",
    "hair salon": "hair salon interior modern",
    barber: "barbershop interior modern",
    spa: "day spa interior calming",
    landscaping: "landscaping garden lawn professional",
    landscaper: "landscaping garden lawn professional",
    dental: "dental office modern clean",
    dentist: "dental office modern clean",
    "auto repair": "auto repair shop mechanic",
    mechanic: "auto repair shop mechanic",
    plumbing: "plumbing professional work",
    plumber: "plumbing professional work",
    electrician: "electrician professional work",
    electrical: "electrician professional work",
    hvac: "hvac technician installation",
    cleaning: "cleaning service professional",
    construction: "construction site professional",
    contractor: "general contractor construction professional",
    fitness: "fitness gym interior modern",
    gym: "fitness gym interior modern",
    yoga: "yoga studio interior calm",
    pet: "pet grooming dog professional",
    "pet grooming": "pet grooming dog professional",
    veterinary: "veterinary clinic modern",
    law: "law office professional",
    lawyer: "law office professional",
    "real estate": "real estate modern home interior",
    realtor: "real estate modern home interior",
    photography: "professional photography studio",
    photographer: "professional photography studio",
    accounting: "accounting office professional",
    accountant: "accounting office professional",
  };
  for (const k of Object.keys(map)) {
    if (n.includes(k)) return map[k];
  }
  return `${n} business professional`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY");
    if (!ACCESS_KEY) {
      return new Response(JSON.stringify({ error: "UNSPLASH_ACCESS_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let niche = "";
    let query = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      niche = String(body.niche ?? "");
      query = String(body.query ?? "").trim();
    } else {
      const url = new URL(req.url);
      niche = url.searchParams.get("niche") ?? "";
      query = url.searchParams.get("query") ?? "";
    }

    const finalQuery = query || buildQuery(niche);
    const apiUrl =
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(finalQuery)}` +
      `&per_page=9&orientation=landscape&content_filter=high&client_id=${ACCESS_KEY}`;

    const r = await fetch(apiUrl, { headers: { "Accept-Version": "v1" } });
    if (!r.ok) {
      const t = await r.text();
      console.error("[unsplash-search] api error", r.status, t);
      return new Response(JSON.stringify({ error: "unsplash api error", status: r.status, detail: t }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await r.json();
    const images = (json.results ?? []).slice(0, 9).map((p: any) => ({
      id: p.id,
      url: p.urls?.regular,
      thumb: p.urls?.small,
      alt: p.alt_description ?? p.description ?? finalQuery,
      photographer: p.user?.name ?? "Unsplash photographer",
      profile_url: p.user?.links?.html ?? "https://unsplash.com",
    }));

    return new Response(JSON.stringify({ query: finalQuery, images }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[unsplash-search] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
