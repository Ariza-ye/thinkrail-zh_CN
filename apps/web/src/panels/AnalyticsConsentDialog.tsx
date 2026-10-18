import { Button } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { useI18n } from "@thinkrail/ui/i18n";
import { useEffect, useRef, useState } from "react";
import { ANALYTICS_DESCRIPTION, AnalyticsSharingSwitch } from "./AnalyticsPreferences";
import { useAnalyticsConsent } from "./useAnalyticsConsent";

export function AnalyticsConsentDialog() {
	const { t } = useI18n();
	const [draft, setDraft] = useState(true);
	const primed = useRef(false);
	const { pending, error, save, prime } = useAnalyticsConsent();

	useEffect(() => {
		if (primed.current) return;
		primed.current = true;
		prime();
	}, [prime]);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) save(draft);
			}}
		>
			<DialogContent data-testid="analytics-consent-dialog">
				<DialogHeader>
					<DialogTitle>{t("Help improve ThinkRail")}</DialogTitle>
					<DialogDescription>{t(ANALYTICS_DESCRIPTION)}</DialogDescription>
				</DialogHeader>
				<AnalyticsSharingSwitch
					enabled={draft}
					disabled={pending}
					onChange={(enabled) => {
						setDraft(enabled);
						if (!enabled) save(false);
					}}
				/>
				{error && (
					<p role="alert" className="tr-text-metadata text-feedback-error">
						{error}
					</p>
				)}
				<DialogFooter>
					<Button
						disabled={pending}
						data-testid="analytics-consent-confirm"
						onClick={() => save(draft)}
					>
						{pending ? t("Saving…") : t("Done")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
