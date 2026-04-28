import { createFileRoute } from '@tanstack/react-router';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import {
  Check,
  FolderOpen,
  Headphones,
  LoaderCircle,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const Route = createFileRoute('/library')({ component: LibraryPage });

type SavedAudioFile = {
  name: string;
  path: string;
  modifiedSec: number | null;
  sizeBytes: number;
};

type AudioGroup = {
  key: string;
  label: string;
  files: SavedAudioFile[];
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(1)} KB`;
  return `${(kib / 1024).toFixed(1)} MB`;
}

function formatModifiedTime(modifiedSec: number | null): string {
  if (!modifiedSec) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(modifiedSec * 1000));
}

function parentFolderName(filePath: string): string {
  return filePath.replace(/\\/g, '/').split('/').at(-2) ?? '';
}

function groupFiles(files: SavedAudioFile[]): AudioGroup[] {
  const map = new Map<string, SavedAudioFile[]>();
  for (const file of files) {
    const key = parentFolderName(file.path);
    const existing = map.get(key) ?? [];
    existing.push(file);
    map.set(key, existing);
  }
  return Array.from(map.entries()).map(([key, grouped]) => ({
    key,
    label: key.replace(/-/g, ' '),
    files: grouped,
  }));
}

function LibraryPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);

  const [files, setFiles] = useState<SavedAudioFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingPath, setDeletingPath] = useState('');
  const [revealingPath, setRevealingPath] = useState('');
  const [pendingDeletePath, setPendingDeletePath] = useState('');
  const [activeFilePath, setActiveFilePath] = useState('');
  const [audioUrl, setAudioUrl] = useState('');

  const groups = useMemo(() => groupFiles(files), [files]);

  const activeFile = useMemo(
    () => files.find((f) => f.path === activeFilePath) ?? null,
    [files, activeFilePath],
  );

  useEffect(() => {
    return () => {
      if (deleteConfirmTimeoutRef.current !== null) {
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      }
    };
  }, []);

  const clearDeleteConfirmation = useCallback(() => {
    if (deleteConfirmTimeoutRef.current !== null) {
      window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = null;
    }
    setPendingDeletePath('');
  }, []);

  const loadFiles = useCallback(async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await invoke<SavedAudioFile[]>('list_saved_audio');
      setFiles(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const handlePlay = useCallback((file: SavedAudioFile) => {
    setError('');
    setActiveFilePath(file.path);
    setAudioUrl(convertFileSrc(file.path));
    requestAnimationFrame(() => {
      audioRef.current?.play().catch(() => undefined);
    });
  }, []);

  const handleReveal = useCallback(
    async (file: SavedAudioFile) => {
      if (revealingPath) return;
      setError('');
      setRevealingPath(file.path);
      try {
        await invoke('reveal_saved_audio_in_finder', { path: file.path });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setRevealingPath('');
      }
    },
    [revealingPath],
  );

  const handleDelete = useCallback(
    async (file: SavedAudioFile) => {
      if (deletingPath) return;
      setError('');

      if (pendingDeletePath !== file.path) {
        clearDeleteConfirmation();
        setPendingDeletePath(file.path);
        deleteConfirmTimeoutRef.current = window.setTimeout(() => {
          setPendingDeletePath((current) =>
            current === file.path ? '' : current,
          );
          deleteConfirmTimeoutRef.current = null;
        }, 2000);
        return;
      }

      clearDeleteConfirmation();
      setDeletingPath(file.path);
      try {
        await invoke('delete_saved_audio', { path: file.path });
        setFiles((prev) => prev.filter((f) => f.path !== file.path));
        if (activeFilePath === file.path) {
          setActiveFilePath('');
          setAudioUrl('');
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      } finally {
        setDeletingPath('');
      }
    },
    [activeFilePath, clearDeleteConfirmation, deletingPath, pendingDeletePath],
  );

  return (
    <main className="min-h-[calc(100vh-4.5rem)] p-4 md:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="pb-2">
          <div className="space-y-1">
            <h1 className="font-semibold text-2xl tracking-tight">
              Audio library
            </h1>
            <p className="text-muted-foreground text-sm">
              Browse and play your saved synthesis output.
            </p>
          </div>
        </div>

        <Card className="shadow-sm backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Headphones className="size-4 text-muted-foreground" />
              <span className="min-w-0 truncate">
                {activeFile ? activeFile.name : 'No track selected'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* biome-ignore lint/a11y/useMediaCaption: Generated speech does not have captions. */}
            <audio
              ref={audioRef}
              controls
              preload="auto"
              src={audioUrl || undefined}
              aria-label="Audio player"
              className="h-10 w-full"
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm backdrop-blur">
          <CardHeader className="grid grid-cols-[1fr_auto] items-center">
            <CardTitle className="text-base">Library</CardTitle>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => void loadFiles()}
              disabled={isLoading}
              aria-label="Refresh library"
              title="Refresh library"
            >
              <RefreshCw
                className={isLoading ? 'size-4 animate-spin' : 'size-4'}
              />
            </Button>
          </CardHeader>
          <CardContent className="grid gap-5">
            {error ? (
              <div className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive text-sm">
                {error}
              </div>
            ) : null}

            {groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {isLoading ? 'Loading…' : 'No saved audio files yet.'}
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.key} className="grid gap-1.5">
                  <p className="px-1 font-medium text-sm leading-none">
                    {group.label}
                  </p>
                  <div className="divide-y overflow-hidden rounded-xl border">
                    {group.files.map((file) => {
                      const isActive = activeFilePath === file.path;
                      const isDeleting = deletingPath === file.path;
                      const isRevealing = revealingPath === file.path;
                      const isConfirmingDelete =
                        pendingDeletePath === file.path;

                      return (
                        <div
                          key={file.path}
                          className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p
                              className={`truncate text-sm ${isActive ? 'font-medium text-primary' : ''}`}
                            >
                              {file.name}
                            </p>
                            <p className="truncate text-muted-foreground text-xs">
                              {formatModifiedTime(file.modifiedSec)} ·{' '}
                              {formatFileSize(file.sizeBytes)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant={isActive ? 'default' : 'ghost'}
                              size="icon-sm"
                              onClick={() => handlePlay(file)}
                              disabled={isDeleting}
                              aria-label={`Play ${file.name}`}
                              title={`Play ${file.name}`}
                            >
                              <Play className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => void handleReveal(file)}
                              disabled={isDeleting || Boolean(revealingPath)}
                              aria-label={`Reveal ${file.name} in Finder`}
                              title="Reveal in Finder"
                            >
                              {isRevealing ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : (
                                <FolderOpen className="size-4" />
                              )}
                            </Button>
                            <Button
                              variant={
                                isConfirmingDelete ? 'destructive' : 'ghost'
                              }
                              size="icon-sm"
                              onClick={() => void handleDelete(file)}
                              disabled={Boolean(deletingPath)}
                              aria-label={
                                isConfirmingDelete
                                  ? `Confirm delete ${file.name}`
                                  : `Delete ${file.name}`
                              }
                              title={isConfirmingDelete ? 'Confirm?' : 'Delete'}
                            >
                              {isDeleting ? (
                                <LoaderCircle className="size-4 animate-spin" />
                              ) : isConfirmingDelete ? (
                                <Check className="size-4" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
