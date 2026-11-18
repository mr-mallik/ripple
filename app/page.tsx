import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 bg-navy text-mist">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-12 px-4 py-14 sm:px-8 sm:py-20">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral-soft">Women&apos;s safety matters</p>
          <h1>
            <Image
              src="/brand/ripple-logo-light.png"
              alt="Ripple: women's safety matters"
              width={940}
              height={478}
              priority
              className="h-auto w-72 sm:w-[30rem]"
            />
          </h1>
          <p className="max-w-2xl text-xl leading-relaxed text-mist sm:text-2xl">
            Report harassment in seconds, get a heads-up when something has happened nearby, and never walk home
            alone.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            href="/app"
            className="group flex flex-col gap-3 rounded-2xl border-t-[6px] border-coral bg-navy-2 p-7 transition hover:-translate-y-0.5"
          >
            <p className="font-display text-sm font-bold text-coral-soft">For you · phone or laptop</p>
            <h2 className="text-2xl font-semibold text-paper">Ripple app</h2>
            <p className="text-mist">
              Report anonymously, see live safety heads-ups around you, walk with a verified person going your way,
              and find support any time.
            </p>
            <span className="mt-auto pt-2 font-semibold text-paper group-hover:underline">Open the app →</span>
          </Link>
          <Link
            href="/security"
            className="group flex flex-col gap-3 rounded-2xl border-t-[6px] border-teal bg-navy-2 p-7 transition hover:-translate-y-0.5"
          >
            <p className="font-display text-sm font-bold text-[#d9c2f0]">For safety teams · desktop</p>
            <h2 className="text-2xl font-semibold text-paper">Safety team dashboard</h2>
            <p className="text-mist">
              A live map of reports and walks. Ripple links reports made close together, sums them up and keeps a
              response log.
            </p>
            <span className="mt-auto pt-2 font-semibold text-paper group-hover:underline">Open the dashboard →</span>
          </Link>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-[#cdbfe0]">
          If you are in danger, call 999. Ripple doesn&apos;t replace the emergency services.
        </p>
      </div>
    </main>
  );
}
