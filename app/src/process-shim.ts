/**
 * Some browser bundles (e.g. EPUB parser path helpers) reference Node's `process`.
 * Safari has no global `process`, which throws before optional checks run.
 */
type ProcessShim = {
  env: Record<string, string | undefined>;
  cwd: () => string;
  nextTick: (cb: () => void) => void;
  emit: (event: string, error?: unknown) => boolean;
};

const shim: ProcessShim = {
  env: {},
  cwd: () => '/',
  nextTick: (cb) => {
    queueMicrotask(cb);
  },
  emit: () => false,
};

if (typeof globalThis.process === 'undefined') {
  Reflect.set(globalThis, 'process', shim);
}
