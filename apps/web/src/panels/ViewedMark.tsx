import { RiCheckLine as Check } from "@remixicon/react";
import { useI18n } from "@thinkrail/ui/i18n";

export function ViewedMark() {
	const { t } = useI18n();
	return (
		<span
			data-testid="change-viewed"
			role="img"
			aria-label={t("Viewed")}
			title={t("Viewed")}
			className="flex size-14 shrink-0 items-center justify-center rounded-xs bg-primary text-text-on-primary"
		>
			<Check className="size-10" />
		</span>
	);
}
