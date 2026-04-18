import { invoke } from '@tauri-apps/api/core';
import { DownloadIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

type AppUpdateResponse = {
	status: 'available' | 'upToDate' | 'restarting';
	version: string | null;
};

type UpdateButtonState =
	| 'unchecked'
	| 'checking'
	| 'available'
	| 'installing'
	| 'upToDate';

export default function UpdateButton() {
	const [state, setState] = useState<UpdateButtonState>('unchecked');
	const [availableVersion, setAvailableVersion] = useState<string | null>(null);

	const isLoading = state === 'checking' || state === 'installing';
	const label = updateButtonLabel(state, availableVersion);
	const variant = state === 'available' ? 'default' : 'outline';

	async function handleUpdateClick() {
		if (isLoading) {
			return;
		}

		if (state === 'available') {
			await installUpdate();
			return;
		}

		await checkForUpdate();
	}

	async function checkForUpdate() {
		setState('checking');
		const toastId = toast.loading('Checking for updates...');

		try {
			const response = await invoke<AppUpdateResponse>('check_app_update');

			if (response.status === 'upToDate') {
				setAvailableVersion(null);
				setState('upToDate');
				toast.success('Kokoros is up to date.', { id: toastId });
				return;
			}

			setAvailableVersion(response.version);
			setState('available');
			toast.success(
				response.version
					? `Kokoros v${response.version} is ready to install.`
					: 'A Kokoros update is ready to install.',
				{ id: toastId },
			);
		} catch (error) {
			setState('unchecked');
			toast.error(formatUpdateError(error), { id: toastId });
		}
	}

	async function installUpdate() {
		setState('installing');
		const toastId = toast.loading(
			availableVersion
				? `Installing v${availableVersion}...`
				: 'Installing update...',
		);

		try {
			const response = await invoke<AppUpdateResponse>('install_app_update');

			if (response.status === 'upToDate') {
				setAvailableVersion(null);
				setState('upToDate');
				toast.success('Kokoros is already up to date.', { id: toastId });
				return;
			}

			toast.success(
				response.version
					? `Installed v${response.version}. Restarting...`
					: 'Installed update. Restarting...',
				{ id: toastId, duration: 1500 },
			);
		} catch (error) {
			setState('available');
			toast.error(formatUpdateError(error), { id: toastId });
		}
	}

	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant={variant}
						size="icon-sm"
						className="shrink-0 rounded-full transition-colors duration-200"
						disabled={isLoading}
						onClick={handleUpdateClick}
						aria-label={label}
					/>
				}
			>
				{isLoading ? (
					<Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
				) : (
					<DownloadIcon className="size-4" aria-hidden="true" />
				)}
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function updateButtonLabel(
	state: UpdateButtonState,
	availableVersion: string | null,
) {
	switch (state) {
		case 'checking':
			return 'Checking for updates...';
		case 'available':
			return availableVersion
				? `Install Kokoros v${availableVersion}`
				: 'Install Kokoros update';
		case 'installing':
			return availableVersion
				? `Installing Kokoros v${availableVersion}...`
				: 'Installing Kokoros update...';
		case 'upToDate':
			return 'Kokoros is up to date. Check again.';
		case 'unchecked':
			return 'Check for updates';
		default: {
			const _exhaustive: never = state;
			return _exhaustive;
		}
	}
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
