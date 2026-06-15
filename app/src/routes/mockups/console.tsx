import { createFileRoute } from '@tanstack/react-router';
import {
  AudioLinesIcon,
  Clock,
  FolderOpen,
  Mic,
  MoreHorizontal,
  Play,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

/**
 * Mockup — "Console"
 * A pro, information-dense two-pane workspace. Large editor on the left,
 * a persistent "now playing" + recent renders rail on the right. Segmented
 * controls instead of stacked radios. For power users batching audio.
 */
export const Route = createFileRoute('/mockups/console')({
  component: ConsoleMockup,
});

const VOICES = [
  { value: 'af_heart', label: 'af_heart', badge: 'Best F' },
  { value: 'af_nova', label: 'af_nova' },
  { value: 'af_bella', label: 'af_bella' },
  { value: 'am_michael', label: 'am_michael', badge: 'Best M' },
  { value: 'am_onyx', label: 'am_onyx' },
  { value: 'am_puck', label: 'am_puck' },
];

const MODES = ['Stream', 'Save & stream', 'Save silent'];

const RECENT = [
  { name: 'intro-take-3.wav', meta: '0:42 · 1.4 MB', when: '2m ago' },
  { name: 'chapter-01.wav', meta: '4:18 · 8.1 MB', when: '1h ago' },
  { name: 'ad-read-final.wav', meta: '0:28 · 0.9 MB', when: 'Yesterday' },
];

function ConsoleMockup() {
  const [voice, setVoice] = useState('af_heart');
  const [mode, setMode] = useState('Save silent');
  const [text, setText] = useState('');

  return (
    <main className="min-h-[calc(100vh-4.5rem)] p-4 md:p-6">
      <div className="mx-auto grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Editor pane */}
        <section className="flex flex-col rounded-3xl border bg-card shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Mic className="size-4 text-muted-foreground" />
              <h1 className="font-semibold text-sm">Composer</h1>
            </div>
            <Badge variant="secondary" className="rounded-full font-mono text-[11px]">
              Untitled
            </Badge>
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste the script you want Kokoro to read…"
            className="min-h-[20rem] flex-1 resize-none bg-transparent px-5 py-4 text-base leading-relaxed outline-none placeholder:text-muted-foreground/60"
          />

          <div className="space-y-3 border-t p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-muted-foreground text-xs">Voice</span>
              {VOICES.map((v) => (
                <button
                  type="button"
                  key={v.value}
                  onClick={() => setVoice(v.value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
                    v.value === voice
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'hover:bg-muted'
                  }`}
                >
                  {v.label}
                  {v.badge && (
                    <span className="rounded-full bg-muted px-1.5 py-px font-sans text-[10px] text-muted-foreground">
                      {v.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5">
                {MODES.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMode(m)}
                    className={`rounded-full px-3 py-1.5 font-medium text-xs transition-colors ${
                      m === mode
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <Button className="rounded-full px-5">
                <AudioLinesIcon className="size-4" />
                Generate
              </Button>
            </div>
          </div>
        </section>

        {/* Right rail */}
        <aside className="flex flex-col gap-4">
          {/* Now playing */}
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-muted-foreground">
              <AudioLinesIcon className="size-4" />
              <span className="font-medium text-sm">Now playing</span>
            </div>
            <div className="rounded-2xl bg-muted/60 p-4">
              <div className="mb-3 flex h-12 items-end gap-1">
                {[6, 14, 9, 22, 13, 30, 18, 26, 11, 20, 8, 16, 24, 12, 7].map(
                  (h, i) => (
                    <span
                      key={i}
                      className="flex-1 rounded-full bg-primary/40"
                      style={{ height: `${h * 1.4}px` }}
                    />
                  ),
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button size="icon" className="size-10 rounded-full">
                  <Play className="size-4" />
                </Button>
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm">intro-take-3.wav</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    0:12 / 0:42
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent renders */}
          <div className="flex min-h-0 flex-1 flex-col rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-4" />
                <span className="font-medium text-sm">Recent renders</span>
              </div>
              <Button variant="ghost" size="icon-sm" className="rounded-full">
                <MoreHorizontal className="size-4" />
              </Button>
            </div>
            <div className="space-y-1.5">
              {RECENT.map((r) => (
                <div
                  key={r.name}
                  className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50"
                >
                  <Button
                    size="icon-sm"
                    variant="secondary"
                    className="rounded-full"
                  >
                    <Play className="size-3.5" />
                  </Button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">{r.name}</p>
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {r.meta} · {r.when}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" className="rounded-full">
                      <FolderOpen className="size-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="rounded-full">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
