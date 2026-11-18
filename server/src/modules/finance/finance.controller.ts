import type { RequestHandler } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import {
  createInvoice,
  createRefund,
  decideRefund,
  getInvoice,
  getPayment,
  ledger,
  listInvoices,
  listPayments,
  listRefunds,
  listTaxConfigurations,
  recordPayment,
  setTaxConfiguration,
} from './finance.service.js';
import { textPdf } from './finance.pdf.js';
function auth(req: Parameters<RequestHandler>[0]) {
  if (!req.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return req.auth;
}
function json(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(json);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  if (
    'toHexString' in value &&
    typeof (value as { toHexString?: unknown }).toHexString === 'function'
  )
    return (value as { toHexString: () => string }).toHexString();
  const out =
    typeof (value as { toObject?: unknown }).toObject === 'function'
      ? (value as { toObject: () => Record<string, unknown> }).toObject()
      : { ...(value as Record<string, unknown>) };
  if (out._id) {
    out.id = String(out._id);
    delete out._id;
  }
  delete out.__v;
  for (const [key, item] of Object.entries(out)) out[key] = json(item);
  return out;
}
const date = (value: unknown) =>
  value instanceof Date
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        value,
      )
    : '';
const money = (paise: number) => {
  const value = BigInt(paise);
  return `INR ${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
};
export const listInvoicesController: RequestHandler = async (req, res) =>
  res.json(json(await listInvoices(auth(req), req.query as never)));
export const createInvoiceController: RequestHandler = async (req, res) =>
  res.status(201).json({ invoice: json(await createInvoice(req.body, auth(req))) });
export const invoicePdfController: RequestHandler = async (req, res) => {
  const i = await getInvoice(String(req.params.invoiceId), auth(req));
  const lines = [
    `Virtual Raksha Kavach`,
    `Invoice ${i.invoiceNumber}`,
    `Issued: ${date(i.issuedAt)}`,
    `Due: ${date(i.dueAt)}`,
    `Customer: ${i.customerId}`,
    '',
    'Description | Qty | Unit INR | Line INR',
    ...i.lines.map(
      (l) =>
        `${l.nameSnapshot} | ${l.quantity} | ${money(l.unitPricePaise)} | ${money(l.lineTotalPaise)}`,
    ),
    `Subtotal: ${money(i.subtotalPaise)}`,
    `Discount: ${money(i.discountPaise)}`,
    `${i.taxLabel ?? 'Tax'} (${i.taxRateBps ?? 0} bps): ${money(i.taxPaise)}`,
    `Total: ${money(i.totalPaise)}`,
    `Status: ${i.status}`,
    'Tax settings require accountant review; this document is not a GST tax invoice.',
  ];
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `inline; filename="${i.invoiceNumber}.pdf"`)
    .send(textPdf(lines));
};
export const listPaymentsController: RequestHandler = async (req, res) =>
  res.json(json(await listPayments(auth(req), req.query as never)));
export const getPaymentController: RequestHandler = async (req, res) => {
  const payment = await getPayment(String(req.params.paymentId), auth(req));
  const allocations = await (
    await import('./finance.model.js')
  ).PaymentAllocationModel.find({ paymentId: payment._id })
    .populate('invoiceId', 'invoiceNumber')
    .lean();
  res.json(json({ payment, allocations }));
};
export const recordPaymentController: RequestHandler = async (req, res) =>
  res.status(201).json({ payment: json(await recordPayment(req.body, auth(req))) });
export const receiptPdfController: RequestHandler = async (req, res) => {
  const p = await getPayment(String(req.params.paymentId), auth(req));
  const allocations = await (
    await import('./finance.model.js')
  ).PaymentAllocationModel.find({ paymentId: p._id })
    .populate('invoiceId', 'invoiceNumber')
    .lean();
  const lines = [
    `Virtual Raksha Kavach`,
    `Payment receipt`,
    `Payment ID: ${p._id}`,
    `Date: ${date(p.receivedAt ?? p.createdAt)}`,
    `Method: ${p.method}`,
    `Status: ${p.status}`,
    `Amount: ${money(p.amountPaise)}`,
    `Reference: ${p.reference ?? '—'}`,
    'Allocations:',
    ...allocations.map(
      (a) =>
        `${(a.invoiceId as unknown as { invoiceNumber?: string })?.invoiceNumber ?? 'Invoice'}: ${money(a.amountPaise)}`,
    ),
  ];
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `inline; filename="receipt-${p._id}.pdf"`)
    .send(textPdf(lines));
};
export const customerLedgerController: RequestHandler = async (req, res) =>
  res.json(json(await ledger(auth(req), String(req.params.customerId))));
export const createRefundController: RequestHandler = async (req, res) =>
  res.status(201).json({ refund: json(await createRefund(req.body, auth(req))) });
export const listRefundsController: RequestHandler = async (req, res) =>
  res.json(json({ items: await listRefunds(auth(req)) }));
export const decideRefundController: RequestHandler = async (req, res) =>
  res.json({
    refund: json(await decideRefund(String(req.params.refundId), req.body.approve, auth(req))),
  });
export const taxConfigurationController: RequestHandler = async (req, res) =>
  res.status(201).json({ taxConfiguration: json(await setTaxConfiguration(req.body, auth(req))) });
export const listTaxConfigurationsController: RequestHandler = async (req, res) =>
  res.json(json({ items: await listTaxConfigurations(auth(req)) }));
