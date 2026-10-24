import Link from "next/link";
import { Mascot } from "@/components/brand";

/** Shown for pages that don't exist yet (menu, family, careers… are coming next). */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <Mascot eager className="mx-auto mb-6 h-72 animate-float" />
        <h1 className="text-6xl text-primary">404</h1>
        <p className="mt-3 text-muted-foreground">This page went out for a panuozzo and hasn&apos;t come back yet.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">
          Back home
        </Link>
      </div>
    </main>
  );
}
