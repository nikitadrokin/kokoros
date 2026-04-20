const TABLE_DIVIDER_PATTERN = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/;
const ORDERED_LIST_PATTERN = /^\s*\d+[.)]\s+/;
const UNORDERED_LIST_PATTERN = /^\s*[-*+]\s+/;
const TASK_LIST_PATTERN = /^\s*[-*+]\s+\[[ xX]\]\s+/;
const BLOCKQUOTE_PATTERN = /^\s{0,3}>\s?/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/;
const REFERENCE_LINK_PATTERN = /^\s*\[[^\]]+\]:\s+\S+/;
const TERMINAL_PUNCTUATION_PATTERN = /[.!?:;](?:["')\]]+)?$/;
const TRAILING_COMMA_PATTERN = /,+(?:["')\]]+)?$/;

type MarkdownLine = {
  text: string;
  kind: 'body' | 'heading' | 'list';
};

export type SpeechTextStats = {
  inputWords: number;
  outputWords: number;
  inputCharacters: number;
  outputCharacters: number;
};

export function optimizeMarkdownForSpeech(markdown: string): string {
  const normalized = markdown
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ');

  const lines = normalized.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (!trimmed) {
      pushBlankLine(output);
      continue;
    }

    if (
      REFERENCE_LINK_PATTERN.test(trimmed) ||
      TABLE_DIVIDER_PATTERN.test(trimmed)
    ) {
      continue;
    }

    const parsedLine = cleanMarkdownLine(trimmed, inCodeBlock);
    if (!parsedLine.text) {
      continue;
    }

    output.push(punctuateLine(parsedLine));
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function optimizePlainTextForSpeech(text: string): string {
  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ');
  const output: string[] = [];

  for (const rawLine of normalized.split('\n')) {
    const cleaned = normalizeSpeechText(rawLine.trim());
    if (!cleaned) {
      pushBlankLine(output);
      continue;
    }

    output.push(
      punctuateLine({
        kind: 'body',
        text: cleaned,
      }),
    );
  }

  return output
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getSpeechTextStats(
  input: string,
  output: string,
): SpeechTextStats {
  return {
    inputWords: countWords(input),
    outputWords: countWords(output),
    inputCharacters: input.length,
    outputCharacters: output.length,
  };
}

function cleanMarkdownLine(
  rawLine: string,
  inCodeBlock: boolean,
): MarkdownLine {
  if (inCodeBlock) {
    return {
      kind: 'body',
      text: normalizeSpeechText(rawLine),
    };
  }

  let kind: MarkdownLine['kind'] = 'body';
  let line = rawLine.replace(BLOCKQUOTE_PATTERN, '').trim();

  if (HEADING_PATTERN.test(line)) {
    kind = 'heading';
    line = line.replace(HEADING_PATTERN, '');
  } else if (TASK_LIST_PATTERN.test(line)) {
    kind = 'list';
    line = line.replace(TASK_LIST_PATTERN, '');
  } else if (UNORDERED_LIST_PATTERN.test(line)) {
    kind = 'list';
    line = line.replace(UNORDERED_LIST_PATTERN, '');
  } else if (ORDERED_LIST_PATTERN.test(line)) {
    kind = 'list';
    line = line.replace(ORDERED_LIST_PATTERN, '');
  }

  line = line
    .replace(/^[-*_]{3,}$/, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<br\s*\/?>/gi, '. ')
    .replace(/<\/?[^>]+>/g, '')
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .replace(/\s*\|\s*/g, ', ');

  return {
    kind,
    text: normalizeSpeechText(line),
  };
}

function normalizeSpeechText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\^\[([^\]]+)\]/g, '$1')
    .replace(/\[\^?[\w-]+\]/g, '')
    .replace(/https?:\/\/[^\s)]+/gi, formatUrlForSpeech)
    .replace(
      /(^|[^\w])\$((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?|\.\d{1,2})(?=\b|[^\d])/g,
      (_match, prefix: string, amount: string) => {
        return `${prefix}${formatCurrencyForSpeech(amount)}`;
      },
    )
    .replace(/(\d+(?:\.\d+)?)%/g, '$1 percent')
    .replace(/&amp;/gi, ' and ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;|&ndash;/gi, ', ')
    .replace(/&/g, ' and ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function punctuateLine(line: MarkdownLine): string {
  if (TERMINAL_PUNCTUATION_PATTERN.test(line.text)) {
    return line.text;
  }

  if (TRAILING_COMMA_PATTERN.test(line.text)) {
    return line.text.replace(TRAILING_COMMA_PATTERN, ';');
  }

  if (line.kind === 'heading') {
    return `${line.text}:`;
  }

  if (line.kind === 'list') {
    return `${line.text};`;
  }

  return `${line.text}.`;
}

function pushBlankLine(lines: string[]) {
  if (lines.length === 0 || lines.at(-1) === '') {
    return;
  }
  lines.push('');
}

function formatCurrencyForSpeech(amount: string): string {
  const normalized = amount.replace(/,/g, '');
  const [dollarsPart = '0', centsPart = ''] = normalized.split('.');
  const dollars = Number.parseInt(dollarsPart || '0', 10);
  const cents = Number.parseInt(centsPart.padEnd(2, '0') || '0', 10);

  if (dollars === 0 && cents > 0) {
    return `${cents} ${pluralize('cent', cents)}`;
  }

  if (cents > 0) {
    return `${dollars} ${pluralize('dollar', dollars)} and ${cents} ${pluralize('cent', cents)}`;
  }

  return `${dollars} ${pluralize('dollar', dollars)}`;
}

function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

function formatUrlForSpeech(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/$/, '')
    .replace(/\./g, ' dot ')
    .replace(/\//g, ' slash ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}
