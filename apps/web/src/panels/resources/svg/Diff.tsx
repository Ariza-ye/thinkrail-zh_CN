import { translate, useI18n } from "@thinkrail/ui/i18n";
import { useMemo } from "react";
import type { ResourceContent, ResourceDiffProps } from "@/resources";
import { diffContentStamp } from "../reviewComposerState";
import { VisualDiff, type VisualDiffSide } from "../VisualDiff";
import { SvgFrame } from "./SvgFrame";
import {
	buildSvgDocument,
	type SvgThemeTokens,
	svgByteLength,
	svgDiffViewState,
	svgIntrinsicSize,
} from "./svgDocument";
import { useSvgTheme } from "./useSvgTheme";

function textOf(content: ResourceContent): string | null {
	return content.kind === "text" ? content.text : null;
}

function SvgContent({
	text,
	tokens,
	path,
}: {
	text: string;
	tokens: SvgThemeTokens;
	path: string;
}) {
	const { t } = useI18n();
	const document = useMemo(() => buildSvgDocument(text, tokens), [text, tokens]);
	return <SvgFrame title={t("Vector diff of {path}", { path: path })} document={document} />;
}

function caption(label: string, text: string | null): string {
	if (text === null) return translate("{label}: No image", { label: label });
	const size = svgIntrinsicSize(text);
	return `${label}: ${size ? `${size.width} × ${size.height}` : translate("Flexible size")} · ${svgByteLength(text)} B`;
}

export default function SvgDiff({
	resource,
	original,
	modified,
	review,
	onPlacedThreadIds,
	viewState,
	onViewState,
}: ResourceDiffProps) {
	const { t } = useI18n();
	const tokens = useSvgTheme(true);
	const originalText = textOf(original);
	const modifiedText = textOf(modified);
	if (!tokens) return null;
	const originalSize = originalText === null ? null : svgIntrinsicSize(originalText);
	const modifiedSize = modifiedText === null ? null : svgIntrinsicSize(modifiedText);
	const originalSide: VisualDiffSide = {
		present: originalText !== null,
		content:
			originalText === null ? null : (
				<SvgContent text={originalText} tokens={tokens} path={resource.path} />
			),
		caption: caption(t("Old"), originalText),
		intrinsicSize: originalSize,
		review: review?.base,
	};
	const modifiedSide: VisualDiffSide = {
		present: modifiedText !== null,
		content:
			modifiedText === null ? null : (
				<SvgContent text={modifiedText} tokens={tokens} path={resource.path} />
			),
		caption: caption(t("New"), modifiedText),
		intrinsicSize: modifiedSize,
		review: review?.worktree,
	};
	return (
		<VisualDiff
			prefix="svg"
			noun="vector"
			regionLabel={t("image region")}
			original={originalSide}
			modified={modifiedSide}
			contentStamp={diffContentStamp(original, modified)}
			onPlacedThreadIds={onPlacedThreadIds}
			initialMode={svgDiffViewState(viewState)}
			onViewState={onViewState}
		/>
	);
}
