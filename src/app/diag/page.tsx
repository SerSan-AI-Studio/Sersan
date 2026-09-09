import type { Metadata } from "next";
import { pageMetadata } from "@/lib/metadata";
import { DiagClient } from "./diag-client";

/**
 * /diag — a device readout, for answering ONE question without guessing:
 * which render path is this handset actually on?
 *
 * It exists because the owner's iPhone could not be reasoned about from here.
 * Two diagnoses were made and both were wrong (no WebGPU; then Safari's
 * missing storage limits), because every branch that decides the mobile
 * experience — tier, fxBudget level, phoneGL, and above all whether
 * `WebGPURenderer.init()` really succeeds — is resolved on the DEVICE and is
 * invisible from a desktop dev machine. The local Browser pane cannot stand in
 * either: it does not composite while hidden, so the WebGL scene never runs
 * there at all.
 *
 * `index: false` keeps it out of search. Nothing here is written, sent or
 * stored — every reading is a read-only browser query, and the probe contexts
 * are disposed immediately.
 */
export const metadata: Metadata = pageMetadata({
  title: "Device diagnostics",
  description: "Render-path readout for this device.",
  path: "/diag",
  index: false,
});

export default function DiagPage() {
  return <DiagClient />;
}
