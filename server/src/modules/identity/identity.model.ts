import { model, Schema } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['ADMIN', 'EMPLOYEE', 'CUSTOMER'], required: true },
    status: {
      type: String,
      enum: ['INVITED', 'ACTIVE', 'SUSPENDED'],
      default: 'INVITED',
      required: true,
    },
    mustChangePassword: { type: Boolean, default: true, required: true },
  },
  { timestamps: true, versionKey: false },
);
userSchema.index({ email: 1 }, { unique: true, name: 'users_email_unique' });
userSchema.index({ role: 1, status: 1 }, { name: 'users_role_status' });

const employeeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 32 },
    permissions: { type: [String], default: [] },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', required: true },
  },
  { timestamps: true, versionKey: false },
);
employeeSchema.index({ status: 1, displayName: 1 }, { name: 'employees_status_name' });

const customerSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
    displayName: { type: String, required: true, trim: true, maxlength: 160 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 32 },
    assignedEmployeeIds: { type: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], default: [] },
    primaryEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', required: true },
  },
  { timestamps: true, versionKey: false },
);

const authSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    familyId: { type: String, required: true, index: true },
    refreshTokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    familyExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBySessionId: { type: Schema.Types.ObjectId, ref: 'AuthSession' },
    lastUsedAt: { type: Date },
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true, versionKey: false },
);
authSessionSchema.index(
  { refreshTokenHash: 1 },
  { unique: true, name: 'auth_sessions_refresh_hash_unique' },
);
authSessionSchema.index(
  { userId: 1, revokedAt: 1, expiresAt: 1 },
  { name: 'auth_sessions_user_active' },
);
authSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'auth_sessions_expiry_ttl' },
);

const oneTimeTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, select: false },
    purpose: {
      type: String,
      enum: ['INVITATION', 'PASSWORD_RESET', 'EMAIL_CHANGE'],
      required: true,
    },
    targetEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);
oneTimeTokenSchema.index({ tokenHash: 1 }, { unique: true, name: 'one_time_tokens_hash_unique' });
oneTimeTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'one_time_tokens_expiry_ttl' },
);
oneTimeTokenSchema.index(
  { userId: 1, purpose: 1, consumedAt: 1 },
  { name: 'one_time_tokens_user_purpose' },
);
customerSchema.index({ email: 1 }, { name: 'customers_email' });
customerSchema.index(
  { assignedEmployeeIds: 1, status: 1 },
  { name: 'customers_employee_assignment' },
);
customerSchema.index({ primaryEmployeeId: 1 }, { name: 'customers_primary_employee' });

export const UserModel = model('User', userSchema);
export const EmployeeModel = model('Employee', employeeSchema);
export const CustomerModel = model('Customer', customerSchema);
export const AuthSessionModel = model('AuthSession', authSessionSchema);
export const OneTimeTokenModel = model('OneTimeToken', oneTimeTokenSchema);
