"use client";

import { useEffect, useState } from "react";


export type ColorMode = "light" | "dark";

function resolve(): ColorMode {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return "light";
}

export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMode(resolve()));
    const mo = new MutationObserver(() => setMode(resolve()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, []);

  return mode;
}
