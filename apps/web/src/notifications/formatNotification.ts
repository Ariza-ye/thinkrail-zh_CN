import type { SessionCompletion } from "@thinkrail/contracts";
import { translate } from "@thinkrail/ui/i18n";

/** Why a worktree's attention dot lit up, captured when the event is enqueued. */
export type AttentionReason =
	| { kind: "needs-input" }
	| { kind: "completed"; completion: SessionCompletion };

/** One worktree that transitioned into needs-attention. */
export interface AttentionEvent {
	sessionId: string;
	workspaceId: string;
	worktreeName: string;
	reason: AttentionReason;
}

/** Where a click on the emitted notification should land. */
export type NotificationTarget =
	| { kind: "chat"; workspaceId: string; sessionId: string }
	| { kind: "switcher" };

/** A ready-to-show notification derived from one flush of accumulated events. */
export interface NotificationSpec {
	title: string;
	/** The worktree name for a single event; channels with a subtitle field use it, others fold it into the body. */
	subtitle?: string;
	body: string;
	tag: string;
	target: NotificationTarget;
}

const BODY_MAX = 100;
const APP_NAME = "ThinkRail";
const AGGREGATE_TAG = "thinkrail-attention";

export function reasonLabel(reason: AttentionReason): string {
	if (reason.kind === "needs-input") return translate("Waiting for your input");
	const completion = reason.completion;
	switch (completion.outcome) {
		case "succeeded":
			return translate("The agent finished");
		case "interrupted":
			return translate("The run was interrupted");
		case "cancelled":
			return translate("The run was cancelled");
		case "failed":
			return completion.failure === "length"
				? translate("Stopped — the context is full")
				: translate("The agent run failed");
	}
}

function truncate(text: string): string {
	return text.length <= BODY_MAX ? text : `${text.slice(0, BODY_MAX - 1)}…`;
}

/**
 * Collapse a window's accumulated attention events into one notification: a single worktree opens
 * its chat on click, several open the session switcher. Returns null when nothing passed.
 */
export function formatNotification(events: readonly AttentionEvent[]): NotificationSpec | null {
	const [event] = events;
	if (!event) return null;
	if (events.length === 1) {
		const name = event.worktreeName.trim();
		// Title is always the bold ThinkRail mark; the worktree is the subtitle, the reason the body.
		return {
			title: APP_NAME,
			...(name ? { subtitle: name } : {}),
			body: truncate(reasonLabel(event.reason)),
			tag: `attention:${event.sessionId}`,
			target: { kind: "chat", workspaceId: event.workspaceId, sessionId: event.sessionId },
		};
	}
	return {
		title: APP_NAME,
		body: truncate(translate("{count} worktrees need your attention", { count: events.length })),
		tag: AGGREGATE_TAG,
		target: { kind: "switcher" },
	};
}
