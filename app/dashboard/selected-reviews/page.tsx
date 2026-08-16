export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { redirect } from 'next/navigation';
import { Star } from 'lucide-react';
import { getAuthenticatedUser, getCurrentDoctor } from '@/lib/dashboard';

type SelectedReview = {
  id: string;
  content: string;
  selected_at: string | null;
  draft_index: number | null;
  generation_metadata: Record<string, unknown> | null;
};

export default async function SelectedReviewsPage() {
  const doctor = await getCurrentDoctor();
  const { supabase, user } = await getAuthenticatedUser();
  if (!doctor?.id || !user?.id) redirect('/onboarding');
  if (doctor.auth_user_id !== user.id) throw new Error('Forbidden');

  const { data, error } = await supabase
    .from('generated_reviews')
    .select('id,content,selected_at,draft_index,generation_metadata')
    .eq('doctor_id', doctor.id)
    .eq('selected', true)
    .order('selected_at', { ascending: false })
    .limit(100);
  if (error) console.error('Selected reviews lookup failed:', error.message);

  const rows = (data ?? []) as SelectedReview[];
  const total = rows.length;

  // Simple aggregation, not full analytics: which draft position gets copied most, and which
  // keyword shows up most often among what patients actually selected.
  const draftCounts = new Map<number, number>();
  const keywordCounts = new Map<string, number>();
  rows.forEach((row) => {
    if (typeof row.draft_index === 'number') draftCounts.set(row.draft_index, (draftCounts.get(row.draft_index) ?? 0) + 1);
    const keywords = Array.isArray(row.generation_metadata?.keywords_selected) ? row.generation_metadata!.keywords_selected as unknown[] : [];
    keywords.forEach((keyword) => { if (typeof keyword === 'string' && keyword.trim()) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + 1); });
  });
  const topDraft = Array.from(draftCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const topKeyword = Array.from(keywordCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold sm:text-3xl">Selected reviews</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-base">Reviews patients actually copied - a stronger signal than "reviews generated" since this is what most likely got posted to Google.</p>

      {total > 0 && (topDraft || topKeyword) && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {topDraft && <div className="card p-5"><p className="text-sm text-slate-500">Most selected draft length</p><p className="mt-1 text-xl font-extrabold">Draft {topDraft[0] + 1} <span className="text-sm font-semibold text-slate-400">({Math.round((topDraft[1] / total) * 100)}%)</span></p></div>}
          {topKeyword && <div className="card p-5"><p className="text-sm text-slate-500">Most used keyword</p><p className="mt-1 truncate text-xl font-extrabold" title={topKeyword[0]}>{topKeyword[0]} <span className="text-sm font-semibold text-slate-400">({Math.round((topKeyword[1] / total) * 100)}%)</span></p></div>}
        </div>
      )}

      <div className="card mt-6 overflow-hidden">
        <div className="border-b px-4 py-3 sm:px-6 sm:py-4"><h2 className="font-bold">{total} selected review{total === 1 ? '' : 's'}</h2></div>
        {rows.length ? rows.map((row) => {
          const meta = row.generation_metadata ?? {};
          const rating = typeof meta.rating === 'number' ? meta.rating : null;
          const language = typeof meta.language === 'string' ? meta.language : null;
          const keywords = Array.isArray(meta.keywords_selected) ? (meta.keywords_selected as unknown[]).filter((k): k is string => typeof k === 'string') : [];
          return (
            <div key={row.id} className="border-b border-slate-100 px-4 py-4 last:border-0 sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-400">
                {rating !== null && <span className="inline-flex items-center gap-1 text-amber-500"><Star size={13} fill="currentColor" />{rating}</span>}
                {language && <span className="rounded-full bg-slate-100 px-2 py-0.5 capitalize">{language}</span>}
                {typeof row.draft_index === 'number' && <span className="rounded-full bg-slate-100 px-2 py-0.5">Draft {row.draft_index + 1}</span>}
                {row.selected_at && <span>{new Date(row.selected_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{row.content}</p>
              {keywords.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{keywords.map((keyword) => <span key={keyword} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand">{keyword}</span>)}</div>}
            </div>
          );
        }) : <p className="px-4 py-8 text-center text-sm font-semibold text-slate-500 sm:px-6">No reviews have been copied by patients yet.</p>}
      </div>
    </div>
  );
}
