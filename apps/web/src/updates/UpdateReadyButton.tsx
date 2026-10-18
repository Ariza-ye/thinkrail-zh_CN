import { RiDownloadCloud2Line as DownloadCloud } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";
import type { UpdatesController } from "./useUpdates";

export function UpdateReadyButton({
	updates,
	onOpen,
}: {
	updates: UpdatesController;
	onOpen(): void;
}) {
	const { t } = useI18n();
	const hostUpdate = updates.source === "host";
	const hostStatus = updates.source === "host" ? updates.state.status : undefined;
	const hostRequestFailed = updates.source === "host" && updates.requestFailed;
	const nativeState = updates.source === "native" ? updates.state : null;
	const nativeNeedsAttention = updates.source === "native" && updates.requestError !== null;
	const nativeActionable =
		nativeNeedsAttention ||
		nativeState?.status === "available" ||
		nativeState?.status === "downloading" ||
		nativeState?.status === "preparing" ||
		nativeState?.status === "ready" ||
		nativeState?.status === "installing" ||
		nativeState?.status === "error";
	if (!nativeActionable && !hostUpdate) return null;

	const availableVersion = updates.state.availableVersion;
	let label = t("Update needs attention");
	let ariaLabel = availableVersion
		? t("ThinkRail {version} update needs attention", { version: availableVersion })
		: t("A ThinkRail update needs attention");
	if (hostUpdate) {
		if (hostRequestFailed || hostStatus === "failed") {
			label = "Update failed";
			ariaLabel = "The ThinkRail host update failed";
		} else if (hostStatus === "running") {
			label = "Updating host";
			ariaLabel = availableVersion
				? t("Updating the ThinkRail host to {version}", { version: availableVersion })
				: t("Updating the ThinkRail host");
		} else if (hostStatus === "succeeded") {
			label = "Restart host";
			ariaLabel = availableVersion
				? t("Restart the ThinkRail host to use {version}", { version: availableVersion })
				: t("Restart the ThinkRail host to use the update");
		} else {
			label = "Update available";
			ariaLabel = availableVersion
				? t("ThinkRail {version} is available", { version: availableVersion })
				: t("A ThinkRail update is available");
		}
	} else if (!nativeNeedsAttention && nativeState) {
		switch (nativeState.status) {
			case "available":
				label = "Update available";
				ariaLabel = availableVersion
					? t("ThinkRail {version} is available to download", { version: availableVersion })
					: t("A ThinkRail update is available to download");
				break;
			case "downloading":
				label =
					typeof nativeState.progress === "number"
						? t("Downloading {progress}%", { progress: Math.round(nativeState.progress) })
						: t("Downloading update");
				ariaLabel = label;
				break;
			case "preparing":
				label = "Preparing update";
				ariaLabel = label;
				break;
			case "ready":
				label = "Update ready";
				ariaLabel = availableVersion
					? t("ThinkRail {version} is ready to install", { version: availableVersion })
					: t("An update is ready to install");
				break;
			case "installing":
				label = "Installing update";
				ariaLabel = label;
				break;
		}
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			data-testid="update-ready"
			data-source={updates.source}
			data-status={nativeState?.status ?? hostStatus ?? (hostUpdate ? "legacy" : undefined)}
			aria-label={t(ariaLabel)}
			onClick={onOpen}
			className="text-primary"
		>
			<DownloadCloud className="size-14" />
			<span className="hidden md:inline">{t(label)}</span>
		</Button>
	);
}
