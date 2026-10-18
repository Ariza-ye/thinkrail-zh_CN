import { useI18n } from "@thinkrail/ui/i18n";
import { formatLfsSize, type LfsPointer } from "./lfsPointer";

export function LfsCard({
	label,
	pointer,
	testid,
}: {
	label?: string;
	pointer: LfsPointer | null;
	testid: string;
}) {
	const { t } = useI18n();
	return (
		<section
			data-testid={testid}
			className="w-full max-w-lg rounded-md border border-border-default bg-container-header-bg p-16"
		>
			{label ? <span className="tr-text-metadata text-text-muted">{label}</span> : null}
			<h2 className="tr-title-entity text-text-default">{t("Stored in Git LFS")}</h2>
			<p className="mt-4 tr-text-metadata text-text-muted">
				{t("This checkout holds the pointer, not the content. Run {command} to fetch it.", {
					command: "git lfs pull",
				})}
			</p>
			<dl className="mt-12 grid grid-cols-[auto_1fr] gap-x-12 gap-y-4 tr-text-metadata text-text-muted">
				<dt>{t("Size")}</dt>
				<dd data-testid={`${testid}-size`}>
					{pointer ? formatLfsSize(pointer.size) : t("Unreadable pointer")}
				</dd>
				<dt>{t("Object")}</dt>
				<dd className="truncate tr-code-text" title={pointer?.oid}>
					{pointer ? pointer.oid.slice(0, 12) : "—"}
				</dd>
			</dl>
		</section>
	);
}
