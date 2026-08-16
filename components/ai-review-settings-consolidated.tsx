'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Brain, CheckCircle2, Loader2, MapPin, Plus, Save, Sparkles, X, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateAISettings } from '@/app/dashboard/actions';

type Priority = 'high' | 'medium' | 'low';
type Tone = 'professional' | 'casual' | 'warm' | 'formal' | 'conversational';

type DoctorKeyword = { id: string; keyword: string; category: string };
type AISettings = {
  target_keywords: Record<Priority, string[]>;
  target_areas: { primary: string[]; secondary: string[] };
  patient_concerns: string[];
  usp_points: string[];
  tone_preference: Tone;
};

const emptySettings: AISettings = {
  target_keywords: { high: [], medium: [], low: [] },
  target_areas: { primary: [], secondary: [] },
  patient_concerns: [],
  usp_points: [],
  tone_preference: 'professional',
};

const priorityMeta: Array<{ key: Priority; label: string; placeholder: string; help: string; icon: string }> = [
  { key: 'high', label: 'HIGH PRIORITY', placeholder: 'root canal treatment', help: '100% included in reviews. Mentioned 2+ times naturally.', icon: '🎯' },
  { key: 'medium', label: 'MEDIUM PRIORITY', placeholder: 'friendly staff', help: '50% chance in reviews. Supporting mentions.', icon: '📌' },
  { key: 'low', label: 'LOW PRIORITY', placeholder: 'affordable pricing', help: '20% chance in reviews. Light-touch mentions.', icon: '💡' },
];

const toneOptions: Array<{ value: Tone; label: string; description: string }> = [
  { value: 'professional', label: 'Professional', description: 'Doctor-focused, direct approach' },
  { value: 'casual', label: 'Casual', description: 'Relaxed, conversational tone' },
  { value: 'warm', label: 'Warm', description: 'Personal, caring approach' },
  { value: 'formal', label: 'Formal', description: 'Structured, polished language' },
  { value: 'conversational', label: 'Conversational', description: 'Natural, friendly chat style' },
];

// Handles legacy double/triple-JSON-encoded values from the corrupted-data bug (a string value like
// '["fear of pain"]' stored where a real array should be) by trying JSON.parse first, recursively,
// before falling back to comma-splitting plain text. Without this, a corrupted value gets naively
// comma-split into fragments still containing literal brackets/quotes, which then get saved back as
// "new" data - compounding the corruption on every save/reload cycle instead of fixing it.
const toList = (value: unknown, depth = 0): string[] => {
  if (depth > 5) return [];
  if (Array.isArray(value)) return value.flatMap((item) => typeof item === 'string' ? [item.trim()] : toList(item, depth + 1)).filter(Boolean);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[') || (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1)) {
      try { return toList(JSON.parse(trimmed), depth + 1); } catch { /* not valid JSON - fall through */ }
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
};

const splitLines = (value: string) => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 20);

function normalizeSettings(row: Record<string, unknown> | null): AISettings {
  const keywords = row?.target_keywords && typeof row.target_keywords === 'object' ? row.target_keywords as Record<string, unknown> : {};
  const areas = row?.target_areas && typeof row.target_areas === 'object' ? row.target_areas as Record<string, unknown> : {};
  const tone = (row?.tone_preference as Tone) || 'professional';
  return {
    target_keywords: {
      high: toList(keywords.high),
      medium: toList(keywords.medium),
      low: toList(keywords.low),
    },
    target_areas: {
      primary: toList(areas.primary ?? areas.Primary),
      secondary: toList(areas.secondary ?? areas.Secondary),
    },
    patient_concerns: toList(row?.patient_concerns),
    usp_points: toList(row?.usp_points),
    tone_preference: tone,
  };
}

function KeywordEditor({ label, icon, placeholder, help, values, onChange }: { label: string; icon: string; placeholder: string; help: string; values: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim();
    if (!next) return;
    if (!values.some((value) => value.toLowerCase() === next.toLowerCase())) onChange([...values, next].slice(0, 12));
    setDraft('');
  };
  return <div className="rounded-xl border border-slate-200 p-4">
    <label className="flex items-center gap-2 text-sm font-bold text-slate-700"><span className="text-lg">{icon}</span>{label}</label>
    <div className="mt-3 flex gap-2">
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} className="input min-w-0 flex-1" placeholder={placeholder} maxLength={60} />
      <button type="button" onClick={add} aria-label={`Add ${label} keyword`} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-blue-50 text-brand hover:bg-blue-100 transition"><Plus size={18} /></button>
    </div>
    <p className="mt-2 text-xs font-medium text-slate-400">{help}</p>
    <div className="mt-3 flex min-h-9 flex-wrap gap-2">{values.length ? values.map((value) => <span key={value} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{value}<button type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`Remove ${value}`} className="text-slate-400 hover:text-red-600"><X size={13} /></button></span>) : <span className="text-xs font-semibold text-slate-400">Not set yet</span>}</div>
  </div>;
}

export function AIReviewSettingsConsolidated({ doctorId }: { doctorId: string }) {
  const [settings, setSettings] = useState<AISettings>(emptySettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const supabase = createClient();
      if (!supabase) { setLoading(false); return; }
      const { data, error } = await supabase.from('doctor_ai_settings').select('target_keywords,target_areas,patient_concerns,usp_points,tone_preference').eq('doctor_id', doctorId).maybeSingle();
      if (!active) return;
      if (error) {
        console.error('AI settings lookup failed:', error.message);
        setMessage({ type: 'error', text: 'Failed to load settings. Try refreshing.' });
      } else {
        setSettings(normalizeSettings(data as Record<string, unknown> | null));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [doctorId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    if (!supabase) {
      setSaving(false);
      setMessage({ type: 'error', text: 'Supabase client not configured.' });
      return;
    }
    const payload = {
      doctor_id: doctorId,
      target_keywords: settings.target_keywords,
      target_areas: settings.target_areas,
      patient_concerns: settings.patient_concerns,
      usp_points: settings.usp_points,
      tone_preference: settings.tone_preference,
    };
    try {
      await updateAISettings(payload);
    } catch (error) {
      console.error('Save failed:', error);
      setSaving(false);
      setMessage({ type: 'error', text: 'Failed to save. Try again.' });
      return;
    }
    setSaving(false);
    setMessage({ type: 'success', text: 'AI Review Settings saved successfully.' });
    window.setTimeout(() => setMessage(null), 3500);
  }

  const updateKeywords = (key: Priority, values: string[]) => setSettings((current) => ({ ...current, target_keywords: { ...current.target_keywords, [key]: values } }));
  const primaryArea = settings.target_areas.primary[0] || '';
  const secondaryArea = settings.target_areas.secondary[0] || '';

  return <div className="mx-auto max-w-4xl">
    <div className="flex items-start gap-4 mb-8">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-brand"><Brain size={24} /></div>
      <div>
        <h1 className="text-3xl font-extrabold">AI Review Settings</h1>
        <p className="mt-2 text-slate-500">Configure how AI generates personalized reviews for your clinic.</p>
      </div>
    </div>

    <form onSubmit={save} className="space-y-8">
      {/* KEYWORDS SECTION */}
      <section className="card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Target size={22} className="text-orange-500" />
          <div>
            <h2 className="text-xl font-bold">Review Keywords</h2>
            <p className="text-sm text-slate-500 mt-1">Manage treatment highlights and clinic strengths by priority level.</p>
          </div>
        </div>
        <div className="grid gap-4">
          {priorityMeta.map((item) => (
            <KeywordEditor
              key={item.key}
              label={item.label}
              icon={item.icon}
              placeholder={item.placeholder}
              help={item.help}
              values={settings.target_keywords[item.key]}
              onChange={(values) => updateKeywords(item.key, values)}
            />
          ))}
        </div>
      </section>

      {/* LOCATION SECTION */}
      <section className="card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <MapPin size={22} className="text-blue-500" />
          <div>
            <h2 className="text-xl font-bold">Service Areas</h2>
            <p className="text-sm text-slate-500 mt-1">Define primary and secondary locations for your clinic.</p>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label">Primary Area</label>
            <input
              value={primaryArea}
              onChange={(event) => setSettings((current) => ({ ...current, target_areas: { ...current.target_areas, primary: event.target.value.trim() ? [event.target.value] : [] } }))}
              className="input mt-2"
              placeholder="e.g., Boring Road, Patna"
              maxLength={90}
            />
            <p className="mt-1 text-xs text-slate-400">Main clinic location for referencing in reviews</p>
          </div>
          <div>
            <label className="label">Secondary Area</label>
            <input
              value={secondaryArea}
              onChange={(event) => setSettings((current) => ({ ...current, target_areas: { ...current.target_areas, secondary: event.target.value.trim() ? [event.target.value] : [] } }))}
              className="input mt-2"
              placeholder="e.g., Phulwari Sharif"
              maxLength={90}
            />
            <p className="mt-1 text-xs text-slate-400">Optional secondary location for occasional mentions</p>
          </div>
        </div>
      </section>

      {/* CONCERNS & USP SECTION */}
      <section className="card p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles size={22} className="text-purple-500" />
          <div>
            <h2 className="text-xl font-bold">Patient Experience</h2>
            <p className="text-sm text-slate-500 mt-1">Add concerns to address and unique strengths to highlight.</p>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="label">Common Patient Concerns</label>
            <p className="text-xs text-slate-400 mt-1">Natural mentions in positive reviews (4-5 stars)</p>
            <textarea
              value={settings.patient_concerns.join('\n')}
              onChange={(event) => setSettings((current) => ({ ...current, patient_concerns: splitLines(event.target.value) }))}
              className="input mt-3 min-h-32 resize-y"
              placeholder="fear of pain&#10;treatment cost&#10;long waiting times"
              maxLength={700}
            />
          </div>
          <div>
            <label className="label">Unique Selling Points</label>
            <p className="text-xs text-slate-400 mt-1">Natural weaving into reviews (1 mention per review)</p>
            <textarea
              value={settings.usp_points.join('\n')}
              onChange={(event) => setSettings((current) => ({ ...current, usp_points: splitLines(event.target.value) }))}
              className="input mt-3 min-h-32 resize-y"
              placeholder="digital X-ray setup&#10;painless extraction technique&#10;24/7 emergency availability"
              maxLength={700}
            />
          </div>
        </div>
      </section>

      {/* TONE SECTION */}
      <section className="card p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-4">Review Tone</h2>
        <p className="text-sm text-slate-500 mb-6">Choose how AI should write patient reviews.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {toneOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSettings((current) => ({ ...current, tone_preference: option.value }))}
              className={`rounded-lg border-2 p-4 text-left transition ${
                settings.tone_preference === option.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 bg-white hover:border-blue-200'
              }`}
            >
              <div className="font-bold text-slate-900">{option.label}</div>
              <div className="text-xs text-slate-500 mt-1">{option.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* SAVE BUTTON */}
      <div className="flex justify-end">
        <button type="submit" disabled={saving || loading} className="btn-primary min-h-12 disabled:opacity-50">
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          {saving ? 'Saving Settings...' : 'Save All Settings'}
        </button>
      </div>
    </form>

    {loading && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading settings...</div>}
    {message && (
      <div role="status" className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-2xl ${message.type === 'success' ? 'bg-[#0A4C95]' : 'bg-[#F37021]'}`}>
        {message.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}
        <span>{message.text}</span>
      </div>
    )}
  </div>;
}
