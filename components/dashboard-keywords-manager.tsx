"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { addKeyword, deleteKeyword } from "@/app/dashboard/actions";

type KeywordItem = { id: string; keyword: string; category: string };

export function DashboardKeywordsManager({ initialItems }: { initialItems: KeywordItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement | null>(null);

  function handleAdd(formData: FormData) {
    setError("");
    startTransition(async () => {
      try {
        const created = await addKeyword(formData);
        if (created) {
          setItems((current) => current.some((item) => item.id === created.id) ? current : [...current, created]);
          formRef.current?.reset();
        }
      } catch (addError) {
        setError(addError instanceof Error ? addError.message : "Unable to add keyword.");
      }
    });
  }

  function handleDelete(id: string) {
    const previous = items;
    setError("");
    setItems((current) => current.filter((item) => item.id !== id));
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("id", id);
        const deleted = await deleteKeyword(formData);
        setItems((current) => current.filter((item) => item.id !== deleted.id));
      } catch (deleteError) {
        setItems(previous);
        setError(deleteError instanceof Error ? deleteError.message : "Unable to delete keyword.");
      }
    });
  }

  return <div>
    <form ref={formRef} action={handleAdd} className="card mt-6 grid gap-3 p-4 sm:mt-8 sm:grid-cols-[1fr_180px_auto] sm:p-6">
      <div><label className="label">Keyword</label><input name="keyword" className="input" placeholder="e.g. Gentle treatment" required disabled={isPending} /></div>
      <div><label className="label">Category</label><select name="category" className="input" disabled={isPending}><option value="treatment">Treatment</option><option value="behavior">Behavior</option><option value="cleanliness">Cleanliness</option><option value="clinic">Clinic</option></select></div>
      <button className="btn-primary min-h-11 self-end px-4 text-sm sm:min-h-12" disabled={isPending}><Plus size={18} />Add</button>
    </form>
    {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
    <div className="card mt-5 overflow-hidden">
      <div className="border-b px-4 py-3 sm:px-6 sm:py-4"><h2 className="font-bold">Active keywords</h2></div>
      {items.length ? items.map((item) => <div key={item.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:gap-4 sm:px-6 sm:py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-brand"><Tag size={17} /></span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold leading-5">{item.keyword}</p>
          <p className="mt-0.5 text-xs capitalize text-slate-400">{item.category}</p>
        </div>
        <button type="button" aria-label={`Delete ${item.keyword}`} disabled={isPending} onClick={() => handleDelete(item.id)} className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 size={18} /></button>
      </div>) : <p className="px-4 py-6 text-sm font-semibold text-slate-500 sm:px-6">No keywords added yet.</p>}
    </div>
  </div>;
}
