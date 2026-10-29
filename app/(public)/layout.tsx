export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-page px-4 py-8 sm:py-12 print:bg-white print:p-0"><div className="mx-auto max-w-3xl">{children}</div></main>;
}
