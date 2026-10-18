import { RiPencilLine as Pencil, RiCloseLine as X } from "@remixicon/react";
import type { QueueLane, SessionQueueState } from "@thinkrail/contracts";
import { useI18n } from "@thinkrail/ui/i18n";

export function QueueStrip({
	queue,
	onEdit,
	onRemove,
}: {
	queue: SessionQueueState;
	onEdit: (kind: QueueLane, index: number) => void;
	onRemove: (kind: QueueLane, index: number) => void;
}) {
	const { t } = useI18n();
	const items = [
		...queue.steering.map((text, index) => ({
			kind: "steering" as const,
			index,
			label: t("Steering"),
			hint: "{message} — delivers at the agent's next step",
			text,
		})),
		...queue.followUp.map((text, index) => ({
			kind: "followUp" as const,
			index,
			label: t("Follow-up"),
			hint: "{message} — runs after the agent finishes",
			text,
		})),
	];
	if (items.length === 0) return null;
	return (
		<div
			data-testid="queue-strip"
			className="flex w-full shrink-0 flex-col gap-2 border-border-default border-t bg-container-elevated-bg px-12 py-4 text-text-muted tr-text-metadata"
		>
			{items.map((item) => (
				<div
					key={`${item.kind}:${item.index}`}
					data-testid="queue-item"
					data-kind={item.kind}
					data-index={item.index}
					title={t(item.hint, { message: item.text })}
					className="flex w-full items-center gap-8"
				>
					<span className="min-w-0 flex-1 truncate">
						<span className="text-text-default">{item.label}:</span> {item.text}
					</span>
					<button
						type="button"
						data-testid="queue-item-edit"
						aria-label={t("Edit queued message: {value}", { value: item.text })}
						onClick={() => onEdit(item.kind, item.index)}
						className="flex size-20 shrink-0 items-center justify-center rounded-xs hover:bg-control-bg-hovered hover:text-text-default"
					>
						<Pencil className="size-12" />
					</button>
					<button
						type="button"
						data-testid="queue-item-remove"
						aria-label={t("Remove queued message: {value}", { value: item.text })}
						onClick={() => onRemove(item.kind, item.index)}
						className="flex size-20 shrink-0 items-center justify-center rounded-xs hover:bg-control-bg-hovered hover:text-text-default"
					>
						<X className="size-12" />
					</button>
				</div>
			))}
		</div>
	);
}
