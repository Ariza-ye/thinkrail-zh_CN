import type { OpenBranchReview } from "@thinkrail/contracts";
import { translate } from "@thinkrail/ui/i18n";
import { isOpenBranchReview } from "../../panels/useOpenBranchReview";

export interface RemoteCounts {
	unpushed: number;
	behind: number;
}

export function remoteCounts(
	review: OpenBranchReview | null,
	detailsKnown = true,
): RemoteCounts | "unknown" | null {
	if (!review || !isOpenBranchReview(review)) return null;
	if (!detailsKnown) return "unknown";
	const unpushed = review.unpushedCommits ?? 0;
	const behind = review.behindCommits ?? 0;
	return unpushed > 0 || behind > 0 ? { unpushed, behind } : null;
}

export type ReviewTone = "success" | "info" | "neutral";

export function reviewTone(review: OpenBranchReview): ReviewTone {
	return review.state === "merged" ? "info" : review.state === "closed" ? "neutral" : "success";
}

export function reviewStateLabel(review: OpenBranchReview): string {
	return review.state === "merged"
		? translate("Merged")
		: review.state === "closed"
			? translate("Closed")
			: translate("Open");
}

/** `PR #12` while open; `Merged #12` / `Closed #12` afterwards (MRs keep their `!`). */
export function reviewChipLabel(review: OpenBranchReview): string {
	const ref = `${review.kind === "pull-request" ? "#" : "!"}${review.number}`;
	if (isOpenBranchReview(review))
		return translate("{state} {ref}", {
			state: review.kind === "pull-request" ? "PR" : "MR",
			ref: ref,
		});
	return translate("{state} {ref}", { state: reviewStateLabel(review), ref: ref });
}

export function projectInitial(name: string): string {
	const first = [...name.trim()][0];
	return first ? first.toLocaleUpperCase() : "?";
}

export function pluralCommits(count: number): string {
	return translate(count === 1 ? "{count} commit" : "{count} commits", { count });
}
