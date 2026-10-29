import type { Instrumentation } from "next";

/** Emails the studio when a page, API route or server action fails on the live site. */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // A missing page or a sign-in redirect isn't a failure.
  const digest = (error as { digest?: string }).digest ?? "";
  if (digest.startsWith("NEXT_") || digest === "DYNAMIC_SERVER_USAGE") return;
  const { reportError } = await import("./lib/alerts");
  await reportError(`${request.method} ${request.path.split("?")[0]}`, error);
};
