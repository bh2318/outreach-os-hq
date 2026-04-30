// scrape-places
// Calls Google Places Text Search + Place Details for a category+city query.
// Scores every result. No-website businesses are always highest priority.
// Upserts into leads table keyed on place_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CHAIN_NAMES = [
  "mcdonald", "subway", "starbucks", "walmart", "target", "home depot", "lowe",
  "cvs", "walgreen", "7-eleven", "domino", "pizza hut", "burger king", "wendy",
  "taco bell", "kfc", "chipotle", "dunkin", "great clips", "sport clips",
  "anytime fitness", "planet fitness", "jiffy lube", "valvoline", "midas",
  "firestone", "autozone", "o'reilly", "napa auto", "ace hardware",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_NAMES.some((c) => lower.includes(c));
}

function isValidPhone(phone: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

async function getPageSpeedScore(url: string, apiKey: string): Promise<number | null> {
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

function calculateScore(hasWebsite: boolean, pageSpeedScore: number | null, reviewCount: number, rating: number): number {
  // No website businesses start at 100 — they are always the primary target
  if (!hasWebsite) {
    let score = 100;
    // Review count bonus — more reviews means more established business
    if (reviewCount >= 200) score += 75;
    else if (reviewCount >= 100) score += 50;
    else if (reviewCount >= 50) score += 30;
    // Rating bonus
    if (rating >= 4.5) score += 25;
    else if (rating >= 4.0) score += 15;
    return score;
  }
  // Has website — score based on how bad the website is
  let score = 0;
  if (pageSpeedScore !== null) {
    if (pageSpeedScore < 30) score += 40;
    else if (pageSpeedScore <= 50) score += 25;
  } else {
    score += 20; // unknown score treated as poor
  }
  return score;
}

function getTier(hasWebsite: boolean, reviewCount: number): number {
  if (!hasWebsite) {
    if (reviewCount >= 200) return 1;
    if (reviewCount >= 100) return 2;
    if (reviewCount >= 50) return 3;
    return 4;
  }
  return 5; // has website — lowest priority
}

type AddrComp = { long_name: string; short_name: string; types: string[] };

function pickComp(comps: AddrComp[] | undefined, type: string, short = false): string | null {
  if (!comps) return null;
  const c = comps.find((x) => x.types.includes(type));
  if (!c) return null;
  return short ? c.short_name : c.long_name;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { niche, city } = await req.json();
    if (!niche || !city) {
      return new Response(JSON.stringify({ success: false, error: "niche and city required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const PLACES_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!PLACES_KEY) throw new Error("GOOGLE_PLACES_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Text Search
    const query = encodeURIComponent(`${niche} in ${city}`);
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${PLACES_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status && searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
      throw new Error(`Places search failed: ${searchData.status}`);
    }

    const results = (searchData.results ?? []).slice(0, 20);
    console.log(`[scrape-places] "${niche} in ${city}" — ${results.length} results`);

    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const r of results) {
      const placeId: string = r.place_id;

      // Skip if already in database
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("place_id", placeId)
        .maybeSingle();
      if (existing) {
        skipped.push(`${r.name} — duplicate`);
        continue;
      }

      // Place Details
      const fields = "name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,address_components,place_id";
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${PLACES_KEY}`;
      const dRes = await fetch(detailsUrl);
      const dJson = await dRes.json();
      const d = dJson.result ?? {};

      const businessName: string = d.name ?? r.name ?? "";
      const phone: string | null = d.formatted_phone_number ?? null;
      const websiteUrl: string | null = d.website ?? null;
      const reviewCount: number = typeof d.user_ratings_total === "number" ? d.user_ratings_total : (r.user_ratings_total ?? 0);
      const rating: number = typeof d.rating === "number" ? d.rating : (r.rating ?? 0);
      const comps: AddrComp[] = d.address_components ?? [];
      const cityName = pickComp(comps, "locality") ?? pickComp(comps, "postal_town") ?? city;
      const stateName = pickComp(comps, "administrative_area_level_1", true) ?? "WA";
      const countyName = pickComp(comps, "administrative_area_level_2");

      // Skip chains
      if (isChain(businessName)) {
        skipped.push(`${businessName} — chain`);
        continue;
      }

      // Skip businesses with fewer than 5 reviews
      if (reviewCount < 5) {
        skipped.push(`${businessName} — insufficient reviews (${reviewCount})`);
        continue;
      }

      // Skip if no valid contact method
      const hasValidPhone = isValidPhone(phone);
      const hasWebsite = !!websiteUrl;
      if (!hasValidPhone && !hasWebsite) {
        skipped.push(`${businessName} — no contact method`);
        continue;
      }

      // Get PageSpeed score only for businesses with websites
      let pageSpeedScore: number | null = null;
      if (hasWebsite && websiteUrl) {
        pageSpeedScore = await getPageSpeedScore(websiteUrl, PLACES_KEY);
      }

      // Calculate score and tier
      const siteScore = calculateScore(hasWebsite, pageSpeedScore, reviewCount, rating);
      const tier = getTier(hasWebsite, reviewCount);

      // Skip businesses with websites that score below threshold
      // No-website businesses always qualify regardless
      if (hasWebsite && siteScore < 20) {
        skipped.push(`${businessName} — website too good (score ${siteScore})`);
        continue;
      }

      // Construct contact email
      let email: string | null = null;
      if (hasWebsite && websiteUrl) {
        try {
          const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
          const host = u.hostname.replace(/^www\./i, "");
          if (host && host.includes(".")) {
            email = `contact@${host}`;
          }
        } catch {
          email = null;
        }
      }

      const lead = {
        business_name: businessName,
        email,
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
        tier,
        niche,
        archived: false,
      };

      const { error: insErr } = await supabase.from("leads").insert(lead);
      if (insErr) {
        console.error(`[scrape-places] insert failed for ${businessName}:`, insErr);
        skipped.push(`${businessName} — insert error`);
      } else {
        inserted.push(`${businessName} — tier ${tier} — score ${siteScore} — ${hasWebsite ? "has website" : "NO WEBSITE"} — ${reviewCount} reviews`);
      }
    }

    console.log(`[scrape-places] inserted ${inserted.length}, skipped ${skipped.length}`);

    return new Response(JSON.stringify({
      success: true,
      inserted: inserted.length,
      skipped: skipped.length,
      businesses: inserted,
      skippedReasons: skipped,
    }), {
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
