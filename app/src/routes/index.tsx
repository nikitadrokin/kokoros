import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { FileAudio } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
  const [style, setStyle] = useState('')
  const [language, setLanguage] = useState('')
  const [speed, setSpeed] = useState('')
  const [modelPath, setModelPath] = useState('')
  const [dataPath, setDataPath] = useState('')
  const [outputPath, setOutputPath] = useState('')
  const [initialSilence, setInitialSilence] = useState('')
  const [mono, setMono] = useState(false)
  const [timestamps, setTimestamps] = useState(false)

  const commandPreview = useMemo(() => {
    const args = ['koko']

    if (language.trim()) {
      args.push('--lan', quoteArg(language.trim()))
    }

    if (modelPath.trim()) {
      args.push('--model', quoteArg(modelPath.trim()))
    }

    if (dataPath.trim()) {
      args.push('--data', quoteArg(dataPath.trim()))
    }

    if (style.trim()) {
      args.push('--style', quoteArg(style.trim()))
    }

    if (speed.trim()) {
      args.push('--speed', quoteArg(speed.trim()))
    }

    if (initialSilence.trim()) {
      args.push('--initial-silence', quoteArg(initialSilence.trim()))
    }

    if (mono) {
      args.push('--mono')
    }

    if (timestamps) {
      args.push('--timestamps')
    }

    args.push('text', quoteArg(text))

    if (outputPath.trim()) {
      args.push('--output', quoteArg(outputPath.trim()))
    }

    return args.join(' ')
  }, [dataPath, initialSilence, language, modelPath, mono, outputPath, speed, style, text, timestamps])

  return (
    <main className='mx-auto flex min-h-screen w-full max-w-6xl px-4 py-6 sm:px-6'>
      <Card className='w-full border-border/80 bg-card/95 py-4 shadow-sm'>
        <CardContent className='space-y-4'>
          <div className='flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <h1 className='text-lg font-semibold tracking-tight'>Kokoros playground</h1>
              <p className='text-sm text-muted-foreground'>
                Basic text, voice, flags, and audio playback.
              </p>
            </div>
            <p className='text-xs text-muted-foreground'>Single-route temporary UI</p>
          </div>

          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
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

            <div className='grid gap-3'>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-1'>
                <div className='space-y-2'>
                  <Label htmlFor='voice-select'>Voice</Label>
                  <Select value={style || undefined} onValueChange={setStyle}>
                    <SelectTrigger id='voice-select' className='w-full bg-background' aria-label='Voice style'>
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
                  <Label htmlFor='language-input'>Language</Label>
                  <Input
                    id='language-input'
                    aria-label='Language flag'
                    className='bg-background'
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
                    className='bg-background'
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
                    className='bg-background'
                    value={initialSilence}
                    onChange={(event) => setInitialSilence(event.target.value)}
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
            </div>
          </div>

          <div className='grid gap-3 border-t pt-4 md:grid-cols-3'>
            <div className='space-y-2'>
              <Label htmlFor='model-path'>Model path</Label>
              <Input
                id='model-path'
                aria-label='Model path'
                className='bg-background'
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
                className='bg-background'
                value={dataPath}
                onChange={(event) => setDataPath(event.target.value)}
                placeholder='data/voices-v1.0.bin'
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
                placeholder='output.wav'
              />
            </div>
          </div>

          <div className='grid gap-3 border-t pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'>
            <div className='space-y-2'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <FileAudio className='size-4 text-muted-foreground' />
                Audio
              </div>
              <div className='rounded-lg border bg-muted/20 p-3'>
                <audio
                  controls
                  preload='none'
                  aria-label='Generated audio preview'
                  className='w-full'
                />
              </div>
            </div>

            <div className='space-y-2'>
              <Label>Command preview</Label>
              <pre className='overflow-x-auto rounded-lg border bg-muted/20 p-3 text-xs leading-5 text-foreground'>
                <code>{commandPreview}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
