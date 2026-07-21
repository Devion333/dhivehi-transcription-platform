"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: use-transcript-status-polling.ts
// Description: Custom hook: use-transcript-status-polling
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import * as React from "react";

import { getTranscriptStatus } from "@/lib/api/transcripts";
import type { TranscriptStatusResponse } from "@/lib/api/types";

export function useTranscriptStatusPolling({
  jobId,
  enabled,
  initialTerminal = false,
  intervalMs = 3000,
  onStatus,
  onError,
}: {
  jobId: string;
  enabled: boolean;
  initialTerminal?: boolean;
  intervalMs?: number;
  onStatus: (status: TranscriptStatusResponse) => void;
  onError?: (error: unknown) => void;
}) {
  const [polling, setPolling] = React.useState(false);
  const terminalRef = React.useRef(initialTerminal);
  const inFlightRef = React.useRef(false);
  const onStatusRef = React.useRef(onStatus);
  const onErrorRef = React.useRef(onError);

  React.useEffect(() => {
    onStatusRef.current = onStatus;
    onErrorRef.current = onError;
  }, [onStatus, onError]);

  React.useEffect(() => {
    terminalRef.current = initialTerminal;
  }, [initialTerminal, jobId]);

  React.useEffect(() => {
    if (!enabled || !jobId || terminalRef.current) {
      setPolling(false);
      return;
    }

    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function poll() {
      if (disposed || terminalRef.current) return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      controller = new AbortController();
      setPolling(true);
      try {
        const status = await getTranscriptStatus(jobId, controller.signal);
        if (disposed) return;
        onStatusRef.current(status);
        terminalRef.current = status.isTerminal;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) onErrorRef.current?.(error);
      } finally {
        inFlightRef.current = false;
        controller = null;
        if (!disposed && !terminalRef.current) schedule();
        else setPolling(false);
      }
    }

    function schedule() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(poll, intervalMs);
    }

    poll();
    return () => {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      controller?.abort();
      setPolling(false);
    };
  }, [enabled, intervalMs, jobId, initialTerminal]);

  return { polling };
}
