import { normalizeSessionTitle, SESSION_TITLE_MAX_LENGTH } from "@thinkrail/contracts";
import { translate } from "@thinkrail/ui/i18n";

export type PreparedChatTitle = { title: string } | { reason: string };

export function prepareChatTitle(titleInput: string): PreparedChatTitle {
	const title = normalizeSessionTitle(titleInput);
	if (title) return { title };
	return titleInput.trim()
		? {
				reason: translate("Keep chat names to {value} characters or fewer.", {
					value: SESSION_TITLE_MAX_LENGTH,
				}),
			}
		: { reason: translate("Enter a chat name.") };
}
