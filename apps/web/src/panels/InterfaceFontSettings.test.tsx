import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InterfaceFontControl } from "./InterfaceFontSettings";

test("the interface font row starts collapsed on the bundled default", () => {
	const markup = renderToStaticMarkup(<InterfaceFontControl />);
	expect(markup).toContain('data-testid="interface-font-trigger"');
	expect(markup).toContain('aria-expanded="false"');
	expect(markup).toContain(">Default<");
	expect(markup).not.toContain('data-testid="interface-font-panel"');
});
