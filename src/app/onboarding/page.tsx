import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { COUNTRIES } from "@/lib/countries";
import { requireUser } from "@/lib/session";
import { safeNext } from "@/lib/next-path";

export const metadata = { title: "Welcome" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser({ allowNotOnboarded: true });
  const next = safeNext((await searchParams).next);
  if (user.onboarded) redirect(next ?? "/dashboard");
  return (
    <div className="mx-auto max-w-xl pt-4">
      <div className="mb-6 text-center">
        <div className="text-4xl">👋</div>
        <h1 className="mt-2 font-display text-4xl font-extrabold">Welcome aboard</h1>
        <p className="muted mt-1">Set up how the world will see you. You can change this anytime.</p>
      </div>
      <div className="card">
        <ProfileForm
          providerName={user.provider_name}
          initial={{ mode: "real", displayName: null, avatar: user.avatar, country: null }}
          countries={COUNTRIES}
          submitLabel="Let's walk 🍂"
          next={next}
        />
      </div>
    </div>
  );
}
