"use client";

import { useCRM } from "../hooks/useCRM";
import { ViewNode } from "./ViewNode";

// These are direct body children, as in index.html. This is also necessary for
// the original @media print body > * :not(dialog) rule.
export default function CRMApp() {
  const model = useCRM();
  if (!model)
    return (
      <>
        <div id="app" />
        <dialog id="modal" aria-labelledby="modal-title" />
        <div id="toasts" aria-live="polite" aria-atomic="true" />
      </>
    );
  return (
    <>
      <ViewNode node={model.app} model={model} />
      <ViewNode node={model.modal} model={model} />
      <ViewNode node={model.toasts} model={model} />
    </>
  );
}
