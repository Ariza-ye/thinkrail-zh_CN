import { RiArrowDownSLine, RiArrowRightSLine } from "@remixicon/react";
import { Button } from "@thinkrail/ui/button";
import { useI18n } from "@thinkrail/ui/i18n";
import { useId, useState } from "react";
import {
	type NotificationChannel,
	type NotificationPermissionState,
	selectNotificationChannel,
} from "@/notifications";
import { toast, useAppStore } from "@/store";
import { getTransport } from "@/transport";
import { SettingsNotice } from "./SettingsNotice";
import { SETTINGS_ROWS_CONTAINER, SettingsRow } from "./SettingsRow";
import { SettingsSwitch } from "./SettingsSwitch";

function HowToEnableInstructions() {
	const { t } = useI18n();
	const [expanded, setExpanded] = useState(false);
	const stepsId = useId();

	return (
		<div className="flex flex-col">
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={stepsId}
				onClick={() => setExpanded((v) => !v)}
				className="flex items-center gap-4 tr-text-metadata text-text-muted transition-colors hover:text-text-default"
			>
				{expanded ? (
					<RiArrowDownSLine className="size-14" />
				) : (
					<RiArrowRightSLine className="size-14" />
				)}
				{t("How to enable")}
			</button>
			{expanded ? (
				<ol
					id={stepsId}
					className="mt-8 ml-24 list-decimal space-y-4 tr-text-metadata text-text-muted"
				>
					<li>{t("Click the lock or info icon in your browser's address bar")}</li>
					<li>{t('Find "Notifications" in the site permissions')}</li>
					<li>{t('Change the setting from "Block" to "Allow"')}</li>
					<li>{t("Refresh this page")}</li>
				</ol>
			) : null}
		</div>
	);
}

export function NotificationsSettings() {
	const { t } = useI18n();
	const enabled = useAppStore((s) => s.notificationsEnabled);
	const [channelKind] = useState<NotificationChannel["kind"]>(
		() => selectNotificationChannel().kind,
	);
	const [permission, setPermission] = useState<NotificationPermissionState>(() =>
		selectNotificationChannel().permission(),
	);

	const requestPermission = () => {
		void selectNotificationChannel()
			.requestPermission()
			.then((result) => {
				setPermission(result);
				if (result === "denied") {
					toast.error(
						t("Notifications are blocked. Re-enable in browser site settings."),
						t("Notifications blocked"),
					);
				}
			});
	};

	const setEnabled = (notificationsEnabled: boolean) => {
		getTransport()
			.request("settings.update", { config: { notificationsEnabled } })
			.catch(() => toast.error(t("Couldn't change the notification setting")));
		if (notificationsEnabled && permission === "default") {
			requestPermission();
		}
	};

	const browserPermission = enabled && channelKind === "browser" ? permission : "granted";

	return (
		<div data-testid="settings-notifications" className={SETTINGS_ROWS_CONTAINER}>
			<SettingsRow
				label={t("Enable notifications")}
				description={
					channelKind === "os"
						? t("Delivered by your operating system.")
						: t("Get notified when a worktree needs your attention.")
				}
				control={
					<SettingsSwitch
						checked={enabled}
						label={t("Enable notifications")}
						testId="notifications-toggle"
						onChange={setEnabled}
					/>
				}
			/>

			{browserPermission === "default" ? (
				<div className="border-border-muted border-b py-12">
					<SettingsNotice
						variant="info"
						testId="notifications-permission-prompt"
						action={
							<Button
								variant="outline"
								size="sm"
								data-testid="notifications-allow"
								onClick={requestPermission}
							>
								{t("Allow in browser")}
							</Button>
						}
					>
						{t("Your browser hasn't granted permission yet.")}
					</SettingsNotice>
				</div>
			) : browserPermission === "denied" || browserPermission === "unsupported" ? (
				<div className="border-border-muted border-b py-12">
					<SettingsNotice
						variant="warning"
						testId="notifications-permission-warning"
						action={browserPermission === "denied" ? <HowToEnableInstructions /> : null}
					>
						{browserPermission === "unsupported"
							? t("This browser doesn't support notifications.")
							: t("Notifications are blocked by your browser.")}
					</SettingsNotice>
				</div>
			) : null}
		</div>
	);
}
