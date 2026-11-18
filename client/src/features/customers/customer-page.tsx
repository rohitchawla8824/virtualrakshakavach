import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Users,
  UserX,
} from 'lucide-react';
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
import {
  archiveCustomer,
  createCustomer,
  fetchAssignableEmployees,
  fetchCustomer,
  fetchCustomerRecords,
  fetchCustomers,
  fetchOwnCustomer,
  requestCustomerEmailChange,
  requestOwnEmailChange,
  updateCustomer,
  updateOwnCustomer,
  type CustomerRecord,
  type EmployeeOption,
} from './customer-api';

type WorkspaceRole = 'ADMIN' | 'EMPLOYEE' | 'CUSTOMER';
type CustomerFormValues = {
  displayName: string;
  email: string;
  phone: string;
  assignedEmployeeIds: string[];
  primaryEmployeeId: string;
};
type CustomerEditorProps = {
  role: WorkspaceRole;
  customer?: CustomerRecord;
  onClose: () => void;
  onSave: (values: CustomerFormValues, customer?: CustomerRecord) => Promise<void>;
};

const formatRupees = (paise: unknown) =>
  typeof paise === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
    : '—';

const formatDate = (value: unknown) => {
  if (typeof value !== 'string') return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(
        date,
      );
};

function employeeId(employee: EmployeeOption | string) {
  return typeof employee === 'string' ? employee : employee.id;
}

function employeeName(employee: EmployeeOption | string) {
  return typeof employee === 'string' ? 'Assigned employee' : employee.displayName;
}

function requestDiagnostic(error: unknown) {
  if (typeof error !== 'object' || error === null || !('status' in error)) return '';
  return [
    typeof error.status === 'number' ? `HTTP ${error.status}` : undefined,
    'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
      ? String(error.code)
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function CustomerEditor({ role, customer, onClose, onSave }: CustomerEditorProps) {
  const isAdmin = role === 'ADMIN';
  const isCreate = !customer;
  const [displayName, setDisplayName] = useState(customer?.displayName ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [assignedEmployeeIds, setAssignedEmployeeIds] = useState(
    customer?.assignedEmployeeIds?.map(employeeId) ?? [],
  );
  const [primaryEmployeeId, setPrimaryEmployeeId] = useState(
    customer?.primaryEmployeeId ? employeeId(customer.primaryEmployeeId) : '',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const employees = useQuery({
    queryKey: ['employees', 'assignable'],
    queryFn: fetchAssignableEmployees,
    enabled: isAdmin,
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({ displayName, email, phone, assignedEmployeeIds, primaryEmployeeId }, customer);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Customer could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function toggleEmployee(id: string) {
    setAssignedEmployeeIds((current) => {
      const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      if (!next.includes(primaryEmployeeId)) setPrimaryEmployeeId(next[0] ?? '');
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-editor-title"
        onSubmit={submit}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="customer-editor-title" className="text-xl font-bold text-slate-900">
              {isCreate ? 'Add customer' : 'Edit customer'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isCreate
                ? 'The customer will receive a secure account invitation by email.'
                : 'Email changes take effect after confirmation at the new address.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close customer form"
          >
            ×
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Customer name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            maxLength={160}
          />
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            maxLength={254}
          />
          <Field
            label="Phone (optional)"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            maxLength={32}
          />
        </div>
        {isAdmin && (
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800">Employee assignments</h3>
            {employees.isLoading ? (
              <Skeleton className="mt-3 h-10" />
            ) : employees.isError ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p role="alert" className="text-sm text-danger">
                  Employee assignments couldn’t load. You can still invite the customer without an
                  assignment and assign an employee later.
                  {requestDiagnostic(employees.error) && (
                    <span className="mt-1 block text-xs text-slate-600">
                      {requestDiagnostic(employees.error)}
                    </span>
                  )}
                </p>
                <Button type="button" variant="secondary" onClick={() => void employees.refetch()}>
                  Retry assignments
                </Button>
              </div>
            ) : employees.data?.items.length ? (
              <>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {employees.data.items.map((employee) => (
                    <label
                      key={employee.id}
                      className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={assignedEmployeeIds.includes(employee.id)}
                        onChange={() => toggleEmployee(employee.id)}
                      />
                      {employee.displayName}
                    </label>
                  ))}
                </div>
                {assignedEmployeeIds.length > 0 && (
                  <label className="mt-3 block space-y-1.5 text-sm font-medium text-slate-700">
                    Primary employee
                    <select
                      value={primaryEmployeeId}
                      onChange={(event) => setPrimaryEmployeeId(event.target.value)}
                      className="field w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm"
                    >
                      <option value="">No primary employee</option>
                      {employees.data.items
                        .filter((item) => assignedEmployeeIds.includes(item.id))
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.displayName}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                No active employees are available to assign.
              </p>
            )}
          </div>
        )}
        {role === 'EMPLOYEE' && isCreate && (
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
            You will be assigned as this customer’s primary employee.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : isCreate ? 'Send invitation' : 'Save changes'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function RecordList({
  records,
  kind,
}: {
  records: Record<string, unknown>[];
  kind: 'subscriptions' | 'invoices' | 'payments';
}) {
  if (!records.length)
    return (
      <EmptyState
        title={`No ${kind} yet`}
        description="Records from this customer’s account will appear here."
      />
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">
              {kind === 'invoices' ? 'Invoice' : kind === 'payments' ? 'Payment' : 'Subscription'}
            </th>
            <th className="px-4 py-3">Date / period</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {records.map((record, index) => {
            const id = String(record._id ?? record.id ?? index);
            const plan =
              typeof record.planId === 'object' && record.planId !== null
                ? (record.planId as Record<string, unknown>)
                : undefined;
            const title =
              kind === 'invoices'
                ? String(record.invoiceNumber ?? 'Invoice')
                : kind === 'payments'
                  ? String(record.method ?? 'Payment')
                  : String(plan?.name ?? 'Subscription');
            const date =
              kind === 'subscriptions'
                ? `${formatDate(record.startsAt)} – ${formatDate(record.endsAt)}`
                : formatDate(record.issuedAt ?? record.receivedAt ?? record.createdAt);
            const status = String(record.status ?? '—');
            const amount =
              kind === 'invoices'
                ? record.totalPaise
                : kind === 'payments'
                  ? record.amountPaise
                  : plan?.pricePaise;
            return (
              <tr key={id}>
                <td className="px-4 py-3 font-semibold text-slate-800">{title}</td>
                <td className="px-4 py-3 text-slate-600">{date}</td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      status === 'ACTIVE' || status === 'PAID' || status === 'SUCCEEDED'
                        ? 'green'
                        : status === 'EXPIRED' || status === 'OVERDUE'
                          ? 'amber'
                          : 'slate'
                    }
                  >
                    {status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-800">
                  {formatRupees(amount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerManagementPage({ role }: { role: WorkspaceRole }) {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { show, view } = useToasts();
  const ownPortal = role === 'CUSTOMER';
  const session = useQuery({
    queryKey: ['auth', 'customer-management-session'],
    queryFn: getCurrentUser,
    enabled: role === 'EMPLOYEE',
    staleTime: 30_000,
  });
  const canCreateCustomers =
    role === 'ADMIN' ||
    (role === 'EMPLOYEE' && session.data?.permissions?.includes('customers:create') === true);
  const canUpdateCustomer =
    ownPortal ||
    role === 'ADMIN' ||
    (role === 'EMPLOYEE' && session.data?.permissions?.includes('customers:update') === true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [recordPage, setRecordPage] = useState(1);
  const [tab, setTab] = useState<'overview' | 'subscriptions' | 'invoices' | 'payments'>(
    'overview',
  );
  const [editorOpen, setEditorOpen] = useState(false);

  const list = useQuery({
    queryKey: ['customers', { search, status, page }],
    queryFn: () => fetchCustomers({ q: search, status, page, limit: 20 }),
    enabled: !ownPortal && !customerId,
  });
  const detail = useQuery({
    queryKey: ['customers', ownPortal ? 'me' : customerId],
    queryFn: () => (ownPortal ? fetchOwnCustomer() : fetchCustomer(customerId!)),
    enabled: ownPortal || Boolean(customerId),
  });
  const recordQuery = useQuery({
    queryKey: ['customers', ownPortal ? 'me' : customerId, tab, recordPage],
    queryFn: () =>
      fetchCustomerRecords(
        ownPortal ? undefined : customerId,
        tab as 'subscriptions' | 'invoices' | 'payments',
        recordPage,
      ),
    enabled: tab !== 'overview' && (ownPortal || Boolean(customerId)),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCustomer(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      show('Customer archived and account access suspended.', 'success');
      navigate('/admin/customers');
    },
    onError: (error) =>
      show(error instanceof Error ? error.message : 'Customer could not be archived.', 'error'),
  });

  async function saveCustomer(values: CustomerFormValues, customer?: CustomerRecord) {
    if (!customer) {
      const created = await createCustomer({
        displayName: values.displayName,
        email: values.email,
        ...(values.phone ? { phone: values.phone } : {}),
        ...(role === 'ADMIN'
          ? {
              assignedEmployeeIds: values.assignedEmployeeIds,
              ...(values.primaryEmployeeId ? { primaryEmployeeId: values.primaryEmployeeId } : {}),
            }
          : {}),
      });
      show(`Invitation sent to ${created.invitation.email}.`, 'success');
      setEditorOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      return;
    }

    const changedEmail = values.email.trim().toLowerCase() !== (customer.email ?? '').toLowerCase();
    if (ownPortal) {
      await updateOwnCustomer({ displayName: values.displayName, phone: values.phone || null });
      if (changedEmail) await requestOwnEmailChange(values.email);
    } else {
      await updateCustomer(customer.id, {
        displayName: values.displayName,
        phone: values.phone || null,
        ...(role === 'ADMIN'
          ? {
              assignedEmployeeIds: values.assignedEmployeeIds,
              primaryEmployeeId: values.primaryEmployeeId || null,
            }
          : {}),
      });
      if (changedEmail) await requestCustomerEmailChange(customer.id, values.email);
    }
    show(
      changedEmail
        ? 'Profile saved. Confirm the email change using the link sent to the new address.'
        : 'Customer profile updated.',
      'success',
    );
    setEditorOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['customers', ownPortal ? 'me' : customer.id] });
  }

  const title = ownPortal
    ? 'My account'
    : customerId
      ? 'Customer details'
      : role === 'ADMIN'
        ? 'Customers'
        : 'Assigned customers';
  const currentCustomer = detail.data?.customer;
  const backPath = ownPortal ? '/portal' : `/${role.toLowerCase()}`;

  return (
    <div className="min-h-screen bg-[#F5F5F6] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:px-7">
          <Link
            to={backPath}
            aria-label="Back to dashboard"
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="grid size-10 place-items-center rounded-xl bg-[#111111] text-white">
            <Users size={18} />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">Virtual Raksha Kavach · Customer management</p>
          </div>
          {!customerId && !ownPortal && canCreateCustomers && (
            <Button className="ml-auto" onClick={() => setEditorOpen(true)}>
              <Plus size={16} /> Add customer
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-7 sm:py-8">
        {!customerId && !ownPortal && (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm text-slate-500">
                  Manage customer accounts and assigned relationships.
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:flex-none">
                  <Search size={16} className="text-slate-400" />
                  <input
                    aria-label="Search customers"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Search name, email or phone"
                    className="w-full bg-transparent text-sm outline-none sm:w-64"
                  />
                </label>
                <select
                  aria-label="Filter customer status"
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="ALL">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Archived</option>
                </select>
              </div>
            </div>
            <Panel className="overflow-hidden">
              {list.isLoading ? (
                <div className="space-y-3 p-5">
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                  <Skeleton className="h-11" />
                </div>
              ) : list.isError ? (
                <div className="p-5">
                  <ErrorState error={list.error} retry={() => void list.refetch()} />
                </div>
              ) : list.data?.items.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-5 py-3">Customer</th>
                          <th className="px-5 py-3">Phone</th>
                          <th className="px-5 py-3">Assigned employees</th>
                          <th className="px-5 py-3">Status</th>
                          <th className="px-5 py-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {list.data.items.map((customer) => (
                          <tr key={customer.id} className="hover:bg-slate-50/70">
                            <td className="px-5 py-4">
                              <p className="font-semibold text-slate-900">{customer.displayName}</p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {customer.email ?? 'No email'}
                              </p>
                            </td>
                            <td className="px-5 py-4 text-slate-600">{customer.phone || '—'}</td>
                            <td className="px-5 py-4 text-slate-600">
                              {customer.assignedEmployeeIds?.length
                                ? customer.assignedEmployeeIds.map(employeeName).join(', ')
                                : 'Unassigned'}
                            </td>
                            <td className="px-5 py-4">
                              <Badge tone={customer.status === 'ACTIVE' ? 'green' : 'slate'}>
                                {customer.status === 'ACTIVE' ? 'Active' : 'Archived'}
                              </Badge>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <Button
                                variant="secondary"
                                className="min-h-9 px-3"
                                onClick={() =>
                                  navigate(`/${role.toLowerCase()}/customers/${customer.id}`)
                                }
                              >
                                View details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                    <span>
                      {list.data.pagination.total} customer
                      {list.data.pagination.total === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2"
                        disabled={page <= 1}
                        onClick={() => setPage((value) => value - 1)}
                      >
                        <ChevronLeft size={16} /> Previous
                      </Button>
                      <span>
                        Page {page} of {Math.max(1, list.data.pagination.pages)}
                      </span>
                      <Button
                        variant="secondary"
                        className="min-h-8 px-2"
                        disabled={page >= list.data.pagination.pages}
                        onClick={() => setPage((value) => value + 1)}
                      >
                        Next <ChevronRight size={16} />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <EmptyState
                  title="No customers found"
                  description={
                    search || status !== 'ALL'
                      ? 'Try changing your search or status filter.'
                      : 'Create a customer to begin managing customer accounts.'
                  }
                  action={
                    search || status !== 'ALL' ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSearch('');
                          setStatus('ALL');
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : canCreateCustomers ? (
                      <Button onClick={() => setEditorOpen(true)}>
                        <Plus size={16} /> Add customer
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </Panel>
          </>
        )}

        {(customerId || ownPortal) &&
          (detail.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28" />
              <Skeleton className="h-56" />
            </div>
          ) : detail.isError || !detail.data ? (
            <ErrorState error={detail.error} retry={() => void detail.refetch()} />
          ) : (
            <>
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-red-50 text-[#C8102E]">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl font-bold text-slate-900">
                        {currentCustomer?.displayName}
                      </h1>
                      <Badge tone={currentCustomer?.status === 'ACTIVE' ? 'green' : 'slate'}>
                        {currentCustomer?.status}
                      </Badge>
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                      <Mail size={15} />
                      {currentCustomer?.email}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {currentCustomer?.phone || 'No phone number'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canUpdateCustomer && (
                    <Button variant="secondary" onClick={() => setEditorOpen(true)}>
                      <Edit3 size={16} /> Edit profile
                    </Button>
                  )}
                  {role === 'ADMIN' && currentCustomer?.status === 'ACTIVE' && customerId && (
                    <Button
                      variant="danger"
                      disabled={archiveMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm('Archive this customer and suspend their account access?')
                        )
                          archiveMutation.mutate(customerId);
                      }}
                    >
                      <UserX size={16} /> Archive
                    </Button>
                  )}
                </div>
              </div>
              {role !== 'CUSTOMER' && currentCustomer?.assignedEmployeeIds && (
                <Panel className="mb-5 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assigned employees
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentCustomer.assignedEmployeeIds.length ? (
                      currentCustomer.assignedEmployeeIds.map((employee) => (
                        <Badge key={employeeId(employee)} tone="slate">
                          {employeeName(employee)}
                          {employeeId(currentCustomer.primaryEmployeeId ?? '') ===
                          employeeId(employee)
                            ? ' · Primary'
                            : ''}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-slate-500">No employees assigned</span>
                    )}
                  </div>
                </Panel>
              )}
              <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Invoiced', value: detail.data.financialSummary.invoicedPaise },
                  { label: 'Payments received', value: detail.data.financialSummary.receivedPaise },
                  { label: 'Outstanding', value: detail.data.financialSummary.outstandingPaise },
                  { label: 'Customer advance', value: detail.data.financialSummary.advancePaise },
                ].map((card) => (
                  <Panel key={card.label} className="p-4">
                    <p className="text-xs font-medium text-slate-500">{card.label}</p>
                    <p className="mt-2 text-xl font-bold text-slate-900">
                      {formatRupees(card.value)}
                    </p>
                  </Panel>
                ))}
              </div>
              <Panel className="overflow-hidden">
                <div className="flex flex-wrap gap-1 border-b border-slate-100 px-4 pt-3">
                  {(['overview', 'subscriptions', 'invoices', 'payments'] as const).map((item) => (
                    <button
                      key={item}
                      onClick={() => {
                        setTab(item);
                        setRecordPage(1);
                      }}
                      className={`rounded-t-lg px-4 py-2 text-sm font-semibold capitalize ${tab === item ? 'border-b-2 border-[#C8102E] text-[#C8102E]' : 'text-slate-500 hover:text-slate-900'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                {tab === 'overview' ? (
                  <div className="grid gap-4 p-5 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Account created
                      </p>
                      <p className="mt-2 text-sm text-slate-800">
                        {formatDate(currentCustomer?.createdAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Records
                      </p>
                      <p className="mt-2 text-sm text-slate-800">
                        {detail.data.financialSummary.invoiceCount} invoices ·{' '}
                        {detail.data.financialSummary.paymentCount} successful payments
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs leading-5 text-slate-500">
                        Financial totals are derived from invoices and successful payment
                        allocations. Tax treatment is not included in this customer summary.
                      </p>
                    </div>
                  </div>
                ) : recordQuery.isLoading ? (
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-12" />
                    <Skeleton className="h-12" />
                  </div>
                ) : recordQuery.isError ? (
                  <div className="p-5">
                    <ErrorState
                      error={recordQuery.error}
                      retry={() => void recordQuery.refetch()}
                    />
                  </div>
                ) : (
                  <>
                    <RecordList records={recordQuery.data?.items ?? []} kind={tab} />
                    {(recordQuery.data?.pagination.pages ?? 0) > 1 && (
                      <div className="flex justify-end gap-2 border-t border-slate-100 p-3">
                        <Button
                          variant="secondary"
                          disabled={recordPage <= 1}
                          onClick={() => setRecordPage((value) => value - 1)}
                        >
                          Previous
                        </Button>
                        <span className="self-center text-sm text-slate-500">
                          Page {recordPage} of {recordQuery.data?.pagination.pages}
                        </span>
                        <Button
                          variant="secondary"
                          disabled={recordPage >= (recordQuery.data?.pagination.pages ?? 1)}
                          onClick={() => setRecordPage((value) => value + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Panel>
            </>
          ))}
      </main>
      {editorOpen && (
        <CustomerEditor
          key={currentCustomer?.id ?? 'new'}
          role={role}
          customer={currentCustomer}
          onClose={() => setEditorOpen(false)}
          onSave={saveCustomer}
        />
      )}
      {view}
    </div>
  );
}
