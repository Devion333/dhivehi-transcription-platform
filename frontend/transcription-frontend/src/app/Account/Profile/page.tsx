"use client";

import { Save, ShieldCheck, UserCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAccountProfile, updateAccountProfile } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import type { AccountProfile } from "@/lib/api/types";
import { formatDetailDate } from "@/lib/transcript-details-utils";

const maxDisplayNameLength = 100;

export default function AccountProfilePage() {
  const auth = useAuth();
  const [profile, setProfile] = React.useState<AccountProfile | null>(null);
  const [displayName, setDisplayName] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getAccountProfile(controller.signal)
      .then((response) => {
        setProfile(response.profile);
        setDisplayName(response.profile.displayName);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Profile could not be loaded.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !profile) return;
    const validation = validateDisplayName(displayName);
    setFieldError(validation);
    setSuccess(null);
    setError(null);
    if (validation) return;
    setSubmitting(true);
    try {
      const response = await updateAccountProfile({ displayName });
      setProfile(response.profile);
      setDisplayName(response.profile.displayName);
      auth.updateUser({ id: response.profile.id, name: response.profile.displayName, email: response.profile.email, role: response.profile.role });
      setSuccess("Profile updated.");
    } catch (err) {
      setError(profileError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <PageContainer><PageHeader title="Profile" /><LoadingState label="Loading profile" /></PageContainer>;
  }
  if (error && !profile) {
    return <PageContainer><PageHeader title="Profile" /><ErrorState title="Could not load profile" description={error} /></PageContainer>;
  }
  if (!profile) return null;

  const changed = displayName.trim() !== profile.displayName;

  return (
    <PageContainer>
      <PageHeader title="Profile" />
      <div className="max-w-2xl space-y-4">
        <Card>
          <CardHeader><SectionHeading title="Account information" icon={UserCircle} tone="admin" /></CardHeader>
          <CardContent className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setFieldError(null); setSuccess(null); }} maxLength={maxDisplayNameLength} disabled={submitting} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? "displayName-error" : undefined} />
                {fieldError && <p id="displayName-error" className="text-sm text-destructive">{fieldError}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={submitting || !changed}>{submitting ? "Saving" : <><Save className="h-4 w-4" /> Save changes</>}</Button>
                {success && <p className="text-sm text-[var(--accent-success)]">{success}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
            </form>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Email" value={profile.email} />
              <Info label="Role" value={roleLabel(profile.role)} />
              <Info label="Status" value={profile.status === "active" ? "Active" : "Inactive"} />
              <Info label="Account created" value={formatDetailDate(profile.createdAt)} />
              <Info label="Last login" value={profile.lastLoginAt ? formatDetailDate(profile.lastLoginAt) : "Not recorded"} />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">Password</p><p className="text-sm text-muted-foreground">Change your account password.</p></div>
            <Button asChild variant="outline"><Link href="/Account/Security"><ShieldCheck className="h-4 w-4" /> Change password</Link></Button>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border p-3"><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>;
}

function validateDisplayName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Display name is required.";
  if ([...trimmed].length > maxDisplayNameLength) return `Use ${maxDisplayNameLength} characters or fewer.`;
  if ([...trimmed].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return "Control characters are not allowed.";
  return null;
}

function profileError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_USER_INPUT") return "Use a non-empty display name without control characters.";
    if (error.code === "UNAUTHENTICATED") return "Your session has expired. Sign in again.";
    return error.message;
  }
  return "Profile could not be updated.";
}

function roleLabel(role: string) {
  return role === "admin" ? "Administrator" : "Standard user";
}
