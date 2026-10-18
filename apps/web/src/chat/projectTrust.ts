import type {
	Project,
	ProjectResourceKind,
	ProjectTrustSummary,
	WsParams,
} from "@thinkrail/contracts";
import { translate } from "@thinkrail/ui/i18n";

export type ProjectTrustNotice =
	| { kind: "hidden" }
	| {
			kind: "untrusted";
			aliasSkills: number;
			piResources: ProjectResourceKind[];
			mcpServers: number;
	  }
	| { kind: "unacknowledged"; names: string[] }
	| { kind: "trusted"; aliasSkills: number };

type TrustRecord = Pick<Project, "trusted" | "piResourceTrust" | "acknowledgedSkills">;

export function deriveProjectTrustNotice(
	project: TrustRecord | undefined,
	summary: ProjectTrustSummary | null,
): ProjectTrustNotice {
	if (!project || !summary) return { kind: "hidden" };
	const mcpServers = summary.mcpServers ?? 0;
	const aliasPending = summary.aliasSkills.length > 0 && project.trusted !== true;
	const nativePending =
		(summary.piResources.length > 0 || mcpServers > 0) && project.piResourceTrust !== "granted";
	if (aliasPending || nativePending) {
		return {
			kind: "untrusted",
			aliasSkills: aliasPending ? summary.aliasSkills.length : 0,
			piResources: nativePending ? summary.piResources : [],
			mcpServers: nativePending ? mcpServers : 0,
		};
	}
	if (summary.aliasSkills.length === 0 && summary.piResources.length === 0 && mcpServers === 0)
		return { kind: "hidden" };
	const acknowledged = new Set(project.acknowledgedSkills ?? []);
	const names = summary.aliasSkills.filter((name) => !acknowledged.has(name));
	if (names.length > 0) return { kind: "unacknowledged", names };
	return { kind: "trusted", aliasSkills: summary.aliasSkills.length };
}

function countLabel(count: number, singular: string, plural: string): string {
	return translate(count === 1 ? singular : plural, { count });
}

function joinNames(words: string[]): string {
	return words.length < 2
		? (words[0] ?? "")
		: translate("{items} and {last}", {
				items: words.slice(0, -1).join(translate(", ")),
				last: words.at(-1) ?? "",
			});
}

const LOADED_KINDS: ReadonlyArray<[ProjectResourceKind, string]> = [
	["skills", "skills"],
	["prompts", "prompts"],
	["themes", "themes"],
	["systemPrompt", "system prompt"],
	["subagents", "subagent definitions"],
];
const CODE_KINDS: ReadonlyArray<[ProjectResourceKind, string]> = [
	["extensions", "extensions"],
	["settings", "settings"],
];

function namesOf(
	kinds: ReadonlyArray<[ProjectResourceKind, string]>,
	present: ReadonlySet<ProjectResourceKind>,
): string {
	return joinNames(kinds.filter(([kind]) => present.has(kind)).map(([, word]) => translate(word)));
}

export function untrustedNoticeText(
	notice: Extract<ProjectTrustNotice, { kind: "untrusted" }>,
): string {
	const parts = [
		...(notice.aliasSkills > 0
			? [countLabel(notice.aliasSkills, "{count} skill", "{count} skills")]
			: []),
		...(notice.piResources.length > 0 ? [translate("its own Pi resources")] : []),
		...(notice.mcpServers > 0
			? [countLabel(notice.mcpServers, "{count} MCP server", "{count} MCP servers")]
			: []),
	];
	return translate("This project ships {resources} — off until you trust it.", {
		resources: joinNames(parts),
	});
}

export function trustEnablesText(
	notice: Extract<ProjectTrustNotice, { kind: "untrusted" }>,
): string | null {
	const present = new Set(notice.piResources);
	const loads = namesOf(LOADED_KINDS, present);
	const runs = namesOf(CODE_KINDS, present);
	const enables = !runs
		? loads
			? translate("Trust loads its {resources}.", { resources: loads })
			: null
		: loads
			? translate("Trust loads its {resources}, and lets its {code} run code on this machine.", {
					resources: loads,
					code: runs,
				})
			: translate("Trust lets its {code} run code on this machine.", { code: runs });
	if (notice.mcpServers === 0) return enables;
	const mcp = translate(
		notice.mcpServers === 1
			? "Its {count} MCP server still needs your approval one by one."
			: "Its {count} MCP servers still need your approval one by one.",
		{ count: notice.mcpServers },
	);
	return enables ? `${enables} ${mcp}` : mcp;
}

export function trustGrantParams(
	projectId: string,
	notice: Extract<ProjectTrustNotice, { kind: "untrusted" }>,
): WsParams<"project.setTrust"> {
	return {
		id: projectId,
		trusted: true,
		...(notice.piResources.length > 0 || notice.mcpServers > 0 ? { resources: true } : {}),
	};
}

export function trustedNoticeText(
	notice: Extract<ProjectTrustNotice, { kind: "trusted" }>,
): string {
	return notice.aliasSkills > 0
		? translate(
				notice.aliasSkills === 1
					? "{count} project skill trusted."
					: "{count} project skills trusted.",
				{ count: notice.aliasSkills },
			)
		: translate("Project resources trusted.");
}

export function canStopTrusting(project: TrustRecord | undefined): boolean {
	return project?.trusted === true || project?.piResourceTrust === "granted";
}

export function stopTrustingText(
	project: TrustRecord | undefined,
	supportsProjectTrust: boolean,
): string {
	return supportsProjectTrust && project?.piResourceTrust === "granted"
		? translate(
				"Its project skills, Pi resources and MCP servers stop loading; running subagents stop and open chats reload when idle.",
			)
		: translate("Its project skills stop loading in new chats.");
}
