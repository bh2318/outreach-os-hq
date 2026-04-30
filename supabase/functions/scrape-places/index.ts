// scrape-places
// Called by send-daily-outreach when the lead queue is empty.
// Searches Google Places for a niche+city query, scores every result,
// and upserts qualified leads into the leads table.
// Priority: no-website businesses always score highest.
// No-website + high reviews = best possible lead.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHAIN_NAMES = [
  "mcdonald", "subway", "starbucks", "walmart", "target", "home depot", "lowes",
  "cvs", "walgreens", "7-eleven", "dominos", "pizza hut", "burger king", "wendys",
  "taco bell", "kfc", "chipotle", "dunkin", "great clips", "sport clips",
  "anytime fitness", "planet fitness", "jiffy lube", "valvoline", "midas",
  "firestone", "autozone", "oreilly", "napa auto", "ace hardware", "dollar general",
  "dollar tree", "family dollar", "ross", "tj maxx", "marshalls", "old navy",
  "gap", "h&m", "forever 21", "best buy", "office depot", "staples",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_NAMES.some((chain) => lower.includes(chain));
}

type AddrComp = { long_name: string; short_name: string; types: string[] };

function pickComp(comps: AddrComp[] | undefined, type: string, short = false): string | null {
  if (!comps) return null;
  const c = comps.find((x) => x.types.includes(type));
  if (!c) return null;
  return short ? c.short_name : c.long_name;
}

async function getPageSpeedMobileScore(url: string, apiKey: string): Promise<number | null> {
  try {
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&key=${apiKey}`;
    const res = await fetch(psiUrl);
    if (!res.ok) return null;
    const j = await res.json();
    const score = j?.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") return null;
    return Math.round(score * 100);
  } catch {
    return null;
  }
}

function calculateScore(websiteUrl: string | null, pageSpeedScore: number | null, reviewCount: number, rating: number): number {
  if (!websiteUrl) {
    let score = 100;
    if (reviewCount >= 200) score += 75;
    else if (reviewCount >= 100) score += 50;
    else if (reviewCount >= 50) score += 30;
    if (rating >= 4.5) score += 25;
    else if (rating >= 4.0) score += 15;
    return score;
  }
  let score = 0;
  if (pageSpeedScore !== null) {
    if (pageSpeedScore < 30) score += 40;
    else if (pageSpeedScore < 50) score += 25;
  } else {
    score += 20;
  }
  return score;
}

function getTier(websiteUrl: string | null, score: number): number {
  if (!websiteUrl) return 1;
  if (score >= 40) return 2;
  if (score >= 20) return 3;
  return 4;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { niche, city } = await req.json();
    if (!niche || !city) {
      return new Response(JSON.stringify({ success: false, error: "niche and city are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!PLACES_KEY) throw new Error("GOOGLE_PLACES_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const query = encodeURIComponent(`${niche} in ${city}`);
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${PLACES_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.status && searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
      throw new Error(`Places search failed: ${searchData.status} ${searchData.error_message ?? ""}`);
    }
    const results = (searchData.results ?? []).slice(0, 20);

    const businesses: Array<Record<string, unknown>> = [];

    for (const r of results) {
      const placeId: string = r.place_id;

      if (isChain(r.name ?? "")) {
        console.log(`[scrape-places] Chain skipped: ${r.name}`);
        continue;
      }

      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("place_id", placeId)
        .maybeSingle();
      if (existing) {
        console.log(`[scrape-places] Duplicate skipped: ${r.name}`);
        continue;
      }

      const fields = "name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,address_components,place_id";
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${PLACES_KEY}`;
      const dRes = await fetch(detailsUrl);
      const dJson = await dRes.json();
      const d = dJson.result ?? {};

      const comps: AddrComp[] = d.address_components ?? [];
      const cityName = pickComp(comps, "locality") ?? pickComp(comps, "postal_town") ?? city;
      const stateName = pickComp(comps, "administrative_area_level_1", true);
      const countyName = pickComp(comps, "administrative_area_level_2");
      const websiteUrl: string | null = d.website ?? null;
      const reviewCount: number = typeof d.user_ratings_total === "number" ? d.user_ratings_total : (typeof r.user_ratings_total === "number" ? r.user_ratings_total : 0);
      const rating: number = typeof d.rating === "number" ? d.rating : (typeof r.rating === "number" ? r.rating : 0);
      const phone: string | null = d.formatted_phone_number ?? null;

      if (reviewCount < 5) {
        console.log(`[scrape-places] Too few reviews skipped: ${r.name} (${reviewCount} reviews)`);
        continue;
      }

      if (!phone && !websiteUrl) {
        console.log(`[scrape-places] No contact method skipped: ${r.name}`);
        continue;
      }

      let pageSpeedScore: number | null = null;
      if (websiteUrl) {
        pageSpeedScore = await getPageSpeedMobileScore(websiteUrl, PLACES_KEY);
      }

      const siteScore = calculateScore(websiteUrl, pageSpeedScore, reviewCount, rating);
      const tier = getTier(websiteUrl, siteScore);

      if (tier === 4) {
        console.log(`[scrape-places] Good website skipped: ${r.name} (score ${siteScore})`);
        continue;
      }

      const lead = {
        business_name: d.name ?? r.name,
        email: null as string | null,
        phone,
        address: d.formatted_address ?? r.formatted_address ?? null,
        city: cityName,
        state: stateName,
        county: countyName,
        website_url: websiteUrl,
        rating,
        review_count: reviewCount,
        place_id: placeId,
        status: "new",
        site_score: siteScore,
        niche,
        archived: false,
      };

      const { data: ins, error: insErr } = await supabase
        .from("leads")
        .insert(lead)
        .select("id")
        .single();

      if (insErr) {
        console.error("[scrape-places] insert failed", insErr);
        continue;
      }

      businesses.push({
        lead_id: ins?.id,
        place_id: placeId,
        business_name: lead.business_name,
        phone: lead.phone,
        rating,
        review_count: reviewCount,
        website_url: lead.website_url,
        has_website: !!lead.website_url,
        site_score: siteScore,
        tier,
        status: "new",
        city: lead.city,
        state: lead.state,
      });
    }

    const sorted = businesses.sort((a, b) => {
      const ta = a.tier as number;
      const tb = b.tier as number;
      if (ta !== tb) return ta - tb;
      if (ta === 1) return (b.review_count as number) - (a.review_count as number);
      return (b.site_score as number) - (a.site_score as number);
    });

    return new Response(JSON.stringify({ success: true, count: sorted.length, businesses: sorted }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[scrape-places] error", e);
    return new Response(JSON.stringify({ success: false, error: String(e instanceof Error ? e.message : e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
