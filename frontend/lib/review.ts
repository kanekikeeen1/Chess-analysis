import type { ReviewOutcome } from "@/lib/domain-types";

/** Trang đích để ôn một thẻ; `from=review` để trang đó hiện nút quay lại "Ôn tập hôm nay". */
export function reviewHref(kind: "PUZZLE" | "MISTAKE", itemId: number) {
  return kind === "PUZZLE" ? `/puzzles?puzzle=${itemId}&from=review` : `/mistakes?id=${itemId}&from=review`;
}

/** Đọc một tham số trên URL hiện tại (client); tránh useSearchParams vì nó buộc trang phải có Suspense. */
export function queryParam(name: string) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function describeReview(review: ReviewOutcome) {
  const when = review.intervalDays <= 1 ? "ngày mai" : `sau ${review.intervalDays} ngày`;
  return review.newCard
    ? `Đã thêm vào Ôn tập — bạn sẽ gặp lại bài này ${when}.`
    : `Lịch ôn đã cập nhật: gặp lại ${when}.`;
}
