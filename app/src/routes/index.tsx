import { createFileRoute } from '@tanstack/react-router';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useSpeechStreamGeneration } from '@/hooks/use-speech-stream-generation';
import { VOICE_OPTIONS } from '@/lib/voice-options';

export const Route = createFileRoute('/')({ component: PlaygroundPage });

type SavedAudioFile = {
  name: string;
  path: string;
  modifiedSec: number | null;
  sizeBytes: number;
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
  const deleteConfirmationTimeoutRef = useRef<number | null>(null);
  const [text, setText] = useState(
    'Hello from Kokoros. Generate speech here, then play it immediately in the app.',
  );
  const [style, setStyle] = useState('af_heart');
  const [playbackMode, setPlaybackMode] = useState<
    'stream' | 'save-stream' | 'save-silent'
  >('save-stream');
  const [isLoadingSavedAudio, setIsLoadingSavedAudio] = useState(false);
  const [deletingAudioPath, setDeletingAudioPath] = useState('');
  const [pendingDeletePath, setPendingDeletePath] = useState('');
  const [savedAudioFiles, setSavedAudioFiles] = useState<SavedAudioFile[]>([]);
  const [savedAudioError, setSavedAudioError] = useState('');
  const {
    audioUrl,
    clearPlayerSource,
    error,
    generateStream,
    isGenerating,
    play: handlePlay,
    savedOutputPath,
    setError,
    setPlayerSource,
  } = useSpeechStreamGeneration({ audioRef });

  useEffect(() => {
    return () => {
      if (deleteConfirmationTimeoutRef.current !== null) {
        window.clearTimeout(deleteConfirmationTimeoutRef.current);
      }
    };
  }, []);

  const clearDeleteConfirmation = useCallback(() => {
    if (deleteConfirmationTimeoutRef.current !== null) {
      window.clearTimeout(deleteConfirmationTimeoutRef.current);
      deleteConfirmationTimeoutRef.current = null;
    }
    setPendingDeletePath('');
  }, []);

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
    const response = await generateStream({
      text,
      style,
      saveToDisk: playbackMode !== 'stream',
      streamAudio: playbackMode !== 'save-silent',
      mono: true,
    });

    if (response?.savedOutputPath) {
      void loadSavedAudio();
    }
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
    <main className='min-h-[calc(100vh-4.5rem)] p-4 md:p-6'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-4'>
        <div className='pb-4'>
          <div className='space-y-1'>
            <h1 className='font-semibold text-2xl tracking-tight'>
              Generate and audition speech
            </h1>
            <p className='max-w-2xl text-muted-foreground text-sm'>
              Write your script, pick a voice, then generate. Choose a playback
              mode — stream immediately, save and stream, or save silently for
              full spatial audio quality.
            </p>
          </div>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]'>
          <Card className='shadow-sm backdrop-blur'>
            <CardHeader>
              <CardTitle>Script</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='space-y-2'>
                <Label htmlFor='playground-text'>Text</Label>
                <Textarea
                  id='playground-text'
                  aria-label='Text to synthesize'
                  className='min-h-72 resize-y'
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder='Enter text for Kokoros to synthesize.'
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='voice-select'>Voice</Label>
                <Select
                  value={style}
                  onValueChange={(value) => setStyle(value ?? '')}
                >
                  <SelectTrigger
                    id='voice-select'
                    className='w-full'
                    aria-label='Voice style'
                  >
                    <SelectValue placeholder='af_heart' />
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

              <div className='space-y-2'>
                <Label>Playback mode</Label>
                <RadioGroup
                  value={playbackMode}
                  onValueChange={(value) =>
                    setPlaybackMode(
                      value as 'stream' | 'save-stream' | 'save-silent',
                    )
                  }
                  className='gap-2'
                >
                  <label
                    htmlFor='mode-stream'
                    className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5'
                  >
                    <RadioGroupItem
                      id='mode-stream'
                      value='stream'
                      className='mt-0.5 shrink-0'
                    />
                    <div className='grid gap-0.5'>
                      <span className='font-medium text-sm leading-none'>
                        Stream only
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        Play immediately, no file saved
                      </span>
                    </div>
                  </label>

                  <label
                    htmlFor='mode-save-stream'
                    className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5'
                  >
                    <RadioGroupItem
                      id='mode-save-stream'
                      value='save-stream'
                      className='mt-0.5 shrink-0'
                    />
                    <div className='grid gap-0.5'>
                      <span className='font-medium text-sm leading-none'>
                        Save &amp; stream
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        Save WAV and stream audio while synthesizing
                      </span>
                    </div>
                  </label>

                  <label
                    htmlFor='mode-save-silent'
                    className='flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-muted/50 has-[[data-checked]]:border-primary/50 has-[[data-checked]]:bg-primary/5'
                  >
                    <RadioGroupItem
                      id='mode-save-silent'
                      value='save-silent'
                      className='mt-0.5 shrink-0'
                    />
                    <div className='grid gap-0.5'>
                      <span className='font-medium text-sm leading-none'>
                        Save silently
                      </span>
                      <span className='text-muted-foreground text-xs'>
                        Save WAV without auto-playing — use Play for full
                        spatial audio
                      </span>
                    </div>
                  </label>
                </RadioGroup>
              </div>

              {error ? (
                <div className='rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm'>
                  {error}
                </div>
              ) : null}

              <Button
                className='w-full sm:w-auto sm:min-w-48'
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <LoaderCircle className='size-4 animate-spin' />
                ) : (
                  <AudioLinesIcon className='size-4' />
                )}
                {isGenerating ? 'Generating…' : 'Generate audio'}
              </Button>
            </CardContent>
          </Card>

          <div className='grid gap-4 xl:self-start'>
            <Card className='shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileAudio className='size-4 text-muted-foreground' />
                  Audio
                </CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3'>
                <div className='rounded-lg'>
                  {/* biome-ignore lint/a11y/useMediaCaption: Generated speech previews do not have a caption track yet. */}
                  <audio
                    ref={audioRef}
                    controls
                    preload='auto'
                    src={audioUrl || undefined}
                    aria-label='Generated audio preview'
                    className='h-10 w-full'
                  />
                </div>

                <Button
                  variant='secondary'
                  className='w-full'
                  onClick={handlePlay}
                  disabled={!audioUrl || isGenerating}
                >
                  <Play className='size-4' />
                  Play again
                </Button>
              </CardContent>
            </Card>

            <Card className='shadow-sm backdrop-blur'>
              <CardHeader className='grid-cols-[1fr_auto] items-center'>
                <CardTitle className='flex items-center gap-2'>
                  <Music2 className='size-4 text-muted-foreground' />
                  Saved audio
                </CardTitle>
                <Button
                  variant='outline'
                  size='icon-sm'
                  onClick={() => void loadSavedAudio()}
                  disabled={isLoadingSavedAudio}
                  aria-label='Refresh saved audio'
                  title='Refresh saved audio'
                >
                  <RefreshCw
                    className={
                      isLoadingSavedAudio ? 'size-4 animate-spin' : 'size-4'
                    }
                  />
                </Button>
              </CardHeader>
              <CardContent className='grid gap-3'>
                {savedAudioError ? (
                  <div className='rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm'>
                    {savedAudioError}
                  </div>
                ) : null}

                {savedAudioFiles.length > 0 ? (
                  <div className='grid max-h-80 gap-2 overflow-y-auto pr-1'>
                    {savedAudioFiles.map((file) => {
                      const isActive = savedOutputPath === file.path;
                      const isDeleting = deletingAudioPath === file.path;
                      const isConfirmingDelete =
                        pendingDeletePath === file.path;

                      return (
                        <div
                          key={file.path}
                          className='grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border px-3 py-2'
                        >
                          <div className='min-w-0'>
                            <p className='truncate font-medium text-sm'>
                              {file.name}
                            </p>
                            <p className='truncate text-muted-foreground text-xs'>
                              {formatModifiedTime(file.modifiedSec)} ·{' '}
                              {formatFileSize(file.sizeBytes)}
                            </p>
                          </div>
                          <div className='flex items-center gap-2'>
                            <Button
                              variant={isActive ? 'default' : 'secondary'}
                              size='icon-sm'
                              onClick={() => handlePlaySavedAudio(file)}
                              disabled={isDeleting}
                              aria-label={`Play ${file.name}`}
                              title={`Play ${file.name}`}
                            >
                              <Play className='size-4' />
                            </Button>
                            <Button
                              variant='destructive'
                              size='icon-sm'
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
                                <LoaderCircle className='size-4 animate-spin' />
                              ) : isConfirmingDelete ? (
                                <Check className='size-4' />
                              ) : (
                                <Trash2 className='size-4' />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className='text-muted-foreground text-sm'>
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
