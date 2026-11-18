export type InvoiceTotals = {
  subtotalPaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
};
function safe(value: bigint) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new RangeError('Financial amount is outside the supported range.');
  return Number(value);
}
export function canReserveAllocationRefund(
  allocatedPaise: number,
  alreadyReservedPaise: number,
  requestedPaise: number,
) {
  if (
    !Number.isSafeInteger(allocatedPaise) ||
    !Number.isSafeInteger(alreadyReservedPaise) ||
    !Number.isSafeInteger(requestedPaise) ||
    allocatedPaise < 0 ||
    alreadyReservedPaise < 0 ||
    requestedPaise < 1
  )
    return false;
  return BigInt(alreadyReservedPaise) + BigInt(requestedPaise) <= BigInt(allocatedPaise);
}
export function calculateInvoiceTotals(
  subtotalPaise: number,
  discountPaise: number,
  rateBps = 0,
  mode: 'EXCLUSIVE' | 'INCLUSIVE' = 'EXCLUSIVE',
): InvoiceTotals {
  for (const amount of [subtotalPaise, discountPaise, rateBps])
    if (!Number.isSafeInteger(amount) || amount < 0)
      throw new RangeError('Financial inputs must be non-negative integers.');
  if (rateBps > 10_000 || discountPaise > subtotalPaise)
    throw new RangeError('Tax rate or discount is invalid.');
  const net = BigInt(subtotalPaise - discountPaise);
  const rate = BigInt(rateBps);
  const tax =
    mode === 'INCLUSIVE'
      ? (net * rate + (10_000n + rate) / 2n) / (10_000n + rate)
      : (net * rate + 5_000n) / 10_000n;
  return {
    subtotalPaise,
    discountPaise,
    taxPaise: safe(tax),
    totalPaise: safe(mode === 'INCLUSIVE' ? net : net + tax),
  };
}
export function calculateOutstanding(
  totalPaise: number,
  allocationsPaise: number[],
  processedRefundsPaise: number[] = [],
) {
  const allocated = allocationsPaise.reduce((sum, value) => sum + BigInt(value), 0n);
  const refunded = processedRefundsPaise.reduce((sum, value) => sum + BigInt(value), 0n);
  const balance = BigInt(totalPaise) - allocated + refunded;
  return safe(balance > 0n ? balance : 0n);
}
export function allocateFifo(
  amountPaise: number,
  invoices: Array<{ invoiceId: string; outstandingPaise: number }>,
) {
  let remaining = BigInt(amountPaise);
  const result: Array<{ invoiceId: string; amountPaise: number }> = [];
  for (const invoice of invoices) {
    if (remaining <= 0n) break;
    const due = BigInt(invoice.outstandingPaise);
    if (due <= 0n) continue;
    const allocated = remaining < due ? remaining : due;
    result.push({ invoiceId: invoice.invoiceId, amountPaise: Number(allocated) });
    remaining -= allocated;
  }
  return { allocations: result, advancePaise: Number(remaining) };
}

export function planPaymentAllocation(
  status: 'SUCCEEDED' | 'FAILED',
  amountPaise: number,
  invoices: Array<{ invoiceId: string; outstandingPaise: number }>,
  requested?: Array<{ invoiceId: string; amountPaise: number }>,
) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 1)
    throw new RangeError('Payment amount must be positive integer paise.');
  if (status === 'FAILED')
    return {
      allocations: [] as Array<{ invoiceId: string; amountPaise: number }>,
      advancePaise: 0,
    };
  if (!requested) return allocateFifo(amountPaise, invoices);
  const due = new Map(invoices.map((invoice) => [invoice.invoiceId, invoice.outstandingPaise]));
  const seen = new Set<string>();
  let allocated = 0n;
  for (const item of requested) {
    const balance = due.get(item.invoiceId);
    if (
      seen.has(item.invoiceId) ||
      !Number.isSafeInteger(item.amountPaise) ||
      item.amountPaise < 1 ||
      balance === undefined ||
      item.amountPaise > balance
    )
      throw new RangeError('Allocation is invalid or exceeds invoice balance.');
    seen.add(item.invoiceId);
    allocated += BigInt(item.amountPaise);
  }
  if (allocated > BigInt(amountPaise)) throw new RangeError('Allocations exceed payment amount.');
  return { allocations: requested, advancePaise: amountPaise - Number(allocated) };
}
