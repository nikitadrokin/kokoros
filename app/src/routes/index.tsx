import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import {
  FileAudio,
  LoaderCircle,
  Play,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

type TimestampRow = {
  word: string;
  startSec: number;
  endSec: number;
};

type SynthesizeSpeechResponse = {
  audioBase64: string;
  sampleRate: number;
  savedOutputPath: string | null;
  savedTimestampsPath: string | null;
  timestamps: TimestampRow[];
};

const quoteArg = (value: string) => {
  if (!value) return '""';
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
};

const base64ToBlobUrl = (base64: string) => {
  const decoded = window.atob(base64);
  const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
};

function PlaygroundPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [text, setText] = useState(
    'Hello from Kokoros. Generate speech here, then play it immediately in the app.',
  );
  const [style, setStyle] = useState('af_heart');
  const [language, setLanguage] = useState('');
  const [speed, setSpeed] = useState('');
  const [modelPath, setModelPath] = useState('');
  const [dataPath, setDataPath] = useState('');
  const [outputPath, setOutputPath] = useState('');
  const [initialSilence, setInitialSilence] = useState('');
  const [mono, setMono] = useState(false);
  const [timestamps, setTimestamps] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedPath, setLastSavedPath] = useState('');
  const [lastTimestampPath, setLastTimestampPath] = useState('');
  const [timestampRows, setTimestampRows] = useState<TimestampRow[]>([]);

  const commandPreview = useMemo(() => {
    const args = ['koko'];

    if (language.trim()) {
      args.push('--lan', quoteArg(language.trim()));
    }

    if (modelPath.trim()) {
      args.push('--model', quoteArg(modelPath.trim()));
    }

    if (dataPath.trim()) {
      args.push('--data', quoteArg(dataPath.trim()));
    }

    if (style.trim()) {
      args.push('--style', quoteArg(style.trim()));
    }

    if (speed.trim()) {
      args.push('--speed', quoteArg(speed.trim()));
    }

    if (initialSilence.trim()) {
      args.push('--initial-silence', quoteArg(initialSilence.trim()));
    }

    if (mono) {
      args.push('--mono');
    }

    if (timestamps) {
      args.push('--timestamps');
    }

    args.push('text', quoteArg(text));

    if (outputPath.trim()) {
      args.push('--output', quoteArg(outputPath.trim()));
    }

    return args.join(' ');
  }, [
    dataPath,
    initialSilence,
    language,
    modelPath,
    mono,
    outputPath,
    speed,
    style,
    text,
    timestamps,
  ]);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
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
            language,
            style,
            speed: speed.trim() ? Number(speed) : undefined,
            modelPath,
            dataPath,
            outputPath,
            initialSilence: initialSilence.trim()
              ? Number(initialSilence)
              : undefined,
            mono,
            timestamps,
          },
        },
      );

      const nextUrl = base64ToBlobUrl(response.audioBase64);

      startTransition(() => {
        setAudioUrl((currentUrl) => {
          if (currentUrl) {
            URL.revokeObjectURL(currentUrl);
          }
          return nextUrl;
        });
        setLastSavedPath(response.savedOutputPath ?? '');
        setLastTimestampPath(response.savedTimestampsPath ?? '');
        setTimestampRows(response.timestamps);
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
    <main className='min-h-screen bg-[radial-gradient(circle_at_top_left,hsl(var(--muted))_0,transparent_30%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-4 md:p-6'>
      <div className='mx-auto flex w-full max-w-6xl flex-col gap-4'>
        <div className='flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-end sm:justify-between'>
          <div className='space-y-1'>
            <h1 className='text-2xl font-semibold tracking-tight'>
              Generate and audition speech in the app
            </h1>
            <p className='max-w-2xl text-sm text-muted-foreground'>
              The synthesizer still runs under the hood, but the normal control
              surface is here: text, voice, generate, then immediate playback.
            </p>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <Button
              className='min-w-40'
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <LoaderCircle className='size-4 animate-spin' />
              ) : (
                <Sparkles className='size-4' />
              )}
              {isGenerating ? 'Generating…' : 'Generate Audio'}
            </Button>
            <Button
              variant='outline'
              onClick={handlePlay}
              disabled={!audioUrl || isGenerating}
            >
              <Play className='size-4' />
              Play
            </Button>
          </div>
        </div>

        <div className='grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]'>
          <Card className='border-border/70 bg-background/90 shadow-sm backdrop-blur'>
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

              {error ? (
                <div className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'>
                  {error}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className='grid gap-4 self-start'>
            <Card className='border-border/70 bg-background/90 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle>Controls</CardTitle>
              </CardHeader>
              <CardContent className='grid gap-3'>
                <div className='space-y-2'>
                  <Label htmlFor='voice-select'>Voice</Label>
                  <Select
                    value={style}
                    // ts complains of string | null
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

                <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1'>
                  <div className='space-y-2'>
                    <Label htmlFor='language-input'>Language</Label>
                    <Input
                      id='language-input'
                      aria-label='Language flag'
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                      placeholder='en-us'
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='speed-input'>Speed</Label>
                    <Input
                      id='speed-input'
                      aria-label='Speed flag'
                      type='number'
                      step='0.1'
                      value={speed}
                      onChange={(event) => setSpeed(event.target.value)}
                      placeholder='1.0'
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='initial-silence'>Initial silence</Label>
                    <Input
                      id='initial-silence'
                      aria-label='Initial silence'
                      type='number'
                      min='0'
                      value={initialSilence}
                      onChange={(event) =>
                        setInitialSilence(event.target.value)
                      }
                      placeholder='Optional'
                    />
                  </div>
                </div>

                <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm'>
                  <div className='flex items-center justify-between gap-4'>
                    <Label htmlFor='mono-toggle'>Mono</Label>
                    <Switch
                      id='mono-toggle'
                      aria-label='Enable mono output'
                      checked={mono}
                      onCheckedChange={setMono}
                    />
                  </div>

                  <div className='flex items-center justify-between gap-4'>
                    <Label htmlFor='timestamps-toggle'>Timestamps</Label>
                    <Switch
                      id='timestamps-toggle'
                      aria-label='Enable timestamps output'
                      checked={timestamps}
                      onCheckedChange={setTimestamps}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className='border-border/70 bg-background/90 shadow-sm backdrop-blur'>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileAudio className='size-4 text-muted-foreground' />
                  Audio
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='rounded-lg border bg-muted/20 p-3'>
                  <audio
                    ref={audioRef}
                    controls
                    preload='auto'
                    src={audioUrl || undefined}
                    aria-label='Generated audio preview'
                    className='h-10 w-full'
                  />
                </div>

                <div className='space-y-1 text-sm text-muted-foreground'>
                  <p>
                    {audioUrl
                      ? 'Latest render is ready for playback.'
                      : 'Generate audio to preview it here.'}
                  </p>
                  {lastSavedPath ? <p>Saved WAV: {lastSavedPath}</p> : null}
                  {lastTimestampPath ? (
                    <p>Saved timestamps: {lastTimestampPath}</p>
                  ) : null}
                  {timestampRows.length ? (
                    <p>{timestampRows.length} timestamp rows generated.</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className='border-border/70 bg-background/90 shadow-sm backdrop-blur'>
          <CardHeader>
            <CardTitle>Engine Paths</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='model-path'>Model path</Label>
              <Input
                id='model-path'
                aria-label='Model path'
                value={modelPath}
                onChange={(event) => setModelPath(event.target.value)}
                placeholder='checkpoints/kokoro-v1.0.onnx'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='data-path'>Voice data path</Label>
              <Input
                id='data-path'
                aria-label='Voice data path'
                value={dataPath}
                onChange={(event) => setDataPath(event.target.value)}
                placeholder='data/voices-v1.0.bin'
              />
            </div>

            <div className='space-y-2'>
              <Label htmlFor='output-path'>Optional output path</Label>
              <Input
                id='output-path'
                aria-label='Output path'
                value={outputPath}
                onChange={(event) => setOutputPath(event.target.value)}
                placeholder='output.wav'
              />
            </div>
          </CardContent>
        </Card>

        <Card className='border-border/70 bg-background/90 shadow-sm backdrop-blur'>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TerminalSquare className='size-4 text-muted-foreground' />
              Under The Hood
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <p className='text-sm text-muted-foreground'>
              The desktop app drives Kokoro directly. This command is only a
              reference for the equivalent CLI call.
            </p>
            <pre className='overflow-x-auto rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-foreground'>
              <code>{commandPreview}</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
