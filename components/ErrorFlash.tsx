"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Shows ?error=<message> (set when a form's action fails) as a banner, with a close button. */
export function ErrorFlash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const error = params.get("error");
  if (!error) return null;
  const close = () => {
    const next = new URLSearchParams(params);
    next.delete("error");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-3 print:hidden">
      <div className="flex w-full max-w-xl items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
        <span className="flex-1">{error}</span>
        <button type="button" onClick={close} aria-label="Close" className="-my-1 shrink-0 rounded px-2 py-1 text-lg leading-none text-red-700 hover:bg-red-100">×</button>
      </div>
    </div>
  );
}
