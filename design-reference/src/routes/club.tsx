import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { tiersQuery } from "@/lib/data";
import { egp } from "@/lib/format";
import { Mascot, PageShell } from "@/components/brand";

export const Route = createFileRoute("/club")({
  head: () => ({
    meta: [
      { title: "PANZUTTI Club — Earn points on every order" },
      { name: "description", content: "Earn 1 point for every EGP you spend. Redeem 1,000 points for EGP 100 off, 1,500 for EGP 150 off, or 2,000 for EGP 300 off." },
      { property: "og:title", content: "PANZUTTI Club" },
      { property: "og:description", content: "Every EGP you spend brings you closer to your next reward." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Club,
});

const reasonLabel: Record<string, string> = { earned: "Earned", redeemed: "Redeemed", reversal: "Reversed", redeem_refund: "Returned", adjustment: "Adjustment" };

function Club() {
  const { session } = useAuth();
  const { data: tiers } = useQuery(tiersQuery);
  const { data: balance } = useQuery({ queryKey: ["points", session?.user.id], enabled: !!session, queryFn: async () => (await supabase.rpc("my_points_balance")).data ?? 0 });
  const { data: ledger } = useQuery({
    queryKey: ["ledger", session?.user.id], enabled: !!session,
    queryFn: async () => (await supabase.from("points_ledger").select("*").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });
  const max = tiers?.length ? tiers[tiers.length - 1].points : 2000;
  const next = tiers?.find((t) => t.points > (balance ?? 0));
  const unlocked = [...(tiers ?? [])].reverse().find((t) => (balance ?? 0) >= t.points);

  return (
    <PageShell kicker="Loyalty" title="PANZUTTI Club">
      <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-[2rem] bg-brand-yellow p-8">
          <h2 className="text-3xl text-primary">EGP 1 = 1 point</h2>
          <p className="mt-2 text-lg">Every EGP you spend brings you closer to your next reward. Points land when your order is completed — delivery fees don't count.</p>
          {session ? (
            <div className="mt-8">
              <p className="font-display text-6xl text-primary">{(balance ?? 0).toLocaleString()}</p>
              <p className="font-bold">points</p>
              <div className="mt-6 h-4 overflow-hidden rounded-full bg-card">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, ((balance ?? 0) / max) * 100)}%` }} />
              </div>
              <div className="relative mt-2 h-6 text-xs font-bold">
                {tiers?.map((t) => <span key={t.id} className="absolute -translate-x-1/2" style={{ left: `${(t.points / max) * 100}%` }}>{t.points}</span>)}
              </div>
              <p className="mt-4 font-bold">
                {unlocked ? `🎉 You can redeem ${egp(unlocked.discount)} off at checkout!` : next ? `${(next.points - (balance ?? 0)).toLocaleString()} points to ${egp(next.discount)} off` : ""}
              </p>
            </div>
          ) : (
            <Link to="/auth" className="mt-8 inline-flex rounded-full bg-primary px-7 py-4 font-extrabold text-primary-foreground">Join free — create an account</Link>
          )}
        </div>
        <Mascot pose="celebrate" className="mx-auto h-64 w-auto" />
      </div>

      <h2 className="mb-4 mt-12 text-3xl text-primary">Rewards</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiers?.map((t) => (
          <div key={t.id} className={`rounded-3xl p-6 ring-1 ${(balance ?? 0) >= t.points ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border"}`}>
            <p className="font-display text-3xl">{t.points.toLocaleString()}</p>
            <p className="font-bold">points</p>
            <p className="mt-4 text-2xl font-extrabold">{egp(t.discount)} off</p>
            {Number(t.min_order) > 0 && <p className="text-sm opacity-80">Min. order {egp(t.min_order)}</p>}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-muted-foreground">One reward per order; rewards can't be combined. Points from cancelled or refunded orders are removed, and points used on a cancelled order are returned.</p>

      {session && (
        <>
          <h2 className="mb-4 mt-12 text-3xl text-primary">History</h2>
          {!ledger?.length ? <p className="text-muted-foreground">No points activity yet.</p> : (
            <ul className="divide-y divide-border rounded-3xl bg-card ring-1 ring-border">
              {ledger.map((l) => (
                <li key={l.id} className="flex justify-between p-4">
                  <span>{reasonLabel[l.reason] ?? l.reason}{l.note ? ` · ${l.note}` : ""} <span className="text-sm text-muted-foreground">· {new Date(l.created_at).toLocaleDateString()}</span></span>
                  <span className={`font-extrabold ${l.delta > 0 ? "text-primary" : "text-destructive"}`}>{l.delta > 0 ? "+" : ""}{l.delta}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PageShell>
  );
}
