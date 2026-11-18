import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { AuthError } from './auth.errors.js';

const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === 'true',
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    })
  : null;

export function emailDeliveryConfigured() {
  return Boolean(transporter && env.SMTP_FROM);
}

export async function sendOperationalNotification(email: string, subject: string, message: string) {
  if (!transporter || !env.SMTP_FROM) throw new Error('EMAIL_NOT_CONFIGURED');
  await transporter.sendMail({ from: env.SMTP_FROM, to: email, subject, text: message });
}

export async function sendAccountLink(
  email: string,
  purpose: 'invitation' | 'password reset' | 'email change',
  token: string,
) {
  if (!transporter || !env.SMTP_FROM) {
    throw new AuthError(503, 'EMAIL_NOT_CONFIGURED', 'Account email delivery is not configured.');
  }
  const path =
    purpose === 'invitation'
      ? '/invite/accept'
      : purpose === 'password reset'
        ? '/reset-password'
        : '/verify-email-change';
  const link = new URL(path, env.FRONTEND_URL);
  link.searchParams.set('token', token);
  const subject = {
    invitation: 'Set up your Virtual Raksha Kavach account',
    'password reset': 'Reset your Virtual Raksha Kavach password',
    'email change': 'Confirm your Virtual Raksha Kavach email address',
  }[purpose];
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject,
    text: `Use this one-time link to ${purpose === 'invitation' ? 'set up your account' : purpose === 'password reset' ? 'reset your password' : 'confirm your new email address'}: ${link.toString()}\n\nIf you did not request this, you can ignore this email.`,
  });
}
