"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createViewState } from "../lib/view-state";
import { createCRMController } from "../lib/crm-controller";

export function useCRM() {
  const [model, setModel] = useState(null);
  const [revision, setRevision] = useState(0);
  const current = useRef(null);
  useEffect(() => {
    const next = createViewState(() => setRevision((n) => n + 1));
    current.current = next;
    setModel(next);
    createCRMController(next);
    return () => {
      next.dispose();
      current.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    model?.flushEffects();
  }, [model, revision]);
  return model;
}
