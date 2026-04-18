import { createFileRoute } from '@tanstack/react-router';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { AudioLinesIcon, FileAudio, LoaderCircle, Play } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

export const Route = createFileRoute('/')({ component: PlaygroundPage });

const VOICE_OPTIONS = [
	{ value: 'af_heart', label: 'af_heart' },
	{ value: 'af_sky', label: 'af_sky' },
	{ value: 'af_nicole', label: 'af_nicole' },
	{ value: 'af_sarah', label: 'af_sarah' },
];

type SynthesizeSpeechResponse = {
	audioBase64: string | null;
	sampleRate: number;
	savedOutputPath: string | null;
	savedTimestampsPath: string | null;
	timestamps: { word: string; startSec: number; endSec: number }[];
};

const base64ToBlobUrl = (base64: string) => {
	const decoded = window.atob(base64);
	const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
	return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
};

const revokeBlobUrl = (url: string) => {
	if (url.startsWith('blob:')) {
		URL.revokeObjectURL(url);
	}
};

function PlaygroundPage() {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [text, setText] = useState(
		'Hello from Kokoros. Generate speech here, then play it immediately in the app.',
	);
	const [style, setStyle] = useState('af_heart');
	const [audioUrl, setAudioUrl] = useState('');
	const [saveToDisk, setSaveToDisk] = useState(true);
	const [savedOutputPath, setSavedOutputPath] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState('');

	useEffect(() => {
		return () => {
			if (audioUrl) {
				revokeBlobUrl(audioUrl);
			}
		};
	}, [audioUrl]);

	const handleGenerate = async () => {
		if (isGenerating) {
			return;
		}

		setError('');
		setIsGenerating(true);

		try {
			const response = await invoke<SynthesizeSpeechResponse>(
				'synthesize_speech',
				{
					request: {
						text,
						style,
						saveToDisk,
						mono: false,
						timestamps: false,
					},
				},
			);

			const nextUrl = response.savedOutputPath
				? convertFileSrc(response.savedOutputPath)
				: response.audioBase64
					? base64ToBlobUrl(response.audioBase64)
					: '';

			if (!nextUrl) {
				throw new Error('No generated audio was returned.');
			}

			startTransition(() => {
				setSavedOutputPath(response.savedOutputPath ?? '');
				setAudioUrl((currentUrl) => {
					if (currentUrl) {
						revokeBlobUrl(currentUrl);
					}
					return nextUrl;
				});
			});

			requestAnimationFrame(() => {
				audioRef.current?.play().catch(() => undefined);
			});
		} catch (caughtError) {
			const message =
				caughtError instanceof Error
					? caughtError.message
					: String(caughtError);
			setError(message);
		} finally {
			setIsGenerating(false);
		}
	};

	const handlePlay = () => {
		audioRef.current?.play().catch(() => undefined);
	};

	return (
		<main className="min-h-[calc(100vh-4.5rem)] p-4 md:p-6">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
				<div className="pb-4">
					<div className="space-y-1">
						<h1 className="font-semibold text-2xl tracking-tight">
							Generate and audition speech
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm">
							Write your script, pick a voice, then generate. New audio plays
							automatically; use Play to hear it again.
						</p>
					</div>
				</div>

				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
					<Card className="shadow-sm backdrop-blur">
						<CardHeader>
							<CardTitle>Script</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="playground-text">Text</Label>
								<Textarea
									id="playground-text"
									aria-label="Text to synthesize"
									className="min-h-72 resize-y"
									value={text}
									onChange={(event) => setText(event.target.value)}
									placeholder="Enter text for Kokoros to synthesize."
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor="voice-select">Voice</Label>
								<Select
									value={style}
									onValueChange={(value) => setStyle(value ?? '')}
								>
									<SelectTrigger
										id="voice-select"
										className="w-full"
										aria-label="Voice style"
									>
										<SelectValue placeholder="af_heart" />
									</SelectTrigger>
									<SelectContent>
										{VOICE_OPTIONS.map((voice) => (
											<SelectItem key={voice.value} value={voice.value}>
												{voice.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
								<Label htmlFor="save-to-disk">Save WAV to disk</Label>
								<Switch
									id="save-to-disk"
									checked={saveToDisk}
									onCheckedChange={setSaveToDisk}
									aria-label="Save WAV to disk"
								/>
							</div>

							{error ? (
								<div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
									{error}
								</div>
							) : null}

							<Button
								className="w-full sm:w-auto sm:min-w-48"
								onClick={handleGenerate}
								disabled={isGenerating}
							>
								{isGenerating ? (
									<LoaderCircle className="size-4 animate-spin" />
								) : (
									<AudioLinesIcon className="size-4" />
								)}
								{isGenerating ? 'Generating…' : 'Generate audio'}
							</Button>
						</CardContent>
					</Card>

					<Card className="shadow-sm backdrop-blur xl:self-start">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<FileAudio className="size-4 text-muted-foreground" />
								Audio
							</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-3">
							<div className="rounded-lg">
								{/* biome-ignore lint/a11y/useMediaCaption: Generated speech previews do not have a caption track yet. */}
								<audio
									ref={audioRef}
									controls
									preload="auto"
									src={audioUrl || undefined}
									aria-label="Generated audio preview"
									className="h-10 w-full"
								/>
							</div>

							<Button
								variant="secondary"
								className="w-full"
								onClick={handlePlay}
								disabled={!audioUrl || isGenerating}
							>
								<Play className="size-4" />
								Play again
							</Button>

							<p className="text-muted-foreground text-sm">
								{savedOutputPath
									? `Saved to ${savedOutputPath}`
									: audioUrl
										? 'Latest render is ready above.'
										: 'Generate audio to preview it here.'}
							</p>
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}
