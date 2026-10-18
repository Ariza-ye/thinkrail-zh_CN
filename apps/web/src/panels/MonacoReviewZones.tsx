import { useI18n } from "@thinkrail/ui/i18n";
import { useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import type { SurfaceReview } from "@/resources";
import { ReviewComposer } from "./ReviewComposer";
import { ReviewThreadCard } from "./ReviewThreadCard";
import type { MonacoReviewZoneState } from "./reviewWidgets";

export function MonacoReviewZones({
	zones,
	review,
	onCloseComposer,
	onRendered,
}: {
	zones: MonacoReviewZoneState;
	review: SurfaceReview | undefined;
	onCloseComposer: () => void;
	onRendered: () => void;
}) {
	const { t } = useI18n();
	useLayoutEffect(onRendered, [onRendered, review, zones]);
	if (!review) return null;
	const threads = new Map(review.threads.map((thread) => [thread.id, thread]));
	const composer = zones.composer;
	return (
		<>
			{zones.threads.map((zone) => {
				const thread = threads.get(zone.commentId);
				return thread
					? createPortal(
							<ReviewThreadCard thread={thread} actions={review.actions} />,
							zone.node,
							`thread:${zone.commentId}`,
						)
					: null;
			})}
			{composer
				? createPortal(
						<ReviewComposer
							draft={{
								selectors: [{ kind: "lineRange", ...composer.selection }],
								label:
									composer.selection.startLine === composer.selection.endLine
										? `L${composer.selection.startLine}`
										: `L${composer.selection.startLine}–${composer.selection.endLine}`,
							}}
							label={
								composer.selection.startLine === composer.selection.endLine
									? t("Line {startLine}", { startLine: composer.selection.startLine })
									: t("Lines {startLine}–{endLine}", {
											startLine: composer.selection.startLine,
											endLine: composer.selection.endLine,
										})
							}
							commenting={review.commenting}
							onClose={onCloseComposer}
						/>,
						composer.node,
						"composer",
					)
				: null}
		</>
	);
}
