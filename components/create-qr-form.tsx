'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createQrCodeRecord, type CreateQrState } from '@/app/dashboard/qr-code/actions';

const initialState: CreateQrState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className="btn-primary mt-6 min-h-12 w-full disabled:cursor-wait disabled:opacity-70">{pending ? 'Creating QR...' : 'Create New QR'}</button>;
}

export function CreateQrForm() {
  const [state, action] = useFormState(createQrCodeRecord, initialState);
  return <form action={action}><SubmitButton />{state.error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}</form>;
}
