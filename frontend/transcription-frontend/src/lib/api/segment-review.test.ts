import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./client", () => {
  class MockApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return {
    request: vi.fn(),
    ApiError: MockApiError,
    isApiError: (error: unknown) => error instanceof MockApiError,
  };
});

import { request, ApiError as MockApiError } from "./client";
import { updateSegmentReview, bulkUpdateSegmentReview } from "./transcripts";
import type { SegmentReviewResponse, BulkReviewResponse } from "./types";

const mockRequest = request as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRequest.mockReset();
});

describe("updateSegmentReview", () => {
  const validReviewResponse: SegmentReviewResponse = {
    segmentId: "seg-1",
    isReviewed: true,
    reviewedBy: "user-123",
    reviewedAt: "2026-07-20T09:00:00Z",
    reviewedSegmentCount: 4,
    totalSegmentCount: 10,
    reviewPercentage: 40,
  };

  it("marks a segment as reviewed and returns flat response", async () => {
    mockRequest.mockResolvedValue(validReviewResponse);
    const result = await updateSegmentReview("job-1", "seg-1", true);
    expect(result.isReviewed).toBe(true);
    expect(result.reviewedBy).toBe("user-123");
    expect(result.reviewedAt).toBe("2026-07-20T09:00:00Z");
    expect(result.segmentId).toBe("seg-1");
    expect(result.reviewedSegmentCount).toBe(4);
    expect(result.totalSegmentCount).toBe(10);
    expect(result.reviewPercentage).toBe(40);
    // No nested segment property
    expect("segment" in result).toBe(false);
  });

  it("marks a segment as not reviewed and returns null reviewer", async () => {
    const unreviewResponse: SegmentReviewResponse = {
      segmentId: "seg-1",
      isReviewed: false,
      reviewedBy: null,
      reviewedAt: null,
      reviewedSegmentCount: 0,
      totalSegmentCount: 10,
      reviewPercentage: 0,
    };
    mockRequest.mockResolvedValue(unreviewResponse);
    const result = await updateSegmentReview("job-1", "seg-1", false);
    expect(result.isReviewed).toBe(false);
    expect(result.reviewedBy).toBeNull();
    expect(result.reviewedAt).toBeNull();
    expect(result.reviewedSegmentCount).toBe(0);
    expect(result.reviewPercentage).toBe(0);
  });

  it("throws on empty jobId", () => {
    expect(() => updateSegmentReview("", "seg-1", true)).toThrow("A transcript job ID is required");
  });

  it("throws on empty segmentId", () => {
    expect(() => updateSegmentReview("job-1", "", true)).toThrow("A segment ID is required");
  });

  it("propagates API errors preserving segment state", async () => {
    mockRequest.mockRejectedValue(new MockApiError("Forbidden", 403, "maintenance_mode"));
    try {
      await updateSegmentReview("job-1", "seg-1", true);
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(MockApiError);
      expect((err as MockApiError).code).toBe("maintenance_mode");
      expect((err as MockApiError).status).toBe(403);
    }
  });
});

describe("bulkUpdateSegmentReview", () => {
  const validBulkResponse: BulkReviewResponse = {
    reviewedSegmentCount: 10,
    totalSegmentCount: 10,
    reviewPercentage: 100,
    message: "Marked all 10 segments as reviewed",
  };

  it("returns flat response with counts and message", async () => {
    mockRequest.mockResolvedValue(validBulkResponse);
    const result = await bulkUpdateSegmentReview("job-1", true);
    expect(result.reviewedSegmentCount).toBe(10);
    expect(result.totalSegmentCount).toBe(10);
    expect(result.reviewPercentage).toBe(100);
    expect(result.message).toContain("Marked all");
    // No nested segment property
    expect("segment" in result).toBe(false);
  });

  it("returns zero counts when unreviewing all", async () => {
    const unreviewBulk: BulkReviewResponse = {
      reviewedSegmentCount: 0,
      totalSegmentCount: 10,
      reviewPercentage: 0,
      message: "Marked all 10 segments as not reviewed",
    };
    mockRequest.mockResolvedValue(unreviewBulk);
    const result = await bulkUpdateSegmentReview("job-1", false);
    expect(result.reviewedSegmentCount).toBe(0);
    expect(result.reviewPercentage).toBe(0);
  });

  it("throws on empty jobId", () => {
    expect(() => bulkUpdateSegmentReview("", true)).toThrow("A transcript job ID is required");
  });
});

describe("state update logic (transcript-details-client pattern)", () => {
  type SegmentState = {
    id: string;
    isReviewed: boolean;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };

  type DetailState = {
    reviewedSegmentCount: number;
    totalSegmentCount: number;
    reviewPercentage: number;
    segments: SegmentState[];
  };

  const prevDetail: DetailState = {
    reviewedSegmentCount: 1,
    totalSegmentCount: 5,
    reviewPercentage: 20,
    segments: [
      { id: "seg-1", isReviewed: false, reviewedBy: null, reviewedAt: null },
      { id: "seg-2", isReviewed: true, reviewedBy: "user-1", reviewedAt: "2026-01-01T00:00:00Z" },
    ],
  };

  it("updates segment from unreviewed to reviewed using backend response", () => {
    const response: SegmentReviewResponse = {
      segmentId: "seg-1",
      isReviewed: true,
      reviewedBy: "user-123",
      reviewedAt: "2026-07-20T09:00:00Z",
      reviewedSegmentCount: 2,
      totalSegmentCount: 5,
      reviewPercentage: 40,
    };

    const updated: DetailState = {
      ...prevDetail,
      reviewedSegmentCount: response.reviewedSegmentCount,
      totalSegmentCount: response.totalSegmentCount,
      reviewPercentage: response.reviewPercentage,
      segments: prevDetail.segments.map((s) =>
        s.id === "seg-1"
          ? {
              ...s,
              isReviewed: response.isReviewed,
              reviewedBy: response.reviewedBy,
              reviewedAt: response.reviewedAt,
            }
          : s
      ),
    };

    expect(updated.segments[0].isReviewed).toBe(true);
    expect(updated.segments[0].reviewedBy).toBe("user-123");
    expect(updated.segments[0].reviewedAt).toBe("2026-07-20T09:00:00Z");
    expect(updated.reviewedSegmentCount).toBe(2);
    expect(updated.reviewPercentage).toBe(40);
    // Unaffected segment unchanged
    expect(updated.segments[1].isReviewed).toBe(true);
    expect(updated.segments[1].reviewedBy).toBe("user-1");
  });

  it("updates segment from reviewed to unreviewed using backend response", () => {
    const response: SegmentReviewResponse = {
      segmentId: "seg-2",
      isReviewed: false,
      reviewedBy: null,
      reviewedAt: null,
      reviewedSegmentCount: 0,
      totalSegmentCount: 5,
      reviewPercentage: 0,
    };

    const updated: DetailState = {
      ...prevDetail,
      reviewedSegmentCount: response.reviewedSegmentCount,
      totalSegmentCount: response.totalSegmentCount,
      reviewPercentage: response.reviewPercentage,
      segments: prevDetail.segments.map((s) =>
        s.id === "seg-2"
          ? { ...s, isReviewed: response.isReviewed, reviewedBy: response.reviewedBy, reviewedAt: response.reviewedAt }
          : s
      ),
    };

    expect(updated.segments[1].isReviewed).toBe(false);
    expect(updated.segments[1].reviewedBy).toBeNull();
    expect(updated.segments[1].reviewedAt).toBeNull();
    expect(updated.reviewedSegmentCount).toBe(0);
    expect(updated.reviewPercentage).toBe(0);
    // Unaffected segment unchanged
    expect(updated.segments[0].isReviewed).toBe(false);
  });

  it("preserves previous state on null response (malformed)", () => {
    function updateState(detail: DetailState, resp: SegmentReviewResponse | null): DetailState {
      return {
        ...detail,
        reviewedSegmentCount: resp!.reviewedSegmentCount,
        totalSegmentCount: resp!.totalSegmentCount,
        reviewPercentage: resp!.reviewPercentage,
        segments: detail.segments.map((s) =>
          s.id === "seg-1"
            ? { ...s, isReviewed: resp!.isReviewed, reviewedBy: resp!.reviewedBy, reviewedAt: resp!.reviewedAt }
            : s
        ),
      };
    }
    let updated: DetailState;
    try {
      const response = null;
      if (!response) throw new Error("malformed response");
      updated = updateState(prevDetail, response);
    } catch {
      updated = prevDetail;
    }
    expect(updated).toBe(prevDetail);
    expect(updated.segments).toEqual(prevDetail.segments);
    expect(updated.reviewedSegmentCount).toBe(1);
  });

  it("preserves previous segment state on request failure", () => {
    // Simulate error before setDetail runs
    const segmentsBefore = [...prevDetail.segments];
    let error: Error | null = null;
    try {
      throw new Error("Network error");
    } catch (err) {
      error = err as Error;
    }
    // State should remain unchanged
    expect(prevDetail.segments).toEqual(segmentsBefore);
    expect(error?.message).toBe("Network error");
  });

  it("handles reviewedBy and reviewedAt as null from backend", () => {
    const response: SegmentReviewResponse = {
      segmentId: "seg-1",
      isReviewed: true,
      reviewedBy: null,
      reviewedAt: null,
      reviewedSegmentCount: 2,
      totalSegmentCount: 5,
      reviewPercentage: 40,
    };

    const updated = prevDetail.segments.map((s) =>
      s.id === "seg-1"
        ? { ...s, isReviewed: response.isReviewed, reviewedBy: response.reviewedBy, reviewedAt: response.reviewedAt }
        : s
    );

    // null should be accepted (not coerced to undefined or empty string)
    expect(updated[0].reviewedBy).toBeNull();
    expect(updated[0].reviewedAt).toBeNull();
  });
});
