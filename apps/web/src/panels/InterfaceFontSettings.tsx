import { RiCheckLine as Check, RiArrowDownSLine as ChevronDown } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";
import { cn } from "@thinkrail/ui/utils";
import { useEffect, useRef, useState } from "react";
import {
	INTERFACE_FONT_PREVIEW_VAR,
	listInstalledFonts,
	setInterfaceFont,
	useInterfaceFont,
} from "@/fonts";
import { SettingsNotice } from "./SettingsNotice";
import { SETTINGS_ROWS_CONTAINER, SettingsRow } from "./SettingsRow";

const MAX_ROWS = 150;

type Catalog = { status: "idle" } | { status: "loading" } | { status: "ready"; families: string[] };

function FontRow({
	family,
	selected,
	onSelect,
}: {
	family: string;
	selected: boolean;
	onSelect: () => void;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		ref.current?.style.setProperty(INTERFACE_FONT_PREVIEW_VAR, `"${family}"`);
	}, [family]);
	return (
		<button
			ref={ref}
			type="button"
			aria-pressed={selected}
			data-testid={`interface-font-row-${family}`}
			onClick={onSelect}
			className={cn(
				"flex h-28 shrink-0 items-center gap-8 rounded-sm px-8 text-left tr-font-preview-interface outline-none transition-colors",
				"focus-visible:ring-2 focus-visible:ring-primary",
				selected
					? "bg-primary-subtle text-text-default"
					: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
			)}
		>
			<span className="truncate">{family}</span>
			{selected ? <Check className="ml-auto size-14 shrink-0 text-primary" /> : null}
		</button>
	);
}

export function InterfaceFontControl() {
	const { t } = useI18n();
	const family = useInterfaceFont();
	const [open, setOpen] = useState(false);
	const [catalog, setCatalog] = useState<Catalog>({ status: "idle" });
	const [query, setQuery] = useState("");
	const [draft, setDraft] = useState("");
	const [rejected, setRejected] = useState(false);

	useEffect(() => {
		if (!open || catalog.status !== "idle") return;
		setCatalog({ status: "loading" });
		let active = true;
		void listInstalledFonts().then((families) => {
			if (active) setCatalog({ status: "ready", families });
		});
		return () => {
			active = false;
		};
	}, [open, catalog.status]);

	const select = (value: string | null) => {
		if (!setInterfaceFont(value)) {
			setRejected(true);
			return;
		}
		setRejected(false);
	};

	const commitDraft = () => {
		if (draft.trim().length === 0) return;
		select(draft);
	};

	const families = catalog.status === "ready" ? catalog.families : [];
	const needle = query.trim().toLowerCase();
	const matched = (
		needle ? families.filter((candidate) => candidate.toLowerCase().includes(needle)) : families
	).slice(0, MAX_ROWS);

	return (
		<div
			data-testid="interface-font-control"
			className={cn(SETTINGS_ROWS_CONTAINER, "border-border-muted border-b")}
		>
			<SettingsRow
				label={t("Interface font")}
				description={t("The font for the interface and reading text on this device.")}
				control={
					<Button
						variant="outline"
						data-testid="interface-font-trigger"
						aria-expanded={open}
						aria-label={t("Interface font")}
						onClick={() => setOpen((value) => !value)}
						className="h-32 min-w-160 justify-between"
					>
						<span className="truncate">{family ?? t("Default")}</span>
						<ChevronDown className="size-16 shrink-0" />
					</Button>
				}
			/>
			{open ? (
				<div className="flex flex-col gap-8 py-12" data-testid="interface-font-panel">
					<input
						type="search"
						value={query}
						aria-label={t("Search fonts")}
						placeholder={t("Search fonts")}
						data-testid="interface-font-search"
						onChange={(event) => setQuery(event.currentTarget.value)}
						className="w-full rounded-sm border border-control-border-default bg-control-bg px-12 py-8 tr-text-ui text-text-default outline-none transition-colors placeholder:text-text-muted focus-visible:border-control-border-active"
					/>
					{catalog.status === "loading" ? (
						<span className="tr-text-metadata text-text-muted">
							{t("Reading the fonts installed on this device…")}
						</span>
					) : null}
					<div
						className="flex max-h-264 flex-col gap-2 overflow-y-auto"
						data-testid="interface-font-list"
					>
						<button
							type="button"
							aria-pressed={family === null}
							data-testid="interface-font-default"
							onClick={() => select(null)}
							className={cn(
								"flex h-28 shrink-0 items-center gap-8 rounded-sm px-8 text-left tr-text-ui outline-none transition-colors",
								"focus-visible:ring-2 focus-visible:ring-primary",
								family === null
									? "bg-primary-subtle text-text-default"
									: "text-text-muted hover:bg-control-bg-hovered hover:text-text-default",
							)}
						>
							<span className="truncate">{t("Default")}</span>
							{family === null ? <Check className="ml-auto size-14 shrink-0 text-primary" /> : null}
						</button>
						{matched.map((candidate) => (
							<FontRow
								key={candidate}
								family={candidate}
								selected={candidate === family}
								onSelect={() => select(candidate)}
							/>
						))}
					</div>
					{catalog.status === "ready" && families.length === 0 ? (
						<SettingsNotice variant="warning" testId="interface-font-unsupported">
							{t("This host didn't list its fonts. Type a family name instead.")}
						</SettingsNotice>
					) : null}
					{rejected ? (
						<SettingsNotice variant="warning" testId="interface-font-error">
							{t("That isn't a usable font name.")}
						</SettingsNotice>
					) : null}
					<div className="flex flex-col gap-4">
						<label htmlFor="interface-font-manual" className="flex flex-col gap-4">
							<span className="tr-text-metadata text-text-muted">{t("Type a family name")}</span>
							<input
								id="interface-font-manual"
								value={draft}
								aria-label={t("Type a family name")}
								autoComplete="off"
								spellCheck={false}
								data-testid="interface-font-manual-input"
								data-settings-draft-input
								onChange={(event) => setDraft(event.currentTarget.value)}
								onBlur={commitDraft}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										commitDraft();
									} else if (event.key === "Escape") {
										setDraft("");
									}
								}}
								className="w-full rounded-sm border border-control-border-default bg-control-bg px-12 py-8 tr-text-ui text-text-default outline-none transition-colors placeholder:text-text-muted focus-visible:border-control-border-active"
							/>
						</label>
					</div>
				</div>
			) : null}
		</div>
	);
}
