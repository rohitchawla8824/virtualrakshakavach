import type { RequestHandler } from 'express';
import { AuthError } from '../auth/auth.errors.js';
import {
  archiveCustomer,
  createCustomer,
  getCustomer,
  getOwnCustomer,
  listCustomerRecords,
  listCustomers,
  requestCustomerEmailChange,
  requestOwnEmailChange,
  updateCustomer,
  updateOwnCustomer,
} from './customer.service.js';

function publicCustomer(value: Record<string, unknown>) {
  const fields = { ...value };
  const id = String(fields._id);
  delete fields._id;
  delete fields.userId;
  delete fields.__v;
  const mapEmployee = (employee: unknown) => {
    if (typeof employee !== 'object' || employee === null) return String(employee);
    const record = employee as Record<string, unknown>;
    return { id: String(record._id), displayName: record.displayName, status: record.status };
  };
  return {
    id,
    ...fields,
    ...(Array.isArray(fields.assignedEmployeeIds)
      ? { assignedEmployeeIds: fields.assignedEmployeeIds.map(mapEmployee) }
      : {}),
    ...(fields.primaryEmployeeId
      ? { primaryEmployeeId: mapEmployee(fields.primaryEmployeeId) }
      : { primaryEmployeeId: null }),
  };
}

function customerAuth(request: Parameters<RequestHandler>[0]) {
  if (!request.auth) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
  return request.auth;
}

export const listCustomersController: RequestHandler = async (request, response) => {
  const result = await listCustomers(customerAuth(request), request.query as never);
  response.status(200).json({
    items: result.items.map((item) => publicCustomer(item as unknown as Record<string, unknown>)),
    pagination: result.pagination,
  });
};

export const getCustomerController: RequestHandler = async (request, response) => {
  const result = await getCustomer(String(request.params.customerId), customerAuth(request));
  response.status(200).json({
    customer: publicCustomer(result.customer as unknown as Record<string, unknown>),
    financialSummary: result.financialSummary,
  });
};

export const getOwnCustomerController: RequestHandler = async (request, response) => {
  const result = await getOwnCustomer(customerAuth(request));
  response.status(200).json({
    customer: publicCustomer(result.customer as unknown as Record<string, unknown>),
    financialSummary: result.financialSummary,
  });
};

export const createCustomerController: RequestHandler = async (request, response) => {
  const invitation = await createCustomer(request.body, customerAuth(request));
  response.status(201).json({
    customerId: invitation.profileId,
    invitation: {
      email: invitation.email,
      expiresAt: invitation.invitationExpiresAt,
    },
  });
};

export const updateCustomerController: RequestHandler = async (request, response) => {
  const customer = await updateCustomer(
    String(request.params.customerId),
    request.body,
    customerAuth(request),
  );
  response.status(200).json({
    customer: publicCustomer(customer as unknown as Record<string, unknown>),
  });
};

export const updateOwnCustomerController: RequestHandler = async (request, response) => {
  const customer = await updateOwnCustomer(request.body, customerAuth(request));
  response.status(200).json({
    customer: publicCustomer(customer as unknown as Record<string, unknown>),
  });
};

export const archiveCustomerController: RequestHandler = async (request, response) => {
  const customer = await archiveCustomer(String(request.params.customerId), customerAuth(request));
  response.status(200).json({
    customer: publicCustomer(customer.toObject() as unknown as Record<string, unknown>),
  });
};

export const requestCustomerEmailChangeController: RequestHandler = async (request, response) => {
  const result = await requestCustomerEmailChange(
    String(request.params.customerId),
    request.body.email,
    customerAuth(request),
  );
  response
    .status(202)
    .json({ result, message: 'A confirmation link was sent to the new address.' });
};

export const requestOwnEmailChangeController: RequestHandler = async (request, response) => {
  const result = await requestOwnEmailChange(request.body.email, customerAuth(request));
  response
    .status(202)
    .json({ result, message: 'A confirmation link was sent to the new address.' });
};

export const listCustomerRecordsController: RequestHandler = async (request, response) => {
  const kind = request.params.kind;
  if (kind !== 'subscriptions' && kind !== 'invoices' && kind !== 'payments')
    throw new AuthError(404, 'NOT_FOUND', 'The requested endpoint was not found.');
  const result = await listCustomerRecords(
    String(request.params.customerId),
    kind,
    request.query as never,
    customerAuth(request),
  );
  response.status(200).json(result);
};

export const listOwnCustomerRecordsController: RequestHandler = async (request, response) => {
  const auth = customerAuth(request);
  if (!auth.customerId)
    throw new AuthError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
  const kind = request.params.kind;
  if (kind !== 'subscriptions' && kind !== 'invoices' && kind !== 'payments')
    throw new AuthError(404, 'NOT_FOUND', 'The requested endpoint was not found.');
  const result = await listCustomerRecords(auth.customerId, kind, request.query as never, auth);
  response.status(200).json(result);
};
