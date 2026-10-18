import { translate, useI18n } from "@thinkrail/ui/i18n";
import type { ResourceContent, ResourceDiffProps } from "@/resources";

function sideSize(content: ResourceContent): string {
	if (content.kind === "absent") return translate("Absent");
	if (content.kind === "bytes")
		return translate("{size} bytes", { size: content.byteLength.toLocaleString() });
	return translate("{size} bytes", {
		size: new TextEncoder().encode(content.text).byteLength.toLocaleString(),
	});
}

export default function BinaryDiff({ original, modified }: ResourceDiffProps) {
	const { t } = useI18n();
	return (
		<div className="flex h-full items-center justify-center bg-container-content-bg p-24">
			<section
				data-testid="binary-diff"
				className="w-full max-w-lg rounded-md border border-border-default bg-container-header-bg p-16 text-center"
			>
				<h2 className="tr-title-entity text-text-default">{t("Binary files differ")}</h2>
				<div className="mt-12 flex items-center justify-center gap-24 tr-text-metadata text-text-muted">
					<span>{t("Original: {size}", { size: sideSize(original) })}</span>
					<span>{t("Modified: {size}", { size: sideSize(modified) })}</span>
				</div>
			</section>
		</div>
	);
}
