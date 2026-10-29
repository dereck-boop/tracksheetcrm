"use client";
import { useEffect, useRef } from "react";

/** Wraps a page shown in an iframe on the studio's website and tells embed.js its height. */
export function EmbedHeight({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || window.parent === window) return;
    const post = () => window.parent.postMessage({ type: "studio-form-height", height: ref.current!.getBoundingClientRect().bottom }, "*");
    const ro = new ResizeObserver(post);
    ro.observe(ref.current);
    post();
    return () => ro.disconnect();
  }, []);
  return <div ref={ref}>{children}</div>;
}
