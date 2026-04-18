import geistCyrillicFontUrl from '@fontsource-variable/geist/files/geist-cyrillic-wght-normal.woff2?url';
import geistLatinExtFontUrl from '@fontsource-variable/geist/files/geist-latin-ext-wght-normal.woff2?url';
import geistLatinFontUrl from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';
import {
	type EpubFile,
	type EpubProcessedChapter,
	initEpubFile,
	type NavPoint,
} from '@lingo-reader/epub-parser';
import { createFileRoute } from '@tanstack/react-router';
import { BookOpen, ChevronRight, LoaderCircle, Upload } from 'lucide-react';
import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';

export const Route = createFileRoute('/epub')({ component: EpubReaderPage });

/** One spine row when the book has no usable NCX / nav tree. */
type SpineListItem = {
	kind: 'spine';
	id: string;
	label: string;
};

/** One TOC row resolved to a loadable manifest id. */
type TocListItem = {
	kind: 'toc';
	id: string;
	navId: string;
	playOrder: string;
	label: string;
	selector: string;
	depth: number;
};

type ChapterListItem = SpineListItem | TocListItem;

type ReaderTheme = {
	background: string;
	foreground: string;
	mutedForeground: string;
	border: string;
	fontFamily: string;
	colorScheme: 'light' | 'dark';
};

const DEFAULT_READER_THEME: ReaderTheme = {
	background: 'oklch(1 0 0)',
	foreground: 'oklch(0.147 0.004 49.3)',
	mutedForeground: 'oklch(0.547 0.021 43.1)',
	border: 'oklch(0.922 0.005 34.3)',
	fontFamily: '"Geist Variable", sans-serif',
	colorScheme: 'light',
};

/**
 * Flattens NCX nav points into rows with manifest ids for `loadChapter`.
 */
function flattenNavPoints(
	points: NavPoint[],
	epub: EpubFile,
	depth: number,
): TocListItem[] {
	const rows: TocListItem[] = [];
	for (const point of points) {
		const resolved = epub.resolveHref(point.href);
		if (resolved) {
			rows.push({
				kind: 'toc',
				id: resolved.id,
				navId: point.id,
				playOrder: point.playOrder,
				label: point.label,
				selector: resolved.selector,
				depth,
			});
		}
		if (point.children?.length) {
			rows.push(...flattenNavPoints(point.children, epub, depth + 1));
		}
	}
	return rows;
}

function buildChapterList(epub: EpubFile): ChapterListItem[] {
	const tocRows = flattenNavPoints(epub.getToc(), epub, 0);
	if (tocRows.length > 0) {
		return tocRows;
	}
	const spine = epub.getSpine();
	return spine.map((item) => ({
		kind: 'spine',
		id: item.id,
		label: item.href.split('/').pop() ?? item.id,
	}));
}

function chapterListItemKey(item: ChapterListItem): string {
	return item.kind === 'toc'
		? `toc-${item.navId}-${item.playOrder}-${item.id}-${item.selector}`
		: `spine-${item.id}`;
}

function readCssVariable(styles: CSSStyleDeclaration, name: string): string {
	return styles.getPropertyValue(name).trim();
}

function readReaderTheme(): ReaderTheme {
	if (typeof window === 'undefined') {
		return DEFAULT_READER_THEME;
	}

	const root = document.documentElement;
	const styles = window.getComputedStyle(root);
	const isDark =
		root.classList.contains('dark') || styles.colorScheme === 'dark';

	return {
		background:
			readCssVariable(styles, '--background') ||
			DEFAULT_READER_THEME.background,
		foreground:
			readCssVariable(styles, '--foreground') ||
			DEFAULT_READER_THEME.foreground,
		mutedForeground:
			readCssVariable(styles, '--muted-foreground') ||
			DEFAULT_READER_THEME.mutedForeground,
		border: readCssVariable(styles, '--border') || DEFAULT_READER_THEME.border,
		fontFamily: styles.fontFamily || DEFAULT_READER_THEME.fontFamily,
		colorScheme: isDark ? 'dark' : 'light',
	};
}

function sameReaderTheme(a: ReaderTheme, b: ReaderTheme): boolean {
	return (
		a.background === b.background &&
		a.foreground === b.foreground &&
		a.mutedForeground === b.mutedForeground &&
		a.border === b.border &&
		a.fontFamily === b.fontFamily &&
		a.colorScheme === b.colorScheme
	);
}

function useReaderTheme(): ReaderTheme {
	const [theme, setTheme] = useState(readReaderTheme);

	useEffect(() => {
		const syncTheme = () => {
			setTheme((current) => {
				const next = readReaderTheme();
				return sameReaderTheme(current, next) ? current : next;
			});
		};

		syncTheme();

		const observer = new MutationObserver(syncTheme);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class', 'style', 'data-theme'],
		});

		const media = window.matchMedia('(prefers-color-scheme: dark)');
		media.addEventListener('change', syncTheme);

		return () => {
			observer.disconnect();
			media.removeEventListener('change', syncTheme);
		};
	}, []);

	return theme;
}

function readerThemeCss(theme: ReaderTheme): string {
	return `:root {
	--epub-reader-background: ${theme.background};
	--epub-reader-foreground: ${theme.foreground};
	--epub-reader-muted-foreground: ${theme.mutedForeground};
	--epub-reader-border: ${theme.border};
	--epub-reader-font-family: ${theme.fontFamily};
	background: var(--epub-reader-background) !important;
	color: var(--epub-reader-foreground) !important;
	color-scheme: ${theme.colorScheme};
	font-family: var(--epub-reader-font-family) !important;
}

html,
body {
	min-height: 100%;
	background: var(--epub-reader-background) !important;
}

body {
	background: var(--epub-reader-background) !important;
	color: var(--epub-reader-foreground) !important;
}
`;
}

function readerCriticalStyle(theme: ReaderTheme): string {
	return `<style>${readerThemeCss(theme)}</style>`;
}

function readerDocumentStyle(theme: ReaderTheme): string {
	return `<style>
@font-face {
	font-display: swap;
	font-family: "Geist Variable";
	font-style: normal;
	font-weight: 100 900;
	src: url(${JSON.stringify(geistCyrillicFontUrl)}) format("woff2-variations");
	unicode-range: U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116;
}

@font-face {
	font-display: swap;
	font-family: "Geist Variable";
	font-style: normal;
	font-weight: 100 900;
	src: url(${JSON.stringify(geistLatinExtFontUrl)}) format("woff2-variations");
	unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}

@font-face {
	font-display: swap;
	font-family: "Geist Variable";
	font-style: normal;
	font-weight: 100 900;
	src: url(${JSON.stringify(geistLatinFontUrl)}) format("woff2-variations");
	unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}

${readerThemeCss(theme)}

body {
	box-sizing: border-box;
	margin: 0 !important;
	padding: clamp(1rem, 3vw, 2.5rem) !important;
	color: var(--epub-reader-foreground) !important;
	font-family: var(--epub-reader-font-family) !important;
	font-size: 16px !important;
	font-synthesis-weight: none;
	line-height: 1.7 !important;
	text-rendering: optimizeLegibility;
	-webkit-font-smoothing: antialiased;
}

*,
*::before,
*::after {
	box-sizing: border-box;
}

body > * {
	max-width: 72ch;
	margin-inline: auto;
}

:where(
	body,
	p,
	li,
	dd,
	dt,
	blockquote,
	div,
	section,
	article,
	aside,
	header,
	footer,
	span,
	a,
	td,
	th,
	caption,
	figcaption,
	h1,
	h2,
	h3,
	h4,
	h5,
	h6
) {
	color: var(--epub-reader-foreground) !important;
	font-family: var(--epub-reader-font-family) !important;
}

:where(p, li, dd, blockquote) {
	line-height: 1.75 !important;
}

:where(h1, h2, h3, h4, h5, h6) {
	font-weight: 650 !important;
	letter-spacing: 0 !important;
	line-height: 1.2 !important;
}

a {
	text-decoration-color: var(--epub-reader-muted-foreground) !important;
	text-underline-offset: 0.15em;
}

:where(blockquote) {
	border-inline-start: 3px solid var(--epub-reader-border);
	margin-inline: 0;
	padding-inline-start: 1rem;
}

:where(img, svg, video, canvas) {
	max-width: 100%;
	height: auto;
}

:where(table) {
	max-width: 100%;
	border-collapse: collapse;
}

:where(code, kbd, pre, samp) {
	font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
}
</style>`;
}

function emptyReaderDocument(theme: ReaderTheme): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>${readerDocumentStyle(theme)}</head><body></body></html>`;
}

function chapterDocument(
	chapter: EpubProcessedChapter,
	theme: ReaderTheme,
): string {
	const links = chapter.css
		.map(
			(part) => `<link rel="stylesheet" href=${JSON.stringify(part.href)} />`,
		)
		.join('');
	return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>${readerCriticalStyle(theme)}${links}${readerDocumentStyle(theme)}</head><body>${chapter.html}</body></html>`;
}

function EpubReaderPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const epubRef = useRef<EpubFile | null>(null);
	const loadedChapterIdRef = useRef<string | null>(null);
	const readerTheme = useReaderTheme();

	const [bookTitle, setBookTitle] = useState('');
	const [chapters, setChapters] = useState<ChapterListItem[]>([]);
	const [activeChapter, setActiveChapter] = useState<{
		id: string;
		chapter: EpubProcessedChapter;
		scrollSelector: string;
		scrollRequestId: number;
	} | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState('');
	const readerSrcDoc = useMemo(
		() =>
			activeChapter
				? chapterDocument(activeChapter.chapter, readerTheme)
				: emptyReaderDocument(readerTheme),
		[activeChapter, readerTheme],
	);

	const disposeEpub = useCallback(() => {
		const current = epubRef.current;
		if (current) {
			current.destroy();
			epubRef.current = null;
		}
		loadedChapterIdRef.current = null;
		setChapters([]);
		setActiveChapter(null);
		setBookTitle('');
	}, []);

	useEffect(() => {
		return () => {
			disposeEpub();
		};
	}, [disposeEpub]);

	const scrollIframeToSelector = useCallback((selector: string) => {
		const doc = iframeRef.current?.contentDocument;
		if (!doc) {
			return;
		}
		if (!selector) {
			doc.defaultView?.scrollTo({ behavior: 'smooth', top: 0 });
			return;
		}
		const target = doc.querySelector(selector);
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, []);

	useEffect(() => {
		if (!activeChapter || loadedChapterIdRef.current !== activeChapter.id) {
			return;
		}
		scrollIframeToSelector(activeChapter.scrollSelector);
	}, [activeChapter, scrollIframeToSelector]);

	const openChapter = useCallback(
		async (epub: EpubFile, id: string, scrollSelector: string) => {
			const processed = await epub.loadChapter(id);
			startTransition(() => {
				setActiveChapter((current) => ({
					id,
					chapter: processed,
					scrollSelector,
					scrollRequestId: (current?.scrollRequestId ?? 0) + 1,
				}));
			});
		},
		[],
	);

	const handleFileChange = async (file: File | undefined) => {
		if (!file) {
			return;
		}
		setError('');
		setIsBusy(true);
		disposeEpub();
		try {
			const epub = await initEpubFile(file);
			epubRef.current = epub;
			const meta = epub.getMetadata();
			setBookTitle(meta.title || file.name);
			const list = buildChapterList(epub);
			setChapters(list);
			const first = list[0];
			if (first) {
				const selector = first.kind === 'toc' ? first.selector : '';
				await openChapter(epub, first.id, selector);
			}
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			setError(message);
		} finally {
			setIsBusy(false);
		}
	};

	const onPickChapter = async (item: ChapterListItem) => {
		const epub = epubRef.current;
		if (!epub) {
			return;
		}
		setError('');
		const selector = item.kind === 'toc' ? item.selector : '';
		if (activeChapter?.id === item.id) {
			setActiveChapter((current) =>
				current
					? {
							...current,
							scrollSelector: selector,
							scrollRequestId: current.scrollRequestId + 1,
						}
					: current,
			);
			return;
		}
		setIsBusy(true);
		try {
			await openChapter(epub, item.id, selector);
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			setError(message);
		} finally {
			setIsBusy(false);
		}
	};

	return (
		<main className="min-h-[calc(100vh-4.5rem)] p-4 md:p-6">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
				<div className="pb-2">
					<div className="space-y-1">
						<h1 className="font-semibold text-2xl tracking-tight">
							EPUB reader
						</h1>
						<p className="max-w-2xl text-muted-foreground text-sm">
							Open an EPUB, browse the table of contents, and read chapters
							inline.
						</p>
					</div>
				</div>

				<div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
					<Card className="min-w-0 shadow-sm backdrop-blur lg:self-start">
						<CardHeader className="space-y-1">
							<CardTitle className="flex items-center gap-2 text-base">
								<BookOpen className="size-4 text-muted-foreground" />
								Library
							</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-4 pt-4">
							<input
								ref={fileInputRef}
								type="file"
								accept=".epub,application/epub+zip"
								className="sr-only"
								aria-label="Choose EPUB file"
								onChange={(event) => {
									const next = event.target.files?.[0];
									void handleFileChange(next);
									event.target.value = '';
								}}
							/>
							<div className="space-y-2">
								<Label htmlFor="epub-file-trigger">EPUB file</Label>
								<Button
									id="epub-file-trigger"
									type="button"
									variant="secondary"
									className="w-full"
									disabled={isBusy}
									onClick={() => fileInputRef.current?.click()}
								>
									{isBusy ? (
										<LoaderCircle className="size-4 animate-spin" />
									) : (
										<Upload className="size-4" />
									)}
									Choose file…
								</Button>
							</div>

							{bookTitle ? (
								<p className="font-medium text-sm leading-snug">{bookTitle}</p>
							) : null}

							{error ? (
								<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
									{error}
								</div>
							) : null}

							<div className="max-h-[min(42dvh,520px)] space-y-0 overflow-y-auto rounded-lg lg:max-h-[min(60dvh,520px)]">
								{chapters.length === 0 ? (
									<p className="p-3 text-muted-foreground text-sm">
										No chapters yet. Choose an EPUB to list its spine or table
										of contents.
									</p>
								) : (
									<ul className="divide-y">
										{chapters.map((item) => (
											<li key={chapterListItemKey(item)}>
												<button
													type="button"
													className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60"
													style={{
														paddingLeft:
															item.kind === 'toc'
																? `${12 + item.depth * 12}px`
																: undefined,
													}}
													onClick={() => {
														void onPickChapter(item);
													}}
												>
													<ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
													<span className="leading-snug">{item.label}</span>
												</button>
											</li>
										))}
									</ul>
								)}
							</div>
						</CardContent>
					</Card>

					<Card className="min-w-0 border-border/70 shadow-sm backdrop-blur">
						<CardHeader>
							<CardTitle className="text-base">Reading pane</CardTitle>
						</CardHeader>
						<CardContent className="min-w-0">
							<div className="overflow-hidden rounded-lg border">
								<iframe
									ref={iframeRef}
									title="EPUB chapter"
									className="h-[clamp(260px,62dvh,640px)] w-full border-0 bg-background lg:h-[clamp(260px,70dvh,640px)]"
									sandbox="allow-same-origin"
									srcDoc={readerSrcDoc}
									style={{ colorScheme: readerTheme.colorScheme }}
									onLoad={() => {
										if (activeChapter) {
											loadedChapterIdRef.current = activeChapter.id;
											scrollIframeToSelector(activeChapter.scrollSelector);
										}
									}}
								/>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		</main>
	);
}
