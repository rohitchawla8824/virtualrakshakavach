import { disconnectDatabase, connectDatabase } from '../src/config/database.js';
import { env } from '../src/config/env.js';
import { CategoryModel } from '../src/modules/catalogue/catalogue.model.js';

async function seedDevelopmentCatalog() {
  if (env.NODE_ENV !== 'development' || env.ENABLE_DEV_SEED !== 'true') {
    throw new Error('Seed blocked: require NODE_ENV=development and ENABLE_DEV_SEED=true.');
  }
  if (!env.MONGODB_URI)
    throw new Error('Seed blocked: configure MONGODB_URI in server/.env first.');

  await connectDatabase();
  const fixtures = [
    { name: 'DEMO ONLY · Sample products', kind: 'PRODUCT' as const },
    { name: 'DEMO ONLY · Sample services', kind: 'SERVICE' as const },
  ];
  for (const fixture of fixtures) {
    await CategoryModel.updateOne(
      { name: fixture.name, kind: fixture.kind },
      { $setOnInsert: { ...fixture, status: 'ACTIVE', seedTag: 'development' } },
      { upsert: true },
    );
  }
  console.info(
    'Development-only catalogue categories are ready. No customer or account data was created.',
  );
}

seedDevelopmentCatalog()
  .catch((error: unknown) => {
    console.error(
      `Development seed failed (${error instanceof Error ? error.name : 'UnknownError'}). Check local configuration and database connectivity.`,
    );
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
