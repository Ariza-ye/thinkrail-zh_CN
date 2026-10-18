import { useI18n } from "@thinkrail/ui/i18n";
import { SettingsSwitch } from "./SettingsSwitch";

export const ANALYTICS_DESCRIPTION =
	"Share anonymous product usage and how you found ThinkRail. We never collect prompts, code, files, credentials, or account identity.";

interface AnalyticsPreferenceProps {
	enabled: boolean;
	disabled: boolean;
	onChange: (enabled: boolean) => void;
}

export function AnalyticsSharingSwitch({
	enabled,
	disabled,
	onChange,
	description,
}: AnalyticsPreferenceProps & { description?: string }) {
	const { t } = useI18n();
	return (
		<div className="flex items-center justify-between gap-12 rounded-sm bg-control-bg px-12 py-8">
			<div className="flex flex-col gap-4">
				<span className="tr-title-compact text-text-default">
					{t("Share additional usage data")}
				</span>
				{description && <span>{description}</span>}
			</div>
			<SettingsSwitch
				checked={enabled}
				disabled={disabled}
				label={t("Share additional usage data")}
				testId="analytics-toggle"
				onChange={onChange}
			/>
		</div>
	);
}

export function AnalyticsPreferences(props: AnalyticsPreferenceProps) {
	const { t } = useI18n();
	return (
		<div className="flex flex-col gap-16 tr-text-metadata text-text-muted">
			<AnalyticsSharingSwitch
				{...props}
				description={t("Setup, agent runs, task completions, reviews, and pull-request outcomes.")}
			/>
			<p>
				{t(
					"Reports use a random installation ID, app type, version and channel, OS, and architecture. Custom providers and models are labeled “custom”. No prompts, code, transcripts, file paths, credentials, or recordings.",
				)}
			</p>
		</div>
	);
}
