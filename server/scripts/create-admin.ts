import { stdout } from 'node:process';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { hashPassword } from '../src/modules/auth/auth.crypto.js';
import { UserModel } from '../src/modules/identity/identity.model.js';
import { assertInteractiveTerminal, promptHidden, promptLine } from './terminal-input.js';

async function main() {
  assertInteractiveTerminal();
  await connectDatabase();
  const email = (await promptLine('Initial admin email: ')).toLowerCase();
  const password = await promptHidden('Initial admin password (12+ characters): ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (
    (await UserModel.exists({ role: 'ADMIN', status: 'ACTIVE' })) &&
    env.NODE_ENV === 'production'
  ) {
    throw new Error('An active administrator already exists. Bootstrap is one-time in production.');
  }
  const passwordHash = await hashPassword(password);
  await UserModel.create({
    email,
    passwordHash,
    role: 'ADMIN',
    status: 'ACTIVE',
    mustChangePassword: false,
  });
  stdout.write('Initial administrator account created. The password was never displayed.\n');
}

main()
  .catch((error: unknown) => {
    stdout.write(`${error instanceof Error ? error.message : 'Administrator bootstrap failed.'}\n`);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
