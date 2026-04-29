// Tiny global tab navigation bus. Components dispatch a CustomEvent and the
// top-level Index page listens for it to switch tabs. Keeps state local in
// Index without needing a global store.

import type { TabId } from "@/components/TabNav";

export const TAB_NAV_EVENT = "outreach-os:nav-tab";

export function navigateTab(tab: TabId) {
  window.dispatchEvent(new CustomEvent<TabId>(TAB_NAV_EVENT, { detail: tab }));
}
