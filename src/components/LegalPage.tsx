export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl space-y-5 pb-10">
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      <p className="muted text-sm">Last updated {updated}</p>
      <div className="card space-y-4 leading-relaxed [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </div>
    </article>
  );
}
