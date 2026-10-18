import { parseToolResultContent, type ToolRenderProps } from "@thinkrail/extension-api/web";
import { useI18n } from "@thinkrail/ui/i18n";
import { ToolResultImages } from "./ToolResultImages";
import { getToolRenderer } from "./toolRegistry";

export function ToolRendererBody({
	imageLabel,
	...props
}: ToolRenderProps & { imageLabel: string }) {
	const { t } = useI18n();
	const Renderer = getToolRenderer(props.toolName);
	const images = props.status === "running" ? [] : parseToolResultContent(props.result).images;
	return (
		<>
			<Renderer {...props} />
			<ToolResultImages
				images={images}
				label={imageLabel || t("{value} image output", { value: props.toolName })}
			/>
		</>
	);
}
