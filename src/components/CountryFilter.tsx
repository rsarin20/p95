"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flag } from "@/lib/countries";

export function CountryFilter({ value, countries }: { value: string; countries: { code: string; name: string }[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Filter by country"
      className="input !w-auto !rounded-full !py-2 text-sm font-semibold"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("country", e.target.value);
        else next.delete("country");
        router.push(`${path}?${next}`);
      }}
    >
      <option value="">🌍 Worldwide</option>
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {flag(c.code)} {c.name}
        </option>
      ))}
    </select>
  );
}
