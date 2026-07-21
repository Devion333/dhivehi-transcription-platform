"use client";

import { Archive, Bell, Cpu, FileText, Save, Shield, Upload, Wrench } from "lucide-react";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { usePublicSettings } from "@/components/app/public-settings-provider";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAdminSystemSettings, restoreDefaultSystemSettings, updateAdminSystemSettings } from "@/lib/api/settings";
import type { SystemSettings } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type SettingsSectionId = "uploads" | "processing" | "transcripts" | "security" | "notifications" | "retention" | "maintenance";

const sections: Array<{ id: SettingsSectionId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "uploads", label: "Uploads", icon: Upload },
  { id: "processing", label: "Processing", icon: Cpu },
  { id: "transcripts", label: "Transcripts and analysis", icon: FileText },
  { id: "security", label: "Security", icon: Shield },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "retention", label: "Retention", icon: Archive },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
];

export function AdminSettingsClient() {
  const [settings, setSettings] = React.useState<SystemSettings | null>(null);
  const [baseline, setBaseline] = React.useState<SystemSettings | null>(null);
  const [activeSection, setActiveSection] = React.useState<SettingsSectionId>("uploads");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [warning, setWarning] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);
  const { refreshSettings } = usePublicSettings();
  const contentScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getAdminSystemSettings(controller.signal)
      .then((response) => {
        setSettings(response);
        setBaseline(response);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "System settings are unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const dirty = Boolean(settings && baseline && JSON.stringify(settings) !== JSON.stringify(baseline));

  function update<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) {
    setSettings((current) => current ? { ...current, [key]: value } : current);
    setMessage(null);
    setWarning(null);
  }

  function handleSectionChange(section: SettingsSectionId) {
    setActiveSection(section);
    window.requestAnimationFrame(() => {
      contentScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    });
  }

  async function refreshPublicSettingsAfterSave() {
    try {
      await refreshSettings();
    } catch {
      setWarning("Settings were saved, but the application banner could not be refreshed.");
    }
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setWarning(null);
    try {
      const response = await updateAdminSystemSettings(settings);
      await refreshPublicSettingsAfterSave();
      setSettings(response.settings);
      setBaseline(response.settings);
      setMessage("System settings saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaults() {
    if (!window.confirm("Restore all system settings to defaults?")) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    setWarning(null);
    try {
      const response = await restoreDefaultSystemSettings();
      await refreshPublicSettingsAfterSave();
      setSettings(response.settings);
      setBaseline(response.settings);
      setMessage("System settings restored to defaults.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore defaults");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer className="box-border flex min-h-0 flex-1 flex-col overflow-hidden pt-8 pb-0">
      <PageHeader
        title="System Settings"
        description={dirty ? "Unsaved changes" : baseline?.updatedAt ? `Last updated ${formatDate(baseline.updatedAt)}` : undefined}
        className="shrink-0"
        actions={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={restoreDefaults} disabled={saving}>Restore defaults</Button><Button onClick={save} disabled={!settings || saving || !dirty}><Save className="h-4 w-4" /> Save changes</Button></div>}
      />
      {loading && <LoadingState label="Loading system settings" />}
      {error && <ErrorState title="Settings error" description={error} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && settings && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {message && <div className="rounded-lg border border-[var(--accent-success-border)] bg-[var(--accent-success-bg)] px-4 py-3 text-sm text-[var(--accent-success)]">{message}</div>}
          {warning && <div className="rounded-lg border border-[var(--accent-warning-border)] bg-[var(--accent-warning-bg)] px-4 py-3 text-sm text-[var(--accent-warning)]">{warning}</div>}
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-6 overflow-hidden">
            <MobileSettingsNavigation activeSection={activeSection} onChange={handleSectionChange} />
            <div className="flex min-h-0 flex-1 gap-8 overflow-hidden">
              <aside className="hidden w-[280px] shrink-0 lg:block">
                <SettingsNavigation activeSection={activeSection} onChange={handleSectionChange} />
              </aside>
              <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <div
                  ref={contentScrollRef}
                  className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-contain pr-2"
                  tabIndex={0}
                  aria-label="Settings content"
                >
                  <div className="min-w-0">
                    <SettingsSection
                      section={activeSection}
                      settings={settings}
                      update={update}
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function MobileSettingsNavigation({ activeSection, onChange }: { activeSection: SettingsSectionId; onChange: (section: SettingsSectionId) => void }) {
  return (
    <div className="lg:hidden">
      <label className="space-y-2">
        <span className="text-sm font-medium">Settings section</span>
        <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={activeSection} onChange={(event) => onChange(event.target.value as SettingsSectionId)}>
          {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
        </select>
      </label>
    </div>
  );
}

function SettingsNavigation({ activeSection, onChange }: { activeSection: SettingsSectionId; onChange: (section: SettingsSectionId) => void }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <nav aria-label="Settings sections" className="space-y-1">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = section.id === activeSection;
          return (
            <button key={section.id} type="button" className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-[var(--accent-primary-bg)] font-medium text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary-border)]")} onClick={() => onChange(section.id)} aria-current={active ? "page" : undefined}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">{section.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function SettingsSection({ section, settings, update }: { section: SettingsSectionId; settings: SystemSettings; update: <K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) => void }) {
  if (section === "uploads") {
    return <SectionRoot><Card><CardHeader><CardTitle>Uploads</CardTitle></CardHeader><CardContent className="space-y-8 p-6"><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3"><Check label="Uploads enabled" checked={settings.uploadsEnabled} onChange={(value) => update("uploadsEnabled", value)} /><NumberField label="Maximum upload size (MB)" value={settings.maximumUploadSizeMb} onChange={(value) => update("maximumUploadSizeMb", value)} min={1} max={10240} helper="Largest accepted file size for new uploads." /><Check label="Require category" checked={settings.requireCategory} onChange={(value) => update("requireCategory", value)} /></div><AllowedFormatsField value={settings.allowedUploadFormats} onChange={(value) => update("allowedUploadFormats", value)} /></CardContent></Card></SectionRoot>;
  }
  if (section === "processing") {
    return <SectionRoot><Card><CardHeader><CardTitle>Processing</CardTitle></CardHeader><CardContent className="grid gap-6 p-6 md:grid-cols-2"><Check label="Processing enabled" checked={settings.processingEnabled} onChange={(value) => update("processingEnabled", value)} /><Check label="Automatic processing" checked={settings.automaticProcessing} onChange={(value) => update("automaticProcessing", value)} /><NumberField label="Maximum processing retries" value={settings.maximumProcessingRetries} onChange={(value) => update("maximumProcessingRetries", value)} min={0} max={10} /><NumberField label="Retry delay (minutes)" value={settings.retryDelayMinutes} onChange={(value) => update("retryDelayMinutes", value)} min={1} max={1440} /></CardContent></Card></SectionRoot>;
  }
  if (section === "transcripts") {
    return <SectionRoot><Card><CardHeader><CardTitle>Transcripts and analysis</CardTitle></CardHeader><CardContent className="space-y-8 p-6"><SettingGroup title="Transcript editing"><div className="grid gap-6 md:grid-cols-2"><Check label="Transcript editing enabled" checked={settings.transcriptEditingEnabled} onChange={(value) => update("transcriptEditingEnabled", value)} /><Check label="Speaker renaming enabled" checked={settings.speakerRenamingEnabled} onChange={(value) => update("speakerRenamingEnabled", value)} /></div></SettingGroup><SettingGroup title="Downloads"><div className="grid gap-6 md:grid-cols-2"><Check label="Transcript downloads enabled" checked={settings.transcriptDownloadsEnabled} onChange={(value) => update("transcriptDownloadsEnabled", value)} /><TextField label="Enabled download formats" value={settings.enabledDownloadFormats.join(", ")} onChange={(value) => update("enabledDownloadFormats", list(value))} /></div></SettingGroup><SettingGroup title="Transcript review requirements"><div className="grid gap-6 md:grid-cols-2"><Check label="Require full review before download" checked={settings.requireFullReviewBeforeDownload} onChange={(value) => update("requireFullReviewBeforeDownload", value)} /><Check label="Require full review before analysis" checked={settings.requireFullReviewBeforeAnalysis} onChange={(value) => update("requireFullReviewBeforeAnalysis", value)} /></div></SettingGroup><SettingGroup title="Analysis availability"><div className="grid gap-6 md:grid-cols-2"><Check label="Analysis enabled" checked={settings.analysisEnabled} onChange={(value) => update("analysisEnabled", value)} /><Check label="Automatic analysis" checked={settings.automaticAnalysis} onChange={(value) => update("automaticAnalysis", value)} /></div></SettingGroup><SettingGroup title="Analysis outputs"><TextField label="Enabled analysis outputs" value={settings.enabledAnalysisOutputs.join(", ")} onChange={(value) => update("enabledAnalysisOutputs", list(value))} /></SettingGroup><SettingGroup title="Analysis permissions"><Check label="Users can rerun analysis" checked={settings.usersCanRerunAnalysis} onChange={(value) => update("usersCanRerunAnalysis", value)} /></SettingGroup></CardContent></Card></SectionRoot>;
  }
  if (section === "security") {
    return <SectionRoot><Card><CardHeader><CardTitle>Security</CardTitle></CardHeader><CardContent className="grid gap-6 p-6 md:grid-cols-2 xl:grid-cols-3"><NumberField label="Session duration (minutes)" value={settings.sessionDurationMinutes} onChange={(value) => update("sessionDurationMinutes", value)} min={15} max={10080} /><NumberField label="Maximum failed login attempts" value={settings.maximumFailedLoginAttempts} onChange={(value) => update("maximumFailedLoginAttempts", value)} min={1} max={20} /><NumberField label="Account lockout (minutes)" value={settings.accountLockoutMinutes} onChange={(value) => update("accountLockoutMinutes", value)} min={1} max={1440} /></CardContent></Card></SectionRoot>;
  }
  if (section === "notifications") {
    return <SectionRoot><Card><CardHeader><CardTitle>Notifications</CardTitle></CardHeader><CardContent className="grid gap-6 p-6 md:grid-cols-2"><Check label="Notify transcription complete" checked={settings.notifyTranscriptionComplete} onChange={(value) => update("notifyTranscriptionComplete", value)} /><Check label="Notify processing failed" checked={settings.notifyProcessingFailed} onChange={(value) => update("notifyProcessingFailed", value)} /><Check label="Notify analysis complete" checked={settings.notifyAnalysisComplete} onChange={(value) => update("notifyAnalysisComplete", value)} /><Check label="Notify transcript assigned" checked={settings.notifyTranscriptAssigned} onChange={(value) => update("notifyTranscriptAssigned", value)} /><Check label="Notify review status changed" checked={settings.notifyReviewStatusChanged} onChange={(value) => update("notifyReviewStatusChanged", value)} /></CardContent></Card></SectionRoot>;
  }
  if (section === "retention") {
    return <SectionRoot><Card><CardHeader><CardTitle>Retention</CardTitle></CardHeader><CardContent className="space-y-6 p-6"><div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"><p>Expired audit records and notifications are removed automatically once per day.</p><p className="mt-1">Set a retention value to 0 to retain that data indefinitely.</p></div><div className="grid gap-6 md:grid-cols-2"><NumberField label="Audit log retention (days)" value={settings.auditRetentionDays} onChange={(value) => update("auditRetentionDays", value)} min={0} max={3650} helper="How long audit records are retained." /><NumberField label="Notification retention (days)" value={settings.notificationRetentionDays} onChange={(value) => update("notificationRetentionDays", value)} min={0} max={3650} helper="How long notifications are retained." /></div></CardContent></Card></SectionRoot>;
  }
  return <SectionRoot><Card><CardHeader><CardTitle>Maintenance</CardTitle></CardHeader><CardContent className="grid gap-6 p-6 md:grid-cols-2"><Check label="Maintenance mode" checked={settings.maintenanceMode} onChange={(value) => update("maintenanceMode", value)} /><Check label="Announcement enabled" checked={settings.announcementEnabled} onChange={(value) => update("announcementEnabled", value)} /><TextAreaField label="Maintenance message" value={settings.maintenanceMessage} onChange={(value) => update("maintenanceMessage", value)} /><TextAreaField label="Announcement message" value={settings.announcementMessage} onChange={(value) => update("announcementMessage", value)} /><TextField label="Announcement expiry" value={settings.announcementExpiresAt ?? ""} onChange={(value) => update("announcementExpiresAt", value.trim() || null)} helper="RFC3339 timestamp, optional." /><TextField label="Organisation name" value={settings.organisationName} onChange={(value) => update("organisationName", value)} /><TextField label="PDF header text" value={settings.pdfHeaderText} onChange={(value) => update("pdfHeaderText", value)} /></CardContent></Card></SectionRoot>;
}

function SectionRoot({ children }: { children: React.ReactNode }) {
  return <div className="min-w-0 space-y-8 pb-8">{children}</div>;
}

function SettingGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-4 border-b pb-8 last:border-b-0 last:pb-0"><h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</section>;
}

function list(value: string) {
  return value.split(",").map((item) => item.trim().replace(/^\./, "").toLowerCase()).filter(Boolean);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function Check({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-16 items-center justify-between gap-4 rounded-lg border px-4 py-3"><span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}</span><input type="checkbox" className="h-4 w-4 shrink-0" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function NumberField({ label, value, onChange, min, max, helper }: { label: string; value: number; onChange: (value: number) => void; min: number; max: number; helper?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input className="h-10 w-full" type="number" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />{helper && <p className="text-sm text-muted-foreground">{helper}</p>}</div>;
}

function TextField({ label, value, onChange, helper }: { label: string; value: string; onChange: (value: string) => void; helper?: string }) {
  return <div className="space-y-2"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} />{helper && <p className="text-xs text-muted-foreground">{helper}</p>}</div>;
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label>{label}</Label><Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} /></div>;
}

const audioUploadFormats = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];
const videoUploadFormats = ["mp4", "mov", "mkv", "webm"];

function AllowedFormatsField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const selected = new Set(value);
  function toggle(format: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(format); else next.delete(format);
    onChange([...next].sort());
  }
  return <div className="space-y-4"><Label>Allowed upload formats</Label><div className="grid gap-6 xl:grid-cols-2"><FormatGroup title="Audio formats" formats={audioUploadFormats} selected={selected} onToggle={toggle} /><FormatGroup title="Video formats" formats={videoUploadFormats} selected={selected} onToggle={toggle} /></div></div>;
}

function FormatGroup({ title, formats, selected, onToggle }: { title: string; formats: string[]; selected: Set<string>; onToggle: (format: string, checked: boolean) => void }) {
  return <div className="space-y-3 rounded-xl border p-4"><p className="text-sm font-medium">{title}</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{formats.map((format) => <label key={format} className="flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-medium uppercase transition-colors has-[:checked]:border-[var(--accent-primary-border)] has-[:checked]:bg-[var(--accent-primary-bg)] has-[:checked]:text-[var(--accent-primary)]"><input className="sr-only" type="checkbox" checked={selected.has(format)} onChange={(event) => onToggle(format, event.target.checked)} /><span>{format}</span></label>)}</div></div>;
}
