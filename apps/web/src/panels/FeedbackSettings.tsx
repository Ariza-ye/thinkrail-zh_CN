import { RiExternalLinkLine as ExternalLink } from "@remixicon/react";
import { buttonVariants } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";
import { INTERVIEW_BOOKING_URL, INTERVIEW_INVITATION_COPY } from "./interview";

export function FeedbackSettings() {
	const { t } = useI18n();
	return (
		<section data-testid="settings-feedback" className="flex flex-col gap-16">
			<div className="flex flex-col gap-4">
				<h3 className="tr-title-section text-text-default">{t("Feedback")}</h3>
				<p className="text-text-muted tr-text-metadata">{t(INTERVIEW_INVITATION_COPY)}</p>
			</div>
			<a
				data-testid="feedback-schedule-interview"
				href={INTERVIEW_BOOKING_URL}
				target="_blank"
				rel="noopener noreferrer"
				className={buttonVariants({ className: "self-start" })}
			>
				<ExternalLink className="size-14" />
				{t("Schedule an interview")}
			</a>
		</section>
	);
}
