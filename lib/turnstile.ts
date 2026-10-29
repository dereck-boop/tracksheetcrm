/**
 * Cloudflare Turnstile, the free invisible "are you a person" check on public forms. It turns on
 * when TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set in Vercel; without them forms still work
 * (protected by the hidden spam field and rate limits).
 */
export const turnstileSiteKey = () => process.env.TURNSTILE_SITE_KEY || null;

/** True when the form's Turnstile answer checks out, or when Turnstile isn't set up. */
export async function passesTurnstile(fd: FormData, ip?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !turnstileSiteKey()) return true;
  const response = String(fd.get("cf-turnstile-response") ?? "");
  if (!response) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret, response, ...(ip && ip !== "unknown" ? { remoteip: ip } : {}) }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch (e) {
    // If Cloudflare can't be reached, don't turn real clients away; the rate limits still apply.
    console.error("Turnstile check failed", e);
    return true;
  }
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 200;
