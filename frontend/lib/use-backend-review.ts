"use client";

import { useEffect, useRef, useState } from "react";

import { backendRequest } from "@/lib/backend-api";
import type { BackendAnalysisJob, CreateAnalysisJobPayload } from "@/lib/domain-types";

export function useBackendReview({
  enabled,
  payload,
  sessionId,
}: {
  enabled: boolean;
  payload: CreateAnalysisJobPayload | null;
  sessionId: number;
}) {
  const [job, setJob] = useState<BackendAnalysisJob | null>(null);
  const [error, setError] = useState("");
  const payloadRef = useRef(payload);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    setJob(null);
    setError("");
    if (!enabled || !payloadRef.current) return;

    async function poll(publicId: string) {
      if (cancelled) return;
      try {
        const next = await backendRequest<BackendAnalysisJob>(`/api/analysis/jobs/${publicId}`);
        if (cancelled) return;
        setJob(next);
        if (next.status === "COMPLETED") return;
        if (next.status === "FAILED") {
          setError(next.errorMessage ?? "Backend không thể hoàn tất Game Review.");
          return;
        }
        timer = window.setTimeout(() => void poll(publicId), 700);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Không thể đọc tiến độ phân tích.");
        }
      }
    }

    void backendRequest<BackendAnalysisJob>("/api/analysis/jobs", {
      method: "POST",
      body: JSON.stringify(payloadRef.current),
    })
      .then((created) => {
        if (cancelled) return;
        setJob(created);
        void poll(created.publicId);
      })
      .catch((caughtError) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Không thể bắt đầu Game Review.");
        }
      });

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, sessionId]);

  return { error, job };
}
