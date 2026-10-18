import type { Workspace } from "@thinkrail/contracts";
import { useI18n } from "@thinkrail/ui/i18n";
import { isExternalWorkspace } from "../store";
import { ConfirmDialog } from "./ConfirmDialog";
import { removeWorkspace } from "./workspaceActions";

export function RemoveWorkspaceDialog({
	workspace,
	open,
	onOpenChange,
}: {
	workspace: Workspace;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { t } = useI18n();
	const isExternal = isExternalWorkspace(workspace);
	const branch = workspace.branch;
	return (
		<ConfirmDialog
			open={open}
			onOpenChange={onOpenChange}
			title={
				isExternal
					? t("Remove {name} from ThinkRail?", { name: workspace.name })
					: t("Remove {name} workspace", { name: workspace.name })
			}
			description={
				isExternal
					? t(
							"Removes this workspace's ThinkRail chats and terminals. The existing checkout, files, and branch {branch} stay untouched.",
							{ branch },
						)
					: t(
							"Deletes this workspace's chats, terminals, and its worktree. The git branch {branch} is kept.",
							{ branch },
						)
			}
			confirmLabel={isExternal ? t("Remove from ThinkRail") : t("Remove")}
			destructive
			confirmTestId="confirm-remove"
			onConfirm={() => removeWorkspace(workspace.id)}
		/>
	);
}
