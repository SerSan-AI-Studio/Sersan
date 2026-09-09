import type { Metadata, Viewport } from "next";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LanguageProvider } from "@/components/language-provider";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SmoothScrollProvider } from "@/components/smooth-scroll-provider";
import { SectionBus } from "@/components/section-bus";
import { CanvasHost } from "@/webgl/CanvasHost";
import { Preloader } from "@/components/fx/preloader";
import { PerfHud } from "@/components/fx/perf-hud";
import { CardTiltController } from "@/components/fx/card-tilt-controller";
import { HeadingChoreographer } from "@/components/fx/heading-choreographer";
import { LabelScrambler } from "@/components/fx/label-scrambler";
import { CustomCursor } from "@/components/fx/custom-cursor";
import { FlipHandoffOverlay } from "@/components/fx/flip-handoff-overlay";
import { CommandPalette } from "@/components/fx/command-palette";
import { AudioTriggers } from "@/components/fx/audio-triggers";
import { Analytics } from "@vercel/analytics/next";
import { POSITIONING } from "@/data/copy";

// Brand type stack (self-hosted via next/font, no runtime CDN requests):
// - Brand: Sersan Display — the custom logotype face (Jost, SIL OFL, see
//   ../fonts/LICENSE-Jost.txt) with two glyph amputations baked in: the A has
//   no crossbar and the R's bowl stops short of the stem. Shipped as a full
//   weight LADDER (200/220/240/260/280/300/340 — every step verified to keep
//   both amputations intact) so the wordmark's stroke weight can be settled
//   against the live particle render instead of guessed. 340 is the default
//   (stem 9.71% of cap height) — deliberately well ABOVE the 5.0–6.5%-ish
//   band the owner's flat reference artwork measures (220 = 5.43%, 240 =
//   6.00%, 260 = 6.71%), because the additive sub-pixel particle render
//   scatters light and reads lighter than solid artwork, so matching the
//   artwork's stem number ships a wordmark that looks too thin — 300 (7.86%)
//   still did, and 340 is where the owner settled, judging the live particle
//   render rather than the arithmetic. The rest of the ladder is kept as the
//   measured record of that comparison.
//   Used for the SERSAN wordmark, nothing else.
// - Display: Fraunces (variable, optical sizing + italic) — the editorial
//   serif for big headings. Editorial New is no longer distributed by
//   Fontshare; Fraunces is what the live site already resolves to.
// - Body: Switzer (Fontshare, self-hosted woff2) — modern distinctive sans.
// - Mono: JetBrains Mono — eyebrows, labels, tabular numerics.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
  style: ["normal", "italic"],
  display: "swap",
});

// PRELOAD OFF (2026-08-18). `preload` defaults to true and next/font/local
// preloads EVERY file in `src` — it cannot know which weight a page uses — so
// the seven-step ladder was putting 7 × ~10KB = ~71KB of woff2 on the critical
// path for a face that paints NOTHING. Safe here, specifically:
//   · the only two nodes that use `font-brand` are the `[data-hero-brand]`
//     anchors (cinematic-system-scroll.tsx), both `opacity: 0` forever — they
//     exist purely as a typography/geometry SOURCE for the particle sampler,
//     so nothing on screen can flash or reflow while the face arrives;
//   · the sampler does not race it: HeroTextParticles awaits
//     `document.fonts.ready` in the same Promise.all as its WebGPU imports
//     (webgl/HeroTextParticles.tsx) BEFORE it calls sampleTextPoints, and the
//     anchor is SSR'd, so the face is already requested by layout when that
//     await is made.
// The files are still requested normally (the anchors use them); they are just
// no longer `<link rel=preload>`-ed ahead of the real critical path. The weight
// is now frozen at 340, so deleting the six unused `src` entries would take the
// remaining ~61KB of transfer off too — kept for now as the ladder that
// documents the choice.
const sersanDisplay = localFont({
  variable: "--font-sersan-display",
  preload: false,
  src: [
    { path: "../fonts/sersan-display-200.woff2", weight: "200", style: "normal" },
    { path: "../fonts/sersan-display-220.woff2", weight: "220", style: "normal" },
    { path: "../fonts/sersan-display-240.woff2", weight: "240", style: "normal" },
    { path: "../fonts/sersan-display-260.woff2", weight: "260", style: "normal" },
    { path: "../fonts/sersan-display-280.woff2", weight: "280", style: "normal" },
    { path: "../fonts/sersan-display-300.woff2", weight: "300", style: "normal" },
    { path: "../fonts/sersan-display-340.woff2", weight: "340", style: "normal" },
  ],
  display: "swap",
});

const switzer = localFont({
  variable: "--font-switzer",
  // `next/font/local` emits a High-priority <link rel="preload"> for EVERY
  // file listed here. The 300 face was 17.9 KB of preload on every route with
  // nothing rendering it: no `font-light`, no `font-[300]` and no
  // `font-weight: 300` anywhere in src (the hero's light look is an INLINE
  // weight on the Sersan Display face — see cinematic-system-scroll.tsx).
  // The woff2 stays in ../fonts, unreferenced, if the weight is ever wanted.
  src: [
    { path: "../fonts/switzer-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/switzer-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/switzer-600.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jbm",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.sersan.io"),
  // The SVG is declared first on purpose: it carries a prefers-color-scheme
  // rule, so the mark inverts with the browser chrome. Browsers without SVG
  // favicon support fall through to the .ico, which is a navy tile precisely
  // because it cannot adapt (design/logo-mark/build-icons.mjs).
  icons: {
    icon: [
      { url: "/favicon.svg?v=13", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
  },
  // Title structure: page-specific value goes first (template appends the
  // brand). Default fronts the hero promise + the buyer query.
  // NOTE: the template appends " · SerSan" to CHILD routes only — the default
  // below is rendered verbatim, so it carries the brand itself.
  title: {
    default: "SerSan — Custom Software, Automation & AI Studio",
    template: "%s · SerSan",
  },
  // 155 chars — under the 160 cap this time (the previous value was 221 and
  // silently truncated). Seeded from POSITIONING.oneLiner so the canonical
  // description cannot drift from the rest of the site, then closed with the
  // entry point: one problem, scoped before anyone writes code.
  description: `${POSITIONING.oneLiner.en} Start with one painful problem — we scope it before we build.`,
  keywords: [
    "custom software development",
    "workflow automation",
    "AI consulting",
    "business process automation",
    "internal tools",
    "custom web applications",
    "software development studio",
    "AI integration",
    "AI agents",
    "MLOps",
    "technical audit",
    "software architecture",
    "fractional CTO",
    "software for SMEs",
    "founder-led software studio",
    "London software studio",
    "EU AI Act",
  ],
  authors: [{ name: "Sersan Limited" }],
  creator: "SerSan",
  alternates: {
    canonical: "/",
    languages: { en: "/", it: "/" },
  },
  openGraph: {
    type: "website",
    title: "Software, automation and AI that earns its place",
    description:
      "Founder-led studio building custom software, workflow automation and AI for founders, SMEs and growing teams. Start with one painful problem — scoped before we build, from a focused fix to a full platform.",
    url: "https://www.sersan.io/",
    siteName: "SerSan",
    locale: "en_GB",
    alternateLocale: ["it_IT"],
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SerSan — custom software, automation and AI. Founder-led studio for growing businesses.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@sersan_io",
    title: "Software, automation and AI that earns its place",
    description:
      "Founder-led studio building custom software, workflow automation and AI. From one manual workflow to a full production platform — scoped before we build.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1422",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Organization JSON-LD — helps search & AI surfaces understand SerSan's
  // positioning at a glance. Kept tight: claims we can verify only.
  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "SerSan",
    legalName: "Sersan Limited",
    url: "https://www.sersan.io",
    logo: "https://www.sersan.io/og-image.png",
    description:
      "Founder-led software studio. Custom software, workflow automation and AI systems for founders, SMEs and growing businesses.",
    foundingLocation: { "@type": "Place", name: "London, United Kingdom" },
    areaServed: ["United Kingdom", "Italy", "European Union"],
    knowsAbout: [
      "Custom software development",
      "Workflow automation",
      "Internal tools and platforms",
      "AI integration",
      "MLOps",
      "Technical audits",
    ],
    sameAs: [
      "https://www.linkedin.com/company/sersan-limited/",
    ],
  };

  // Pre-hydration language stamp — the dark-mode-toggle trick, applied to
  // EN/IT. Reading cookies() here would flip every statically prerendered
  // route to dynamic rendering, so the shell stays static English and this
  // blocking inline script (SSR'd into <head>, runs before first paint)
  // resolves the visitor's persisted language and stamps <html lang> +
  // data-lang. It cannot retranslate the static English text — that swap is
  // LanguageProvider's pre-paint fade-through at hydration — but it makes the
  // document's declared language correct from the very first frame for
  // returning Italian visitors, and hands the provider a pre-paint source of
  // truth (detectInitial reads data-lang first). Storage priority mirrors
  // detectInitial: localStorage, then cookie. Everything is try-wrapped:
  // storage access can throw under hardened privacy modes, and a 404 page in
  // the wrong language beats a scripting error before paint.
  const langStamp = `(function(){try{var l=null;try{var s=localStorage.getItem("sersan_language");if(s==="en"||s==="it")l=s}catch(e){}if(!l){var m=document.cookie.match(/(?:^|;\\s*)sersan_language=(en|it)/);if(m)l=m[1]}if(l&&l!=="en"){var d=document.documentElement;d.lang=l;d.setAttribute("data-lang",l)}}catch(e){}})();`;

  return (
    /* Static lang="en" keeps this a non-dynamic Server Component (so the page
       stays statically prerendered). The inline stamp above corrects lang +
       data-lang pre-paint for returning Italian visitors, and LanguageProvider
       keeps document.lang in sync on every later switch.
       suppressHydrationWarning is scoped to THIS element only (one level
       deep): the stamp legitimately mutates <html> attributes before React
       hydrates, and the mismatch is by design, not a bug to surface. */
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fraunces.variable} ${switzer.variable} ${jetbrainsMono.variable} ${sersanDisplay.variable} h-full antialiased`}
    >
      <head>
        {/* Must run BEFORE first paint — a plain blocking inline script, the
            only reliable pre-paint hook a static shell has. */}
        <script dangerouslySetInnerHTML={{ __html: langStamp }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <a href="#main" className="skip-to-content">
          Skip to content
        </a>
        <LanguageProvider>
          <SmoothScrollProvider>
            {/* First-load preloader — a sober mono % counter + bar + 52. mark
                that counts real readiness to 100, then wipes up while the
                signature line draws in (introStore hand-off). Client-only
                (mounts after hydration → no SSR mismatch), shows once per hard
                load (layout persists across soft navigations), and is skipped
                entirely under prefers-reduced-motion. */}
            <Preloader />
            {/* Persistent WebGL layer — fixed, behind everything (z-0).
                Mounted at layout level so the GL context survives route
                changes. Decorative only: aria-hidden + pointer-events:none
                live inside CanvasHost. */}
            <CanvasHost />
            {/* Dev/preview `?perf=1` overlay (mobile-parity plan Phase 6.1):
                fps / dpr / draw calls / fxBudget / renderer readout fed by the
                in-Canvas PerfProbe. Self-gated on tierStore.perfHud (only ever
                true after resolve() on the client, behind devOverridesAllowed)
                → renders null on the server and in production. */}
            <PerfHud />
            {/* Section-state bus writer — measures [data-line-anchor] spans,
                publishes the active section + scroll direction to
                useSectionStore. Lives OUTSIDE the Canvas so the bus works on
                every tier, including "off". Renders nothing. */}
            <SectionBus />
            {/* (Round 8-A, 2026-08-22: <ScrollSnapSections /> deleted. Free
                sections no longer settle at all — the page rests wherever the
                reader leaves it, Lusion-style. lib/scroll-snap survives as the
                pinned-runway whisper only, and the runway owners register
                themselves; there is nothing site-wide left to mount.) */}
            <CardTiltController />
            <HeadingChoreographer />
            {/* Mono eyebrow/label decode-scramble — one delegated observer. */}
            <LabelScrambler />
            <CustomCursor />
            {/* Persistent card→detail Flip "flying image" handoff overlay.
                Renders null normally; on arrival at a /case-studies/<slug> with
                a fresh armed snapshot it flies a fixed image clone (z-70, above
                the curtain) from the clicked card onto the detail hero. */}
            <FlipHandoffOverlay />
            {/* Procedural UI sounds (hover/click via delegated listeners +
                AudioContext autoplay-gesture unlock). Renders nothing. */}
            <AudioTriggers />
            {/* ⌘K / Ctrl+K quick-nav palette (fx/command-palette). Renders a
                portal dialog on demand; nothing at rest. */}
            <CommandPalette />
            <Navbar />
            {/* Content wrapper above the canvas (z-1). The canvas adds
                light behind this layer; text stays DOM-crisp.
                data-lang-fade: LanguageProvider's swap beat dims THIS wrapper
                (opacity only — no transform, so fixed descendants keep the
                viewport as their containing block) while the EN↔IT copy
                swaps, then fades it back up. The navbar sits outside on
                purpose: its one translated label isn't worth dimming the
                persistent chrome, and the toggle itself must stay crisp
                mid-beat. */}
            <div
              data-lang-fade
              className="relative z-[1] flex flex-1 flex-col"
            >
              <main id="main" className="flex-1">
                {children}
              </main>
              <Footer />
            </div>
          </SmoothScrollProvider>
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
