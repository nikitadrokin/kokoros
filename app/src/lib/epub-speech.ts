import { optimizePlainTextForSpeech } from './tts-text';

const SPEECH_BLOCK_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'li',
  'blockquote',
  'dd',
  'dt',
  'caption',
  'figcaption',
  'td',
  'th',
].join(',');

const SKIP_SELECTOR = [
  'script',
  'style',
  'svg',
  'canvas',
  'audio',
  'video',
  'nav',
  'aside',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="doc-pagebreak"]',
  '.pagebreak',
  '.page-number',
  '.pagenum',
].join(',');

export type EpubSpeechScope = {
  startSelector?: string;
  endSelector?: string;
};

export function extractSpeechTextFromChapterHtml(
  html: string,
  scope: EpubSpeechScope = {},
): string {
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
  const body = doc.body;
  const startNode = scope.startSelector
    ? body.querySelector(scope.startSelector)
    : null;
  const endNode = scope.endSelector
    ? body.querySelector(scope.endSelector)
    : null;
  const lines: string[] = [];
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_ELEMENT);
  let started = !startNode;
  let lastAddedBlock: Element | null = null;

  while (walker.nextNode()) {
    const element = walker.currentNode as Element;

    if (endNode && (element === endNode || element.contains(endNode))) {
      break;
    }

    if (!started) {
      if (!startNode) {
        started = true;
      } else if (element === startNode || element.contains(startNode)) {
        started = true;
      } else {
        continue;
      }
    }

    if (!element.matches(SPEECH_BLOCK_SELECTOR) || shouldSkipElement(element)) {
      continue;
    }

    if (lastAddedBlock?.contains(element)) {
      continue;
    }

    const text = element.textContent?.replace(/\s+/g, ' ').trim();
    if (!text) {
      continue;
    }

    lines.push(text);
    lastAddedBlock = element;
  }

  return optimizePlainTextForSpeech(lines.join('\n\n'));
}

export function extractSelectedSpeechText(
  doc: Document | null | undefined,
): string {
  const selection = doc?.getSelection();
  const text = selection?.toString().trim() ?? '';
  return optimizePlainTextForSpeech(text);
}

function shouldSkipElement(element: Element): boolean {
  if (element.closest(SKIP_SELECTOR)) {
    return true;
  }

  const epubType = element.getAttribute('epub:type') ?? '';
  return /\b(pagebreak|noteref|footnote|endnote|rearnote)\b/i.test(epubType);
}
