import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 bg-navy text-mist">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-12 px-4 py-14 sm:px-8 sm:py-20">
        <header className="flex flex-col gap-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-coral-soft">
            HudHackHer 2026 · Demo
          </p>
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
            Turning separate reports of harassment on campus into one fast, joined-up response.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2">
          <Link
            href="/app"
            className="group flex flex-col gap-3 rounded-2xl border-t-[6px] border-coral bg-navy-2 p-7 transition hover:-translate-y-0.5"
          >
            <p className="font-display text-sm font-bold text-coral-soft">For students · phone</p>
            <h2 className="text-2xl font-semibold text-paper">Student app</h2>
            <p className="text-mist">
              Report in seconds, anonymously. Get a heads-up when something has happened nearby, or
              start a walk-with-me check-in.
            </p>
            <span className="mt-auto pt-2 font-semibold text-paper group-hover:underline">Open the app →</span>
          </Link>
          <Link
            href="/security"
            className="group flex flex-col gap-3 rounded-2xl border-t-[6px] border-teal bg-navy-2 p-7 transition hover:-translate-y-0.5"
          >
            <p className="font-display text-sm font-bold text-[#d9c2f0]">For campus security · desktop</p>
            <h2 className="text-2xl font-semibold text-paper">Security dashboard</h2>
            <p className="text-mist">
              A live map of reports. Ripple flags clusters, sums them up and keeps a response log.
            </p>
            <span className="mt-auto pt-2 font-semibold text-paper group-hover:underline">Open the dashboard →</span>
          </Link>
        </div>

        <p className="max-w-3xl text-sm leading-relaxed text-[#cdbfe0]">
          This is a hackathon prototype. It uses fictional data only and must not be used to report a
          real incident. If you are in danger, call 999.
        </p>
      </div>
    </main>
  );
}
