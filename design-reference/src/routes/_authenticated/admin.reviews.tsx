import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Trash2, Plus, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fulfillmentLabel } from "@/lib/format";
import { REVIEW_KINDS, SERVICE_KINDS, Stars, StarInput } from "@/lib/reviews";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PhotoPlaceholder } from "@/components/product-card";
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/admin/reviews")({ component: AdminReviews });

const PAGE = 25;
const SELECT_BASE = "*, products(id,name,slug,image_url), orders(id,order_number,fulfillment,tracking_token)";
const SELECT_INNER = "*, products(id,name,slug,image_url), orders!inner(id,order_number,fulfillment,tracking_token)";

type Filters = { kind: string; status: string; product: string; email: string; rating: string; from: string; to: string; order: string; fulfillment: string; q: string };
const EMPTY: Filters = { kind: "", status: "", product: "", email: "", rating: "", from: "", to: "", order: "", fulfillment: "", q: "" };

const fetchPage = async (f: Filters, page: number) => {
  const needsOrder = !!(f.order || f.fulfillment);
  let q = supabase.from("reviews").select(needsOrder ? SELECT_INNER : SELECT_BASE, { count: "exact" });
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status) q = q.eq("status", f.status);
  if (f.product) q = q.eq("product_id", f.product);
  if (f.email.trim()) q = q.ilike("customer_email", `%${f.email.trim()}%`);
  if (f.rating) q = q.eq("rating", Number(f.rating));
  if (f.from) q = q.gte("created_at", new Date(f.from + "T00:00:00").toISOString());
  if (f.to) q = q.lte("created_at", new Date(f.to + "T23:59:59").toISOString());
  if (f.order.trim()) q = q.ilike("orders.order_number", `%${f.order.trim()}%`);
  if (f.fulfillment) q = q.eq("orders.fulfillment", f.fulfillment as "delivery" | "pickup" | "dine_in");
  if (f.q.trim()) {
    const t = f.q.trim().replace(/[,()%]/g, " ");
    q = q.or(`body.ilike.%${t}%,title.ilike.%${t}%,customer_name.ilike.%${t}%,customer_email.ilike.%${t}%`);
  }
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) throw error;
  return { rows: (data ?? []) as unknown as Review[], count: count ?? 0 };
};

type Review = {
  id: string; kind: string; product_id: string | null; order_id: string | null; user_id: string | null;
  customer_email: string | null; customer_name: string | null; rating: number; title: string | null; body: string | null;
  source: string; verified_purchase: boolean; status: string; admin_note: string | null; admin_edited: boolean; edited_at: string | null; created_at: string;
  products: { id: string; name: string; slug: string; image_url: string | null } | null;
  orders: { id: string; order_number: string; fulfillment: string; tracking_token: string } | null;
};
type Stats = { kinds?: Record<string, { avg: number; count: number }>; total: number; product_avg: number | null; product_count: number; delivery_avg: number | null; delivery_count: number; time_avg: number | null; time_count: number; pending: number; published: number; hidden: number };

function AdminReviews() {
  const qc = useQueryClient();
  const [f, setF] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<Review | null>(null);
  const [edit, setEdit] = useState<Review | null>(null);
  const [adding, setAdding] = useState(false);

  // Text filters apply after a short pause; dropdowns apply straight away.
  useEffect(() => {
    const t = setTimeout(() => { setApplied(f); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [f]);

  const stats = useQuery({
    queryKey: ["admin-review-stats"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_review_stats");
      if (error) throw error;
      return data as unknown as Stats;
    },
  });
  const list = useQuery({ queryKey: ["admin-reviews", applied, page], queryFn: () => fetchPage(applied, page), placeholderData: (prev) => prev });
  const products = useQuery({
    queryKey: ["admin-products-lite"],
    queryFn: async () => (await supabase.from("products").select("id,name,image_url,slug").order("name")).data ?? [],
  });
  const settings = useQuery({
    queryKey: ["admin-review-settings"],
    queryFn: async () => ((await supabase.from("site_settings").select("value").eq("key", "reviews").maybeSingle()).data?.value ?? {}) as Record<string, any>,
  });

  const refresh = () => {
    list.refetch(); stats.refetch();
    qc.invalidateQueries({ queryKey: ["product-ratings"] });
    qc.invalidateQueries({ queryKey: ["review-summary"] });
    qc.invalidateQueries({ queryKey: ["product-reviews"] });
  };
  const setStatus = async (r: Review, status: string) => {
    const { error } = await supabase.from("reviews").update({ status }).eq("id", r.id);
    if (error) toast.error(errMsg(error)); else { toast.success(status === "published" ? "Published" : status === "hidden" ? "Hidden" : "Moved to pending"); refresh(); }
  };
  const remove = async (r: Review) => {
    if (!confirm("Delete this review permanently? Ratings update straight away.")) return;
    const { error } = await supabase.from("reviews").delete().eq("id", r.id);
    if (error) toast.error(errMsg(error)); else { toast.success("Deleted"); refresh(); }
  };
  const toggleAuto = async (v: boolean) => {
    const { error } = await supabase.from("site_settings").upsert({ key: "reviews", value: { ...(settings.data ?? {}), auto_publish: v } as Json, updated_at: new Date().toISOString() });
    if (error) toast.error(errMsg(error)); else settings.refetch();
  };

  const s = stats.data;
  const total = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const filtered = JSON.stringify(f) !== JSON.stringify(EMPTY);
  const set = (k: keyof Filters, v: string) => setF((x) => ({ ...x, [k]: v }));
  const sel = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl text-primary md:text-4xl">Reviews</h1>
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-full bg-brand-red px-5 py-2 font-bold text-brand-cream"><Plus className="h-4 w-4" /> Add Review</button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat l="Total reviews" v={s?.total ?? "—"} />
        {Object.keys(REVIEW_KINDS).map((k) => {
          const x = s?.kinds?.[k];
          return <Stat key={k} l={`${REVIEW_KINDS[k]} rating`} v={x ? `${Number(x.avg).toFixed(2)} ★` : "—"} sub={s ? `${x?.count ?? 0} published` : ""} onClick={() => set("kind", k)} />;
        })}
        <Stat l="Pending" v={s?.pending ?? "—"} onClick={() => set("status", "pending")} />
        <Stat l="Published" v={s?.published ?? "—"} onClick={() => set("status", "published")} />
        <Stat l="Hidden" v={s?.hidden ?? "—"} onClick={() => set("status", "hidden")} />
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <Switch checked={settings.data?.auto_publish !== false} onCheckedChange={toggleAuto} />
        Publish customer reviews automatically <span className="text-muted-foreground">(off = they wait as Pending until you publish them)</span>
      </label>

      {/* Filters */}
      <section className="mt-6 space-y-3 rounded-3xl bg-card p-4 ring-1 ring-border">
        <div className="flex flex-wrap gap-2">
          {[["", "All reviews"], ...Object.entries(REVIEW_KINDS)].map(([k, l]) => (
            <button key={k} onClick={() => set("kind", k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${f.kind === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>{l}</button>
          ))}
          <span className="mx-1 w-px bg-border" />
          {([["", "Any status"], ["pending", "Pending"], ["published", "Published"], ["hidden", "Hidden"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => set("status", k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${f.status === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>{l}</button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Search text, name or email" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <select className={sel} value={f.product} onChange={(e) => set("product", e.target.value)} aria-label="Product">
            <option value="">Any product</option>
            {products.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Input placeholder="Customer email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          <Input placeholder="Order number (e.g. PZ-1001)" value={f.order} onChange={(e) => set("order", e.target.value)} />
          <select className={sel} value={f.rating} onChange={(e) => set("rating", e.target.value)} aria-label="Stars">
            <option value="">Any stars</option>
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? "s" : ""}</option>)}
          </select>
          <select className={sel} value={f.fulfillment} onChange={(e) => set("fulfillment", e.target.value)} aria-label="Order type">
            <option value="">Any order type</option>
            <option value="delivery">Delivery</option><option value="pickup">Pickup</option><option value="dine_in">Dine-in</option>
          </select>
          <div className="flex items-center gap-1"><Label className="shrink-0 text-xs">From</Label><Input type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></div>
          <div className="flex items-center gap-1"><Label className="shrink-0 text-xs">To</Label><Input type="date" value={f.to} onChange={(e) => set("to", e.target.value)} /></div>
        </div>
        {filtered && <button onClick={() => setF(EMPTY)} className="text-sm font-bold text-brand-red underline">Clear filters</button>}
      </section>

      {/* Phones: one card per review */}
      <ul className="mt-4 space-y-3 md:hidden">
        {list.isLoading && <li className="p-4 text-center text-muted-foreground">Loading…</li>}
        {list.data && !list.data.rows.length && <li className="rounded-2xl bg-card p-4 text-center text-muted-foreground ring-1 ring-border">{filtered ? "No reviews match these filters." : "No reviews yet."}</li>}
        {list.data?.rows.map((r) => (
          <li key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold">{REVIEW_KINDS[r.kind]}{r.products ? ` · ${r.products.name}` : ""}</p>
                <p className="truncate text-xs text-muted-foreground">{r.customer_name || "—"} · {r.customer_email || "no email"}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "published" ? "bg-primary text-primary-foreground" : r.status === "hidden" ? "bg-muted" : "bg-brand-yellow"}`}>{r.status}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2"><Stars value={r.rating} /><span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span></div>
            {(r.title || r.body) && <p className="mt-2 line-clamp-3 text-sm">{r.title && <b>{r.title} </b>}{r.body}</p>}
            <div className="mt-1 flex flex-wrap gap-1">
              {r.orders && <span className="text-xs text-muted-foreground">{r.orders.order_number} · {fulfillmentLabel[r.orders.fulfillment]}</span>}
              {r.source === "admin" && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">Admin-created</span>}
              {r.admin_edited && <span className="rounded-full bg-brand-yellow/60 px-2 py-0.5 text-[10px] font-bold uppercase">Admin-edited</span>}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-xs font-bold">
              <button onClick={() => setView(r)} className="rounded-full py-2 ring-1 ring-border">View</button>
              {r.status === "published"
                ? <button onClick={() => setStatus(r, "hidden")} className="rounded-full py-2 ring-1 ring-border">Hide</button>
                : <button onClick={() => setStatus(r, "published")} className="rounded-full bg-primary py-2 text-primary-foreground">Publish</button>}
              <button onClick={() => setEdit(r)} className="rounded-full py-2 ring-1 ring-border">Edit</button>
              <button onClick={() => remove(r)} className="rounded-full py-2 text-destructive ring-1 ring-destructive/40">Delete</button>
            </div>
          </li>
        ))}
      </ul>

      {/* Table */}
      <div className="mt-4 hidden overflow-x-auto rounded-3xl bg-card ring-1 ring-border md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="p-3">Type</th><th>Customer</th><th>Product</th><th>Order</th><th>Rating</th><th className="w-[28%]">Review</th><th>Date</th><th>Status</th><th className="pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {list.error && <tr><td colSpan={9} className="p-6 text-center text-destructive">{errMsg(list.error)}</td></tr>}
            {list.data && !list.data.rows.length && <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">{filtered ? "No reviews match these filters." : "No reviews yet. They appear here when customers rate completed orders."}</td></tr>}
            {list.data?.rows.map((r) => (
              <tr key={r.id} className="border-t border-border align-top">
                <td className="p-3">
                  <span className="font-bold">{REVIEW_KINDS[r.kind]}</span>
                  {r.source === "admin" && <span className="mt-1 block w-fit rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">Admin-created</span>}
                  {r.admin_edited && <span className="mt-1 block w-fit rounded-full bg-brand-yellow/60 px-2 py-0.5 text-[10px] font-bold uppercase">Admin-edited</span>}
                </td>
                <td className="py-3"><span className="block">{r.customer_name || "—"}</span><span className="block text-xs text-muted-foreground">{r.customer_email || "no email (guest)"}</span></td>
                <td className="py-3">{r.products ? <Link to="/menu/$slug" params={{ slug: r.products.slug }} target="_blank" className="font-bold underline">{r.products.name}</Link> : "—"}</td>
                <td className="py-3">
                  {r.orders ? (
                    <Link to="/track/$token" params={{ token: r.orders.tracking_token }} target="_blank" className="inline-flex items-center gap-1 font-bold underline">{r.orders.order_number}<ExternalLink className="h-3 w-3" /></Link>
                  ) : "—"}
                  {r.orders && <span className="block text-xs text-muted-foreground">{fulfillmentLabel[r.orders.fulfillment]}</span>}
                </td>
                <td className="py-3"><Stars value={r.rating} /></td>
                <td className="py-3 pr-3">{r.title && <b className="block">{r.title}</b>}<span className="line-clamp-2">{r.body || <i className="text-muted-foreground">No text</i>}</span></td>
                <td className="whitespace-nowrap py-3 text-xs">{fmtDateTime(r.created_at)}</td>
                <td className="py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === "published" ? "bg-primary text-primary-foreground" : r.status === "hidden" ? "bg-muted" : "bg-brand-yellow"}`}>{r.status}</span></td>
                <td className="py-3 pr-3">
                  <div className="flex justify-end gap-1">
                    <IconBtn label="View" onClick={() => setView(r)}><Eye className="h-4 w-4" /></IconBtn>
                    {r.status === "published"
                      ? <IconBtn label="Hide" onClick={() => setStatus(r, "hidden")}><EyeOff className="h-4 w-4" /></IconBtn>
                      : <button onClick={() => setStatus(r, "published")} className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">Publish</button>}
                    <IconBtn label="Edit" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></IconBtn>
                    <IconBtn label="Delete" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{total} review{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="rounded-full px-3 py-1 font-bold ring-1 ring-border disabled:opacity-40">Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-full px-3 py-1 font-bold ring-1 ring-border disabled:opacity-40">Next</button>
        </div>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-lg">
          {view && (
            <>
              <DialogHeader>
                <DialogTitle>{REVIEW_KINDS[view.kind]} review{view.products ? ` — ${view.products.name}` : ""}</DialogTitle>
                <DialogDescription>{view.customer_name || "Guest"} · {view.customer_email || "no email"} · {fmtDateTime(view.created_at)}</DialogDescription>
              </DialogHeader>
              <Stars value={view.rating} />
              {view.title && <p className="font-bold">{view.title}</p>}
              <p className="whitespace-pre-line">{view.body || <i className="text-muted-foreground">No text</i>}</p>
              <div className="space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
                <p>Source: <b>{view.source === "admin" ? "Created by admin (not a verified customer review)" : view.verified_purchase ? "Customer · verified order" : "Customer"}</b></p>
                {view.admin_edited && <p>Edited by admin {fmtDateTime(view.edited_at)}</p>}
                {view.orders && <p>Order {view.orders.order_number} · {fulfillmentLabel[view.orders.fulfillment]}</p>}
                {view.admin_note && <p>Internal note: {view.admin_note}</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit || adding} onOpenChange={(o) => { if (!o) { setEdit(null); setAdding(false); } }}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          {(edit || adding) && <ReviewForm review={edit} products={products.data ?? []} onDone={() => { setEdit(null); setAdding(false); refresh(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ l, v, sub, onClick }: { l: string; v: string | number; sub?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C onClick={onClick} className="rounded-2xl bg-card p-4 text-left ring-1 ring-border">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{l}</p>
      <p className="mt-1 text-2xl font-extrabold text-primary">{v}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </C>
  );
}

const IconBtn = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} title={label} aria-label={label} className="rounded-full p-1.5 hover:bg-muted">{children}</button>
);

type ProductLite = { id: string; name: string; image_url: string | null; slug: string };
type OrderLite = { id: string; order_number: string; fulfillment: string; customer_name: string; user_id: string | null; order_items: { product_id: string | null; product_name: string }[] };

function toLocalInput(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function ReviewForm({ review, products, onDone }: { review: Review | null; products: ProductLite[]; onDone: () => void }) {
  const { session } = useAuth();
  const isEdit = !!review;
  const [email, setEmail] = useState(review?.customer_email ?? "");
  const [name, setName] = useState(review?.customer_name ?? "");
  const [kind, setKind] = useState(review?.kind ?? "product");
  const [productId, setProductId] = useState(review?.product_id ?? "");
  const [pSearch, setPSearch] = useState("");
  const [orderQ, setOrderQ] = useState(review?.orders?.order_number ?? "");
  const [order, setOrder] = useState<OrderLite | null>(null);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [title, setTitle] = useState(review?.title ?? "");
  const [body, setBody] = useState(review?.body ?? "");
  const [date, setDate] = useState(toLocalInput(review?.created_at ?? new Date().toISOString()));
  const [status, setStatus] = useState(review?.status ?? "published");
  const [note, setNote] = useState(review?.admin_note ?? "");
  const [busy, setBusy] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ["admin-customers-lite"],
    enabled: !isEdit,
    queryFn: async () => (await supabase.rpc("admin_customers")).data ?? [],
  });
  const match = customers?.find((c) => c.email?.toLowerCase() === email.trim().toLowerCase());
  useEffect(() => { if (match && !name) setName(match.full_name ?? ""); }, [match, name]);

  const { data: orderHits } = useQuery({
    queryKey: ["admin-order-search", orderQ],
    enabled: !isEdit && orderQ.trim().length >= 2 && !order,
    queryFn: async () => (await supabase.from("orders").select("id,order_number,fulfillment,customer_name,user_id,order_items(product_id,product_name)").ilike("order_number", `%${orderQ.trim()}%`).order("created_at", { ascending: false }).limit(8)).data ?? [],
  });

  const orderProducts = useMemo(() => new Set((order?.order_items ?? []).map((i) => i.product_id).filter(Boolean) as string[]), [order]);
  const visible = products
    .filter((p) => !order || kind !== "product" || orderProducts.has(p.id))
    .filter((p) => !pSearch.trim() || p.name.toLowerCase().includes(pSearch.trim().toLowerCase()));
  const chosen = products.find((p) => p.id === productId);

  const save = async () => {
    if (!isEdit && !/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error("Customer email is required");
    if (rating < 1) return toast.error("Choose a star rating");
    if (kind === "product" && !productId) return toast.error("Choose the product");
    if (kind !== "product" && order && !(SERVICE_KINDS[order.fulfillment] ?? []).includes(kind)) return toast.error(`“${REVIEW_KINDS[kind]}” doesn't apply to a ${fulfillmentLabel[order.fulfillment].toLowerCase()} order`);
    setBusy(true);
    const now = new Date().toISOString();
    const uid = session?.user.id ?? null;
    const common = { rating, title: title.trim() || null, body: body.trim() || null, status, admin_note: note.trim() || null, created_at: new Date(date).toISOString() };
    const { error } = isEdit
      ? await supabase.from("reviews").update({ ...common, customer_name: name.trim() || null, admin_edited: true, edited_by: uid, edited_at: now }).eq("id", review!.id)
      : await supabase.from("reviews").insert({
          ...common,
          kind,
          product_id: kind === "product" ? productId : null,
          order_id: order?.id ?? null,
          user_id: match?.id ?? order?.user_id ?? null,
          customer_email: email.trim().toLowerCase(),
          customer_name: name.trim() || order?.customer_name || null,
          source: "admin",
          verified_purchase: false,
          created_by: uid,
        });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success(isEdit ? "Review updated (marked as admin-edited)" : "Review added (marked as admin-created)");
    onDone();
  };

  const sel = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit review" : "Add review"}</DialogTitle>
        <DialogDescription>
          {isEdit ? "Changes are saved as an admin edit and shown that way in this panel." : "Saved as admin-created. It is never shown as a verified customer review."}
        </DialogDescription>
      </DialogHeader>

      {!isEdit && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Customer email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />{match && <p className="mt-0.5 text-xs text-primary">Matches a customer account</p>}</div>
            <div><Label>Customer name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          </div>
          <div><Label>Review type</Label>
            <select className={sel} value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(REVIEW_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label>Order {kind === "product" ? "(optional)" : "(recommended)"}</Label>
            {order ? (
              <div className="flex items-center justify-between rounded-xl bg-muted p-2 text-sm">
                <span><b>{order.order_number}</b> · {fulfillmentLabel[order.fulfillment]} · {order.customer_name}</span>
                <button className="text-xs underline" onClick={() => { setOrder(null); setOrderQ(""); }}>Change</button>
              </div>
            ) : (
              <>
                <Input placeholder="Type an order number" value={orderQ} onChange={(e) => setOrderQ(e.target.value)} />
                {orderHits && orderHits.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl ring-1 ring-border">
                    {orderHits.map((o) => (
                      <li key={o.id}><button className="w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setOrder(o as OrderLite); if (!name) setName(o.customer_name); }}><b>{o.order_number}</b> · {fulfillmentLabel[o.fulfillment]} · {o.customer_name}</button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          {kind === "product" && (
            <div>
              <Label>Product *{order && " (items in this order)"}</Label>
              {chosen && (
                <div className="mb-2 flex items-center gap-2 rounded-xl bg-muted p-2 text-sm">
                  {chosen.image_url ? <img src={chosen.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <PhotoPlaceholder className="h-10 w-10 rounded-lg" />}
                  <b>{chosen.name}</b>
                </div>
              )}
              <Input placeholder="Search products" value={pSearch} onChange={(e) => setPSearch(e.target.value)} />
              <ul className="mt-1 max-h-48 overflow-y-auto rounded-xl ring-1 ring-border">
                {visible.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => setProductId(p.id)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${productId === p.id ? "bg-primary/10 font-bold" : ""}`}>
                      {p.image_url ? <img src={p.image_url} alt="" className="h-8 w-8 rounded object-cover" /> : <PhotoPlaceholder className="h-8 w-8 rounded" />}
                      {p.name}
                    </button>
                  </li>
                ))}
                {!visible.length && <li className="px-3 py-2 text-sm text-muted-foreground">No products match.</li>}
              </ul>
            </div>
          )}
        </>
      )}
      {isEdit && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Customer name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Type</Label><p className="pt-2 text-sm">{REVIEW_KINDS[review!.kind]}{review!.products ? ` — ${review!.products.name}` : ""}</p></div>
        </div>
      )}

      <div><Label>Stars *</Label><StarInput label="Stars" value={rating} onChange={setRating} /></div>
      <div><Label>Title (optional)</Label><Input maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div><Label>Review text (optional)</Label><Textarea maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Review date</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label>Status</Label>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">Pending</option><option value="published">Published</option><option value="hidden">Hidden</option>
          </select>
        </div>
      </div>
      <div><Label>Internal note (never shown to customers)</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <button disabled={busy} onClick={save} className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : isEdit ? "Save changes" : "Add review"}</button>
    </div>
  );
}
