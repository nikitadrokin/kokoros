import { createRootRoute, Outlet } from '@tanstack/react-router';
import Header from '@/components/Header';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider>
      <div className='flex h-dvh flex-col overflow-hidden bg-background text-foreground'>
        <Header />
        <div className='min-h-0 flex-1 overflow-y-auto overscroll-y-contain'>
          <Outlet />
        </div>
        <Toaster />
      </div>
    </TooltipProvider>
  );
}
