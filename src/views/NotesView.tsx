import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionLabel } from "@/components/SectionLabel";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Note = { id: string; content: string; created_at: string };

function useOperatorNotes() {
  return useQuery({
    queryKey: ["operator-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("operator_notes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NotesView() {
  const qc = useQueryClient();
  const { data, isLoading } = useOperatorNotes();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function save() {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("operator_notes").insert({ content });
      if (error) throw error;
      setDraft("");
      setOpen(false);
      toast.success("Note saved");
      qc.invalidateQueries({ queryKey: ["operator-notes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save note");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    try {
      const { error } = await supabase.from("operator_notes").delete().eq("id", id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["operator-notes"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete note");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>Notes — your personal scratchpad</SectionLabel>
        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium",
            "bg-primary text-primary-foreground hover:bg-primary-hover"
          )}
          onClick={() => setOpen(true)}
        >
          <Plus className="w-3.5 h-3.5" /> Add Note
        </button>
      </div>

      {open && (
        <div className="surface-card mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="label-uppercase">New note</div>
            <button
              onClick={() => { setOpen(false); setDraft(""); }}
              className="w-6 h-6 rounded-md inline-flex items-center justify-center text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Write anything — reminders, ideas, lead notes…"
            className="input-base w-full text-[13px]"
            style={{ resize: "vertical" }}
            autoFocus
          />
          <div className="flex justify-end mt-2 gap-2">
            <button className="btn-ghost" onClick={() => { setOpen(false); setDraft(""); }}>Cancel</button>
            <button
              onClick={save}
              disabled={saving || !draft.trim()}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-medium",
                "bg-primary text-primary-foreground hover:bg-primary-hover",
                "disabled:opacity-60 disabled:cursor-not-allowed"
              )}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}

      {isLoading ? null : !data?.length ? (
        <EmptyState>No notes yet. Tap Add Note to jot something down.</EmptyState>
      ) : (
        <div className="space-y-2">
          {data.map((n) => (
            <div key={n.id} className="surface-card flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">{n.content}</div>
                <div className="text-[10px] text-muted-foreground mt-2">{fmt(n.created_at)}</div>
              </div>
              <button
                onClick={() => remove(n.id)}
                disabled={busyId === n.id}
                className="text-muted-foreground hover:text-status-red-text transition-colors p-1.5 rounded-md hover:bg-secondary"
                aria-label="Delete note"
                title="Delete note"
              >
                {busyId === n.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
