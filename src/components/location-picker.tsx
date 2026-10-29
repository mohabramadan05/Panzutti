"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, LocateFixed, MapPin, X } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";

export type LatLng = { lat: number; lng: number };

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const START: LatLng = { lat: 30.0866, lng: 31.327 }; // between Heliopolis and Nasr City (our delivery area)

export const mapsLink = (p: LatLng) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// The few Maps JS pieces we use (avoids pulling in @types/google.maps)
type GMap = {
  getCenter(): { lat(): number; lng(): number } | undefined;
  panTo(p: LatLng): void;
  setZoom(z: number): void;
  addListener(event: string, fn: () => void): void;
};
type GoogleNS = {
  maps: {
    Map: new (el: HTMLElement, opts: object) => GMap;
    Geocoder: new () => { geocode(req: { location: LatLng }): Promise<{ results: { formatted_address: string; types?: string[] }[] }> };
  };
};
type MapsWindow = Window & { google?: GoogleNS; __panzuttiMaps?: () => void; gm_authFailure?: () => void };

let loader: Promise<GoogleNS> | null = null;
function loadMaps(locale: Locale, onAuthFail: () => void): Promise<GoogleNS> {
  const w = window as MapsWindow;
  w.gm_authFailure = onAuthFail; // Google calls this when the key is rejected
  if (w.google?.maps?.Map) return Promise.resolve(w.google);
  loader ??= new Promise<GoogleNS>((resolve, reject) => {
    w.__panzuttiMaps = () => resolve(w.google!);
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY}&language=${locale}&region=EG&loading=async&callback=__panzuttiMaps`;
    s.async = true;
    s.onerror = () => {
      loader = null;
      reject(new Error("maps"));
    };
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Optional pin for delivery orders. With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY the customer drags a
 * Google map under a fixed centre pin; without it (or if the key fails) they can still share
 * their GPS position, previewed in a keyless Google Maps embed.
 */
export function LocationPicker({
  locale,
  t,
  value,
  onChange,
  onAddress,
}: {
  locale: Locale;
  t: Dictionary["checkout"];
  value: LatLng | null;
  onChange: (p: LatLng | null) => void;
  onAddress?: (address: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const google = useRef<GoogleNS | null>(null);
  const [interactive, setInteractive] = useState(!!KEY);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  // latest callbacks, so the map listeners set up once never call stale ones
  const cb = useRef({ onChange, onAddress });
  cb.current = { onChange, onAddress };
  const initial = useRef(value);

  // Google first; OpenStreetMap's free reverse geocoder when there's no key or the Geocoding API is off
  const reverseGeocode = async (p: LatLng) => {
    if (!cb.current.onAddress) return;
    let address = "";
    if (google.current) {
      try {
        const { results } = await new google.current.maps.Geocoder().geocode({ location: p });
        address = (results.find((r) => !r.types?.includes("plus_code")) ?? results[0])?.formatted_address ?? "";
      } catch {
        // fall through to OpenStreetMap
      }
    }
    if (!address) {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=18&accept-language=${locale}`,
        );
        address = ((await res.json()) as { display_name?: string }).display_name ?? "";
      } catch {
        // offline / blocked: the customer types the address
      }
    }
    if (address) cb.current.onAddress(address);
  };

  useEffect(() => {
    if (!KEY || !el.current) return;
    let cancelled = false;
    loadMaps(locale, () => setInteractive(false))
      .then((g) => {
        if (cancelled || !el.current) return;
        google.current = g;
        const m = new g.maps.Map(el.current, {
          center: initial.current ?? START,
          zoom: initial.current ? 17 : 13,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        m.addListener("dragend", () => {
          const c = m.getCenter();
          if (!c) return;
          const p = { lat: c.lat(), lng: c.lng() };
          cb.current.onChange(p);
          void reverseGeocode(p);
        });
        map.current = m;
      })
      .catch(() => !cancelled && setInteractive(false));
    return () => {
      cancelled = true;
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set the map up once per locale
  }, [locale]);

  const locate = () => {
    if (!("geolocation" in navigator)) return setError(t.locUnavailable);
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        onChange(p);
        if (map.current) {
          map.current.panTo(p);
          map.current.setZoom(17);
        }
        void reverseGeocode(p);
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? t.locDenied : t.locUnavailable);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold">{t.mapLabel}</span>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
        >
          {locating ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          {t.useMyLocation}
        </button>
      </div>

      {interactive ? (
        <div className="relative h-64 overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
          <div ref={el} className="absolute inset-0" />
          {/* fixed centre pin: the customer moves the map under it */}
          <MapPin
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto size-10 -translate-y-full fill-brand-red text-brand-cream drop-shadow-md"
          />
        </div>
      ) : (
        value && (
          <iframe
            title={t.mapLabel}
            src={`https://maps.google.com/maps?q=${value.lat},${value.lng}&z=17&hl=${locale}&output=embed`}
            className="h-56 w-full rounded-2xl ring-1 ring-border"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        )
      )}

      {error ? (
        <p className="text-sm font-bold text-brand-red">{error}</p>
      ) : value ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-bold text-primary">{t.locSet}</span>
          <a href={mapsLink(value)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">
            {t.openInMaps} <ExternalLink className="size-3.5" />
          </a>
          <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-brand-red">
            <X className="size-3.5" /> {t.locClear}
          </button>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{interactive ? t.mapHint : t.mapHintNoMap}</p>
      )}
    </div>
  );
}
