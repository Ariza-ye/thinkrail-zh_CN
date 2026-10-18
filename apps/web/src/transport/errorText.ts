import { translate } from "@thinkrail/ui/i18n";

export function errorText(err: unknown, fallback = translate("The request failed.")): string {
	if (err instanceof Error && err.message) return err.message;
	if (typeof err === "string" && err) return err;
	return fallback;
}
