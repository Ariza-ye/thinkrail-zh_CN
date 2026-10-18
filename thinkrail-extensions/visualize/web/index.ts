import { defineWebExtension, strArg } from "@thinkrail/extension-api/web";
import { translate } from "@thinkrail/ui/i18n";
import { VisualizationCard } from "./VisualizationCard";

export { MermaidView } from "./MermaidView";

export default defineWebExtension({
	name: "visualize",
	toolRenderers: {
		visualize: {
			renderer: VisualizationCard,
			options: {
				prominence: "primary",
				defaultExpanded: true,
				summary: ({ args }) => {
					const title = strArg(args, "title");
					if (title) return title;
					if (strArg(args, "type") === "comparison") {
						const count = Array.isArray(args.options) ? args.options.length : 0;
						return translate(
							count === 1 ? "comparison — {count} option" : "comparison — {count} options",
							{ count },
						);
					}
					return translate("diagram");
				},
			},
		},
	},
});
