import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { settingsQuery } from "@/lib/data";
import { errMsg } from "@/lib/format";
import { PageShell, SignInPrompt } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import interior from "@/assets/interior.jpg.asset.json";

export const Route = createFileRoute("/reservations")({
  head: () => ({
    meta: [
      { title: "Book a table — PANZUTTI Heliopolis" },
      { name: "description", content: "Reserve a table at PANZUTTI, Meraki Complex, Heliopolis — and pre-order your food so it's ready when you arrive." },
      { property: "og:title", content: "Book a table at PANZUTTI" },
      { property: "og:description", content: "Reserve and pre-order at Meraki Complex, Heliopolis." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Reservations,
});

const todayCairo = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

function Reservations() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { data: settings } = useQuery(settingsQuery);
  const cfg = settings?.reservations ?? {};
  const [date, setDate] = useState(todayCairo());
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState(2);
  const [f, setF] = useState({ name: "", phone: "", notes: "" });
  const [preorder, setPreorder] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: slots, refetch } = useQuery({
    queryKey: ["slots", date],
    queryFn: async () => (await supabase.rpc("slot_availability", { _date: date })).data ?? [],
  });
  const { data: profile } = useQuery({ queryKey: ["profile", session?.user.id], enabled: !!session, queryFn: async () => (await supabase.from("profiles").select("*").eq("id", session!.user.id).maybeSingle()).data });
  useEffect(() => { if (profile) setF((x) => ({ ...x, name: x.name || profile.full_name || "", phone: x.phone || profile.phone || "" })); }, [profile]);

  const submit = async () => {
    if (!time) return toast.error("Choose a time");
    setBusy(true);
    const { data, error } = await supabase.rpc("create_reservation", { _date: date, _time: time, _guests: guests, _name: f.name, _phone: f.phone, _notes: f.notes });
    setBusy(false);
    if (error) { refetch(); return toast.error(errMsg(error)); }
    toast.success("Request sent! We'll confirm your table shortly.");
    if (preorder) {
      sessionStorage.setItem("pz-reservation", data as string);
      toast.info("Now add your food to the cart and check out — it will be linked to your table.", { duration: 8000 });
      navigate({ to: "/menu" });
    } else navigate({ to: "/account" });
  };

  return (
    <PageShell kicker="Dine-in" title="Book a table">
      <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          {cfg.enabled === false && <p className="rounded-2xl bg-card p-4 font-bold">Online reservations are currently closed.</p>}
          <section className="rounded-3xl bg-card p-6 ring-1 ring-border">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Date</Label><Input type="date" min={todayCairo()} value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }} /></div>
              <div><Label>Guests</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={guests} onChange={(e) => setGuests(+e.target.value)}>
                  {Array.from({ length: cfg.max_party ?? 10 }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <p className="mb-2 mt-6 font-bold">Available times</p>
            {!slots?.length ? <p className="text-muted-foreground">We're closed on this day.</p> : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => {
                  const full = s.booked + guests > s.capacity;
                  const past = new Date(`${date}T${s.slot}+03:00`).getTime() < Date.now() + 30 * 60e3;
                  const t = s.slot.slice(0, 5);
                  return (
                    <button key={s.slot} disabled={full || past} onClick={() => setTime(s.slot)} className={`rounded-full px-4 py-2 text-sm font-bold ring-1 disabled:opacity-30 ${time === s.slot ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>{t}</button>
                  );
                })}
              </div>
            )}
          </section>
          {session ? (
            <section className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-border">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
                <div><Label>Mobile</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
              </div>
              <div><Label>Notes (occasion, seating)</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={300} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <button onClick={() => setPreorder(false)} className={`rounded-2xl p-4 text-left ring-1 ${!preorder ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}><b>Table only</b><br /><span className="text-sm opacity-80">Order when you arrive</span></button>
                <button onClick={() => setPreorder(true)} className={`rounded-2xl p-4 text-left ring-1 ${preorder ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}><b>Table + pre-order</b><br /><span className="text-sm opacity-80">Food ready on arrival · pay at the restaurant</span></button>
              </div>
              <button disabled={busy || cfg.enabled === false} onClick={submit} className="w-full rounded-full bg-brand-red py-4 font-extrabold text-brand-cream disabled:opacity-50">{busy ? "Sending…" : "Request booking"}</button>
              <p className="text-sm text-muted-foreground">Your booking is <b>pending</b> until the restaurant confirms it. You'll see the status in your account.</p>
            </section>
          ) : <SignInPrompt text="Sign in to book a table and pre-order." />}
        </div>
        <img src={interior.url} alt="Inside PANZUTTI" className="hidden aspect-[3/4] w-full rounded-[2rem] object-cover lg:block" />
      </div>
    </PageShell>
  );
}
