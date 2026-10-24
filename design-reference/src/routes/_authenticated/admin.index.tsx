import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { egp, fulfillmentLabel, statusLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: Dashboard });

function Dashboard() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const { data: orders } = useQuery({
    queryKey: ["admin-dash"],
    queryFn: async () => (await supabase.from("orders").select("id,order_number,fulfillment,status,total,created_at,customer_name").gte("created_at", since).order("created_at", { ascending: false })).data ?? [],
    refetchInterval: 30000,
  });
  const today = new Date().toDateString();
  const valid = (orders ?? []).filter((o) => !["cancelled", "refunded"].includes(o.status));
  const todays = valid.filter((o) => new Date(o.created_at).toDateString() === today);
  const sales = todays.reduce((s, o) => s + Number(o.total), 0);
  const avg = valid.length ? valid.reduce((s, o) => s + Number(o.total), 0) / valid.length : 0;
  const types = (["delivery", "pickup", "dine_in"] as const).map((t) => ({ t, n: valid.filter((o) => o.fulfillment === t).length }));
  const tot = types.reduce((s, x) => s + x.n, 0) || 1;
  const colors = ["var(--brand-green)", "var(--brand-yellow)", "var(--brand-red)"];
  let acc = 0;
  const grad = types.map((x, i) => { const a = acc; acc += (x.n / tot) * 360; return `${colors[i]} ${a}deg ${acc}deg`; }).join(",");
  const open = valid.filter((o) => !["completed"].includes(o.status)).length;

  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Last 30 days</p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat l="Orders today" v={String(todays.length)} />
        <Stat l="Sales today" v={egp(sales)} />
        <Stat l="Avg. order value" v={egp(Math.round(avg))} />
        <Stat l="Open orders" v={String(open)} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="rounded-3xl bg-card p-6 ring-1 ring-border">
          <h2 className="text-xl text-primary">Orders by type</h2>
          <div className="mx-auto mt-4 h-40 w-40 rounded-full" style={{ background: valid.length ? `conic-gradient(${grad})` : "var(--muted)" }}>
            <div className="m-auto h-full w-full scale-50 rounded-full bg-card" />
          </div>
          <ul className="mt-4 space-y-1 text-sm">
            {types.map((x, i) => <li key={x.t} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: colors[i] }} />{fulfillmentLabel[x.t]}</span><b>{Math.round((x.n / tot) * 100)}%</b></li>)}
          </ul>
        </div>
        <div className="rounded-3xl bg-card p-6 ring-1 ring-border">
          <div className="flex items-center justify-between gap-2"><h2 className="text-xl text-primary">Recent orders</h2><Link to="/admin/orders" className="text-sm font-bold underline">All orders</Link></div>
          {!orders?.length ? <p className="mt-4 text-muted-foreground">No orders yet.</p> : (
            <table className="mt-4 w-full text-sm">
              <tbody>
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-2 font-bold">{o.order_number}<span className="block text-xs font-normal text-muted-foreground sm:hidden">{fulfillmentLabel[o.fulfillment]}</span></td><td className="hidden sm:table-cell">{o.customer_name}</td><td className="hidden sm:table-cell">{fulfillmentLabel[o.fulfillment]}</td><td className="whitespace-nowrap">{egp(o.total)}</td>
                    <td><span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">{statusLabel[o.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const Stat = ({ l, v }: { l: string; v: string }) => (
  <div className="min-w-0 rounded-3xl bg-card p-4 ring-1 ring-border md:p-5"><p className="text-sm text-muted-foreground">{l}</p><p className="mt-1 truncate font-display text-2xl text-primary md:text-3xl">{v}</p></div>
);
