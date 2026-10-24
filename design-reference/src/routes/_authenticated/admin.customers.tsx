import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { egp, errMsg } from "@/lib/format";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/admin/customers")({ component: Customers });

function Customers() {
  const [q, setQ] = useState("");
  const { data, refetch } = useQuery({ queryKey: ["admin-customers"], queryFn: async () => { const { data, error } = await supabase.rpc("admin_customers"); if (error) throw error; return data; } });
  const rows = (data ?? []).filter((c) => [c.full_name, c.email, c.phone].join(" ").toLowerCase().includes(q.toLowerCase()));
  const adjust = async (id: string) => {
    const v = prompt("Points to add (use a minus sign to remove):");
    if (!v || isNaN(+v)) return;
    const note = prompt("Reason (shown to the customer):") ?? "";
    const { error } = await supabase.rpc("admin_adjust_points", { _user_id: id, _delta: Math.trunc(+v), _note: note });
    if (error) toast.error(errMsg(error)); else { toast.success("Points updated"); refetch(); }
  };
  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Customers</h1>
      <Input className="mt-4 max-w-sm" placeholder="Search name, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-4 overflow-x-auto rounded-3xl bg-card ring-1 ring-border">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground"><th className="p-3">Name</th><th>Contact</th><th>Joined</th><th>Orders</th><th>Spent</th><th>Points</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-3 font-bold">{c.full_name || "—"}</td><td>{c.email}<br />{c.phone}</td><td>{new Date(c.created_at).toLocaleDateString()}</td>
                <td>{c.orders_count}</td><td>{egp(c.total_spent)}</td><td className="font-bold">{c.points}</td>
                <td><button className="font-bold underline" onClick={() => adjust(c.id)}>Adjust points</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
