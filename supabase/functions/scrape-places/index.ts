// scrape-places
// Calls Google Places (Text Search + Place Details) for a niche+city query,
// returns up to 10 real businesses, and upserts them into the leads table
// keyed on place_id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // 1) Text Search
    const query = encodeURIComponent(`${niche} in ${city}`);
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${PLACES_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.status && searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
      throw new Error(`Places search failed: ${searchData.status} ${searchData.error_message ?? ""}`);
    }
    const results = (searchData.results ?? []).slice(0, 10);
    console.log(`[scrape-places] query="${niche} in ${city}" returned ${results.length} results`);

    const businesses: Array<Record<string, unknown>> = [];

    for (const r of results) {
      const placeId: string = r.place_id;
      // 2) Place Details for phone, website, address components
      const fields = "name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,address_components,place_id";
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${PLACES_KEY}`;
      const dRes = await fetch(detailsUrl);
      const dJson = await dRes.json();
      const d = dJson.result ?? {};

      const comps: AddrComp[] = d.address_components ?? [];
      const cityName = pickComp(comps, "locality") ?? pickComp(comps, "postal_town") ?? city;
      const stateName = pickComp(comps, "administrative_area_level_1", true);
      const countyName = pickComp(comps, "administrative_area_level_2");

      const lead = {
        business_name: d.name ?? r.name,
        email: null as string | null,
        phone: d.formatted_phone_number ?? null,
        address: d.formatted_address ?? r.formatted_address ?? null,
        city: cityName,
        state: stateName,
        county: countyName,
        website_url: d.website ?? null,
        rating: typeof d.rating === "number" ? d.rating : (typeof r.rating === "number" ? r.rating : null),
        review_count: typeof d.user_ratings_total === "number" ? d.user_ratings_total : (typeof r.user_ratings_total === "number" ? r.user_ratings_total : null),
        place_id: placeId,
        status: "new",
        niche,
      };

      // Upsert by place_id
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("place_id", placeId)
        .maybeSingle();

      let leadId: string | null = existing?.id ?? null;
      let inserted = false;
      if (!existing) {
        const { data: ins, error: insErr } = await supabase
          .from("leads")
          .insert(lead)
          .select("id")
          .single();
        if (insErr) {
          console.error("[scrape-places] insert failed", insErr);
        } else {
          leadId = ins?.id ?? null;
          inserted = true;
        }
      }

      businesses.push({
        lead_id: leadId,
        place_id: placeId,
        business_name: lead.business_name,
        phone: lead.phone,
        rating: lead.rating,
        review_count: lead.review_count,
        website_url: lead.website_url,
        has_website: !!lead.website_url,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        inserted,
      });
    }

    return new Response(JSON.stringify({ success: true, count: businesses.length, businesses }), {
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
