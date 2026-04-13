import { TanStackDevtools } from "@tanstack/react-devtools";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import "../styles.css";
import { AppSidebar } from "#/components/AppSidebar";
import ThemeToggle from "#/components/ThemeToggle";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";

export const Route = createRootRoute({
	component: RootComponent,
});

function RootComponent() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--header-bg)] px-3 backdrop-blur-lg md:px-4">
					<SidebarTrigger className="-ml-1" />
					<Separator orientation="vertical" className="mr-1 h-6" />
					<span className="text-sm font-medium text-[var(--sea-ink-soft)]">
						Kokoro
					</span>
					<div className="ml-auto flex items-center gap-2">
						<ThemeToggle />
					</div>
				</header>
				<div className="flex min-h-[calc(100svh-3.5rem)] flex-1 flex-col">
					<Outlet />
				</div>
				<TanStackDevtools
					config={{
						position: "bottom-right",
					}}
					plugins={[
						{
							name: "TanStack Router",
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
			</SidebarInset>
		</SidebarProvider>
	);
}
