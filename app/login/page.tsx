import { AuthForm } from '@/components/auth-form'; import { AuthShell } from '@/components/auth-shell';
export default function Login(){return <AuthShell title="Welcome back" copy="Log in to manage your clinic’s reviews and reputation."><AuthForm mode="login"/></AuthShell>}
