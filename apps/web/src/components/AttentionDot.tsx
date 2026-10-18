import { useI18n } from "@thinkrail/ui/i18n";
import { cn } from "@thinkrail/ui/utils";

export function AttentionDot({ className }: { className?: string }) {
	const { t } = useI18n();
	return (
		<span
			data-testid="attention-dot"
			role="img"
			aria-label={t("Needs attention")}
			className={cn("flex size-20 shrink-0 items-center justify-center", className)}
		>
			<span aria-hidden className="size-6 rounded-full bg-primary" />
		</span>
	);
}
