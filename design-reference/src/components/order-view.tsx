import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrackView } from "@/components/track-view";

/** Signed-in customers open orders by id; the live view itself is the same private tracking page guests get. */
export function OrderView({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["order-token", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("tracking_token").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (isLoading) return <p>Loading…</p>;
  if (!data) return <p>Order not found.</p>;
  return <TrackView token={data.tracking_token} />;
}
