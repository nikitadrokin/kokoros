import { createFileRoute } from '@tanstack/react-router';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AudioLinesIcon,
  Check,
  FileAudio,
  LoaderCircle,
  Music2,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

const SPEECH_STREAM_CHUNK_EVENT = 'speech-stream-chunk';
const FLOAT_SAMPLE_BYTES = 4;
const WAV_HEADER_BYTES = 44;
const WEB_AUDIO_START_DELAY_SEC = 0.08;
const WEB_AUDIO_MIN_LEAD_SEC = 0.02;

type SynthesizeSpeechStreamResponse = {
  sampleRate: number;
  channels: number;
  savedOutputPath: string | null;
};

type SpeechStreamChunkEvent = {
  streamId: string;
  audioBase64: string;
  sampleRate: number;
  channels: number;
  sampleFormat: 'float32le';
};

type SavedAudioFile = {
  name: string;
  path: string;
  modifiedSec: number | null;
  sizeBytes: number;
};

const base64ToBytes = (base64: string) => {
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

const createFloatWavBlobUrl = (
  audioChunks: Uint8Array[],
  sampleRate: number,
  channels: number,
) => {
  const dataBytes = audioChunks.reduce(
    (totalBytes, chunk) => totalBytes + chunk.byteLength,
    0,
  );
  const wavBytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(wavBytes.buffer);
  const blockAlign = channels * FLOAT_SAMPLE_BYTES;
  const byteRate = sampleRate * blockAlign;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 32, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (const chunk of audioChunks) {
    wavBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
};

const createStreamId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const revokeBlobUrl = (url: string) => {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kib = bytes / 1024;
  if (kib < 1024) {
    return `${kib.toFixed(1)} KB`;
  }

  return `${(kib / 1024).toFixed(1)} MB`;
};

const formatModifiedTime = (modifiedSec: number | null) => {
  if (!modifiedSec) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(modifiedSec * 1000));
};

function PlaygroundPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeStreamIdRef = useRef('');
  const deleteConfirmationTimeoutRef = useRef<number | null>(null);
  const nextPlayTimeRef = useRef(0);
  const scheduledSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const [text, setText] = useState(
    'Hello from Kokoros. Generate speech here, then play it immediately in the app.',
  );
  const [style, setStyle] = useState('af_heart');
  const [audioUrl, setAudioUrl] = useState('');
  const [saveToDisk, setSaveToDisk] = useState(true);
  const [savedOutputPath, setSavedOutputPath] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSavedAudio, setIsLoadingSavedAudio] = useState(false);
  const [deletingAudioPath, setDeletingAudioPath] = useState('');
  const [pendingDeletePath, setPendingDeletePath] = useState('');
  const [savedAudioFiles, setSavedAudioFiles] = useState<SavedAudioFile[]>([]);
  const [error, setError] = useState('');
  const [savedAudioError, setSavedAudioError] = useState('');

  const stopScheduledAudio = useCallback(() => {
    for (const source of scheduledSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Source nodes throw if they already ended; either state is fine here.
      }
    }
    scheduledSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
  }, []);

  const scheduleStreamChunk = useCallback(
    (bytes: Uint8Array, sampleRate: number, channels: number) => {
      const audioContext = audioContextRef.current;
      if (!audioContext || bytes.byteLength === 0) {
        return;
      }

      const sampleCount = bytes.byteLength / FLOAT_SAMPLE_BYTES;
      const frameCount = sampleCount / channels;
      if (
        !Number.isInteger(sampleCount) ||
        !Number.isInteger(frameCount) ||
        frameCount <= 0
      ) {
        throw new Error('Received a malformed audio stream chunk.');
      }

      const sampleBuffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(sampleBuffer).set(bytes);
      const samples = new Float32Array(sampleBuffer);
      const audioBuffer = audioContext.createBuffer(
        channels,
        frameCount,
        sampleRate,
      );

      if (channels === 1) {
        audioBuffer.copyToChannel(samples, 0);
      } else {
        for (let channel = 0; channel < channels; channel += 1) {
          const channelData = audioBuffer.getChannelData(channel);
          for (let frame = 0; frame < frameCount; frame += 1) {
            channelData[frame] = samples[frame * channels + channel];
          }
        }
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        scheduledSourcesRef.current = scheduledSourcesRef.current.filter(
          (scheduledSource) => scheduledSource !== source,
        );
      };

      const startAt = Math.max(
        nextPlayTimeRef.current,
        audioContext.currentTime + WEB_AUDIO_MIN_LEAD_SEC,
      );
      source.start(startAt);
      scheduledSourcesRef.current.push(source);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (audioUrl) {
        revokeBlobUrl(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (deleteConfirmationTimeoutRef.current !== null) {
        window.clearTimeout(deleteConfirmationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      streamCleanupRef.current?.();
      stopScheduledAudio();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
    };
  }, [stopScheduledAudio]);

  const clearDeleteConfirmation = useCallback(() => {
    if (deleteConfirmationTimeoutRef.current !== null) {
      window.clearTimeout(deleteConfirmationTimeoutRef.current);
      deleteConfirmationTimeoutRef.current = null;
    }
    setPendingDeletePath('');
  }, []);

  const setPlayerSource = (nextUrl: string, nextSavedOutputPath: string) => {
    setSavedOutputPath(nextSavedOutputPath);
    setAudioUrl((currentUrl) => {
      if (currentUrl) {
        revokeBlobUrl(currentUrl);
      }
      return nextUrl;
    });
  };

  const clearPlayerSource = () => {
    audioRef.current?.pause();
    audioRef.current?.removeAttribute('src');
    audioRef.current?.load();
    setSavedOutputPath('');
    setAudioUrl((currentUrl) => {
      if (currentUrl) {
        revokeBlobUrl(currentUrl);
      }
      return '';
    });
  };

  const loadSavedAudio = useCallback(async () => {
    setSavedAudioError('');
    setIsLoadingSavedAudio(true);

    try {
      const files = await invoke<SavedAudioFile[]>('list_saved_audio');
      setSavedAudioFiles(files);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setSavedAudioError(message);
    } finally {
      setIsLoadingSavedAudio(false);
    }
  }, []);

  useEffect(() => {
    void loadSavedAudio();
  }, [loadSavedAudio]);

  const handleGenerate = async () => {
    if (isGenerating) {
      return;
    }

    const streamId = createStreamId();
    const streamedAudioChunks: Uint8Array[] = [];

    setError('');
    setIsGenerating(true);
    activeStreamIdRef.current = streamId;
    audioRef.current?.pause();
    stopScheduledAudio();
    streamCleanupRef.current?.();
    streamCleanupRef.current = null;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      nextPlayTimeRef.current =
        audioContextRef.current.currentTime + WEB_AUDIO_START_DELAY_SEC;

      const unlistenChunk = await listen<SpeechStreamChunkEvent>(
        SPEECH_STREAM_CHUNK_EVENT,
        (event) => {
          if (event.payload.streamId !== activeStreamIdRef.current) {
            return;
          }

          try {
            if (event.payload.sampleFormat !== 'float32le') {
              throw new Error(
                `Unsupported stream format: ${event.payload.sampleFormat}`,
              );
            }

            const bytes = base64ToBytes(event.payload.audioBase64);
            if (!saveToDisk) {
              streamedAudioChunks.push(bytes);
            }
            scheduleStreamChunk(
              bytes,
              event.payload.sampleRate,
              event.payload.channels,
            );
          } catch (caughtError) {
            const message =
              caughtError instanceof Error
                ? caughtError.message
                : String(caughtError);
            setError(message);
          }
        },
      );
      streamCleanupRef.current = unlistenChunk;

      const response = await invoke<SynthesizeSpeechStreamResponse>(
        'synthesize_speech_stream',
        {
          request: {
            text,
            style,
            streamId,
            saveToDisk,
            mono: true,
            timestamps: false,
          },
        },
      );

      const nextUrl = response.savedOutputPath
        ? convertFileSrc(response.savedOutputPath)
        : createFloatWavBlobUrl(
            streamedAudioChunks,
            response.sampleRate,
            response.channels,
          );

      setPlayerSource(nextUrl, response.savedOutputPath ?? '');

      if (response.savedOutputPath) {
        void loadSavedAudio();
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setError(message);
    } finally {
      if (activeStreamIdRef.current === streamId) {
        activeStreamIdRef.current = '';
      }
      streamCleanupRef.current?.();
      streamCleanupRef.current = null;
      setIsGenerating(false);
    }
  };

  const handlePlay = () => {
    audioRef.current?.play().catch(() => undefined);
  };

  const handlePlaySavedAudio = (file: SavedAudioFile) => {
    setError('');
    setPlayerSource(convertFileSrc(file.path), file.path);
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => undefined);
    });
  };

  const handleDeleteSavedAudio = async (file: SavedAudioFile) => {
    if (deletingAudioPath) {
      return;
    }

    setError('');
    setSavedAudioError('');

    if (pendingDeletePath !== file.path) {
      clearDeleteConfirmation();
      setPendingDeletePath(file.path);
      deleteConfirmationTimeoutRef.current = window.setTimeout(() => {
        setPendingDeletePath((currentPath) =>
          currentPath === file.path ? '' : currentPath,
        );
        deleteConfirmationTimeoutRef.current = null;
      }, 2000);
      return;
    }

    clearDeleteConfirmation();
    setDeletingAudioPath(file.path);

    try {
      await invoke('delete_saved_audio', { path: file.path });
      setSavedAudioFiles((files) =>
        files.filter((savedFile) => savedFile.path !== file.path),
      );

      if (savedOutputPath === file.path) {
        clearPlayerSource();
      }
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError);
      setSavedAudioError(message);
    } finally {
      setDeletingAudioPath('');
    }
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

          <div className="grid gap-4 xl:self-start">
            <Card className="shadow-sm backdrop-blur">
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
              </CardContent>
            </Card>

            <Card className="shadow-sm backdrop-blur">
              <CardHeader className="grid-cols-[1fr_auto] items-center">
                <CardTitle className="flex items-center gap-2">
                  <Music2 className="size-4 text-muted-foreground" />
                  Saved audio
                </CardTitle>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => void loadSavedAudio()}
                  disabled={isLoadingSavedAudio}
                  aria-label="Refresh saved audio"
                  title="Refresh saved audio"
                >
                  <RefreshCw
                    className={
                      isLoadingSavedAudio ? 'size-4 animate-spin' : 'size-4'
                    }
                  />
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3">
                {savedAudioError ? (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {savedAudioError}
                  </div>
                ) : null}

                {savedAudioFiles.length > 0 ? (
                  <div className="grid max-h-80 gap-2 overflow-y-auto pr-1">
                    {savedAudioFiles.map((file) => {
                      const isActive = savedOutputPath === file.path;
                      const isDeleting = deletingAudioPath === file.path;
                      const isConfirmingDelete =
                        pendingDeletePath === file.path;

                      return (
                        <div
                          key={file.path}
                          className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-sm">
                              {file.name}
                            </p>
                            <p className="truncate text-muted-foreground text-xs">
                              {formatModifiedTime(file.modifiedSec)} ·{' '}
                              {formatFileSize(file.sizeBytes)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant={isActive ? 'default' : 'secondary'}
                              size="icon-sm"
                              onClick={() => handlePlaySavedAudio(file)}
                              disabled={isDeleting}
                              aria-label={`Play ${file.name}`}
                              title={`Play ${file.name}`}
                            >
                              <Play className="size-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon-sm"
                              onClick={() => void handleDeleteSavedAudio(file)}
                              disabled={Boolean(deletingAudioPath)}
                              aria-label={
                                isConfirmingDelete
                                  ? `Confirm delete ${file.name}`
                                  : `Delete ${file.name}`
                              }
                              title={isConfirmingDelete ? 'Confirm?' : 'Delete'}
                            >
                              {isDeleting ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : isConfirmingDelete ? (
                                <Check className="size-4" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {isLoadingSavedAudio
                      ? 'Loading saved audio…'
                      : 'Saved WAV files will appear here.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
