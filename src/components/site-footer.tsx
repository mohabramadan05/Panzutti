import Link from "next/link";
import { Instagram, Facebook, MapPin, Phone, Mail, Clock } from "lucide-react";
import { Logo } from "./brand";
import { brand } from "@/lib/brand";
import { getMenuData } from "@/lib/data";
import { getDictionary, type Locale } from "@/lib/i18n";
import { telHref, timeLabel } from "@/lib/format";

function TikTok({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.27 0 .53.04.78.12V9.75a5.7 5.7 0 1 0 4.92 5.65V9.01a7.3 7.3 0 0 0 4.27 1.37V7.3a4.3 4.3 0 0 1-3.17-1.48Z" />
    </svg>
  );
}

/**
 * Takes only `locale` and loads its own data on purpose. In dev, React also serializes server
 * component props for debugging; passing the shared dictionary/branch objects here while pages pass
 * pieces of the same objects to client components made dev HTML responses hang forever
 * (cart, order and item pages never loaded under `npm run dev`).
 */
export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const { branch } = await getMenuData();
  const year = new Date().getFullYear();
  return (
    <footer className="relative bg-brand-green-dark text-brand-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <Logo variant="cream" className="h-14" />
          <p className="mt-4 max-w-xs text-brand-cream/80">{t.meta.description}</p>
          <p className="mt-3 font-script text-2xl text-brand-yellow">{t.footer.tagline}</p>
        </div>

        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">{t.nav.visit}</h3>
          <ul className="space-y-2 text-sm text-brand-cream/85">
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a href={brand.mapsUrl} target="_blank" rel="noreferrer" className="hover:underline">{locale === "ar" ? branch.address_ar : branch.address_en}</a></li>
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a href={telHref(branch.phone)} dir="ltr" className="hover:underline">{branch.phone.replace("+20", "0")}</a></li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><a href={`mailto:${brand.email}`} className="hover:underline">{brand.email}</a></li>
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t.visit.daily} {timeLabel(branch.opens_at, locale)} – {timeLabel(branch.closes_at, locale)}</li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">Panzutti</h3>
          <ul className="space-y-2 text-sm text-brand-cream/85">
            <li><Link href={`/${locale}/menu`} className="hover:underline">{t.nav.menu}</Link></li>
            <li><Link href={`/${locale}/reserve`} className="hover:underline">{t.nav.reserve}</Link></li>
            <li><Link href={`/${locale}/track`} className="hover:underline">{t.nav.track}</Link></li>
            <li><Link href={`/${locale}/points`} className="hover:underline">{t.nav.points}</Link></li>
            <li><Link href={`/${locale}/family`} className="hover:underline">{t.nav.family}</Link></li>
            <li><Link href={`/${locale}/careers`} className="hover:underline">{t.join.team}</Link></li>
            <li><Link href={`/${locale}/suppliers`} className="hover:underline">{t.join.supplier}</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">{t.footer.follow}</h3>
          <div className="flex gap-3">
            <a href={brand.socials.instagram} target="_blank" rel="noreferrer" aria-label="Instagram" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-cream/10 transition hover:bg-brand-yellow hover:text-brand-green-dark"><Instagram className="h-5 w-5" /></a>
            <a href={brand.socials.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-cream/10 transition hover:bg-brand-yellow hover:text-brand-green-dark"><TikTok className="h-5 w-5" /></a>
            <a href={brand.socials.facebook} target="_blank" rel="noreferrer" aria-label="Facebook" className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-cream/10 transition hover:bg-brand-yellow hover:text-brand-green-dark"><Facebook className="h-5 w-5" /></a>
          </div>
        </div>
      </div>
      <div className="border-t border-brand-cream/15 py-5 text-center text-xs text-brand-cream/60">
        © {year} Panzutti · Panuozzo &amp; More. {t.footer.rights}
      </div>
    </footer>
  );
}
