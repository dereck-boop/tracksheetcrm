"use client";
import { useEffect } from "react";

/** Shown instead of a blank crash screen when a page fails to load. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-3xl text-black">Something went wrong</h1>
        <p className="mt-3 text-gray-600">This page didn&apos;t load properly. Please try again. If it keeps happening, get in touch and we&apos;ll sort it out.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">Try again</button>
          <button type="button" onClick={() => history.back()} className="btn-secondary">Go back</button>
        </div>
        {error.digest && <p className="mt-6 font-mono text-xs text-gray-400">Reference {error.digest}</p>}
      </div>
    </main>
  );
}
