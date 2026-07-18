"use client";

import { ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionHeading } from "@/components/ui/section-heading";
import { changePassword } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";

type PasswordFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type FieldErrors = Partial<Record<keyof PasswordFields, string>>;

const initialFields: PasswordFields = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function AccountSecurityPage() {
  const router = useRouter();
  const [fields, setFields] = React.useState<PasswordFields>(initialFields);
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [status, setStatus] = React.useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  function updateField(field: keyof PasswordFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setStatus("idle");
    setMessage("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validateFields(fields);
    setErrors(nextErrors);
    setStatus("idle");
    setMessage("");
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const response = await changePassword(fields);
      setFields(initialFields);
      setErrors({});
      if (response.reauthenticationRequired) {
        router.replace("/Login?reason=password-changed");
        return;
      }
      setStatus("success");
      setMessage("Password changed successfully");
    } catch (error) {
      const mapped = mapChangePasswordError(error);
      setErrors(mapped.fieldErrors);
      setStatus("error");
      setMessage(mapped.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Change password" />
      <Card className="max-w-xl">
        <CardHeader>
          <SectionHeading title="Password" icon={ShieldCheck} tone="admin" />
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit} noValidate>
            <PasswordField
              id="currentPassword"
              label="Current password"
              value={fields.currentPassword}
              autoComplete="current-password"
              error={errors.currentPassword}
              disabled={submitting}
              onChange={(value) => updateField("currentPassword", value)}
            />
            <PasswordField
              id="newPassword"
              label="New password"
              value={fields.newPassword}
              autoComplete="new-password"
              error={errors.newPassword}
              disabled={submitting}
              onChange={(value) => updateField("newPassword", value)}
            />
            <PasswordField
              id="confirmPassword"
              label="Confirm new password"
              value={fields.confirmPassword}
              autoComplete="new-password"
              error={errors.confirmPassword}
              disabled={submitting}
              onChange={(value) => updateField("confirmPassword", value)}
            />
            {message && <p className={status === "success" ? "text-sm text-[var(--accent-success)]" : "text-sm text-destructive"}>{message}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? "Changing password" : "Change password"}</Button>
          </form>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function PasswordField({ id, label, value, autoComplete, error, disabled, onChange }: {
  id: keyof PasswordFields;
  label: string;
  value: string;
  autoComplete: "current-password" | "new-password";
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="password" autoComplete={autoComplete} value={value} disabled={disabled} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={(event) => onChange(event.target.value)} />
      {error && <p id={`${id}-error`} className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function validateFields(fields: PasswordFields) {
  const errors: FieldErrors = {};
  if (!fields.currentPassword) errors.currentPassword = "Current password is required.";
  if (!fields.newPassword) errors.newPassword = "New password is required.";
  else if ([...fields.newPassword].length < 10) errors.newPassword = "Password must be at least 10 characters.";
  if (!fields.confirmPassword) errors.confirmPassword = "Confirm your new password.";
  else if (fields.newPassword && fields.newPassword !== fields.confirmPassword) errors.confirmPassword = "Passwords do not match.";
  if (fields.currentPassword && fields.newPassword && fields.currentPassword === fields.newPassword) errors.newPassword = "New password must be different.";
  return errors;
}

function mapChangePasswordError(error: unknown): { message: string; fieldErrors: FieldErrors } {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "INVALID_CURRENT_PASSWORD":
        return { message: "Password change failed.", fieldErrors: { currentPassword: "Current password is incorrect." } };
      case "PASSWORD_CONFIRMATION_MISMATCH":
        return { message: "Password change failed.", fieldErrors: { confirmPassword: "Passwords do not match." } };
      case "PASSWORD_POLICY_FAILED":
        return { message: "Password change failed.", fieldErrors: { newPassword: "Password must be at least 10 characters." } };
      case "PASSWORD_UNCHANGED":
        return { message: "Password change failed.", fieldErrors: { newPassword: "New password must be different." } };
      case "TOO_MANY_LOGIN_ATTEMPTS":
        return { message: error.message, fieldErrors: {} };
      case "UNAUTHENTICATED":
        return { message: "Your session has expired. Sign in again.", fieldErrors: {} };
      default:
        return { message: error.message || "Password change failed.", fieldErrors: {} };
    }
  }
  return { message: "Password change failed.", fieldErrors: {} };
}
