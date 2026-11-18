import mongoose from 'mongoose';

export function getLiveness() {
  return {
    status: 'ok' as const,
    service: 'virtual-raksha-kavach-api',
    timestamp: new Date().toISOString(),
  };
}

export function getReadiness() {
  const databaseConnected = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  return {
    ready: databaseConnected,
    checks: { database: databaseConnected ? 'connected' : 'disconnected' },
    timestamp: new Date().toISOString(),
  };
}
