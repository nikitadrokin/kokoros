import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';

type AppUpdateResponse = {
	status: 'upToDate' | 'restarting';
	version: string | null;
};

export default function UpdateButton() {
	const [isChecking, setIsChecking] = useState(false);

	async function handleInstallUpdate() {
		if (isChecking) {
			return;
		}

		setIsChecking(true);
		const toastId = toast.loading('Checking for updates...');

		try {
			const response = await invoke<AppUpdateResponse>('install_app_update');

			if (response.status === 'upToDate') {
				toast.success('Kokoros is up to date.', { id: toastId });
				return;
			}

			toast.success(
				response.version
					? `Installed v${response.version}. Restarting...`
					: 'Installed update. Restarting...',
				{ id: toastId, duration: 1500 },
			);
		} catch (error) {
			toast.error(formatUpdateError(error), { id: toastId });
		} finally {
			setIsChecking(false);
		}
	}

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			className="h-9 rounded-full"
			disabled={isChecking}
			onClick={handleInstallUpdate}
			aria-label="Check for and install updates"
		>
			{isChecking ? (
				<Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
			) : (
				<DownloadIcon className="size-4" aria-hidden="true" />
			)}
			<span className="hidden sm:inline">
				{isChecking ? 'Checking' : 'Update'}
			</span>
		</Button>
	);
}

function formatUpdateError(error: unknown) {
	if (error instanceof Error) {
		return error.message;
	}

	if (typeof error === 'string') {
		return error;
	}

	return 'Update failed.';
}
