import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export function assertInteractiveTerminal() {
  if (!stdin.isTTY || !stdin.setRawMode)
    throw new Error('Run this command in an interactive terminal.');
}

export async function promptLine(label: string) {
  assertInteractiveTerminal();
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    const value = await prompt.question(label);
    if (!value.trim()) throw new Error('Input is required.');
    return value.trim();
  } finally {
    prompt.close();
  }
}

export function promptHidden(label: string) {
  return new Promise<string>((resolve, reject) => {
    try {
      assertInteractiveTerminal();
      stdout.write(label);
      let value = '';
      const done = (error?: Error) => {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        if (error) reject(error);
        else resolve(value);
      };
      const onData = (buffer: Buffer) => {
        for (const byte of buffer) {
          if (byte === 3) return done(new Error('Cancelled.'));
          if (byte === 13 || byte === 10) return done();
          if (byte === 8 || byte === 127) value = value.slice(0, -1);
          else if (byte >= 32) value += String.fromCharCode(byte);
        }
      };
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    } catch (error) {
      reject(error);
    }
  });
}
