import { Link, useRouterState } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "#/components/ui/sidebar";
import { SIDEBAR_NAV } from "#/config/sidebar-nav";

/**
 * Primary app navigation; items are driven by `sidebar-nav.ts` for easy new pages.
 */
export function AppSidebar() {
	const pathname = useRouterState({ select: (s) => s.location.pathname });

	function isActive(to: string): boolean {
		if (to === "/") {
			return pathname === "/";
		}
		return pathname === to || pathname.startsWith(`${to}/`);
	}

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="border-b border-sidebar-border">
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild tooltip="Kokoro home">
							<Link to="/" className="font-semibold no-underline">
								<span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs">
									K
								</span>
								<span>Kokoro</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Pages</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{SIDEBAR_NAV.map((item) => (
								<SidebarMenuItem key={item.to}>
									<SidebarMenuButton
										asChild
										isActive={isActive(item.to)}
										tooltip={item.tooltip}
									>
										<Link to={item.to} className="no-underline">
											<item.Icon className="shrink-0" />
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarRail />
		</Sidebar>
	);
}
