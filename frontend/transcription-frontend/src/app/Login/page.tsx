"use client";

import { FileAudio } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api/client";

export default function LoginPage() {
  return (
    <React.Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">Checking session</main>}>
      <LoginForm />
    </React.Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const reason = searchParams.get("reason");

  React.useEffect(() => {
    if (auth.status === "authenticated") router.replace("/");
  }, [auth.status, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setSubmitting(true);
    try {
      await auth.login({ email: email.trim(), password });
      setPassword("");
      router.replace("/");
    } catch (err) {
      setPassword("");
      if (err instanceof ApiError && (err.status === 401 || err.code === "UNAUTHENTICATED")) {
        setError("Invalid email or password");
      } else if (err instanceof ApiError && err.status === 429) {
        setError(err.message);
      } else {
        setError("Sign in failed");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (auth.status === "checking") {
    return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10 text-sm text-muted-foreground">Checking session</main>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <FileAudio className="h-5 w-5" />
            </div>
            <CardTitle>Transcript App</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={submitting} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={submitting} />
            </div>
            {reason === "password-changed" && <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">Password changed. Sign in with your new password.</p>}
            {auth.status === "error" && <p className="text-sm text-muted-foreground">Unable to verify an existing session. You can still sign in.</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={submitting}>{submitting ? "Signing in" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
