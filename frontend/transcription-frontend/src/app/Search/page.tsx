'use client'
export const dynamic = 'force-dynamic'
import * as React from "react";
const { useState } = React;
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, SearchX, Loader2, Moon, Sun } from "lucide-react";
import { QDRANT_URL } from "@/config";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" disabled>
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="hover:scale-110"
    >
      {theme === "light" ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}

interface MatchingSegment {
  speaker: string;
  start_time: number;
  end_time: number;
  transcript_text: string;
  segment_index: number;
  parent_job_id: string;
}

interface SearchResult {
  parent_job_id: string;
  filename: string;
  reference_number: string;
  category: string;
  segments: MatchingSegment[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function highlightText(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    part.toLowerCase() === term.toLowerCase()
      ? React.createElement('mark', { key: i, className: 'bg-yellow-200 dark:bg-yellow-800 rounded px-0.5' }, part)
      : part
  );
}

export default function SearchPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [submittedTerm, setSubmittedTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    setSubmittedTerm(term);
    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const segResponse = await fetch(`${QDRANT_URL}/collections/file_metadata/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [
              { key: "type", match: { value: "segment" } },
              { key: "transcript_text", match: { value: term } }
            ]
          },
          limit: 50,
          with_payload: true,
          with_vector: false
        })
      });

      if (!segResponse.ok) {
        throw new Error(`Search failed: ${segResponse.status}`);
      }

      const segData = await segResponse.json();
      const segmentPoints = segData.result.points || [];

      if (segmentPoints.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const jobIds = [...new Set<string>(segmentPoints.map((p: any) => p.payload.parent_job_id))];

      const parentResponse = await fetch(`${QDRANT_URL}/collections/file_metadata/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [
              { key: "type", match: { value: "parent" } },
              {
                should: jobIds.map((id: string) => ({
                  key: "job_id",
                  match: { value: id }
                }))
              }
            ]
          },
          limit: jobIds.length,
          with_payload: true,
          with_vector: false
        })
      });

      if (!parentResponse.ok) {
        throw new Error(`Failed to fetch parent data: ${parentResponse.status}`);
      }

      const parentData = await parentResponse.json();
      const parentPoints = parentData.result.points || [];

      const parentLookup = new Map<string, any>();
      for (const pp of parentPoints) {
        parentLookup.set(pp.payload.job_id, pp.payload);
      }

      const grouped = new Map<string, SearchResult>();
      for (const sp of segmentPoints) {
        const payload = sp.payload;
        const pjId = payload.parent_job_id;
        const parent = parentLookup.get(pjId);

        if (!grouped.has(pjId)) {
          grouped.set(pjId, {
            parent_job_id: pjId,
            filename: parent?.filename || 'Unknown',
            reference_number: parent?.reference_number || 'N/A',
            category: parent?.category || '',
            segments: []
          });
        }

        grouped.get(pjId)!.segments.push({
          speaker: payload.speaker || 'Unknown',
          start_time: payload.start_time || 0,
          end_time: payload.end_time || 0,
          transcript_text: payload.transcript_text || '',
          segment_index: payload.segment_index || 0,
          parent_job_id: pjId
        });
      }

      setResults(Array.from(grouped.values()));
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const totalSegments = results.reduce((sum, r) => sum + r.segments.length, 0);

  return (
    <div className="min-h-screen bg-stone-200 dark:bg-neutral-900">
      <header className="backdrop-blur-sm shadow-md dark:shadow-lg relative z-10">
        <div className="max-w-8xl mx-auto pl-2 pr-6 py-4 flex items-center justify-between gap-2">
          <h1
            className="text-2xl font-bold text-neutral-700 dark:text-white cursor-pointer hover:text-neutral-900 dark:hover:text-neutral-200"
            onClick={() => router.push('/')}
          >
            Transcription App
          </h1>
          <ThemeToggle />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6">
          <Input
            type="text"
            placeholder="Search across all transcripts..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-stone-50 dark:bg-neutral-700/50 border-stone-300 dark:border-neutral-600 text-stone-900 dark:text-white placeholder:text-stone-500 dark:placeholder:text-neutral-400 h-12 text-lg"
          />
          <Button
            onClick={handleSearch}
            disabled={loading || !searchTerm.trim()}
            className="h-12 px-6 bg-stone-600 hover:bg-stone-700 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-white"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Search className="w-5 h-5" />
            )}
            Search
          </Button>
        </div>

        {error && (
          <Card className="shadow-xl bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 mb-6">
            <CardContent className="p-4">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-stone-600 dark:text-neutral-400" />
          </div>
        )}

        {!loading && hasSearched && results.length > 0 && (
          <p className="text-sm text-stone-600 dark:text-neutral-400 mb-4">
            {totalSegments} result{totalSegments !== 1 ? 's' : ''} found across {results.length} recording{results.length !== 1 ? 's' : ''}
          </p>
        )}

        {!loading && hasSearched && results.length > 0 && results.map((result) => (
          <Card key={result.parent_job_id} className="shadow-xl bg-stone-100 dark:bg-neutral-800 border-stone-200 dark:border-neutral-700 mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <a
                  href={`/Transcripts/Details?job_id=${result.parent_job_id}`}
                  className="text-lg font-semibold text-neutral-900 dark:text-white hover:underline"
                >
                  {result.filename}
                </a>
                <Badge variant="secondary" className="text-xs">
                  {result.reference_number}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {result.segments.map((seg, idx) => (
                  <div
                    key={`${seg.parent_job_id}-${seg.segment_index}-${idx}`}
                    className="border border-stone-200 dark:border-neutral-700 rounded-lg bg-stone-50 dark:bg-neutral-700/50 p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-stone-900 dark:text-white">
                        {seg.speaker}
                      </span>
                      <span className="text-xs text-stone-500 dark:text-neutral-400">
                        {formatTime(seg.start_time)} — {formatTime(seg.end_time)}
                      </span>
                    </div>
                    <p className="text-sm text-stone-800 dark:text-neutral-200 mb-2">
                      {highlightText(seg.transcript_text, submittedTerm)}
                    </p>
                    <a
                      href={`/Transcripts/Details?job_id=${seg.parent_job_id}`}
                      className="text-xs text-stone-600 dark:text-neutral-400 hover:text-stone-900 dark:hover:text-white underline"
                    >
                      Jump to transcript
                    </a>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/Transcripts/Details?job_id=${result.parent_job_id}`)}
                  className="text-stone-700 dark:text-neutral-300 border-stone-300 dark:border-neutral-600"
                >
                  View Transcript
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {!loading && hasSearched && results.length === 0 && !error && (
          <div className="text-center py-20">
            <SearchX className="w-16 h-16 mx-auto mb-4 text-stone-400 dark:text-neutral-500" />
            <p className="text-xl text-stone-600 dark:text-neutral-400">
              No results found for your search
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
