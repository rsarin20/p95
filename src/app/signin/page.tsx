import { redirect } from "next/navigation";
import { enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { SignInButtons } from "@/components/SignInButtons";
import { CHALLENGE } from "@/lib/config";
import { safeNext } from "@/lib/next-path";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  OAuthAccountNotLinked: "That email is linked to a different sign-in method.",
  AccessDenied: "Sign-in was cancelled.",
  CredentialsSignin: "Enter a name with at least 2 characters.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; callbackUrl?: string }> }) {
  const user = await getCurrentUser().catch(() => null);
  const { error, callbackUrl } = await searchParams;
  const next = safeNext(callbackUrl);
  if (user) redirect(user.onboarded ? (next ?? "/dashboard") : "/onboarding");
  const providers = enabledProviders();
  const none = !providers.google && !providers.apple && !providers.facebook && !providers.demo;

  return (
    <div className="mx-auto max-w-md pt-6 sm:pt-12">
      <div className="card animate-pop text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-pumpkin-400 to-maple-500 text-3xl shadow">
          🍂
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold">Join {CHALLENGE.name}</h1>
        <p className="muted mt-1">One tap to start. You&apos;ll choose your public name next.</p>
        {error && (
          <p className="mt-4 rounded-2xl bg-maple-500/10 px-4 py-3 text-sm font-semibold text-maple-600 dark:text-maple-400">
            {ERRORS[error] ?? "Something went wrong signing in. Please try again."}
          </p>
        )}
        <div className="mt-6">
          {none ? (
            <p className="muted text-sm">Sign-in isn&apos;t configured yet. Add OAuth keys (see README).</p>
          ) : (
            <SignInButtons providers={providers} next={next} />
          )}
        </div>
        <p className="muted mt-6 text-xs">
          We only use your account to sign you in. Your email is never shown publicly — only the name you choose. See our{" "}
          <a href="/privacy" className="underline">privacy policy</a> and <a href="/terms" className="underline">terms</a>.
        </p>
      </div>
    </div>
  );
}
