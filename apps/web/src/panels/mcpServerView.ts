import type {
	McpListResult,
	McpRenderedTarget,
	McpServerEntryInput,
	McpServerSummary,
	WsParams,
} from "@thinkrail/contracts";
import { type Translator, translate } from "@thinkrail/ui/i18n";
import { MCP_STATE_LABEL, type McpStateTone, mcpStateTone, mcpToolCountLabel } from "@/lib";
import type { McpServerRow } from "@/store";
import { type McpEditableExposure, withEnabled, withExposure } from "./mcpEntries";

export type McpRowAction =
	| "sign-in"
	| "review"
	| "edit"
	| "test-connection"
	| "reconnect"
	| "reload"
	| "open-chat"
	| "show-log";

export interface McpRowView {
	label: string;
	tone: McpStateTone;
	reason?: string;
	action?: McpRowAction;
	secondary?: McpRowAction;
}

const DISABLED_IN_PI_SETTINGS = "pi settings (-builtin:mcp)";

export function mcpHandledElsewhereText(by: string, translator: Translator = translate): string {
	return by === DISABLED_IN_PI_SETTINGS
		? translator(
				"MCP is turned off in pi settings (-builtin:mcp); remove that entry to manage servers here.",
			)
		: translator(
				"MCP is handled by {by} in this workspace; ThinkRail's MCP management is read-only.",
				{ by },
			);
}

export interface McpChatFailure {
	chat: string;
	error: string;
}

export function mcpChatFailureText(
	failures: readonly McpChatFailure[],
	targeted: number,
): string | null {
	const [first] = failures;
	if (!first) return null;
	return targeted === 1
		? first.error
		: failures.map((failure) => `${failure.chat}: ${failure.error}`).join("\n");
}

function firstLine(text: string | undefined): string | undefined {
	return text
		?.split("\n")
		.map((line) => line.trim())
		.find(Boolean);
}

const STATUS_LINE_TAIL = / \((?:codemode|deferred|direct|hidden)\)$/;
const STATE_PREFIX = /^(?:failed|disconnected|starting|connecting…?)(?::\s*|,\s*|$)/;

function mcpDetailReason(detail: string | undefined, name: string): string | undefined {
	const [head = "", ...rest] = (detail ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (rest[0]) return rest[0];
	const body = head.startsWith(`${name}: `) ? head.slice(name.length + 2) : head;
	return body.replace(STATUS_LINE_TAIL, "").replace(STATE_PREFIX, "").trim() || undefined;
}

export function formatStartingElapsed(ms: number, translator: Translator = translate): string {
	const minutes = Math.floor(Math.max(0, ms) / 60_000);
	return minutes < 1 ? translator("<1 min") : translator("{minutes} min", { minutes });
}

function inChats(row: McpServerRow, count: number, translator: Translator = translate): string {
	return row.sessions.total > 1
		? translator(" in {count} of {total} chats", { count, total: row.sessions.total })
		: "";
}

export function mcpRowView(
	row: McpServerRow,
	now: number,
	translator: Translator = translate,
): McpRowView {
	const { summary } = row;
	const view = baseView(row, now, translator);
	if (
		row.approvalPending &&
		row.state !== "pending-approval" &&
		row.state !== "handled-elsewhere"
	) {
		return {
			...view,
			reason:
				summary.approval?.state === "changed"
					? translator("The repository's override changed since you approved it — review it again.")
					: translator("The repository overrides this server's settings — review the change."),
			action: "review",
		};
	}
	return view;
}

function baseView(row: McpServerRow, now: number, translator: Translator = translate): McpRowView {
	const { summary } = row;
	const http = summary.transport === "http";
	switch (row.state) {
		case "replaced":
			return {
				label: translator("Replaced by project"),
				tone: "neutral",
				reason: translator("This project's own entry runs instead."),
			};
		case "handled-elsewhere":
			return { label: translator(MCP_STATE_LABEL["handled-elsewhere"]), tone: "neutral" };
		case "starting":
			return {
				label: translator("Starting · {elapsed}", {
					elapsed: formatStartingElapsed(now - (row.startingSince ?? now), translator),
				}),
				tone: "working",
				...(row.sessions.total > 1
					? {
							reason: translator("Starting{chats}.", {
								chats: inChats(row, row.sessions.reporting.length, translator),
							}),
						}
					: {}),
			};
		case "connected": {
			const tools = row.toolCount === undefined ? "" : ` · ${mcpToolCountLabel(row.toolCount)}`;
			return {
				label: translator("Connected{chats}{tools}", {
					chats: inChats(row, row.sessions.connected, translator),
					tools,
				}),
				tone: mcpStateTone("connected", row.toolCount),
				...(row.toolCount === 0 ? { reason: translator("The server reports no tools.") } : {}),
			};
		}
		case "needs-sign-in":
			return {
				label: translator(MCP_STATE_LABEL["needs-sign-in"]),
				tone: "warning",
				reason: translator("Sign in to let chats use this server."),
				...(row.effective && summary.oauth ? { action: "sign-in" as const } : {}),
			};
		case "failed":
			return {
				label: translator(MCP_STATE_LABEL.failed),
				tone: "error",
				reason:
					mcpDetailReason(row.detail, summary.name) ?? translator("The server failed to start."),
				action: "reconnect",
				secondary: "show-log",
			};
		case "disconnected":
			return {
				label: translator(MCP_STATE_LABEL.disconnected),
				tone: "warning",
				reason: translator("Reconnects on the next call."),
				action: "reconnect",
			};
		case "disabled":
			return {
				label: translator(MCP_STATE_LABEL.disabled),
				tone: "neutral",
				reason: translator("Turned off."),
			};
		case "disabled-in-project":
			return {
				label: translator(MCP_STATE_LABEL["disabled-in-project"]),
				tone: "neutral",
				reason: translator("Turned off for this project only."),
			};
		case "disabled-in-chat":
			return {
				label:
					row.sessions.total > 1
						? translator("Disabled in {count} of {total} chats", {
								count: row.sessions.reporting.length,
								total: row.sessions.total,
							})
						: translator("Disabled in 1 chat"),
				tone: "neutral",
				reason: translator("Turned off from a chat's Resources."),
			};
		case "pending-approval":
			return summary.approval?.state === "changed"
				? {
						label: translator("Changed since approval"),
						tone: "warning",
						reason: translator("The entry changed since you approved it — review it again."),
						action: "review",
					}
				: {
						label: translator(MCP_STATE_LABEL["pending-approval"]),
						tone: "warning",
						reason: translator(
							"Defined by this repository — review what it runs before it starts.",
						),
						action: "review",
					};
		case "invalid-config":
			return {
				label: translator(MCP_STATE_LABEL["invalid-config"]),
				tone: "error",
				reason:
					firstLine(summary.configError ?? row.detail) ?? translator("pi rejected this entry."),
				...(summary.scope === "project" ? { action: "edit" as const } : {}),
			};
		case "pending-reload":
			return {
				label: translator(MCP_STATE_LABEL["pending-reload"]),
				tone: "info",
				reason: translator("Applies when the chat is idle."),
				action: "reload",
			};
		case "not-running":
			return {
				label: translator(MCP_STATE_LABEL["not-running"]),
				tone: "neutral",
				reason: translator("Starts when a chat opens in this workspace."),
				action: "open-chat",
				...(row.effective && http ? { secondary: "test-connection" as const } : {}),
			};
		case "unknown":
			return {
				label: translator(MCP_STATE_LABEL.unknown),
				tone: "neutral",
				reason: row.startingStalled
					? translator("Still starting after a minute — pi has not answered.")
					: translator("pi has not reported this server yet."),
			};
	}
}

export type McpSettingChange = { enabled: boolean } | { exposure: McpEditableExposure };

type McpSettingWrite =
	| { method: "mcp.setProjectOverride"; params: WsParams<"mcp.setProjectOverride"> }
	| { method: "mcp.update"; params: WsParams<"mcp.update"> };

/** The row's identity for a rewrite or removal: its scope and the fingerprint it was rendered with. */
export function mcpRenderedTarget(summary: McpServerSummary): McpRenderedTarget {
	return { scope: summary.scope, expectedFingerprint: summary.fingerprint };
}

export function mcpEntryUpdate(
	workspaceId: string,
	summary: McpServerSummary,
	entry: McpServerEntryInput,
): WsParams<"mcp.update"> {
	return { workspaceId, name: summary.name, entry, ...mcpRenderedTarget(summary) };
}

export function mcpSettingWrite(
	workspaceId: string,
	summary: McpServerSummary,
	change: McpSettingChange,
	projectEntry: McpServerEntryInput | null,
	translator: Translator = translate,
): McpSettingWrite {
	if (summary.scope === "user") {
		return {
			method: "mcp.setProjectOverride",
			params: { workspaceId, name: summary.name, ...change },
		};
	}
	if (!projectEntry)
		throw new Error(translator('Read "{name}" from .pi/mcp.json first.', { name: summary.name }));
	return {
		method: "mcp.update",
		params: mcpEntryUpdate(
			workspaceId,
			summary,
			"enabled" in change
				? withEnabled(projectEntry, change.enabled)
				: withExposure(projectEntry, change.exposure),
		),
	};
}

export function mcpSaveFeedback(result: McpListResult): string {
	return result.statuses.length === 0
		? "Saved — applies when a chat starts in this workspace."
		: "Saved — applies to open chats as they reload; a busy chat waits until it is idle.";
}

export function mcpExposureLabel(
	exposure: McpEditableExposure,
	translator: Translator = translate,
): string {
	return translator(exposure.charAt(0).toUpperCase() + exposure.slice(1));
}

export function mcpConfiguredExposureText(
	summary: McpServerSummary,
	translator: Translator = translate,
): string {
	return summary.exposure === "codemode"
		? translator("codemode — treated as deferred (codemode not available yet)")
		: summary.exposure;
}
