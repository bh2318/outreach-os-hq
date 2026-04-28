import { useEffect, useState } from "react";
import { TopBar } from "@/components/TopBar";
import { TabNav, type TabId } from "@/components/TabNav";
import { DashboardView } from "@/views/DashboardView";
import { CallsView } from "@/views/CallsView";
import { MocksView } from "@/views/MocksView";
import { RepliesView } from "@/views/RepliesView";
import { PipelineView } from "@/views/PipelineView";
import { ActivityView } from "@/views/ActivityView";
import { SettingsView } from "@/views/SettingsView";

const TAB_KEY = "outreach-os.tab";

const Index = () => {
  const [tab, setTab] = useState<TabId>(() => (localStorage.getItem(TAB_KEY) as TabId) || "dashboard");
  useEffect(() => { localStorage.setItem(TAB_KEY, tab); }, [tab]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar />
      <TabNav active={tab} onChange={setTab} />
      <main className="max-w-[1280px] mx-auto px-4 py-6">
        {tab === "dashboard" && <DashboardView />}
        {tab === "calls" && <CallsView />}
        {tab === "mocks" && <MocksView />}
        {tab === "replies" && <RepliesView />}
        {tab === "pipeline" && <PipelineView />}
        {tab === "activity" && <ActivityView />}
        {tab === "settings" && <SettingsView />}
      </main>
    </div>
  );
};

export default Index;
