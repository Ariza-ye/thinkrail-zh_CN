import { RiAlertLine } from "@remixicon/react";
import { useI18n } from "@thinkrail/ui/i18n";
import { FILE_CHANGED_NOTICE } from "./reviewComposerState";

export function StaleComposerNotice({ visible }: { visible: boolean }) {
	const { t } = useI18n();
	return visible ? (
		<p
			role="status"
			data-testid="review-selection-stale"
			className="flex items-center gap-8 rounded-sm border border-feedback-warning-muted bg-container-elevated-bg px-8 py-4 tr-text-metadata text-text-default"
		>
			<RiAlertLine className="size-14 shrink-0 text-feedback-warning" aria-hidden />
			{t(FILE_CHANGED_NOTICE)}
		</p>
	) : null;
}
