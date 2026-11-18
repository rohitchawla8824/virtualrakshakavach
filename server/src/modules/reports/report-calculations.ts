export function calculateOutstandingPaise(
  totalPaise: string,
  allocatedPaise: string,
  processedRefundPaise: string,
) {
  const outstanding = BigInt(totalPaise) - BigInt(allocatedPaise) + BigInt(processedRefundPaise);
  return outstanding > 0n ? outstanding.toString() : '0';
}

export function sumPaise(amounts: string[]) {
  return amounts.reduce((total, amount) => total + BigInt(amount), 0n).toString();
}
