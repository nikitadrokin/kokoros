import { createFileRoute } from '@tanstack/react-router';
import {
  AudioLinesIcon,
  ChevronDown,
  Pause,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Mockup — "Studio"
 * A calm, single-column composer. The script is the hero; everything else
 * collapses into a floating control bar and a docked mini-player so the
 * writing surface stays front and center. Large radius throughout.
 */
export const Route = createFileRoute('/mockups/studio')({
  component: StudioMockup,
});

const VOICES = [
  { value: 'af_heart', label: 'Heart', tag: 'Warm · F' },
  { value: 'am_michael', label: 'Michael', tag: 'Deep · M' },
  { value: 'af_nova', label: 'Nova', tag: 'Bright · F' },
  { value: 'am_puck', label: 'Puck', tag: 'Playful · M' },
];

const MODES = [
  { value: 'stream', label: 'Stream' },
  { value: 'save-stream', label: 'Save & stream' },
  { value: 'save-silent', label: 'Save silent' },
];

function StudioMockup() {
  const [voice, setVoice] = useState(VOICES[0].value);
  const [mode, setMode] = useState('save-silent');
  const [playing, setPlaying] = useState(false);
  const [text, setText] = useState('');

  const activeVoice = VOICES.find((v) => v.value === voice) ?? VOICES[0];

  return (
    <main className="relative min-h-[calc(100vh-4.5rem)] px-4 pb-40 pt-10">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Studio</h1>
            <p className="text-muted-foreground text-sm">
              Write, pick a voice, and let it speak.
            </p>
          </div>
        </header>

        {/* Writing surface */}
        <div className="rounded-4xl border bg-card p-2 shadow-sm">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Start typing your script…"
            className="min-h-[22rem] w-full resize-none rounded-[1.75rem] bg-transparent px-6 py-5 text-lg leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center justify-between px-4 pb-2 text-muted-foreground text-xs tabular-nums">
            <span>{text.trim() ? text.trim().split(/\s+/).length : 0} words</span>
            <span>~{Math.max(1, Math.round(text.length / 14))}s of audio</span>
          </div>
        </div>
      </div>

      {/* Floating control bar */}
      <div className="-translate-x-1/2 fixed bottom-6 left-1/2 z-40 w-[min(46rem,calc(100vw-2rem))]">
        <div className="flex items-center gap-2 rounded-full border bg-background/80 p-2 shadow-lg backdrop-blur">
          {/* Voice picker */}
          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 font-medium text-sm transition-colors hover:bg-muted/70"
            >
              <span className="grid size-6 place-items-center rounded-full bg-primary/15 text-[11px] text-primary">
                {activeVoice.label[0]}
              </span>
              {activeVoice.label}
              <ChevronDown className="size-4 text-muted-foreground" />
            </button>
            <div className="invisible absolute bottom-full left-0 mb-2 w-56 origin-bottom translate-y-1 rounded-3xl border bg-popover p-1.5 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {VOICES.map((v) => (
                <button
                  type="button"
                  key={v.value}
                  onClick={() => setVoice(v.value)}
                  className={`flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
                    v.value === voice ? 'bg-muted' : ''
                  }`}
                >
                  <span className="font-medium">{v.label}</span>
                  <span className="text-muted-foreground text-xs">{v.tag}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mode segmented */}
          <div className="hidden items-center gap-0.5 rounded-full bg-muted p-0.5 sm:flex">
            {MODES.map((m) => (
              <button
                type="button"
                key={m.value}
                onClick={() => setMode(m.value)}
                className={`rounded-full px-3 py-1.5 font-medium text-xs transition-colors ${
                  m.value === mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Button variant="ghost" size="icon" className="ml-auto rounded-full sm:ml-0">
            <SlidersHorizontal className="size-4" />
          </Button>

          <Button
            onClick={() => setPlaying((p) => !p)}
            className="ml-auto rounded-full px-5"
          >
            {playing ? (
              <Pause className="size-4" />
            ) : (
              <AudioLinesIcon className="size-4" />
            )}
            {playing ? 'Stop' : 'Generate'}
          </Button>
        </div>
      </div>
    </main>
  );
}
