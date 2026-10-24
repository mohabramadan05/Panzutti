import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/admin/loyalty")({ component: Loyalty });

function Loyalty() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["admin-tiers"], queryFn: async () => (await supabase.from("reward_tiers").select("*").order("points")).data ?? [] });
  const { data: ledger } = useQuery({ queryKey: ["admin-ledger"], queryFn: async () => (await supabase.from("points_ledger").select("*").order("created_at", { ascending: false }).limit(100)).data ?? [] });
  const upd = async (id: string, patch: { discount?: number; min_order?: number; is_active?: boolean }) => {
    const { error } = await supabase.from("reward_tiers").update(patch).eq("id", id);
    if (error) toast.error(errMsg(error)); else { refetch(); qc.invalidateQueries({ queryKey: ["tiers"] }); }
  };
  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Loyalty</h1>
      <p className="mt-2 text-muted-foreground">Customers earn 1 point per EGP of food & drink (after discounts, excluding delivery) when an order is marked Completed.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {data?.map((t) => (
          <div key={t.id} className="space-y-2 rounded-3xl bg-card p-5 ring-1 ring-border">
            <p className="font-display text-2xl text-primary">{t.points.toLocaleString()} pts</p>
            <label className="block text-sm">Discount (EGP)<Input type="number" defaultValue={t.discount} onBlur={(e) => upd(t.id, { discount: +e.target.value })} /></label>
            <label className="block text-sm">Min. order (EGP)<Input type="number" defaultValue={t.min_order} onBlur={(e) => upd(t.id, { min_order: +e.target.value })} /></label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={t.is_active} onCheckedChange={(v) => upd(t.id, { is_active: v })} />Active</label>
          </div>
        ))}
      </div>
      <h2 className="mt-10 text-2xl text-primary">Recent points activity</h2>
      <div className="mt-3 overflow-x-auto rounded-3xl bg-card ring-1 ring-border">
        <table className="w-full text-sm"><tbody>
          {ledger?.map((l) => <tr key={l.id} className="border-t border-border"><td className="p-3">{new Date(l.created_at).toLocaleString()}</td><td>{l.user_id.slice(0, 8)}</td><td>{l.reason}</td><td>{l.note}</td><td className="font-bold">{l.delta > 0 ? "+" : ""}{l.delta}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
