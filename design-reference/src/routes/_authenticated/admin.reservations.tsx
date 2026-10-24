import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg, statusLabel } from "@/lib/format";
import { Input } from "@/components/ui/input";
import type { Database } from "@/integrations/supabase/types";

type RS = Database["public"]["Enums"]["reservation_status"];
const ST: RS[] = ["pending", "confirmed", "rejected", "cancelled", "completed", "no_show"];

export const Route = createFileRoute("/_authenticated/admin/reservations")({ component: AdminRes });

function AdminRes() {
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const { data, refetch } = useQuery({
    queryKey: ["admin-res", from],
    queryFn: async () => (await supabase.from("reservations").select("*").gte("reserved_date", from).order("reserved_date").order("reserved_time")).data ?? [],
  });
  const { data: preorders } = useQuery({
    queryKey: ["admin-preorders", from],
    queryFn: async () => (await supabase.from("orders").select("id,order_number,reservation_id,total,status").not("reservation_id", "is", null)).data ?? [],
  });
  const update = async (id: string, patch: Database["public"]["Tables"]["reservations"]["Update"]) => {
    const { error } = await supabase.from("reservations").update(patch).eq("id", id);
    if (error) return toast.error(errMsg(error));
    if (patch.status === "rejected" || patch.status === "cancelled") await supabase.from("orders").update({ status: "cancelled", cancel_reason: patch.status === "rejected" ? "Reservation was not accepted" : "Reservation was cancelled" }).eq("reservation_id", id).eq("status", "pending");
    toast.success("Updated"); refetch();
  };
  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Reservations</h1>
      <div className="mt-4 flex items-center gap-2"><span className="text-sm">From</span><Input type="date" className="w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="mt-6 space-y-3">
        {!data?.length && <p className="text-muted-foreground">No upcoming reservations.</p>}
        {data?.map((r) => {
          const po = preorders?.find((p) => p.reservation_id === r.id && p.status !== "cancelled");
          return (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div>
                <p className="font-bold">{r.reserved_date} · {r.reserved_time.slice(0, 5)} · {r.guests} guests</p>
                <p className="text-sm text-muted-foreground">{r.customer_name} · {r.phone}{r.notes && ` · “${r.notes}”`}</p>
                {po && <p className="text-sm font-bold text-brand-red">Pre-order {po.order_number}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="date" className="w-40" defaultValue={r.reserved_date} onBlur={(e) => e.target.value !== r.reserved_date && update(r.id, { reserved_date: e.target.value })} />
                <Input type="time" className="w-28" defaultValue={r.reserved_time.slice(0, 5)} onBlur={(e) => e.target.value !== r.reserved_time.slice(0, 5) && update(r.id, { reserved_time: e.target.value })} />
                <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value as RS })} className="rounded-md border border-input bg-background px-2 py-2 text-sm">
                  {ST.map((s) => <option key={s} value={s}>{s === "pending" ? "Pending" : statusLabel[s]}</option>)}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
