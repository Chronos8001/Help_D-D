import postgres from 'postgres';

let client;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('La variable DATABASE_URL est absente.');
  }

  client ??= postgres(process.env.DATABASE_URL, {
    ssl: process.env.DATABASE_SSL === 'disable' ? false : 'require',
    max: 1,
  });

  return client;
}
