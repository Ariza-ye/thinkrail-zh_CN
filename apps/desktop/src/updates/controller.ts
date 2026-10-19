import type {
	NativeUpdateBridge,
	NativeUpdateFailedPhase,
	NativeUpdateState,
} from "@thinkrail/contracts";

const MAX_ERROR_LENGTH = 1024;
const SEMVER_PATTERN =
	/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+(?:[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

const TRANSFER_STATUSES = new Set([
	"download-starting",
	"fetching-patch",
	"downloading-patch",
	"downloading-full-bundle",
]);

const PREPARING_STATUSES = new Set([
	"applying-patch",
	"extracting-version",
	"patch-chain-complete",
	"decompressing",
	"preparing",
]);

type StatePatch = Partial<
	Pick<NativeUpdateState, "status" | "availableVersion" | "progress" | "error" | "failedPhase">
>;

type ActiveCheck = object;
interface ActiveDownload {
	version: string;
	operation?: Promise<boolean>;
}

export interface NativeUpdaterInfo {
	version: string;
	updateAvailable: boolean;
	updateReady: boolean;
	error: string;
}

export interface NativeUpdaterStatusEntry {
	status: string;
	message: string;
	details?: {
		progress?: number;
		errorMessage?: string;
	};
}

export interface NativeUpdaterDependency {
	updateInfo(): NativeUpdaterInfo;
	onStatusChange(listener: ((entry: NativeUpdaterStatusEntry) => void) | null): void;
	checkForUpdate(): Promise<NativeUpdaterInfo>;
	downloadUpdate(): Promise<void>;
}

export interface NativeUpdateControllerDependencies {
	enabled: boolean;
	version: string;
	channel: string;
	updater: NativeUpdaterDependency;
	restartToUpdate(): Promise<void>;
}

export interface NativeUpdateController extends NativeUpdateBridge {
	dispose(): void;
}

function errorText(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value);
	return message.slice(0, MAX_ERROR_LENGTH) || "Native update failed";
}

export function isStrictlyNewerVersion(currentVersion: string, candidateVersion: string): boolean {
	if (!SEMVER_PATTERN.test(currentVersion) || !SEMVER_PATTERN.test(candidateVersion)) return false;
	return Bun.semver.order(currentVersion, candidateVersion) < 0;
}

function progressFrom(entry: NativeUpdaterStatusEntry): number | null {
	const progress = entry.details?.progress;
	if (typeof progress !== "number" || !Number.isFinite(progress)) return null;
	return Math.min(100, Math.max(0, progress));
}

export function createNativeUpdateController(
	dependencies: NativeUpdateControllerDependencies,
): NativeUpdateController {
	const listeners = new Set<(state: NativeUpdateState) => void>();
	let state: Readonly<NativeUpdateState> = Object.freeze({
		revision: 0,
		status: dependencies.enabled ? "idle" : "disabled",
		version: dependencies.version,
		channel: dependencies.channel,
		availableVersion: null,
		progress: null,
		error: null,
		failedPhase: null,
	});
	let preparedVersion: string | null = null;
	let disposed = false;
	let activeCheck: ActiveCheck | undefined;
	let activeDownload: ActiveDownload | undefined;
	let restarting = false;

	const publish = (patch: StatePatch): void => {
		if (disposed) return;
		const next = { ...state, ...patch };
		if (
			state.status === next.status &&
			state.availableVersion === next.availableVersion &&
			state.progress === next.progress &&
			state.error === next.error &&
			state.failedPhase === next.failedPhase
		) {
			return;
		}
		state = Object.freeze({ ...next, revision: state.revision + 1 });
		for (const listener of listeners) {
			try {
				listener(state);
			} catch (error) {
				console.error("[desktop] native update listener failed", error);
			}
		}
	};

	const isNewer = (info: NativeUpdaterInfo): boolean =>
		info.updateAvailable && isStrictlyNewerVersion(state.version, info.version);

	const isMatchingReady = (info: NativeUpdaterInfo, version: string): boolean =>
		info.version === version && info.updateReady && isNewer(info);

	const setReady = (version: string): boolean => {
		if (!isStrictlyNewerVersion(state.version, version)) return false;
		preparedVersion = version;
		publish({
			status: "ready",
			availableVersion: version,
			progress: 100,
			error: null,
			failedPhase: null,
		});
		return true;
	};

	const fail = (phase: Exclude<NativeUpdateFailedPhase, null>, error: unknown): void => {
		const message = errorText(error);
		if (phase === "check" && preparedVersion) {
			publish({
				status: "ready",
				availableVersion: preparedVersion,
				progress: 100,
				error: message,
				failedPhase: phase,
			});
			return;
		}
		publish({
			status: "error",
			availableVersion: preparedVersion ?? state.availableVersion,
			progress: null,
			error: message,
			failedPhase: phase,
		});
	};

	const acceptCheckedInfo = (info: NativeUpdaterInfo): void => {
		if (info.error) {
			fail("check", info.error);
			return;
		}
		if (!isNewer(info)) {
			if (preparedVersion) {
				publish({
					status: "ready",
					availableVersion: preparedVersion,
					progress: 100,
					error: null,
					failedPhase: null,
				});
				return;
			}
			publish({
				status: "idle",
				availableVersion: null,
				progress: null,
				error: null,
				failedPhase: null,
			});
			return;
		}
		if (info.updateReady) {
			setReady(info.version);
			return;
		}

		preparedVersion = null;
		publish({
			status: "available",
			availableVersion: info.version,
			progress: null,
			error: null,
			failedPhase: null,
		});
	};

	const performCheck = async (token: ActiveCheck): Promise<void> => {
		const retainedVersion = preparedVersion ?? state.availableVersion;
		publish({
			status: "checking",
			availableVersion: retainedVersion,
			progress: preparedVersion ? 100 : null,
			error: null,
			failedPhase: null,
		});
		try {
			const info = await dependencies.updater.checkForUpdate();
			if (disposed || activeCheck !== token) return;
			acceptCheckedInfo(info);
		} catch (error) {
			if (!disposed && activeCheck === token) fail("check", error);
		}
	};

	const performDownload = async (token: ActiveDownload): Promise<boolean> => {
		publish({
			status: "downloading",
			availableVersion: token.version,
			progress: null,
			error: null,
			failedPhase: null,
		});
		try {
			await dependencies.updater.downloadUpdate();
			if (disposed || activeDownload !== token) return false;
			if (preparedVersion === token.version) return true;
			const info = dependencies.updater.updateInfo();
			if (info.error) {
				fail("download", info.error);
				return false;
			}
			if (isMatchingReady(info, token.version)) return setReady(token.version);
			fail("download", "Native update download did not complete");
			return false;
		} catch (error) {
			if (disposed || activeDownload !== token) return false;
			if (preparedVersion === token.version) return true;
			fail("download", error);
			return false;
		}
	};

	const launchDownload = (): boolean => {
		if (!dependencies.enabled || disposed || activeCheck || activeDownload || restarting) {
			return false;
		}
		const version = state.availableVersion;
		const retryingDownload = state.status === "error" && state.failedPhase === "download";
		if (
			!version ||
			!isStrictlyNewerVersion(state.version, version) ||
			(state.status !== "available" && !retryingDownload)
		) {
			return false;
		}
		const token: ActiveDownload = { version };
		activeDownload = token;
		const operation = performDownload(token);
		token.operation = operation;
		void operation.then(() => {
			if (activeDownload === token) activeDownload = undefined;
		});
		return true;
	};

	const handleDownloadStatus = (
		token: ActiveDownload,
		entry: NativeUpdaterStatusEntry,
	): boolean => {
		if (preparedVersion === token.version) return true;
		if (state.status === "error" && state.failedPhase === "download" && entry.status !== "error") {
			return true;
		}
		if (entry.status === "download-progress") {
			const progress = progressFrom(entry);
			if (progress === 100) {
				const info = dependencies.updater.updateInfo();
				if (isMatchingReady(info, token.version)) setReady(token.version);
				else {
					publish({
						status: "preparing",
						availableVersion: token.version,
						progress: 100,
						error: null,
						failedPhase: null,
					});
				}
				return true;
			}
			publish({
				status: "downloading",
				availableVersion: token.version,
				progress,
				error: null,
				failedPhase: null,
			});
			return true;
		}
		if (TRANSFER_STATUSES.has(entry.status)) {
			publish({
				status: "downloading",
				availableVersion: token.version,
				progress: null,
				error: null,
				failedPhase: null,
			});
			return true;
		}
		if (PREPARING_STATUSES.has(entry.status)) {
			if (preparedVersion !== token.version || state.status !== "ready") {
				publish({
					status: "preparing",
					availableVersion: token.version,
					progress: 100,
					error: null,
					failedPhase: null,
				});
			}
			return true;
		}
		if (entry.status === "download-complete") {
			const info = dependencies.updater.updateInfo();
			if (isMatchingReady(info, token.version)) setReady(token.version);
			else {
				publish({
					status: "preparing",
					availableVersion: token.version,
					progress: 100,
					error: null,
					failedPhase: null,
				});
			}
			return true;
		}
		if (entry.status === "error") {
			fail(
				"download",
				dependencies.updater.updateInfo().error || entry.details?.errorMessage || entry.message,
			);
			return true;
		}
		return false;
	};

	const handleStatus = (entry: NativeUpdaterStatusEntry): void => {
		if (!dependencies.enabled || disposed) return;
		if (activeDownload && handleDownloadStatus(activeDownload, entry)) return;
		if (entry.status === "error" && restarting) {
			fail(
				"install",
				dependencies.updater.updateInfo().error || entry.details?.errorMessage || entry.message,
			);
		}
	};

	if (dependencies.enabled) dependencies.updater.onStatusChange(handleStatus);

	return {
		getState: async () => ({ ...state }),
		checkForUpdates: async () => {
			if (!dependencies.enabled || disposed || activeCheck || activeDownload || restarting) return;
			const token: ActiveCheck = {};
			activeCheck = token;
			void performCheck(token).then(() => {
				if (activeCheck === token) activeCheck = undefined;
			});
		},
		downloadUpdate: async () => {
			launchDownload();
		},
		restartToUpdate: async () => {
			if (
				!dependencies.enabled ||
				disposed ||
				restarting ||
				activeCheck ||
				!preparedVersion ||
				(activeDownload !== undefined && activeDownload.version !== preparedVersion)
			) {
				return;
			}
			restarting = true;
			const expectedVersion = preparedVersion;
			const pendingDownload = activeDownload?.operation;
			publish({
				status: "installing",
				availableVersion: expectedVersion,
				progress: null,
				error: null,
				failedPhase: null,
			});
			const operation = (async () => {
				try {
					if (
						pendingDownload &&
						(!(await pendingDownload) || preparedVersion !== expectedVersion)
					) {
						return;
					}
					if (disposed) return;
					await dependencies.restartToUpdate();
				} catch (error) {
					if (!disposed && restarting) fail("install", error);
				}
			})();
			void operation.then(() => {
				restarting = false;
			});
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			listeners.clear();
			if (dependencies.enabled) dependencies.updater.onStatusChange(null);
		},
	};
}
