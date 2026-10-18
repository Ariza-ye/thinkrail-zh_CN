import { resultText, strArg, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { useI18n } from "@thinkrail/ui/i18n";

export function BashCard({ args, result, status }: ToolRenderProps) {
	const { t } = useI18n();
	const command = strArg(args, "command");
	const output = resultText(result);
	const isError = status === "error";

	return (
		<div
			data-testid="tool-bash"
			className="overflow-hidden rounded-sm border border-border-default bg-container-header-bg tr-code-text"
		>
			<div className="border-border-default border-b px-8 py-4">
				<span className="text-feedback-success">$</span>
				<span className="ml-8 text-text-muted">{command}</span>
			</div>
			<pre
				className={`overflow-auto px-8 py-4 tr-code-text leading-relaxed ${isError ? "text-feedback-error" : "text-text-default"}`}
			>
				{output || (status === "running" ? t("Running…") : t("(no output)"))}
			</pre>
		</div>
	);
}
