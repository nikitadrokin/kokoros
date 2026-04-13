import type { LucideIcon } from "lucide-react";
import { BookOpen, FlaskConical, Info } from "lucide-react";

/**
 * Single entry in the app sidebar; extend this list when adding new file routes.
 */
export type SidebarNavItem = {
	/** Visible label in the sidebar */
	title: string;
	/** TanStack Router `to` path */
	to: "/" | "/about" | "/playground";
	/** Shown when the sidebar is collapsed (icon mode) */
	tooltip: string;
	Icon: LucideIcon;
};

/**
 * Ordered navigation for `AppSidebar` — keep in sync with `src/routes/*.tsx`.
 */
export const SIDEBAR_NAV: readonly SidebarNavItem[] = [
	{
		title: "CLI reference",
		to: "/",
		tooltip: "CLI reference",
		Icon: BookOpen,
	},
	{
		title: "Playground",
		to: "/playground",
		tooltip: "Playground",
		Icon: FlaskConical,
	},
	{
		title: "About",
		to: "/about",
		tooltip: "About",
		Icon: Info,
	},
];
