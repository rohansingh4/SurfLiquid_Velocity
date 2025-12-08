import pkg from 'pg';
const { Pool } = pkg;

const PG_CONNECTION_STRING = 'postgres://sn98_reader_zkc:VS92dGOh0cVNwJra1f@bid-cl.clowwyoeud0k.eu-central-1.rds.amazonaws.com:5432/postgres';

// Create a connection pool
const pgPool = new Pool({
  connectionString: PG_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false
  },
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pgPool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export { pgPool };
