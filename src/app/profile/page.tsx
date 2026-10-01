import { ProfileForm } from "@/components/ProfileForm";
import { DangerZone } from "@/components/DangerZone";
import { COUNTRIES } from "@/lib/countries";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Profile" };

export default async function Profile() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="font-display text-4xl font-extrabold">Your profile</h1>
      <div className="card">
        <ProfileForm
          providerName={user.provider_name}
          initial={{ mode: user.name_mode, displayName: user.display_name, avatar: user.avatar, country: user.country }}
          countries={COUNTRIES}
          submitLabel="Save changes"
        />
      </div>
      <DangerZone />
    </div>
  );
}
