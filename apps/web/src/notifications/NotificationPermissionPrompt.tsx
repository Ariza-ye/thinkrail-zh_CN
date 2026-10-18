import { Button } from "@thinkrail/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@thinkrail/ui/dialog";
import { useI18n } from "@thinkrail/ui/i18n";
import { useRef } from "react";
import { toast, useAppStore } from "@/store";
import { selectNotificationChannel } from "./channel";
import { snoozePrompt } from "./notificationPrompt";

const DENIED_HINT =
	"Notifications are blocked for this site. Re-enable them in your browser's site settings, then turn notifications on again.";

export function NotificationPermissionPrompt() {
	const { t } = useI18n();
	const open = useAppStore((state) => state.notificationPromptOpen);
	const pendingRef = useRef(false);

	const dismiss = () => {
		snoozePrompt();
		useAppStore.getState().closeNotificationPrompt();
	};

	const enable = () => {
		if (pendingRef.current) return;
		pendingRef.current = true;
		void selectNotificationChannel()
			.requestPermission()
			.then((result) => {
				if (result === "denied") toast.error(t(DENIED_HINT), t("Notifications blocked"));
			})
			.finally(() => {
				pendingRef.current = false;
				useAppStore.getState().closeNotificationPrompt();
			});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) dismiss();
			}}
		>
			<DialogContent data-testid="notification-permission-prompt">
				<DialogHeader>
					<DialogTitle>{t("Get notified when a worktree needs you")}</DialogTitle>
					<DialogDescription>
						{t(
							"ThinkRail can notify you when an agent asks a question, finishes, or fails — even when the app is in a background tab. Notifications only appear while this window isn't focused.",
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="outline" data-testid="notification-not-now" onClick={dismiss}>
						{t("Not now")}
					</Button>
					<Button data-testid="notification-enable" onClick={enable}>
						{t("Enable")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
