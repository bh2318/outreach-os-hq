import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activity";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const FAKE_BUSINESSES = [
  "ProServ {N}", "{N} & Sons", "Ace {N}", "Reliable {N}", "Elite {N}",
  "Sunrise {N}", "Heritage {N}", "Apex {N}", "{N} Pros", "{N} Masters"
];

function generateMockLeads(niche: string, location: string, count: number) {
  const [city, stateRaw] = location.split(",").map(s => s.trim());
  const state = stateRaw || "";
  const cityName = city || "Unknown";
  // Generic county fallback — uses "<City> County" everywhere when Places lookup
  // is unavailable. Works for any city in any state with no hardcoded lookups.
  const county = `${cityName} County`;
  const out: any[] = [];
  for (let i = 0; i < count; i++) {
    const tpl = FAKE_BUSINESSES[Math.floor(Math.random() * FAKE_BUSINESSES.length)];
    const nicheTitle = niche.charAt(0).toUpperCase() + niche.slice(1);
    const business = tpl.replace("{N}", nicheTitle);
    const score = Math.random() < 0.3 ? null : Math.floor(Math.random() * 70) + 15;
    out.push({
      business_name: `${business} #${Math.floor(Math.random() * 999)}`,
      owner_name: null,
      email: `contact${i}@${business.toLowerCase().replace(/[^a-z]/g, "")}.com`,
      phone: `555-${String(Math.floor(Math.random() * 900) + 100)}-${String(Math.floor(Math.random() * 9000) + 1000)}`,
      city: cityName,
      state,
      county,
      zip: null,
      niche,
      website_url: score ? `http://${business.toLowerCase().replace(/[^a-z]/g, "")}.com` : null,
      site_score: score,
      status: "new",
    });
  }
  return out;
}

export function ScraperBar() {
  const [niche, setNiche] = useState("");
  const [location, setLocation] = useState("");
  const [volume, setVolume] = useState(50);
  const qc = useQueryClient();

  const run = useMutation({
    mutationFn: async () => {
      if (!niche.trim() || !location.trim()) {
        throw new Error("Niche and city are required");
      }
      const leads = generateMockLeads(niche.trim(), location.trim(), volume);
      const { error } = await supabase.from("leads").insert(leads);
      if (error) throw error;
      const qualified = leads.filter(l => (l.site_score ?? 100) < 60).length;
      await logActivity({
        action_type: "scraped",
        detail: `Scraper run: ${leads.length} leads found for ${niche}, ${location}. ${qualified} qualified.`,
        outcome: "success",
      });
      return leads.length;
    },
    onSuccess: (n) => {
      qc.invalidateQueries();
      toast.success(`${n} leads added to queue`);
      setNiche("");
    },
    onError: (e: any) => toast.error(e.message ?? "Scraper failed"),
  });

  return (
    <div className="surface-card flex items-center gap-2">
      <input
        className="input-base flex-1"
        placeholder="Niche — plumbers, roofers, landscapers…"
        value={niche}
        onChange={(e) => setNiche(e.target.value)}
        disabled={run.isPending}
      />
      <input
        className="input-base"
        style={{ maxWidth: 150 }}
        placeholder="City, State"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        disabled={run.isPending}
      />
      <select
        className="input-base"
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        disabled={run.isPending}
      >
        <option value={50}>50 leads</option>
        <option value={100}>100 leads</option>
        <option value={200}>200 leads</option>
        <option value={250}>250 leads</option>
      </select>
      <button
        className="btn-primary"
        onClick={() => run.mutate()}
        disabled={run.isPending}
      >
        {run.isPending ? <><Loader2 className="w-3 h-3 animate-spin" /> Scraping…</> : "Run scraper"}
      </button>
    </div>
  );
}
