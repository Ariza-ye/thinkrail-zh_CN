import { RiErrorWarningLine, RiStackFill, RiStackLine } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";
import { IconTooltip } from "@thinkrail/ui/tooltip";
import { cn } from "@thinkrail/ui/utils";
import type { ComponentProps } from "react";

export function ResourcesButton({
	activeCount,
	open,
	working,
	className,
	...props
}: ComponentProps<typeof Button> & {
	activeCount: number | null;
	open: boolean;
	working?: boolean;
}) {
	const { t } = useI18n();
	const Icon = open ? RiStackFill : RiStackLine;
	const live = working ?? (activeCount !== null && activeCount > 0);
	return (
		<IconTooltip
			label={activeCount === null ? t("Resources — active count unavailable") : t("Resources")}
			wrapTrigger
		>
			<Button
				variant="ghost"
				size="sm"
				className={cn(
					"h-panel-header-control shrink-0 gap-4 tr-text-metadata aria-expanded:bg-control-bg-selected",
					className,
				)}
				data-testid="resources-trigger"
				data-active-count={activeCount ?? "unknown"}
				data-live={live || undefined}
				aria-label={
					activeCount === null
						? t("Resources, active count unavailable")
						: t("Resources, {count} active", { count: activeCount })
				}
				aria-expanded={open}
				{...props}
			>
				<Icon className={cn("size-14", live && "motion-safe:animate-working")} />
				<span className="hidden @[480px]:inline">{t("Resources")}</span>
				<span className="tabular-nums">{activeCount ?? "—"}</span>
			</Button>
		</IconTooltip>
	);
}

export function ResourcesAttention({ count, onOpen }: { count: number; onOpen: () => void }) {
	const { t } = useI18n();
	const label = t(
		count === 1
			? "{count} MCP server needs attention — open MCP settings"
			: "{count} MCP servers need attention — open MCP settings",
		{ count },
	);
	return (
		<IconTooltip label={label}>
			<Button
				variant="ghost"
				size="icon"
				data-testid="resources-mcp-attention"
				data-count={count}
				aria-label={label}
				onClick={onOpen}
				className="shrink-0 text-feedback-warning hover:text-feedback-warning"
			>
				<RiErrorWarningLine className="size-14" />
			</Button>
		</IconTooltip>
	);
}
