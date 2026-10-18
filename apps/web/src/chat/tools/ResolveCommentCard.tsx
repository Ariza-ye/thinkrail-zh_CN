import { RiCheckboxCircleLine as CheckCircle2 } from "@remixicon/react";
import { strArg, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { useI18n } from "@thinkrail/ui/i18n";
import type { ReactNode } from "react";

export function ResolveCommentCard({ args, status }: ToolRenderProps): ReactNode {
	const { t } = useI18n();
	const commentId = strArg(args, "commentId");
	const note = strArg(args, "note");
	return (
		<div className="flex items-start gap-4 tr-text-ui">
			<CheckCircle2
				className={`mt-2 size-12 shrink-0 ${status === "error" ? "text-feedback-error" : "text-feedback-success"}`}
			/>
			<div className="min-w-0">
				<span className="tr-code-text text-text-muted">{commentId}</span>
				{status === "error" ? (
					<span className="ml-4 text-feedback-error">{t("couldn't be resolved")}</span>
				) : (
					<span className="ml-4 text-text-muted">{t("resolved")}</span>
				)}
				{note && <p className="text-text-subtle italic">{note}</p>}
			</div>
		</div>
	);
}
