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
	label: string;
	selector: string;
	depth: number;
};

type ChapterListItem = SpineListItem | TocListItem;

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

function chapterDocument(chapter: EpubProcessedChapter): string {
	const links = chapter.css
		.map(
			(part) => `<link rel="stylesheet" href=${JSON.stringify(part.href)} />`,
		)
		.join('');
	return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${links}</head><body>${chapter.html}</body></html>`;
}

function EpubReaderPage() {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const iframeRef = useRef<HTMLIFrameElement>(null);
	const epubRef = useRef<EpubFile | null>(null);

	const [bookTitle, setBookTitle] = useState('');
	const [chapters, setChapters] = useState<ChapterListItem[]>([]);
	const [activeChapter, setActiveChapter] = useState<{
		srcDoc: string;
		scrollSelector: string;
	} | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState('');

	const disposeEpub = useCallback(() => {
		const current = epubRef.current;
		if (current) {
			current.destroy();
			epubRef.current = null;
		}
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
		if (!selector) {
			return;
		}
		const doc = iframeRef.current?.contentDocument;
		if (!doc) {
			return;
		}
		const target = doc.querySelector(selector);
		target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, []);

	const openChapter = useCallback(
		async (epub: EpubFile, id: string, scrollSelector: string) => {
			const processed = await epub.loadChapter(id);
			const srcDoc = chapterDocument(processed);
			startTransition(() => {
				setActiveChapter({ srcDoc, scrollSelector });
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
		setIsBusy(true);
		try {
			const selector = item.kind === 'toc' ? item.selector : '';
			await openChapter(epub, item.id, selector);
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			setError(message);
		} finally {
			setIsBusy(false);
		}
	};

	return (
		<main className="min-h-[calc(100vh-4.5rem)] bg-[radial-gradient(circle_at_top_left,hsl(var(--muted))_0,transparent_30%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--muted)/0.35))] p-4 md:p-6">
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

				<div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)]">
					<Card className="shadow-sm backdrop-blur lg:self-start">
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

							<div className="max-h-[min(60vh,520px)] space-y-0 overflow-y-auto rounded-lg">
								{chapters.length === 0 ? (
									<p className="p-3 text-muted-foreground text-sm">
										No chapters yet. Choose an EPUB to list its spine or table
										of contents.
									</p>
								) : (
									<ul className="divide-y">
										{chapters.map((item, index) => (
											<li key={`${item.kind}-${item.id}-${index}`}>
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

					<Card className="border-border/70 shadow-sm backdrop-blur">
						<CardHeader>
							<CardTitle className="text-base">Reading pane</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="overflow-hidden rounded-lg border">
								<iframe
									ref={iframeRef}
									title="EPUB chapter"
									className="h-[min(70vh,640px)] w-full border-0"
									style={{
										backgroundColor: 'red !important',
									}}
									sandbox="allow-same-origin"
									srcDoc={activeChapter?.srcDoc}
									onLoad={() => {
										if (activeChapter?.scrollSelector) {
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
