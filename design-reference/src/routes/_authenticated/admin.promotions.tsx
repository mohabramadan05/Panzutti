import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { egp, errMsg } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/promotions")({ component: Promos });

function Promos() {
  const { data, refetch } = useQuery({ queryKey: ["admin-promos"], queryFn: async () => (await supabase.from("promotions").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [f, setF] = useState({ code: "", description: "", kind: "fixed", value: "", min_order: "", starts_at: "", ends_at: "", max_uses: "" });
  const create = async () => {
    if (!f.code.trim() || !(+f.value > 0)) return toast.error("Code and value are required");
    const { error } = await supabase.from("promotions").insert({
      code: f.code.trim().toUpperCase(), description: f.description || null, kind: f.kind, value: +f.value, min_order: +f.min_order || 0,
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null, ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null, max_uses: f.max_uses ? +f.max_uses : null,
    });
    if (error) return toast.error(errMsg(error));
    setF({ code: "", description: "", kind: "fixed", value: "", min_order: "", starts_at: "", ends_at: "", max_uses: "" }); refetch();
  };
  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Promotions</h1>
      <div className="mt-6 grid gap-3 rounded-3xl bg-card p-5 ring-1 ring-border sm:grid-cols-4">
        <Input placeholder="CODE" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <select className="rounded-md border border-input bg-background px-3" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="fixed">EGP off</option><option value="percent">% off</option></select>
        <Input type="number" placeholder="Value" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        <Input type="number" placeholder="Min order" value={f.min_order} onChange={(e) => setF({ ...f, min_order: e.target.value })} />
        <Input placeholder="Description" className="sm:col-span-2" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input type="datetime-local" title="Starts" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} />
        <Input type="datetime-local" title="Ends" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} />
        <Input type="number" placeholder="Max uses" value={f.max_uses} onChange={(e) => setF({ ...f, max_uses: e.target.value })} />
        <button onClick={create} className="rounded-full bg-primary py-2 font-bold text-primary-foreground sm:col-span-3">Create code</button>
      </div>
      <div className="mt-6 space-y-2">
        {data?.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-card p-4 ring-1 ring-border">
            <div><b className="font-display text-lg text-primary">{p.code}</b> — {p.kind === "percent" ? `${p.value}%` : egp(p.value)} off{Number(p.min_order) > 0 && ` · min ${egp(p.min_order)}`} <span className="text-sm text-muted-foreground">· used {p.uses}{p.max_uses ? `/${p.max_uses}` : ""}{p.ends_at && ` · ends ${new Date(p.ends_at).toLocaleDateString()}`}</span></div>
            <div className="flex items-center gap-3">
              <Switch checked={p.is_active} onCheckedChange={async (v) => { await supabase.from("promotions").update({ is_active: v }).eq("id", p.id); refetch(); }} />
              <button className="text-sm text-destructive" onClick={async () => { if (confirm("Delete this code?")) { await supabase.from("promotions").delete().eq("id", p.id); refetch(); } }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
