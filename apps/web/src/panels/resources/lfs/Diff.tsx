import { useI18n } from "@thinkrail/ui/i18n";
import type { ResourceContent, ResourceDiffProps } from "@/resources";
import { LfsCard } from "./LfsCard";
import { parseLfsPointer } from "./lfsPointer";

function pointerOf(content: ResourceContent) {
	return content.kind === "text" ? parseLfsPointer(content.text) : null;
}

export default function LfsDiff({ original, modified }: ResourceDiffProps) {
	const { t } = useI18n();
	return (
		<div
			data-testid="lfs-diff"
			className="grid h-full grid-cols-1 content-start gap-12 bg-container-content-bg p-24 md:grid-cols-2"
		>
			{original.kind === "absent" ? (
				<div className="tr-text-metadata text-text-muted">{t("Old: no pointer")}</div>
			) : (
				<LfsCard label={t("Old")} pointer={pointerOf(original)} testid="lfs-pointer-original" />
			)}
			{modified.kind === "absent" ? (
				<div className="tr-text-metadata text-text-muted">{t("New: no pointer")}</div>
			) : (
				<LfsCard label={t("New")} pointer={pointerOf(modified)} testid="lfs-pointer-modified" />
			)}
		</div>
	);
}
