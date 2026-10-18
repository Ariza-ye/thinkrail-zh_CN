import type { NativeQuitHint } from "@thinkrail/contracts";
import { translate, useI18n } from "@thinkrail/ui/i18n";
import { cn } from "@thinkrail/ui/utils";
import { useState } from "react";
import { platformShortcutLabel } from "../lib";

type VisibleQuitHint = Exclude<NativeQuitHint, "hidden">;

function quitHintText(hint: VisibleQuitHint) {
	if (hint === "release") return translate("Release to quit");
	if (hint === "quitting") return translate("Quitting…");
	return translate("Hold {shortcut} or press twice to quit", {
		shortcut: platformShortcutLabel("Q"),
	});
}

export function QuitHintOverlay({ hint }: { hint: NativeQuitHint }) {
	useI18n();
	const [lastVisible, setLastVisible] = useState<VisibleQuitHint | null>(null);
	if (hint !== "hidden" && hint !== lastVisible) setLastVisible(hint);
	const hidden = hint === "hidden" || !lastVisible;
	return (
		<div
			role="status"
			aria-live="polite"
			data-testid="quit-hint"
			data-hint={hint}
			className={cn(
				"pointer-events-none fixed inset-0 z-200 flex items-center justify-center bg-overlay transition-opacity duration-200 ease-out",
				hidden ? "opacity-0" : "opacity-100",
			)}
		>
			{lastVisible ? (
				<div
					aria-hidden={hidden}
					className="rounded-lg border border-border-default bg-container-elevated-bg px-24 py-16 text-text-default tr-heading-lg shadow-(--shadow-lg)"
				>
					{quitHintText(lastVisible)}
				</div>
			) : null}
		</div>
	);
}
