import {
	RiArrowRightSLine as Next,
	RiArrowLeftSLine as Previous,
	RiZoomInLine as ZoomIn,
	RiZoomOutLine as ZoomOut,
} from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";

export function PdfToolbar({
	page,
	pageCount,
	zoom,
	onPage,
	onZoom,
}: {
	page: number;
	pageCount: number;
	zoom: number;
	onPage: (page: number) => void;
	onZoom: (zoom: number) => void;
}) {
	const { t } = useI18n();
	return (
		<div className="flex h-32 shrink-0 items-center gap-4 border-border-default border-b bg-container-header-bg px-8">
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Previous PDF page")}
				disabled={page <= 1}
				onClick={() => onPage(page - 1)}
			>
				<Previous className="size-16" />
			</Button>
			<span className="min-w-64 text-center tr-text-metadata text-text-muted">
				{page} / {pageCount}
			</span>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Next PDF page")}
				disabled={page >= pageCount}
				onClick={() => onPage(page + 1)}
			>
				<Next className="size-16" />
			</Button>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Zoom PDF out")}
				onClick={() => onZoom(zoom / 1.2)}
			>
				<ZoomOut className="size-14" />
			</Button>
			<span className="min-w-40 text-center tr-text-metadata text-text-muted">
				{Math.round(zoom * 100)}%
			</span>
			<Button
				variant="ghost"
				size="icon"
				aria-label={t("Zoom PDF in")}
				onClick={() => onZoom(zoom * 1.2)}
			>
				<ZoomIn className="size-14" />
			</Button>
		</div>
	);
}
