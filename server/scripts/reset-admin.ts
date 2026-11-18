import { stdout } from 'node:process';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/auth/auth.crypto.js';
import {
  AuthSessionModel,
  OneTimeTokenModel,
  UserModel,
} from '../src/modules/identity/identity.model.js';
import { assertInteractiveTerminal, promptHidden, promptLine } from './terminal-input.js';

function assertPassword(password: string) {
  if (password.length < 12 || password.length > 128 || Buffer.byteLength(password, 'utf8') > 72)
    throw new Error('Password must be 12-128 characters and no more than 72 UTF-8 bytes.');
}

async function main() {
  if (env.NODE_ENV !== 'development')
    throw new Error('This command is only available when NODE_ENV=development.');
  assertInteractiveTerminal();

  await connectDatabase();
  const email = (await promptLine('Active admin email: ')).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');

  const user = await UserModel.findOne({ email, role: 'ADMIN', status: 'ACTIVE' }).select('_id');
  if (!user) throw new Error('No active administrator account uses that email.');

  const password = await promptHidden('New admin password (12+ characters): ');
  assertPassword(password);
  const confirmation = await promptHidden('Confirm new password: ');
  if (password !== confirmation) throw new Error('The passwords do not match.');

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const result = await UserModel.updateOne(
    { _id: user._id, role: 'ADMIN', status: 'ACTIVE' },
    { $set: { passwordHash, mustChangePassword: false } },
  );
  if (result.matchedCount !== 1) throw new Error('The administrator account could not be updated.');

  await Promise.all([
    AuthSessionModel.updateMany(
      { userId: user._id, revokedAt: null },
      { $set: { revokedAt: now } },
    ),
    OneTimeTokenModel.updateMany(
      { userId: user._id, purpose: 'PASSWORD_RESET', consumedAt: null },
      { $set: { consumedAt: now } },
    ),
  ]);
  stdout.write('Administrator password reset. Sign in with the new password.\n');
}

main()
  .catch((error: unknown) => {
    stdout.write(`${error instanceof Error ? error.message : 'Administrator reset failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
