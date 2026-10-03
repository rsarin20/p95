import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <div className="text-5xl">🍂</div>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Lost in the leaves</h1>
      <p className="muted mt-1">That page doesn&apos;t exist.</p>
      <Link href="/" className="btn-primary mt-5">Back home</Link>
    </div>
  );
}
