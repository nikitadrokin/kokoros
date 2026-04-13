import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/playground")({
	component: Playground,
});

/**
 * Placeholder route for future `koko` UI flows (e.g. text synthesis controls).
 */
function Playground() {
	return (
		<main className="page-wrap px-4 py-12">
			<section className="island-shell rounded-2xl p-6 sm:p-8">
				<p className="island-kicker mb-2">Playground</p>
				<h1 className="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
					Interactive controls
				</h1>
				<p className="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
					This page is wired into the sidebar so new tools can ship here. Hook
					up Tauri commands or spawn <code>koko</code> from this route when you
					are ready.
				</p>
			</section>
		</main>
	);
}
