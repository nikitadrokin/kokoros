import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

/**
 * Static reference for UI integration: documents the `koko` binary shape (see `koko -h`).
 * Not wired to process execution yet.
 */
function Home() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell mb-6 rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">CLI reference</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          <code className="text-[var(--sea-ink)]">koko</code> command map
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          Global binary name: <code>koko</code>. Top level is always{' '}
          <code>koko [global options] &lt;COMMAND&gt;</code>. Global flags apply before the
          subcommand; subcommands add their own args. Paths default relative to the process
          working directory (model <code>checkpoints/kokoro-v1.0.onnx</code>, voices{' '}
          <code>data/voices-v1.0.bin</code>).
        </p>
      </section>

      <section className="island-shell mb-6 rounded-2xl p-6 sm:p-8">
        <h2 className="mb-4 text-xl font-semibold text-[var(--sea-ink)]">
          Global options (all subcommands)
        </h2>
        <dl className="m-0 space-y-3 text-sm text-[var(--sea-ink-soft)]">
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              -l, --lan &lt;LANGUAGE&gt;
            </dt>
            <dd className="m-0 mt-1">
              eSpeak-NG language id (default <code>en-us</code>); list linked from upstream
              espeak-ng docs.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              -m, --model &lt;MODEL_PATH&gt;
            </dt>
            <dd className="m-0 mt-1">Kokoro v1.0 ONNX file (default checkpoints path above).</dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              -d, --data &lt;DATA_PATH&gt;
            </dt>
            <dd className="m-0 mt-1">Voices binary (default data path above).</dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              -s, --style &lt;STYLE&gt;
            </dt>
            <dd className="m-0 mt-1">
              One voice or combined voices string (default <code>af_heart</code>).
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              -p, --speed &lt;SPEED&gt;
            </dt>
            <dd className="m-0 mt-1">
              Speech rate coefficient; &lt;1 slower, &gt;1 faster (default <code>1</code>).
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">--mono</dt>
            <dd className="m-0 mt-1">Force mono WAV instead of stereo.</dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              --initial-silence &lt;TOKENS&gt;
            </dt>
            <dd className="m-0 mt-1">Leading silence length in model tokens.</dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">--timestamps</dt>
            <dd className="m-0 mt-1">
              Emit word-level timestamps sidecar TSV alongside audio (also on some
              subcommands).
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">
              --instances &lt;N&gt;
            </dt>
            <dd className="m-0 mt-1">
              Parallel TTS worker count (default <code>2</code>).
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[var(--sea-ink)]">-h, --help / -V, --version</dt>
            <dd className="m-0 mt-1">Help and version.</dd>
          </div>
        </dl>
      </section>

      <section className="island-shell mb-6 rounded-2xl p-6 sm:p-8">
        <h2 className="mb-4 text-xl font-semibold text-[var(--sea-ink)]">Subcommands</h2>
        <ul className="m-0 list-none space-y-6 p-0">
          <li className="border-b border-[var(--line)] pb-6 last:border-0 last:pb-0">
            <h3 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
              koko text [OPTIONS] [TEXT]
            </h3>
            <p className="m-0 mb-2 text-sm text-[var(--sea-ink-soft)]">
              One-shot synthesis: optional <code>[TEXT]</code> argument; if omitted, uses a long
              built-in demo string. Writes a single WAV.
            </p>
            <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
              <li>
                <code>-o, --output &lt;OUTPUT_PATH&gt;</code> — default <code>output.wav</code>
              </li>
              <li>
                <code>--timestamps</code> — per-invocation override for sidecar TSV
              </li>
            </ul>
          </li>
          <li className="border-b border-[var(--line)] pb-6 last:border-0 last:pb-0">
            <h3 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
              koko file [OPTIONS] &lt;INPUT_PATH&gt;
            </h3>
            <p className="m-0 mb-2 text-sm text-[var(--sea-ink-soft)]">
              Batch: each non-empty line of the input file becomes one WAV. Replace{' '}
              <code>{'{line}'}</code> in the output pattern with 1-based line index.
            </p>
            <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
              <li>
                <code>-o, --output &lt;OUTPUT_PATH_FORMAT&gt;</code> — default{' '}
                <code>output_{'{line}'}.wav</code>
              </li>
              <li>
                <code>--timestamps</code> — sidecar TSV per line/file naming mirrors WAV
              </li>
            </ul>
          </li>
          <li className="border-b border-[var(--line)] pb-6 last:border-0 last:pb-0">
            <h3 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
              koko stream [OPTIONS]
            </h3>
            <p className="m-0 mb-2 text-sm text-[var(--sea-ink-soft)]">
              Piping mode: read lines from stdin, write raw audio for each line to stdout
              (suitable for shell pipelines). Optional <code>--timestamps</code> for sidecar
              behavior per help text.
            </p>
          </li>
          <li>
            <h3 className="mb-2 font-mono text-base font-semibold text-[var(--sea-ink)]">
              koko openai [OPTIONS]
            </h3>
            <p className="m-0 mb-2 text-sm text-[var(--sea-ink-soft)]">
              Long-running HTTP server with an OpenAI-compatible TTS API surface. UI should treat
              as a managed subprocess (bind address, log stream, shutdown).
            </p>
            <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-[var(--sea-ink-soft)]">
              <li>
                <code>--ip &lt;IP&gt;</code> — default <code>0.0.0.0</code>
              </li>
              <li>
                <code>--port &lt;PORT&gt;</code> — default <code>3000</code>
              </li>
              <li>
                <code>--timestamps</code> — listed on server command in CLI help
              </li>
            </ul>
          </li>
        </ul>
      </section>

      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <h2 className="mb-3 text-xl font-semibold text-[var(--sea-ink)]">
          Integration notes (Tauri / UI)
        </h2>
        <ul className="m-0 list-disc space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>
            Resolve <code>koko</code> on PATH or bundle sidecar; set cwd to a folder that
            contains default <code>checkpoints/</code> and <code>data/</code> or pass explicit{' '}
            <code>-m</code> / <code>-d</code>.
          </li>
          <li>
            Simple app flows map to <code>text</code> (preview), <code>file</code> (batch jobs),
            <code>stream</code> (live stdin — rarely from GUI), <code>openai</code> (local API
            toggle).
          </li>
          <li>
            Parallelism: expose <code>--instances</code> for heavy batch UIs; respect user
            machine limits.
          </li>
          <li>
            Timestamp outputs are file-based; UI needs paths for both WAV and TSV when enabled.
          </li>
        </ul>
      </section>
    </main>
  )
}
