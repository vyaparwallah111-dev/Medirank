'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Brain, CheckCircle2, Loader2, MapPin, Plus, Save, Sparkles, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { updateAISettings } from '@/app/dashboard/actions';

type Priority = 'high' | 'medium' | 'low';
type Tone = 'Formal' | 'Casual' | 'Mixed';
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
  tone_preference: 'Mixed',
};

const priorityMeta: Array<{ key: Priority; label: string; placeholder: string; help: string }> = [
  { key: 'high', label: 'High Priority', placeholder: 'root canal', help: 'Most frequent AI keyword focus.' },
  { key: 'medium', label: 'Medium Priority', placeholder: 'friendly staff', help: 'Moderate supporting keywords.' },
  { key: 'low', label: 'Low Priority', placeholder: 'affordable', help: 'Rare, light-touch mentions.' },
];

const toList = (value: unknown) => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim());
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
};

const splitLines = (value: string) => value.split(/\n|,/).map((item) => item.trim()).filter(Boolean).slice(0, 20);

function normalizeSettings(row: Record<string, unknown> | null): AISettings {
  const keywords = row?.target_keywords && typeof row.target_keywords === 'object' ? row.target_keywords as Record<string, unknown> : {};
  const areas = row?.target_areas && typeof row.target_areas === 'object' ? row.target_areas as Record<string, unknown> : {};
  const tone = row?.tone_preference === 'Formal' || row?.tone_preference === 'Casual' || row?.tone_preference === 'Mixed' ? row.tone_preference : 'Mixed';
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

function KeywordEditor({ label, placeholder, help, values, onChange }: { label: string; placeholder: string; help: string; values: string[]; onChange: (values: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const next = draft.trim();
    if (!next) return;
    if (!values.some((value) => value.toLowerCase() === next.toLowerCase())) onChange([...values, next].slice(0, 12));
    setDraft('');
  };
  return <div className="rounded-xl border border-slate-200 p-4">
    <label className="label">{label}</label>
    <div className="mt-2 flex gap-2">
      <input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} className="input min-w-0 flex-1" placeholder={placeholder} maxLength={60} />
      <button type="button" onClick={add} aria-label={`Add ${label} keyword`} className="grid min-h-12 min-w-12 place-items-center rounded-xl bg-blue-50 text-brand hover:bg-blue-100"><Plus size={18} /></button>
    </div>
    <p className="mt-2 text-xs font-medium text-slate-400">{help}</p>
    <div className="mt-3 flex min-h-9 flex-wrap gap-2">{values.length ? values.map((value) => <span key={value} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">{value}<button type="button" onClick={() => onChange(values.filter((item) => item !== value))} aria-label={`Remove ${value}`} className="text-slate-400 hover:text-red-600"><X size={13} /></button></span>) : <span className="text-xs font-semibold text-slate-400">No keywords added yet.</span>}</div>
  </div>;
}

export function AIKnowledgeBaseSettings({ doctorId }: { doctorId: string }) {
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
        setMessage({ type: 'error', text: 'AI settings could not be loaded.' });
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
      setMessage({ type: 'error', text: 'Supabase client is not configured.' });
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
      console.error('AI settings save failed:', error);
      setSaving(false);
      setMessage({ type: 'error', text: 'Unable to save AI settings. Please try again.' });
      return;
    }
    setSaving(false);
    setMessage({ type: 'success', text: 'AI Knowledge Base settings saved.' });
    window.setTimeout(() => setMessage(null), 3500);
  }

  const updateKeywords = (key: Priority, values: string[]) => setSettings((current) => ({ ...current, target_keywords: { ...current.target_keywords, [key]: values } }));
  const primaryArea = settings.target_areas.primary[0] || '';
  const secondaryArea = settings.target_areas.secondary[0] || '';

  return <section className="card mt-6 p-5 sm:p-7">
    <div className="flex gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-brand"><Brain size={20} /></span>
      <div>
        <h2 className="font-bold">AI Knowledge Base Settings</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Control the locality, tone, and priority keywords used by AI review generation.</p>
      </div>
    </div>

    <form onSubmit={save} className="mt-6 space-y-6">
      <div>
        <div className="flex items-center gap-2"><Sparkles size={17} className="text-orange" /><h3 className="font-bold">Target keywords</h3></div>
        <div className="mt-3 grid gap-3">
          {priorityMeta.map((item) => <KeywordEditor key={item.key} label={item.label} placeholder={item.placeholder} help={item.help} values={settings.target_keywords[item.key]} onChange={(values) => updateKeywords(item.key, values)} />)}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label">Primary Area</label>
          <div className="relative mt-2"><MapPin className="absolute left-3 top-3.5 text-slate-400" size={18} /><input value={primaryArea} onChange={(event) => setSettings((current) => ({ ...current, target_areas: { ...current.target_areas, primary: event.target.value.trim() ? [event.target.value] : [] } }))} className="input pl-10" placeholder="Boring Road, Patna" maxLength={90} /></div>
        </div>
        <div>
          <label className="label">Secondary Area</label>
          <div className="relative mt-2"><MapPin className="absolute left-3 top-3.5 text-slate-400" size={18} /><input value={secondaryArea} onChange={(event) => setSettings((current) => ({ ...current, target_areas: { ...current.target_areas, secondary: event.target.value.trim() ? [event.target.value] : [] } }))} className="input pl-10" placeholder="Patna, Bihar" maxLength={90} /></div>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className="label">Common Patient Concerns</label><textarea value={settings.patient_concerns.join('\n')} onChange={(event) => setSettings((current) => ({ ...current, patient_concerns: splitLines(event.target.value) }))} className="input mt-2 min-h-32 resize-y" placeholder="pain during treatment&#10;long waiting time&#10;cost clarity" maxLength={700} /></div>
        <div><label className="label">Unique Selling Points</label><textarea value={settings.usp_points.join('\n')} onChange={(event) => setSettings((current) => ({ ...current, usp_points: splitLines(event.target.value) }))} className="input mt-2 min-h-32 resize-y" placeholder="24/7 emergency availability&#10;digital X-ray setup&#10;painless dental care" maxLength={700} /></div>
      </div>

      <div className="max-w-xs">
        <label className="label">Tone Preference</label>
        <select value={settings.tone_preference} onChange={(event) => setSettings((current) => ({ ...current, tone_preference: event.target.value as Tone }))} className="input mt-2">
          <option value="Formal">Formal</option>
          <option value="Casual">Casual</option>
          <option value="Mixed">Mixed</option>
        </select>
      </div>

      <button type="submit" disabled={saving || loading} className="btn-primary min-h-12 w-full sm:w-auto disabled:opacity-50">{saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}{saving ? 'Saving AI Settings...' : 'Save AI Settings'}</button>
    </form>

    {loading && <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 size={16} className="animate-spin" />Loading AI settings...</div>}
    {message && <div role="status" className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-2xl ${message.type === 'success' ? 'bg-[#0A4C95]' : 'bg-[#F37021]'}`}>{message.type === 'success' ? <CheckCircle2 size={18} /> : <X size={18} />}<span>{message.text}</span></div>}
  </section>;
}
