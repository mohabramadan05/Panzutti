import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/brand";
import { errMsg } from "@/lib/format";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — PANZUTTI" },
      { name: "description", content: "Choose a new password for your PANZUTTI account." },
      { property: "og:title", content: "Reset password — PANZUTTI" },
      { property: "og:description", content: "Choose a new password." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  return (
    <PageShell title="New password">
      <form
        className="max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) return toast.error(errMsg(error));
          toast.success("Password updated");
          navigate({ to: "/account" });
        }}
      >
        <Input type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" />
        <button className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Save</button>
      </form>
    </PageShell>
  );
}
