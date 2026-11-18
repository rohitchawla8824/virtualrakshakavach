import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Panel,
  Skeleton,
} from '@/components/ui/primitives';
import { useToasts } from '@/components/ui/use-toasts';
import { getCurrentUser } from '@/features/auth/auth-api';
import { fetchCustomers, fetchOwnCustomer } from '@/features/customers/customer-api';
import { fetchProducts } from '@/features/catalogue/catalogue-api';
import {
  createInvoice,
  fetchInvoices,
  fetchLedger,
  fetchPayments,
  recordPayment,
  fetchTaxConfigurations,
  createTaxConfiguration,
  createRefund,
  fetchRefunds,
  decideRefund,
  fetchPaymentDetails,
  createOnlineOrder,
  verifyOnlinePayment,
  cancelOnlineOrder,
  fetchNotifications,
} from './finance-api';

const money = (paise: number) => {
  const value = BigInt(paise);
  const rupees = value / 100n;
  const fraction = String(value % 100n).padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN').format(rupees)}.${fraction}`;
};
const moneyInput = (paise: number) => {
  const amount = BigInt(paise);
  return `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
};
const day = (date: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
    new Date(date),
  );
function rupeesToPaise(value: string) {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a valid amount with up to two decimal places.');
  const [rupees, decimal = ''] = value.split('.');
  const paise = BigInt(rupees) * 100n + BigInt(decimal.padEnd(2, '0'));
  if (paise > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.');
  return Number(paise);
}
function percentToBps(value: string) {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value))
    throw new Error('Enter a rate from 0 to 100 with up to two decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const bps = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (bps > 10_000n) throw new Error('Rate cannot exceed 100%.');
  return Number(bps);
}
function formatPercent(bps: number) {
  const value = BigInt(bps);
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}%`;
}
type RazorpayCheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayCheckoutInstance = {
  open: () => void;
  on: (event: 'payment.failed', handler: () => void) => void;
};
type RazorpayCheckoutOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: 'INR';
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
  theme: { color: string };
  handler: (result: RazorpayCheckoutResult) => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckoutInstance;
  }
}
let checkoutScriptPromise: Promise<void> | undefined;
function loadRazorpayCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!checkoutScriptPromise) {
    checkoutScriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Razorpay checkout could not be loaded.'));
      document.head.append(script);
    }).catch((error: unknown) => {
      checkoutScriptPromise = undefined;
      throw error;
    });
  }
  return checkoutScriptPromise;
}
export function FinancePage({ role }: { role: 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER' }) {
  const [customerId, setCustomerId] = useState('');
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [paymentStatus, setPaymentStatus] = useState<'SUCCEEDED' | 'FAILED'>('SUCCEEDED');
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [discount, setDiscount] = useState('0');
  const [taxConfigurationId, setTaxConfigurationId] = useState('');
  const [refundTarget, setRefundTarget] = useState<{
    id: string;
    amountPaise: number;
    allocations: Array<{ invoiceId: { id: string; invoiceNumber: string }; amountPaise: number }>;
  } | null>(null);
  const [refundInvoiceId, setRefundInvoiceId] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [onlinePayingInvoiceId, setOnlinePayingInvoiceId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { show, view } = useToasts();
  const user = useQuery({ queryKey: ['current-user'], queryFn: getCurrentUser });
  const canReadFinance =
    role !== 'EMPLOYEE' || user.data?.permissions?.includes('finance:read') === true;
  const canInvoice =
    role === 'ADMIN' || user.data?.permissions?.includes('invoices:create') === true;
  const canPay = role === 'ADMIN' || user.data?.permissions?.includes('payments:record') === true;
  const customers = useQuery({
    queryKey: ['finance-customers'],
    queryFn: () => fetchCustomers({ q: '', status: 'ACTIVE', page: 1, limit: 100 }),
    enabled: role !== 'CUSTOMER' && (canInvoice || canPay),
  });
  const ownCustomer = useQuery({
    queryKey: ['own-customer'],
    queryFn: fetchOwnCustomer,
    enabled: role === 'CUSTOMER',
  });
  const products = useQuery({
    queryKey: ['products', { finance: true }],
    queryFn: () =>
      fetchProducts({ q: '', kind: '', status: 'ACTIVE', categoryId: '', page: 1, limit: 100 }),
    enabled: invoiceOpen,
  });
  const invoices = useQuery({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
    enabled: canReadFinance,
  });
  const payments = useQuery({
    queryKey: ['payments'],
    queryFn: fetchPayments,
    enabled: canReadFinance,
  });
  const taxes = useQuery({
    queryKey: ['tax-configurations'],
    queryFn: fetchTaxConfigurations,
    enabled: role !== 'CUSTOMER',
  });
  const refunds = useQuery({
    queryKey: ['refunds'],
    queryFn: fetchRefunds,
    enabled: role === 'ADMIN',
  });
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
    enabled: role !== 'EMPLOYEE',
  });
  const selected = customerId || (role === 'CUSTOMER' ? ownCustomer.data?.customer.id : '');
  const ledger = useQuery({
    queryKey: ['ledger', selected],
    queryFn: () => fetchLedger(selected!),
    enabled: Boolean(selected) && canReadFinance,
  });
  const canRefund = role === 'ADMIN' || user.data?.permissions?.includes('refunds:request');
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['invoices'] });
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['ledger'] });
  };
  const invoiceMutation = useMutation({
    mutationFn: (input: unknown) => createInvoice(input),
    onSuccess: () => {
      refresh();
      setInvoiceOpen(false);
      show('Invoice created from current product prices.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Invoice failed.', 'error'),
  });
  const paymentMutation = useMutation({
    mutationFn: (input: unknown) => recordPayment(input),
    onSuccess: () => {
      refresh();
      setPaymentOpen(false);
      setKey(crypto.randomUUID());
      show('Manual payment recorded.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Payment failed.', 'error'),
  });
  const refundMutation = useMutation({
    mutationFn: (input: unknown) => createRefund(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['refunds'] });
      setRefundTarget(null);
      show('Refund request submitted for approval.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Refund request failed.', 'error'),
  });
  const decisionMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideRefund(id, approve),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['refunds'] });
      refresh();
      show('Refund decision saved.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Refund decision failed.', 'error'),
  });
  const taxMutation = useMutation({
    mutationFn: (input: unknown) => createTaxConfiguration(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tax-configurations'] });
      show('Tax configuration saved.', 'success');
    },
    onError: (e) => show(e instanceof Error ? e.message : 'Tax configuration failed.', 'error'),
  });
  const onlinePaymentMutation = useMutation({
    mutationFn: ({ invoiceId, idempotencyKey }: { invoiceId: string; idempotencyKey: string }) =>
      createOnlineOrder(invoiceId, idempotencyKey),
    onMutate: ({ invoiceId }) => setOnlinePayingInvoiceId(invoiceId),
    onSettled: () => setOnlinePayingInvoiceId(null),
    onSuccess: async (order) => {
      let handled = false;
      try {
        await loadRazorpayCheckout();
        if (!window.Razorpay) throw new Error('Razorpay checkout is unavailable in this browser.');
        const checkout = new window.Razorpay({
          key: order.keyId,
          order_id: order.orderId,
          amount: order.amountPaise,
          currency: order.currency,
          name: 'Virtual Raksha Kavach',
          description: `Invoice ${order.invoiceNumber}`,
          prefill: { name: order.customerName, email: order.customerEmail },
          theme: { color: '#C8102E' },
          handler: (result) => {
            handled = true;
            void verifyOnlinePayment({
              orderId: result.razorpay_order_id,
              paymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature,
            })
              .then(() => {
                show('Payment verified and confirmed.', 'success');
                refresh();
                void qc.invalidateQueries({ queryKey: ['notifications'] });
              })
              .catch((error: unknown) =>
                show(
                  error instanceof Error
                    ? `${error.message} If the amount was debited, wait for confirmation before trying again.`
                    : 'Payment verification is pending. Do not retry if your account was debited.',
                  'error',
                ),
              );
          },
          modal: {
            ondismiss: () => {
              if (!handled) {
                handled = true;
                void cancelOnlineOrder(order.orderId).catch(() => undefined);
                show('Checkout closed. No payment was confirmed.', 'error');
              }
            },
          },
        });
        checkout.on('payment.failed', () => {
          handled = true;
          void cancelOnlineOrder(order.orderId).catch(() => undefined);
          show('Payment was not completed. You can start a new test checkout.', 'error');
        });
        checkout.open();
      } catch (error) {
        void cancelOnlineOrder(order.orderId).catch(() => undefined);
        show(
          error instanceof Error ? error.message : 'Could not start Razorpay test checkout.',
          'error',
        );
      }
    },
    onError: (error) =>
      show(
        error instanceof Error ? error.message : 'Could not create Razorpay test order.',
        'error',
      ),
  });
  return (
    <main className="space-y-6 p-4 sm:p-7">
      {view}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-red-700">
            Financial management
          </p>
          <h1 className="mt-1 text-2xl font-bold">Invoices, payments & ledger</h1>
          <p className="mt-1 text-sm text-slate-500">
            Amounts use integer paise on the server. Dates display in Asia/Kolkata.
          </p>
        </div>
        <div className="flex gap-2">
          {canInvoice && (
            <Button variant="secondary" onClick={() => setInvoiceOpen(true)}>
              Create invoice
            </Button>
          )}
          {canPay && <Button onClick={() => setPaymentOpen(true)}>Record manual payment</Button>}
        </div>
      </header>
      {role !== 'CUSTOMER' && canReadFinance && (
        <label className="block max-w-md text-sm">
          Customer ledger
          <select
            className="field mt-1 w-full rounded-xl border p-2.5"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="">Choose customer to view ledger</option>
            {customers.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      {ledger.data && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Invoiced', ledger.data.summary.invoicedPaise],
            ['Received', ledger.data.summary.receivedPaise],
            ['Outstanding', ledger.data.summary.outstandingPaise],
            ['Advance', ledger.data.summary.advancePaise],
          ].map(([label, value]) => (
            <Panel key={String(label)} className="p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="mt-1 text-xl font-bold">{money(Number(value))}</p>
            </Panel>
          ))}
        </section>
      )}
      {notifications.data?.items.length ? (
        <Panel className="space-y-2 p-4">
          <h2 className="font-semibold">Payment notifications</h2>
          {notifications.data.items.slice(0, 5).map((notification) => (
            <p key={notification.id} className="text-sm text-slate-600">
              {notification.message ?? notification.type}
            </p>
          ))}
        </Panel>
      ) : null}
      {role === 'ADMIN' && (
        <Panel className="space-y-3 p-5">
          <h2 className="font-semibold">Configurable tax rates</h2>
          <p className="text-sm text-slate-500">
            Generic rate configuration only. Confirm applicable tax treatment with your accountant
            before issuing invoices.
          </p>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              try {
                taxMutation.mutate({
                  name: form.get('name'),
                  rateBps: percentToBps(String(form.get('rate') ?? '')),
                  mode: form.get('mode'),
                  active: true,
                });
                e.currentTarget.reset();
              } catch (error) {
                show(error instanceof Error ? error.message : 'Invalid tax rate.', 'error');
              }
            }}
          >
            <Field label="Name" name="name" required />
            <Field label="Rate (%)" name="rate" inputMode="decimal" placeholder="18.00" required />
            <label className="block text-sm">
              Calculation
              <select className="field mt-1 w-full rounded-xl border p-2.5" name="mode">
                <option value="EXCLUSIVE">Added to subtotal</option>
                <option value="INCLUSIVE">Included in price</option>
              </select>
            </label>
            <Button className="self-end" disabled={taxMutation.isPending}>
              Add rate
            </Button>
          </form>
        </Panel>
      )}
      {canReadFinance && (
        <Panel className="overflow-hidden">
          <h2 className="border-b p-5 font-semibold">Invoices</h2>
          {invoices.isLoading ? (
            <Skeleton className="m-5 h-12" />
          ) : invoices.error ? (
            <div className="p-5">
              <ErrorState retry={() => void invoices.refetch()} />
            </div>
          ) : !invoices.data?.items.length ? (
            <EmptyState title="No invoices" description="Created invoices will appear here." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {['Invoice', 'Date', 'Total', 'Status', 'PDF'].map((x) => (
                      <th key={x} className="px-4 py-3">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.items
                    .filter(
                      (i) => role !== 'CUSTOMER' || i.customerId === ownCustomer.data?.customer.id,
                    )
                    .map((i) => (
                      <tr key={i.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{i.invoiceNumber}</td>
                        <td className="px-4 py-3">{day(i.issuedAt)}</td>
                        <td className="px-4 py-3">{money(i.totalPaise)}</td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              i.status === 'PAID'
                                ? 'green'
                                : i.status === 'OVERDUE'
                                  ? 'red'
                                  : 'amber'
                            }
                          >
                            {i.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <a
                            className="font-semibold text-red-700 underline"
                            href={`/api/v1/invoices/${i.id}/pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Download
                          </a>
                          {role === 'CUSTOMER' && !['PAID', 'VOID', 'DRAFT'].includes(i.status) && (
                            <Button
                              className="ml-2"
                              disabled={
                                onlinePaymentMutation.isPending && onlinePayingInvoiceId === i.id
                              }
                              onClick={() =>
                                onlinePaymentMutation.mutate({
                                  invoiceId: i.id,
                                  idempotencyKey: crypto.randomUUID(),
                                })
                              }
                            >
                              {onlinePaymentMutation.isPending && onlinePayingInvoiceId === i.id
                                ? 'Starting…'
                                : 'Pay online (test)'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {role === 'ADMIN' && (
        <Panel className="overflow-hidden">
          <h2 className="border-b p-5 font-semibold">Refund approval queue</h2>
          {refunds.isLoading ? (
            <Skeleton className="m-5 h-12" />
          ) : refunds.error ? (
            <div className="p-5">
              <ErrorState retry={() => void refunds.refetch()} />
            </div>
          ) : !refunds.data?.items.length ? (
            <EmptyState
              title="No refund requests"
              description="Submitted refund requests will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {['Payment', 'Amount', 'Reason', 'Status', 'Action'].map((h) => (
                      <th className="px-4 py-3" key={h}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refunds.data.items.map((r) => (
                    <tr className="border-t" key={r.id}>
                      <td className="px-4 py-3">{r.paymentId}</td>
                      <td className="px-4 py-3">{money(r.amountPaise)}</td>
                      <td className="px-4 py-3">{r.reason}</td>
                      <td className="px-4 py-3">{r.status}</td>
                      <td className="px-4 py-3">
                        {r.status === 'PENDING_APPROVAL' && (
                          <div className="flex gap-2">
                            <Button
                              disabled={decisionMutation.isPending}
                              onClick={() => decisionMutation.mutate({ id: r.id, approve: true })}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={decisionMutation.isPending}
                              onClick={() => decisionMutation.mutate({ id: r.id, approve: false })}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {canReadFinance && (
        <Panel className="overflow-hidden">
          <h2 className="border-b p-5 font-semibold">Payment history</h2>
          {payments.isLoading ? (
            <Skeleton className="m-5 h-12" />
          ) : payments.error ? (
            <div className="p-5">
              <ErrorState retry={() => void payments.refetch()} />
            </div>
          ) : !payments.data?.items.length ? (
            <EmptyState
              title="No payments"
              description="Manual payment records will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {['Date', 'Amount', 'Method', 'Status', 'Receipt'].map((x) => (
                      <th key={x} className="px-4 py-3">
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.data.items
                    .filter(
                      (p) => role !== 'CUSTOMER' || p.customerId === ownCustomer.data?.customer.id,
                    )
                    .map((p) => (
                      <tr key={p.id} className="border-t">
                        <td className="px-4 py-3">{day(p.createdAt)}</td>
                        <td className="px-4 py-3">{money(p.amountPaise)}</td>
                        <td className="px-4 py-3">{p.method}</td>
                        <td className="px-4 py-3">{p.status}</td>
                        <td className="px-4 py-3">
                          <a
                            className="font-semibold text-red-700 underline"
                            href={`/api/v1/payments/${p.id}/receipt.pdf`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Receipt
                          </a>
                          {canRefund &&
                            p.status === 'SUCCEEDED' &&
                            p.method !== 'RAZORPAY_SANDBOX' && (
                              <Button
                                className="ml-2"
                                variant="secondary"
                                onClick={async () => {
                                  try {
                                    const details = await fetchPaymentDetails(p.id);
                                    setRefundTarget({
                                      id: p.id,
                                      amountPaise: p.amountPaise,
                                      allocations: details.allocations,
                                    });
                                    const firstAllocation = details.allocations[0];
                                    setRefundInvoiceId(firstAllocation?.invoiceId.id ?? '');
                                    setRefundAmount(
                                      moneyInput(firstAllocation?.amountPaise ?? p.amountPaise),
                                    );
                                  } catch (e) {
                                    show(
                                      e instanceof Error
                                        ? e.message
                                        : 'Could not load payment details.',
                                      'error',
                                    );
                                  }
                                }}
                              >
                                Request refund
                              </Button>
                            )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
      {invoiceOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="w-full max-w-lg space-y-3 p-6">
            <h2 className="text-xl font-bold">Create invoice</h2>
            <label className="block text-sm">
              Customer
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Product/service
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Select item</option>
                {products.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {money(p.sellingPricePaise)}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <Field
              label="Discount (rupees)"
              type="text"
              inputMode="decimal"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <label className="block text-sm">
              Tax configuration
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={taxConfigurationId}
                onChange={(e) => setTaxConfigurationId(e.target.value)}
              >
                <option value="">No tax</option>
                {taxes.data?.items.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {formatPercent(t.rateBps)} · {t.mode.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Due date" type="date" id="invoice-due" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInvoiceOpen(false)}>
                Close
              </Button>
              <Button
                disabled={!customerId || !productId || invoiceMutation.isPending}
                onClick={() => {
                  const due = (document.getElementById('invoice-due') as HTMLInputElement)?.value;
                  if (!due) return show('Select a due date.', 'error');
                  try {
                    const parsedQuantity = Number(quantity);
                    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity < 1)
                      throw new Error('Quantity must be a positive whole number.');
                    invoiceMutation.mutate({
                      customerId,
                      dueAt: new Date(`${due}T23:59:00+05:30`).toISOString(),
                      lines: [{ productId, quantity: parsedQuantity }],
                      discountPaise: rupeesToPaise(discount),
                      ...(taxConfigurationId ? { taxConfigurationId } : {}),
                    });
                  } catch (error) {
                    show(
                      error instanceof Error ? error.message : 'Invalid invoice values.',
                      'error',
                    );
                  }
                }}
              >
                Create invoice
              </Button>
            </div>
          </Panel>
        </div>
      )}
      {paymentOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="w-full max-w-lg space-y-3 p-6">
            <h2 className="text-xl font-bold">Record manual payment</h2>
            <label className="block text-sm">
              Customer
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Amount in rupees"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <label className="block text-sm">
              Method
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {['CASH', 'UPI', 'BANK_TRANSFER'].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Result
              <select
                className="field mt-1 w-full rounded-xl border p-2.5"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as 'SUCCEEDED' | 'FAILED')}
              >
                <option value="SUCCEEDED">Received</option>
                <option value="FAILED">Failed / not received</option>
              </select>
            </label>
            <Field label="Reference (optional)" id="payment-ref" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPaymentOpen(false)}>
                Close
              </Button>
              <Button
                disabled={!customerId || !amount || paymentMutation.isPending}
                onClick={() => {
                  let paise: number;
                  try {
                    paise = rupeesToPaise(amount);
                  } catch (error) {
                    return show(
                      error instanceof Error ? error.message : 'Invalid amount.',
                      'error',
                    );
                  }
                  paymentMutation.mutate({
                    customerId,
                    amountPaise: paise,
                    method,
                    status: paymentStatus,
                    idempotencyKey: key,
                    reference:
                      (document.getElementById('payment-ref') as HTMLInputElement)?.value ||
                      undefined,
                  });
                }}
              >
                Save payment record
              </Button>
            </div>
          </Panel>
        </div>
      )}
      {refundTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <Panel className="w-full max-w-lg space-y-3 p-6">
            <h2 className="text-xl font-bold">Request refund</h2>
            <p className="text-sm text-slate-500">
              Maximum payment amount: {money(refundTarget.amountPaise)}. Invoice allocation limits
              are also enforced by the server.
            </p>
            {refundTarget.allocations.length > 0 && (
              <label className="block text-sm">
                Invoice
                <select
                  className="field mt-1 w-full rounded-xl border p-2.5"
                  value={refundInvoiceId}
                  onChange={(e) => {
                    setRefundInvoiceId(e.target.value);
                    const allocation = refundTarget.allocations.find(
                      (item) => item.invoiceId.id === e.target.value,
                    );
                    if (allocation) setRefundAmount(moneyInput(allocation.amountPaise));
                  }}
                >
                  {refundTarget.allocations.map((a) => (
                    <option key={a.invoiceId.id} value={a.invoiceId.id}>
                      {a.invoiceId.invoiceNumber} · {money(a.amountPaise)} allocated
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Field
              label="Refund amount (rupees)"
              type="text"
              inputMode="decimal"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
            />
            <Field
              label="Reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRefundTarget(null)}>
                Cancel
              </Button>
              <Button
                disabled={
                  refundMutation.isPending ||
                  (refundTarget.allocations.length > 0 && !refundInvoiceId)
                }
                onClick={() => {
                  try {
                    refundMutation.mutate({
                      paymentId: refundTarget.id,
                      ...(refundInvoiceId ? { invoiceId: refundInvoiceId } : {}),
                      amountPaise: rupeesToPaise(refundAmount),
                      reason: refundReason,
                    });
                  } catch (e) {
                    show(e instanceof Error ? e.message : 'Invalid amount.', 'error');
                  }
                }}
              >
                Submit request
              </Button>
            </div>
          </Panel>
        </div>
      )}
    </main>
  );
}
