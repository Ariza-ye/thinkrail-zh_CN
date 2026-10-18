import { RiFileTextLine as FileText } from "@remixicon/react";
import {
	languageFromPath,
	numArg,
	resultText,
	strArg,
	type ToolRenderProps,
} from "@thinkrail/extension-api/web";
import { useI18n } from "@thinkrail/ui/i18n";
import { CodeBlock } from "./CodeBlock";
import { Collapsible, countLines } from "./Collapsible";
import { ToolFileLink } from "./ToolFileLink";

export function ReadCard({
	toolCallId,
	args,
	result,
	status,
	workspaceRoot,
	onOpenFile,
}: ToolRenderProps) {
	const { t } = useI18n();
	const path = strArg(args, "path");
	const offset = numArg(args, "offset");
	const limit = numArg(args, t("limit"));
	const output = resultText(result);
	const lang = languageFromPath(path);

	let range = "";
	if (offset != null && offset > 1) {
		range =
			limit != null
				? t("lines {value}–{value2}", { value: offset, value2: offset + limit - 1 })
				: t("from line {value}", { value: offset });
	} else if (limit != null) {
		range = t("first {value} lines", { value: limit });
	}

	return (
		<div data-testid="tool-read" className="flex flex-col gap-4">
			<div className="flex items-center gap-4 tr-text-metadata">
				<FileText className="size-12 shrink-0 text-text-muted" />
				<ToolFileLink
					path={path}
					workspaceRoot={workspaceRoot}
					onOpenFile={onOpenFile}
					disabled={status === "running"}
					className="text-primary"
				/>
				{range ? <span className="shrink-0 text-text-muted">{range}</span> : null}
			</div>
			{status === "running" ? (
				<span className="text-text-muted tr-text-metadata">{t("Reading…")}</span>
			) : status === "error" ? (
				<pre className="overflow-auto px-8 py-4 text-feedback-error tr-code-text">{output}</pre>
			) : output ? (
				<Collapsible id={`${toolCallId}:content`} lines={countLines(output)}>
					<CodeBlock code={output} lang={lang} />
				</Collapsible>
			) : (
				<span className="text-text-muted tr-text-metadata italic">{t("(empty file)")}</span>
			)}
		</div>
	);
}
