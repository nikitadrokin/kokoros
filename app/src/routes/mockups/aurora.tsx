import { createFileRoute } from '@tanstack/react-router';
import { AudioLinesIcon, Check, Play, Waves } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * Mockup — "Aurora"
 * A soft, friendly bento layout. Oversized rounded tiles, a gradient hero
 * with a live waveform, voices as avatar chips, and a segmented mode toggle.
 * Leans hardest into the large border radius and a warm, approachable feel.
 */
export const Route = createFileRoute('/mockups/aurora')({
  component: AuroraMockup,
});

const VOICES = [
  { value: 'af_heart', label: 'Heart', hue: 'from-rose-400 to-orange-300' },
  { value: 'af_nova', label: 'Nova', hue: 'from-violet-400 to-indigo-300' },
  { value: 'af_river', label: 'River', hue: 'from-sky-400 to-cyan-300' },
  { value: 'am_michael', label: 'Michael', hue: 'from-emerald-400 to-teal-300' },
  { value: 'am_onyx', label: 'Onyx', hue: 'from-slate-500 to-slate-400' },
];

const MODES = [
  { value: 'stream', label: 'Stream' },
  { value: 'save-stream', label: 'Save & stream' },
  { value: 'save-silent', label: 'Save silent' },
];

function AuroraMockup() {
  const [voice, setVoice] = useState('af_heart');
  const [mode, setMode] = useState('save-silent');
  const [text, setText] = useState('');

  return (
    <main className="min-h-[calc(100vh-4.5rem)] p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-5xl gap-4 md:grid-cols-3">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-4xl bg-gradient-to-br from-primary/90 via-primary to-primary/70 p-7 text-primary-foreground md:col-span-3">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm/none opacity-80">
                <Waves className="size-4" /> Aurora
              </div>
              <h1 className="font-semibold text-3xl tracking-tight">
                Let's make something speak.
              </h1>
            </div>
            <div className="flex h-12 items-end gap-1">
              {[10, 24, 16, 34, 20, 40, 26, 38, 18, 30, 14, 22].map((h, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-primary-foreground/70"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Script tile */}
        <div className="rounded-4xl border bg-card p-2 shadow-sm md:col-span-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What should it say?"
            className="min-h-[16rem] w-full resize-none rounded-[1.75rem] bg-transparent px-6 py-5 text-lg leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center justify-between px-5 pb-3 text-muted-foreground text-xs tabular-nums">
            <span>{text.length} characters</span>
            <span>⌘↵ to generate</span>
          </div>
        </div>

        {/* Voice + mode column */}
        <div className="flex flex-col gap-4">
          <div className="rounded-4xl border bg-card p-5 shadow-sm">
            <p className="mb-3 font-medium text-sm">Voice</p>
            <div className="space-y-1.5">
              {VOICES.map((v) => (
                <button
                  type="button"
                  key={v.value}
                  onClick={() => setVoice(v.value)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors ${
                    v.value === voice
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-transparent hover:bg-muted/60'
                  }`}
                >
                  <span
                    className={`grid size-9 place-items-center rounded-full bg-gradient-to-br ${v.hue} font-semibold text-sm text-white shadow-sm`}
                  >
                    {v.label[0]}
                  </span>
                  <span className="flex-1 font-medium text-sm">{v.label}</span>
                  {v.value === voice && (
                    <Check className="size-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-4xl border bg-card p-5 shadow-sm">
            <p className="mb-3 font-medium text-sm">Output</p>
            <div className="flex flex-col gap-1.5 rounded-2xl bg-muted p-1">
              {MODES.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`rounded-xl px-3 py-2 text-left font-medium text-sm transition-colors ${
                    m.value === mode
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action bar tile */}
        <div className="flex items-center justify-between gap-4 rounded-4xl border bg-card p-4 shadow-sm md:col-span-3">
          <div className="flex items-center gap-3">
            <Button size="icon" variant="secondary" className="size-11 rounded-full">
              <Play className="size-5" />
            </Button>
            <div>
              <p className="font-medium text-sm">Preview</p>
              <p className="text-muted-foreground text-xs">
                Nothing generated yet
              </p>
            </div>
          </div>
          <Button size="lg" className="rounded-full px-8 text-base">
            <AudioLinesIcon className="size-5" />
            Generate
          </Button>
        </div>
      </div>
    </main>
  );
}
