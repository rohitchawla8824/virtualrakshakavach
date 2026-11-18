import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button, Field } from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import {
  acceptInvitation,
  confirmEmailChange,
  requestPasswordReset,
  resetPassword,
  signIn,
  type AccountRole,
} from './auth-api';

const rolePaths: Record<AccountRole, string> = {
  ADMIN: '/admin',
  EMPLOYEE: '/employee',
  CUSTOMER: '/portal',
};

function BrandPanel() {
  return (
    <aside className="relative flex min-h-[220px] flex-col justify-between p-6 sm:p-10 lg:min-h-screen lg:p-12">
      <div className="relative flex items-center gap-3">
        <BrandLogo />
        <div>
          <p className="font-bold">Virtual Raksha Kavach</p>
          <p className="text-xs text-white/55">Business management, reimagined</p>
        </div>
      </div>
      <div className="relative max-w-lg pb-2 pt-10 lg:pb-0">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-action/30 bg-action/10">
          <LockKeyhole size={22} className="text-rose-400" />
        </div>
        <h2 className="text-4xl font-bold leading-tight tracking-tight">
          One secure space for your business.
        </h2>
        <p className="mt-5 max-w-md text-base leading-7 text-white/60">
          Manage customers, subscriptions and day-to-day operations with confidence.
        </p>
        <div className="mt-8 flex items-center gap-3 text-sm text-white/55">
          <span className="size-2 rounded-full bg-rose-500 shadow-[0_0_14px_rgba(200,16,46,0.9)]" />
          <span>Built around your business needs</span>
        </div>
      </div>
      <div className="relative hidden items-center justify-between text-xs text-white/40 lg:flex">
        <span>© 2026 Virtual Raksha Kavach</span>
        <span>Secure business workspace</span>
      </div>
    </aside>
  );
}

export function LoginPage() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { show, view } = useToasts();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const user = await signIn(email, password);
      queryClient.setQueryData(['auth', 'session'], user);
      navigate(rolePaths[user.role], { replace: true });
    } catch (error) {
      show(error instanceof Error ? error.message : 'Sign-in failed. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="auth-screen relative min-h-screen overflow-hidden bg-[#080808] text-white lg:grid lg:grid-cols-[1.04fr_0.96fr]">
      <div aria-hidden="true" className="auth-backdrop">
        <div className="auth-grid" />
        <div className="auth-watermark">
        <img src="/virtuallogo-transparent.png" alt="" />
        </div>
        <div className="auth-glow auth-glow-primary" />
        <div className="auth-glow auth-glow-secondary" />
      </div>
      <BrandPanel />
      <main className="relative flex min-h-[calc(100vh-220px)] items-center justify-center px-5 pb-10 sm:px-10 lg:min-h-screen lg:py-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="auth-card w-full max-w-[440px] rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-9"
        >
          <div>
            <div className="mb-6 grid size-12 place-items-center rounded-2xl border border-action/30 bg-action/10 text-rose-400">
              <LockKeyhole size={22} />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-400">
              Welcome back
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Sign in to your account
            </h1>
            <p className="mt-2 text-sm text-white/55">
              Enter your details to access your workspace.
            </p>
          </div>
          <form className="mt-8 space-y-5" onSubmit={submit}>
            <label className="block space-y-1.5 text-sm font-medium text-white/80">
              <span>Email address</span>
              <span className="relative block">
                <Mail
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="auth-input w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-10 pr-3 text-sm text-white placeholder:text-white/30"
                />
              </span>
            </label>
            <label className="block space-y-1.5 text-sm font-medium text-white/80">
              <span>Password</span>
              <span className="relative block">
                <LockKeyhole
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35"
                />
                <input
                  required
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="auth-input w-full rounded-xl border border-white/10 bg-black/35 py-3 pl-10 pr-11 text-sm text-white placeholder:text-white/30"
                />
                <button
                  type="button"
                  aria-label={visible ? 'Hide password' : 'Show password'}
                  onClick={() => setVisible(!visible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/40 transition hover:text-white"
                >
                  {visible ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm font-semibold text-rose-400 transition hover:text-rose-300"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'} {!submitting && <ArrowRight size={17} />}
            </Button>
          </form>
          <p className="mt-8 text-center text-xs leading-5 text-white/40">
            Protected workspace · Your account access is managed by your administrator.
          </p>
        </motion.div>
      </main>
      {view}
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { show, view } = useToasts();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (error) {
      show(error instanceof Error ? error.message : 'Could not submit the reset request.', 'error');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
      >
        <div className="mb-7 flex items-center gap-3">
          <BrandLogo size="small" />
          <span className="text-sm font-bold text-navy">Virtual Raksha Kavach</span>
        </div>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-navy"
        >
          <ArrowLeft size={16} /> Back to sign in
        </Link>
        <div className="mt-8 grid size-12 place-items-center rounded-2xl bg-cyan-50 text-cyan">
          <Mail size={22} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-cyan">
          Account recovery
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy">Forgot your password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Enter the email address associated with your account to request reset instructions.
        </p>
        {sent ? (
          <div
            role="status"
            className="mt-6 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-sm leading-6 text-cyan-900"
          >
            If an active account uses this address, reset instructions will be sent. For privacy,
            this message is the same for addresses with and without accounts.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              label="Email address"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
            <Button className="w-full" type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}{' '}
              {!submitting && <ArrowRight size={16} />}
            </Button>
          </form>
        )}
        <p className="mt-7 text-center text-xs text-slate-400">
          Need access? Contact your business administrator.
        </p>
      </motion.section>
      {view}
    </main>
  );
}

function CompleteAccountForm({ mode }: { mode: 'invitation' | 'reset' }) {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show, view } = useToasts();
  const token = searchParams.get('token') ?? '';
  const isInvitation = mode === 'invitation';

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token)
      return show('This link is incomplete. Request a new email from your administrator.', 'error');
    if (password !== confirmation) return show('The passwords do not match.', 'error');
    setSubmitting(true);
    try {
      if (isInvitation) {
        const user = await acceptInvitation(token, password);
        queryClient.setQueryData(['auth', 'session'], user);
        navigate(rolePaths[user.role], { replace: true });
      } else {
        await resetPassword(token, password);
        show('Password updated. Sign in with your new password.', 'success');
        navigate('/login', { replace: true });
      }
    } catch (error) {
      show(error instanceof Error ? error.message : 'The link could not be used.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
      >
        <div className="mb-7 flex items-center gap-3">
          <BrandLogo size="small" />
          <span className="text-sm font-bold text-navy">Virtual Raksha Kavach</span>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">Secure account</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy">
          {isInvitation ? 'Set your password' : 'Choose a new password'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Use at least 12 characters. This one-time link expires and cannot be reused.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            maxLength={72}
            required
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={12}
            maxLength={72}
            required
          />
          <Button className="w-full" type="submit" disabled={submitting || !token}>
            {submitting ? 'Saving…' : isInvitation ? 'Activate account' : 'Update password'}
          </Button>
        </form>
        {!token && (
          <p role="alert" className="mt-4 text-sm text-danger">
            This link is missing its one-time token. Request a fresh email.
          </p>
        )}
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-navy"
        >
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </motion.section>
      {view}
    </main>
  );
}

export function PasswordResetPage() {
  return <CompleteAccountForm mode="reset" />;
}

export function InvitationAcceptPage() {
  return <CompleteAccountForm mode="invitation" />;
}

export function EmailChangeConfirmPage() {
  const [searchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const { show, view } = useToasts();
  const token = searchParams.get('token') ?? '';

  async function confirm() {
    if (!token) return show('This confirmation link is incomplete.', 'error');
    setSubmitting(true);
    try {
      const result = await confirmEmailChange(token);
      setComplete(true);
      show(result.message, 'success');
    } catch (error) {
      show(error instanceof Error ? error.message : 'Email could not be confirmed.', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="panel w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9"
      >
        <div className="mb-7 flex items-center gap-3">
          <BrandLogo size="small" />
          <span className="text-sm font-bold text-navy">Virtual Raksha Kavach</span>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan">
          Email verification
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-navy">
          {complete ? 'Email confirmed' : 'Confirm your new email'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {complete
            ? 'Your email has been updated. Sign in again with your new address.'
            : 'Confirm this one-time link to update the email used for your account sign-in.'}
        </p>
        {!complete && (
          <Button
            className="mt-6 w-full"
            onClick={() => void confirm()}
            disabled={submitting || !token}
          >
            {submitting ? 'Confirming…' : 'Confirm email address'}
          </Button>
        )}
        {!token && (
          <p role="alert" className="mt-4 text-sm text-danger">
            This link is missing its confirmation token. Request an email change again.
          </p>
        )}
        <Link
          to="/login"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-navy"
        >
          <ArrowLeft size={16} /> Back to sign in
        </Link>
      </motion.section>
      {view}
    </main>
  );
}
