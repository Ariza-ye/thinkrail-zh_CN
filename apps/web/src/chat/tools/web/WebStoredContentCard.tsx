import { RiLinksLine as LinkIcon } from "@remixicon/react";
import { numArg, resultText, strArg, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { translate, useI18n } from "@thinkrail/ui/i18n";
import { WebResultBody } from "./WebResultBody";

function detailString(result: unknown, key: string): string {
	if (typeof result !== "object" || result === null || !("details" in result)) return "";
	const details = (result as { details: unknown }).details;
	if (typeof details !== "object" || details === null) return "";
	const value = (details as Record<string, unknown>)[key];
	return typeof value === "string" ? value : "";
}

export function storedContentTarget(args: Record<string, unknown>, result: unknown): string {
	const query = strArg(args, "query") || detailString(result, "query");
	if (query) return query;
	const url = strArg(args, "url") || detailString(result, "url");
	if (url) return url;
	const queryIndex = numArg(args, "queryIndex");
	if (queryIndex !== null) return translate("query {value}", { value: queryIndex });
	const urlIndex = numArg(args, "urlIndex");
	if (urlIndex !== null) return translate("URL {value}", { value: urlIndex });
	return "";
}

export function storedContentSummary({ args, result }: ToolRenderProps): string {
	return storedContentTarget(args, result) || strArg(args, "responseId");
}

export function WebStoredContentCard({ toolCallId, args, result, status }: ToolRenderProps) {
	const { t } = useI18n();
	const responseId = strArg(args, "responseId");
	const target = storedContentTarget(args, result);
	const output = resultText(result);
	return (
		<div data-testid="tool-get_search_content" className="flex flex-col gap-4">
			<div className="flex items-center gap-4 tr-text-metadata">
				<LinkIcon className="size-12 shrink-0 text-text-muted" />
				<span className="min-w-0 truncate text-primary" title={target || responseId}>
					{target || responseId || "stored content"}
				</span>
				{target && responseId ? (
					<span className="shrink-0 text-text-muted" title={responseId}>
						{responseId}
					</span>
				) : null}
			</div>
			<WebResultBody
				id={`${toolCallId}:content`}
				output={output}
				status={status}
				runningLabel={t("Loading stored content…")}
				emptyLabel={t("(no stored content)")}
			/>
		</div>
	);
}
