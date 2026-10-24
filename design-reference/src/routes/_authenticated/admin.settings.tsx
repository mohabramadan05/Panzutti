import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, uploadMedia } from "@/lib/data";
import { errMsg } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/settings")({ component: SettingsPage });

type S = Record<string, Record<string, any>>;

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-settings"], queryFn: async () => Object.fromEntries(((await supabase.from("site_settings").select("*")).data ?? []).map((r) => [r.key, r.value])) as S });
  const [s, setS] = useState<S>({});
  useEffect(() => { if (data) setS(data); }, [data]);
  const set = (k: string, f: string, v: unknown) => setS((x) => ({ ...x, [k]: { ...(x[k] ?? {}), [f]: v } }));
  const save = async (k: string) => {
    const { error } = await supabase.from("site_settings").upsert({ key: k, value: s[k] as Json, updated_at: new Date().toISOString() });
    if (error) toast.error(errMsg(error)); else { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["settings"] }); }
  };
  const txt = (k: string, f: string, label: string, area = false) => (
    <div><Label>{label}</Label>{area ? <Textarea value={s[k]?.[f] ?? ""} onChange={(e) => set(k, f, e.target.value)} /> : <Input value={s[k]?.[f] ?? ""} onChange={(e) => set(k, f, e.target.value)} />}</div>
  );
  const img = (k: string, f: string, label: string) => (
    <div><Label>{label}</Label><div className="flex items-center gap-3">{s[k]?.[f] && <img src={s[k][f]} alt="" className="h-14 w-20 rounded object-cover" />}
      <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { set(k, f, await uploadMedia(file, "site")); } catch (er) { toast.error(errMsg(er)); } }} />
      {s[k]?.[f] && <button className="text-sm text-destructive" onClick={() => set(k, f, "")}>Use default</button>}</div></div>
  );
  const tog = (k: string, f: string, label: string, def = true) => (
    <label className="flex items-center gap-2 text-sm"><Switch checked={s[k]?.[f] ?? def} onCheckedChange={(v) => set(k, f, v)} />{label}</label>
  );
  const num = (k: string, f: string, label: string, def: number, hint?: string) => (
    <div><Label>{label}</Label><Input type="number" min={0} value={s[k]?.[f] ?? def} onChange={(e) => set(k, f, Math.max(0, Math.round(Number(e.target.value) || 0)))} />{hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}</div>
  );
  const time = (k: string, f: string, label: string) => (
    <div><Label>{label}</Label><Input type="time" value={s[k]?.[f] ?? ""} onChange={(e) => set(k, f, e.target.value)} /></div>
  );
  const Card = ({ k, title, children }: { k: string; title: string; children: React.ReactNode }) => (
    <section className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-border"><h2 className="text-xl text-primary">{title}</h2>{children}<button onClick={() => save(k)} className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Save</button></section>
  );
  const faq: { q: string; a: string }[] = s.policies?.faq ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl text-primary md:text-4xl">Content & settings</h1>
      <div className="grid gap-6 xl:grid-cols-2">
        {Card({ k: "announcement", title: "Announcement bar", children: <>{tog("announcement", "enabled", "Show bar", false)}{txt("announcement", "text", "Text")}{txt("announcement", "link", "Link (optional)")}</> })}
        {Card({ k: "home", title: "Homepage", children: <>{txt("home", "hero_title", "Hero headline")}{txt("home", "hero_subtitle", "Hero text")}{img("home", "hero_image", "Hero photo")}{txt("home", "story_title", "Story title")}{txt("home", "story_body", "Story text", true)}{img("home", "story_image", "Story photo")}</> })}
        {Card({ k: "location", title: "Restaurant, location & contact", children: <>{txt("location", "name", "Restaurant name")}{txt("location", "address", "Address")}{txt("location", "map_url", "Google Maps link")}
          <div className="grid gap-2 sm:grid-cols-2">{txt("location", "lat", "Latitude (optional)")}{txt("location", "lng", "Longitude (optional)")}</div>
          <p className="text-xs text-muted-foreground">Customers get this address, phone and map link on their pickup and dine-in tracking pages. Coordinates make the map pin exact.</p>{txt("location", "phone", "Phone")}{txt("location", "whatsapp", "WhatsApp")}{txt("location", "email", "Email")}</> })}
        {Card({ k: "socials", title: "Social links", children: <>{txt("socials", "instagram", "Instagram URL")}{txt("socials", "facebook", "Facebook URL")}{txt("socials", "tiktok", "TikTok URL")}</> })}
        {Card({ k: "ordering", title: "Order types", children: <>{tog("ordering", "delivery_enabled", "Delivery on")}{tog("ordering", "pickup_enabled", "Pickup on")}{tog("ordering", "dine_in_enabled", "Dine-in ordering on")}
          <p className="text-sm text-muted-foreground">Payment is cash only. Online card payment turns on once a payment provider is connected.</p></> })}
        {Card({ k: "timing", title: "Ordering status & kitchen timing", children: <>
          {tog("timing", "orders_enabled", "Accept online orders")}
          {tog("timing", "temporarily_closed", "Temporarily closed (stops all new orders)", false)}
          {txt("timing", "closed_message", "Message shown while closed")}
          <div className="grid gap-2 sm:grid-cols-2">
            <div><Label>How to add up item times</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={s.timing?.calc_rule ?? "longest"} onChange={(e) => set("timing", "calc_rule", e.target.value)}>
                <option value="longest">Longest item + buffer (recommended)</option>
                <option value="sum">Add all items together + buffer</option>
              </select></div>
            {num("timing", "prep_buffer_minutes", "Kitchen buffer (min)", 5)}
            {num("timing", "per_extra_item_minutes", "Extra per additional item (min)", 1, "Only used with “longest item”")}
            {num("timing", "dispatch_buffer_minutes", "Dispatch buffer (min)", 5, "Packing and handing to the driver")}
            {num("timing", "delivery_minutes", "Standard delivery time (min)", 30, "Used when an area has no time of its own")}
          </div>
          <h3 className="pt-2 font-bold">Pickup scheduling</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {num("timing", "pickup_min_advance_minutes", "Minimum notice (min)", 0, "Earliest pickup is the larger of this and kitchen time")}
            {num("timing", "pickup_max_days", "Book up to (days ahead)", 2, "0 = today only")}
            {num("timing", "slot_minutes", "Pickup slot length (min)", 15)}
            {num("timing", "pickup_capacity_per_slot", "Max pickups per slot", 0, "0 = no limit")}
          </div>
          <h3 className="pt-2 font-bold">Service hours (optional, inside opening hours)</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {time("timing", "delivery_start", "Delivery from")}{time("timing", "delivery_end", "Delivery until")}
            {time("timing", "pickup_start", "Pickup from")}{time("timing", "pickup_end", "Pickup until")}
          </div>
          <p className="text-xs text-muted-foreground">Leave service hours empty to follow opening hours. Prep time per item is set in Menu.</p></> })}
        {Card({ k: "reservations", title: "Reservations", children: <>{tog("reservations", "enabled", "Accept bookings")}
          <div className="grid gap-2 sm:grid-cols-3">
            <div><Label>Seats per slot</Label><Input type="number" value={s.reservations?.capacity_per_slot ?? 20} onChange={(e) => set("reservations", "capacity_per_slot", +e.target.value)} /></div>
            <div><Label>Slot minutes</Label><Input type="number" value={s.reservations?.slot_minutes ?? 30} onChange={(e) => set("reservations", "slot_minutes", +e.target.value)} /></div>
            <div><Label>Max party</Label><Input type="number" value={s.reservations?.max_party ?? 10} onChange={(e) => set("reservations", "max_party", +e.target.value)} /></div>
          </div></> })}
        {Card({ k: "policies", title: "Policies & FAQ", children: <>{txt("policies", "terms", "Terms & conditions", true)}{txt("policies", "privacy", "Privacy policy", true)}{txt("policies", "delivery", "Delivery policy", true)}{txt("policies", "refunds", "Cancellations & refunds", true)}{txt("policies", "loyalty", "Club terms", true)}
          <Label>FAQ</Label>
          {faq.map((x, i) => (
            <div key={i} className="space-y-1 rounded-xl bg-muted p-2">
              <Input value={x.q} placeholder="Question" onChange={(e) => set("policies", "faq", faq.map((y, j) => (j === i ? { ...y, q: e.target.value } : y)))} />
              <Textarea value={x.a} placeholder="Answer" onChange={(e) => set("policies", "faq", faq.map((y, j) => (j === i ? { ...y, a: e.target.value } : y)))} />
              <button className="text-xs text-destructive" onClick={() => set("policies", "faq", faq.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button className="block text-sm font-bold underline" onClick={() => set("policies", "faq", [...faq, { q: "", a: "" }])}>+ Add question</button></> })}
        <Hours />
        <section className="space-y-2 rounded-3xl bg-card p-5 ring-1 ring-border">
          <h2 className="text-xl text-primary">Delivery areas</h2>
          <p className="text-sm text-muted-foreground">Areas, the delivery price and the delivery time are managed with the delivery staff.</p>
          <Link to="/admin/drivers" className="inline-block rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Open Delivery</Link>
        </section>
      </div>
    </div>
  );
}

function Hours() {
  const { data, refetch } = useQuery({ queryKey: ["admin-hours"], queryFn: async () => (await supabase.from("opening_hours").select("*").order("weekday")).data ?? [] });
  const qc = useQueryClient();
  const upd = async (w: number, patch: { open_time?: string; close_time?: string; is_closed?: boolean }) => { const { error } = await supabase.from("opening_hours").update(patch).eq("weekday", w); if (error) toast.error(errMsg(error)); refetch(); qc.invalidateQueries({ queryKey: ["hours"] }); };
  return (
    <section className="space-y-2 rounded-3xl bg-card p-5 ring-1 ring-border">
      <h2 className="text-xl text-primary">Opening hours (Cairo time)</h2>
      {data?.map((h) => (
        <div key={h.weekday} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-full font-bold sm:w-24">{DAYS[h.weekday]}</span>
          <Input type="time" className="w-28" defaultValue={h.open_time.slice(0, 5)} onBlur={(e) => upd(h.weekday, { open_time: e.target.value })} />
          <Input type="time" className="w-28" defaultValue={h.close_time.slice(0, 5)} onBlur={(e) => upd(h.weekday, { close_time: e.target.value })} />
          <label className="flex items-center gap-1"><Switch checked={h.is_closed} onCheckedChange={(v) => upd(h.weekday, { is_closed: v })} />Closed</label>
        </div>
      ))}
    </section>
  );
}

