"use client";

/**
 * The readout itself. Plain DOM, no Canvas, no store — it must work on a
 * device where the scene does NOT, which is the whole point.
 *
 * The decisive row is BACKEND: it builds a real `WebGPURenderer` against an
 * offscreen 2×2 canvas and awaits `init()`, then reports which backend the
 * renderer actually settled on. That is the same negotiation Scene.tsx does at
 * `onCreated`, so it answers "does WebGPU genuinely work on this handset" —
 * not "is `navigator.gpu` present", which is a much weaker question and the
 * one that misled the last two diagnoses. The probe renderer is disposed as
 * soon as it has been read.
 */
import { useEffect, useState } from "react";
import { resolveFxBudget } from "@/webgl/store/tierStore";

type Row = { k: string; v: string; flag?: "good" | "bad" | "warn" };

function yn(b: boolean): string {
  return b ? "yes" : "no";
}

export function DiagClient() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [backend, setBackend] = useState<string>("probing…");

  useEffect(() => {
    const mq = (q: string) => window.matchMedia(q).matches;
    const coarse = mq("(pointer: coarse)");
    const reduced = mq("(prefers-reduced-motion: reduce)");
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nav.hardwareConcurrency;
    const mem = nav.deviceMemory;
    const hasGpu = "gpu" in navigator;

    // WebGL2 + the renderer string the device-class heuristics read.
    let webgl2 = false;
    let renderer = "";
    try {
      const probe = document.createElement("canvas");
      const gl = probe.getContext("webgl2") as WebGL2RenderingContext | null;
      webgl2 = !!gl;
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        renderer = dbg
          ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
          : "(hidden by the browser)";
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    } catch {
      webgl2 = false;
    }

    // THE budget the whole mobile experience hangs off. `resolveFxBudget()`
    // with no argument runs the very detectors `resolve()` uses, so this is
    // the real number, not a re-derivation.
    const budget = resolveFxBudget();

    const out: Row[] = [
      { k: "viewport", v: `${window.innerWidth} × ${window.innerHeight}` },
      { k: "devicePixelRatio", v: String(window.devicePixelRatio) },
      { k: "pointer", v: coarse ? "coarse (touch)" : "fine (mouse)" },
      { k: "reduced motion", v: yn(reduced), flag: reduced ? "warn" : "good" },
      {
        k: "hardwareConcurrency",
        v: cores == null ? "(absent)" : String(cores),
      },
      {
        k: "deviceMemory",
        v: mem == null ? "(absent — normal on iOS)" : String(mem),
      },
      { k: "navigator.gpu", v: yn(hasGpu), flag: hasGpu ? "good" : "bad" },
      { k: "WebGL2", v: yn(webgl2), flag: webgl2 ? "good" : "bad" },
      { k: "GL renderer", v: renderer || "(none)" },
      {
        k: "fxBudget.level",
        v: String(budget.level),
        // Level 2 is the threshold everything the owner asked for sits behind:
        // the compact brand beat, the eclipse, the rail islands and the gyro
        // permission prompt. Level 1 gets none of them.
        flag: budget.level >= 2 ? "good" : "bad",
      },
      { k: "fxBudget.postFx", v: budget.postFx },
      { k: "fxBudget.particleScale", v: String(budget.particleScale) },
      { k: "raymarchLite (eclipse)", v: yn(budget.raymarchLite) },
      {
        k: "gyroParallax (motion prompt)",
        v: yn(budget.gyroParallax),
        flag: budget.gyroParallax ? "good" : "warn",
      },
    ];
    setRows(out);

    let disposed = false;
    void (async () => {
      if (!hasGpu) {
        setBackend("webgl2 (no navigator.gpu on this device)");
        return;
      }
      try {
        const { WebGPURenderer } = await import("three/webgpu");
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 2;
        const r = new WebGPURenderer({ canvas, alpha: true, antialias: false });
        await r.init();
        if (disposed) return;
        // The same positive test backendOf() uses: a WebGL backend is
        // identified by its own flag, and a true WebGPU backend exposes
        // `compute`. Never infer the backend from navigator.gpu.
        const bk = (r as unknown as { backend?: { isWebGLBackend?: boolean } })
          .backend;
        const isWebGPU =
          !!bk &&
          bk.isWebGLBackend !== true &&
          typeof (r as unknown as { compute?: unknown }).compute === "function";
        setBackend(isWebGPU ? "webgpu ✓" : "webgl2 (WebGPU init fell back)");
        void r.dispose();
      } catch (e) {
        setBackend(`webgl2 (init threw: ${String(e).slice(0, 120)})`);
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const mono = { fontFamily: "var(--font-jbm), ui-monospace, monospace" };

  return (
    <main
      className="min-h-screen bg-[hsl(var(--bg))] px-5 py-10 text-ink"
      style={mono}
    >
      <h1 className="mb-1 text-[13px] uppercase tracking-[0.28em] text-ink-mute">
        Sersan · device diagnostics
      </h1>
      <p className="mb-6 text-[11px] leading-relaxed text-[hsl(var(--ink-dim))]">
        Read-only. Nothing is stored or sent. Screenshot this page.
      </p>

      <div className="mb-6 rounded border border-white/10 p-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-ink-mute">
          Render backend actually negotiated
        </div>
        <div className="mt-1 text-[15px] font-medium">{backend}</div>
      </div>

      {rows === null ? (
        <p className="text-[12px] text-ink-mute">reading…</p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <tbody>
            {rows.map((r) => (
              <tr key={r.k} className="border-b border-white/5">
                <td className="py-2 pr-3 align-top text-[hsl(var(--ink-dim))]">
                  {r.k}
                </td>
                <td
                  className={
                    "py-2 text-right align-top " +
                    (r.flag === "good"
                      ? "text-emerald-400"
                      : r.flag === "bad"
                        ? "text-red-400"
                        : r.flag === "warn"
                          ? "text-amber-400"
                          : "text-ink")
                  }
                >
                  {r.v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
