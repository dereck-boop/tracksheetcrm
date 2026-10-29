"use client";
import Script from "next/script";

declare global {
  interface Window { turnstile?: { reset: (el?: string | HTMLElement) => void } }
}

/** The Cloudflare "are you a person" check. Usually invisible; adds cf-turnstile-response to the form. */
export function Turnstile({ siteKey }: { siteKey: string | null | undefined }) {
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={siteKey} data-appearance="interaction-only" />
    </>
  );
}

/** A Turnstile answer works once; get a fresh one after the form comes back with an error. */
export const resetTurnstile = () => window.turnstile?.reset();
