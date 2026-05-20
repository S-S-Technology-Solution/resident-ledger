import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card shadow-lg p-8 space-y-6">
        <div className="text-center space-y-1">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-emerald-700 text-white font-black text-xl">R</div>
          <h1 className="text-xl font-semibold mt-3">ResidentLedger</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <LoginForm next={next} />
        {process.env.NODE_ENV !== "production" && (
          <p className="text-center text-xs text-muted-foreground">
            Default admin: <span className="font-mono">admin@example.com / changeme</span>
          </p>
        )}
      </div>
    </div>
  );
}
