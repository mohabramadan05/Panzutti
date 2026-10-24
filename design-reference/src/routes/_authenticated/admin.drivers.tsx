import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, UserRound, MapPin, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/data";
import { egp, errMsg, fmtDateTime, statusLabel, telLink } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Database, Json } from "@/integrations/supabase/types";

type Driver = Database["public"]["Tables"]["drivers"]["Row"];
export const Route = createFileRoute("/_authenticated/admin/drivers")({ component: AdminDrivers });

const ON_ROAD = ["driver_assigned", "picked_up", "out_for_delivery"] as const;

function AdminDrivers() {
  const [filter, setFilter] = useState<"all" | "available" | "busy" | "inactive">("all");
  const [edit, setEdit] = useState<Partial<Driver> | null>(null);
  const [historyFor, setHistoryFor] = useState<Driver | null>(null);
  const { data: drivers, refetch } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => (await supabase.from("drivers").select("*").order("is_active", { ascending: false }).order("full_name")).data ?? [],
  });
  const { data: active } = useQuery({
    queryKey: ["admin-driver-active"],
    refetchInterval: 15_000,
    queryFn: async () => (await supabase.from("orders").select("id,order_number,status,driver_id").in("status", [...ON_ROAD]).not("driver_id", "is", null)).data ?? [],
  });
  const busy = (id: string) => active?.filter((o) => o.driver_id === id) ?? [];

  const list = (drivers ?? []).filter((d) =>
    filter === "all" ? true : filter === "inactive" ? !d.is_active : filter === "busy" ? d.is_active && busy(d.id).length > 0 : d.is_active && d.is_available && busy(d.id).length === 0,
  );

  const quick = async (id: string, patch: Partial<Driver>) => {
    const { error } = await supabase.from("drivers").update(patch).eq("id", id);
    if (error) toast.error(errMsg(error)); else refetch();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-primary md:text-4xl">Delivery</h1>
        <button className="rounded-full bg-brand-red px-5 py-2 font-bold text-brand-cream" onClick={() => setEdit({ full_name: "", phone: "", is_active: true, is_available: true })}>Add delivery person</button>
      </div>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {(["all", "available", "busy", "inactive"] as const).map((k) => (
          <button key={k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold capitalize ring-1 ${filter === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>
            {k === "busy" ? "On a delivery" : k}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!list.length && <p className="text-muted-foreground">No delivery staff here yet.</p>}
        {list.map((d) => {
          const b = busy(d.id);
          return (
            <div key={d.id} className={`rounded-2xl bg-card p-4 ring-1 ring-border ${d.is_active ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-3">
                {d.photo_url ? <img src={d.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" /> : <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted"><UserRound className="h-6 w-6" /></span>}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg text-primary">{d.full_name}</p>
                  <a href={telLink(d.phone)} className="inline-flex items-center gap-1 text-sm font-bold"><Phone className="h-3.5 w-3.5" /> {d.phone}</a>
                  <p className="mt-1 text-xs">
                    {!d.is_active ? <span className="rounded-full bg-muted px-2 py-0.5 font-bold">Inactive</span>
                      : b.length ? <span className="rounded-full bg-brand-yellow px-2 py-0.5 font-bold">On delivery · {b.map((o) => o.order_number).join(", ")}</span>
                      : d.is_available ? <span className="rounded-full bg-primary px-2 py-0.5 font-bold text-primary-foreground">Available</span>
                      : <span className="rounded-full bg-muted px-2 py-0.5 font-bold">Off shift</span>}
                  </p>
                  {d.notes && <p className="mt-1 text-sm text-muted-foreground">{d.notes}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Added {fmtDateTime(d.created_at)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
                <label className="flex items-center gap-2"><Switch checked={d.is_active} onCheckedChange={(v) => quick(d.id, { is_active: v })} />Active</label>
                <label className="flex items-center gap-2"><Switch checked={d.is_available} disabled={!d.is_active} onCheckedChange={(v) => quick(d.id, { is_available: v })} />On shift</label>
                <button className="font-bold underline" onClick={() => setEdit(d)}>Edit</button>
                <button className="underline" onClick={() => setHistoryFor(d)}>History</button>
              </div>
            </div>
          );
        })}
      </div>

      <DeliveryAreas />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit delivery person" : "Add delivery person"}</DialogTitle></DialogHeader>
          {edit && <DriverForm d={edit} onDone={() => { setEdit(null); refetch(); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{historyFor?.full_name} — delivery history</DialogTitle></DialogHeader>
          {historyFor && <DriverHistory id={historyFor.id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DriverForm({ d, onDone }: { d: Partial<Driver>; onDone: () => void }) {
  const [f, setF] = useState<Partial<Driver>>(d);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.full_name?.trim()) return toast.error("Name is required");
    if ((f.phone ?? "").replace(/\D/g, "").length < 8) return toast.error("Enter a valid phone number");
    setBusy(true);
    const row = { full_name: f.full_name.trim(), phone: f.phone!.trim(), photo_url: f.photo_url || null, notes: f.notes?.trim() || null, is_active: f.is_active ?? true, is_available: f.is_available ?? true };
    const { error } = f.id ? await supabase.from("drivers").update(row).eq("id", f.id) : await supabase.from("drivers").insert(row);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Saved");
    onDone();
  };
  return (
    <div className="space-y-3">
      <div><Label>Full name</Label><Input value={f.full_name ?? ""} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
      <div><Label>Phone</Label><Input type="tel" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /><p className="mt-0.5 text-xs text-muted-foreground">Customers see this number while their order is with this person.</p></div>
      <div>
        <Label>Photo (optional)</Label>
        <div className="mt-1 flex items-center gap-3">
          {f.photo_url && <img src={f.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />}
          <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const url = await uploadMedia(file, "drivers"); setF((x) => ({ ...x, photo_url: url })); } catch (er) { toast.error(errMsg(er)); } }} />
          {f.photo_url && <button className="text-sm text-destructive" onClick={() => setF({ ...f, photo_url: null })}>Remove</button>}
        </div>
      </div>
      <div><Label>Notes (staff only)</Label><Textarea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
      <div className="flex gap-5 text-sm">
        <label className="flex items-center gap-2"><Switch checked={f.is_active ?? true} onCheckedChange={(v) => setF({ ...f, is_active: v })} />Active</label>
        <label className="flex items-center gap-2"><Switch checked={f.is_available ?? true} onCheckedChange={(v) => setF({ ...f, is_available: v })} />On shift</label>
      </div>
      <button disabled={busy} onClick={save} className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground">{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}

function DriverHistory({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["driver-history", id],
    queryFn: async () => (await supabase.from("driver_assignments").select("*, orders(order_number,status,address,total)").eq("driver_id", id).order("assigned_at", { ascending: false }).limit(100)).data ?? [],
  });
  if (isLoading) return <p>Loading…</p>;
  if (!data?.length) return <p className="text-muted-foreground">No deliveries yet.</p>;
  return (
    <ul className="space-y-2 text-sm">
      {data.map((a) => (
        <li key={a.id} className="rounded-xl bg-muted p-3">
          <div className="flex justify-between gap-2"><b>{a.orders?.order_number}</b><span>{statusLabel[a.orders?.status ?? ""] ?? a.orders?.status}</span></div>
          <p className="text-muted-foreground">Assigned {fmtDateTime(a.assigned_at)}{a.unassigned_at ? ` · removed ${fmtDateTime(a.unassigned_at)}${a.reason ? ` (${a.reason})` : ""}` : ""}</p>
          {a.orders?.address && <p>{a.orders.address}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Where we deliver, with one price, one minimum and one delivery time for every area. */
function DeliveryAreas() {
  const qc = useQueryClient();
  const { data: zones, refetch } = useQuery({
    queryKey: ["admin-zones"],
    queryFn: async () => (await supabase.from("delivery_zones").select("*").order("sort_order").order("name")).data ?? [],
  });
  const { data: cfg, refetch: refCfg } = useQuery({
    queryKey: ["admin-delivery-cfg"],
    queryFn: async () => {
      const { data } = await supabase.from("site_settings").select("key,value").in("key", ["delivery", "timing"]);
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, (r.value ?? {}) as Record<string, any>]));
      return { delivery: m.delivery ?? {}, timing: m.timing ?? {} };
    },
  });
  const [fee, setFee] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [minutes, setMinutes] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    const first = zones?.[0];
    setFee(String(cfg.delivery.fee ?? first?.fee ?? 0));
    setMinOrder(String(cfg.delivery.min_order ?? first?.min_order ?? 0));
    setMinutes(String(cfg.timing.delivery_minutes ?? 30));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const refresh = () => { refetch(); refCfg(); qc.invalidateQueries({ queryKey: ["zones"] }); qc.invalidateQueries({ queryKey: ["settings"] }); };
  const n = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  const saveShared = async () => {
    if (!cfg) return;
    setBusy(true);
    const f = n(fee), m = n(minOrder), t = Math.max(1, n(minutes));
    const now = new Date().toISOString();
    const r1 = await supabase.from("site_settings").upsert({ key: "delivery", value: { ...cfg.delivery, fee: f, min_order: m } as Json, updated_at: now });
    const r2 = await supabase.from("site_settings").upsert({ key: "timing", value: { ...cfg.timing, delivery_minutes: t } as Json, updated_at: now });
    // Same price for every area; areas use the shared delivery time.
    const r3 = await supabase.from("delivery_zones").update({ fee: f, min_order: m, eta_minutes: null }).not("id", "is", null);
    setBusy(false);
    const err = r1.error || r2.error || r3.error;
    if (err) return toast.error(errMsg(err));
    if (name.trim()) { await addArea(); toast.success("Delivery saved — customers can now choose delivery"); return; }
    if (!zones?.some((z) => z.is_active)) { toast.warning("Price saved, but customers can't choose delivery until you add at least one area below (e.g. Nasr City) and press Add area."); refresh(); return; }
    toast.success("Delivery price and time saved for all areas");
    refresh();
  };

  const addArea = async () => {
    const nm = name.trim();
    if (!nm) return;
    if (zones?.some((z) => z.name.trim().toLowerCase() === nm.toLowerCase())) return toast.error("That area is already on the list");
    const { error } = await supabase.from("delivery_zones").insert({ name: nm, fee: n(fee), min_order: n(minOrder), eta_minutes: null, is_active: true, sort_order: (zones?.length ?? 0) + 1 });
    if (error) return toast.error(errMsg(error));
    setName("");
    refresh();
  };

  const run = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) toast.error(errMsg(error)); refresh(); };
  const removeArea = async (id: string, nm: string) => {
    if (!confirm(`Remove ${nm} from delivery areas?`)) return;
    const { error } = await supabase.from("delivery_zones").delete().eq("id", id);
    if (error) {
      // Areas already used by orders or saved addresses are switched off instead of deleted.
      await run(supabase.from("delivery_zones").update({ is_active: false }).eq("id", id));
      toast.info(`${nm} has past orders, so it was switched off instead of deleted.`);
      return;
    }
    refresh();
  };

  const active = (zones ?? []).filter((z) => z.is_active).length;

  return (
    <section className="mt-12 rounded-3xl bg-card p-5 ring-1 ring-border md:p-6">
      <h2 className="flex items-center gap-2 text-2xl text-primary"><MapPin className="h-6 w-6" /> Delivery areas, price & time</h2>
      <p className="mt-1 text-sm text-muted-foreground">One delivery price and one delivery time for every area on the list. Customers pick their area at checkout.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="dl-fee">Delivery price (EGP)</Label><Input id="dl-fee" type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} /></div>
        <div><Label htmlFor="dl-min">Minimum order (EGP)</Label><Input id="dl-min" type="number" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /><p className="mt-0.5 text-xs text-muted-foreground">0 = no minimum</p></div>
        <div><Label htmlFor="dl-time">Delivery time (minutes)</Label><Input id="dl-time" type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} /><p className="mt-0.5 text-xs text-muted-foreground">Drive time, added after the kitchen time</p></div>
      </div>
      <button disabled={busy || !cfg} onClick={saveShared} className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save for all areas"}</button>

      <div className="mt-8">
        <h3 className="text-lg text-primary">Areas we deliver to <span className="text-sm font-normal text-muted-foreground">({active} active)</span></h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input className="max-w-xs" placeholder="e.g. Masr El Gedida" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} />
          <button onClick={addArea} className="rounded-full bg-brand-red px-5 py-2 text-sm font-bold text-brand-cream">Add area</button>
        </div>
        {!zones?.length ? (
          <p className="mt-4 rounded-xl bg-brand-red/10 p-3 text-sm font-bold text-brand-red">No delivery areas yet, so customers can't choose delivery. Type an area name above and press “Add area”.</p>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-2xl ring-1 ring-border">
            {zones.map((z) => (
              <li key={z.id} className={`flex flex-wrap items-center gap-3 p-3 ${z.is_active ? "" : "opacity-60"}`}>
                <Input className="h-9 max-w-xs flex-1" defaultValue={z.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== z.name) run(supabase.from("delivery_zones").update({ name: v }).eq("id", z.id)); }} />
                <span className="text-sm text-muted-foreground">{egp(z.fee)}{Number(z.min_order) > 0 ? ` · min ${egp(z.min_order)}` : ""}</span>
                <label className="ml-auto flex items-center gap-2 text-sm"><Switch checked={z.is_active} onCheckedChange={(v) => run(supabase.from("delivery_zones").update({ is_active: v }).eq("id", z.id))} />Active</label>
                <button onClick={() => removeArea(z.id, z.name)} aria-label={`Remove ${z.name}`} className="p-1 text-destructive"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        {zones?.some((z) => Number(z.fee) !== n(fee) || Number(z.min_order) !== n(minOrder) || z.eta_minutes != null) && (
          <p className="mt-3 text-sm text-brand-red">Some areas still have an old price or time. Press “Save for all areas” to make them all the same.</p>
        )}
      </div>
    </section>
  );
}
