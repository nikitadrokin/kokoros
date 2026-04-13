import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { AudioLines, FileAudio, Languages, SlidersHorizontal, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export const Route = createFileRoute('/')({ component: PlaygroundPage })

const VOICE_OPTIONS = [
  { value: 'af_heart', label: 'af_heart' },
  { value: 'af_sky', label: 'af_sky' },
  { value: 'af_nicole', label: 'af_nicole' },
  { value: 'af_sarah', label: 'af_sarah' },
]

const quoteArg = (value: string) => {
  if (!value) return '""'
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
}

function PlaygroundPage() {
  const [text, setText] = useState(
    "Hello from Kokoros. This page is the temporary playground while the real UI is rebuilt."
  )
  const [style, setStyle] = useState('af_heart')
  const [language, setLanguage] = useState('en-us')
  const [speed, setSpeed] = useState('1.0')
  const [modelPath, setModelPath] = useState('checkpoints/kokoro-v1.0.onnx')
  const [dataPath, setDataPath] = useState('data/voices-v1.0.bin')
  const [outputPath, setOutputPath] = useState('output.wav')
  const [initialSilence, setInitialSilence] = useState('')
  const [mono, setMono] = useState(false)
  const [timestamps, setTimestamps] = useState(false)

  const commandPreview = useMemo(() => {
    const args = [
      'koko',
      '--lan',
      quoteArg(language),
      '--model',
      quoteArg(modelPath),
      '--data',
      quoteArg(dataPath),
      '--style',
      quoteArg(style),
      '--speed',
      quoteArg(speed),
    ]

    if (initialSilence.trim()) {
      args.push('--initial-silence', quoteArg(initialSilence.trim()))
    }

    if (mono) {
      args.push('--mono')
    }

    if (timestamps) {
      args.push('--timestamps')
    }

    args.push('text', quoteArg(text), '--output', quoteArg(outputPath))

    return args.join(' ')
  }, [dataPath, initialSilence, language, modelPath, mono, outputPath, speed, style, text, timestamps])

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8'>
      <section className='rounded-2xl border bg-card/95 px-6 py-6 shadow-sm sm:px-8'>
        <div className='flex flex-col gap-4 md:flex-row md:items-end md:justify-between'>
          <div className='space-y-3'>
            <Badge variant='outline' className='rounded-full px-3 py-1 text-xs font-medium'>
              Temporary UI
            </Badge>
            <div className='space-y-2'>
              <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
                Kokoros playground
              </h1>
              <p className='max-w-2xl text-sm text-muted-foreground sm:text-base'>
                One route, basic controls, and a sane layout. This is the stripped-down shell for
                rebuilding the app without the starter UI.
              </p>
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Badge variant='secondary' className='gap-1.5 rounded-full px-3 py-1'>
              <Sparkles className='size-3.5' />
              text mode
            </Badge>
            <Badge variant='secondary' className='gap-1.5 rounded-full px-3 py-1'>
              <AudioLines className='size-3.5' />
              audio slot ready
            </Badge>
          </div>
        </div>
      </section>

      <section className='grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]'>
        <div className='grid gap-6'>
          <Card className='border-border/80 bg-card/95 shadow-sm'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-lg'>
                <Languages className='size-4 text-muted-foreground' />
                Input
              </CardTitle>
              <CardDescription>Text and voice selection for the basic playground route.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-5'>
              <div className='grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]'>
                <div className='space-y-2'>
                  <Label htmlFor='playground-text'>Text</Label>
                  <Textarea
                    id='playground-text'
                    aria-label='Text to synthesize'
                    className='min-h-56 resize-y bg-background'
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder='Enter text for Kokoros to synthesize.'
                  />
                </div>

                <div className='space-y-5'>
                  <div className='space-y-2'>
                    <Label htmlFor='voice-select'>Voice</Label>
                    <Select value={style} onValueChange={setStyle}>
                      <SelectTrigger id='voice-select' className='w-full bg-background' aria-label='Voice style'>
                        <SelectValue placeholder='Choose a voice' />
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
                    <Label htmlFor='language-input'>Language</Label>
                    <Input
                      id='language-input'
                      aria-label='Language flag'
                      className='bg-background'
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                    />
                  </div>

                  <div className='space-y-2'>
                    <Label htmlFor='speed-input'>Speed</Label>
                    <Input
                      id='speed-input'
                      aria-label='Speed flag'
                      type='number'
                      step='0.1'
                      className='bg-background'
                      value={speed}
                      onChange={(event) => setSpeed(event.target.value)}
                    />
                  </div>

                  <div className='grid gap-4 rounded-xl border bg-muted/30 p-4'>
                    <div className='flex items-center justify-between gap-4'>
                      <div className='space-y-1'>
                        <Label htmlFor='mono-toggle'>Mono</Label>
                        <p className='text-xs text-muted-foreground'>Match `--mono`.</p>
                      </div>
                      <Switch
                        id='mono-toggle'
                        aria-label='Enable mono output'
                        checked={mono}
                        onCheckedChange={setMono}
                      />
                    </div>

                    <div className='flex items-center justify-between gap-4'>
                      <div className='space-y-1'>
                        <Label htmlFor='timestamps-toggle'>Timestamps</Label>
                        <p className='text-xs text-muted-foreground'>Match `--timestamps`.</p>
                      </div>
                      <Switch
                        id='timestamps-toggle'
                        aria-label='Enable timestamps output'
                        checked={timestamps}
                        onCheckedChange={setTimestamps}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='border-border/80 bg-card/95 shadow-sm'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-lg'>
                <SlidersHorizontal className='size-4 text-muted-foreground' />
                CLI flags
              </CardTitle>
              <CardDescription>Expose the current path and output flags directly in the UI.</CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label htmlFor='model-path'>Model path</Label>
                <Input
                  id='model-path'
                  aria-label='Model path'
                  className='bg-background'
                  value={modelPath}
                  onChange={(event) => setModelPath(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='data-path'>Voice data path</Label>
                <Input
                  id='data-path'
                  aria-label='Voice data path'
                  className='bg-background'
                  value={dataPath}
                  onChange={(event) => setDataPath(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='output-path'>Output path</Label>
                <Input
                  id='output-path'
                  aria-label='Output path'
                  className='bg-background'
                  value={outputPath}
                  onChange={(event) => setOutputPath(event.target.value)}
                />
              </div>

              <div className='space-y-2'>
                <Label htmlFor='initial-silence'>Initial silence</Label>
                <Input
                  id='initial-silence'
                  aria-label='Initial silence'
                  type='number'
                  min='0'
                  className='bg-background'
                  value={initialSilence}
                  onChange={(event) => setInitialSilence(event.target.value)}
                  placeholder='Optional'
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className='grid gap-6'>
          <Card className='border-border/80 bg-card/95 shadow-sm'>
            <CardHeader>
              <CardTitle className='flex items-center gap-2 text-lg'>
                <FileAudio className='size-4 text-muted-foreground' />
                Audio
              </CardTitle>
              <CardDescription>This is the playback slot for generated output.</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='rounded-xl border bg-muted/20 p-4'>
                <audio
                  controls
                  preload='none'
                  aria-label='Generated audio preview'
                  className='w-full'
                />
              </div>
              <p className='text-sm text-muted-foreground'>
                No generation flow is wired yet. Keep this panel as the stable place where the
                produced audio will be playable.
              </p>
            </CardContent>
          </Card>

          <Card className='border-border/80 bg-card/95 shadow-sm'>
            <CardHeader>
              <CardTitle className='text-lg'>Command preview</CardTitle>
              <CardDescription>The current UI state mapped back to the CLI.</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className='overflow-x-auto rounded-xl border bg-muted/30 p-4 text-xs leading-6 text-foreground sm:text-sm'>
                <code>{commandPreview}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  )
}
