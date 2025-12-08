import pkg from 'pg';
const { Client } = pkg;

const PG_CONNECTION_STRING = 'postgres://sn98_reader_zkc:VS92dGOh0cVNwJra1f@bid-cl.clowwyoeud0k.eu-central-1.rds.amazonaws.com:5432/postgres';

async function exploreDatabase() {
  const client = new Client({
    connectionString: PG_CONNECTION_STRING,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully!\n');

    // Get all schemas
    console.log('=== SCHEMAS ===');
    const schemasResult = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name;
    `);
    console.log('Available schemas:');
    schemasResult.rows.forEach(row => console.log(`  - ${row.schema_name}`));
    console.log('\n');

    // Get all tables from public schema
    console.log('=== TABLES IN PUBLIC SCHEMA ===');
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (tablesResult.rows.length === 0) {
      console.log('No tables found in public schema.\n');
    } else {
      console.log('Available tables:');
      tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));
      console.log('\n');

      // For each table, show schema and sample data
      for (const tableRow of tablesResult.rows) {
        const tableName = tableRow.table_name;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TABLE: ${tableName}`);
        console.log('='.repeat(60));

        // Get column information
        const columnsResult = await client.query(`
          SELECT column_name, data_type, character_maximum_length, is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [tableName]);

        console.log('\nSchema:');
        columnsResult.rows.forEach(col => {
          const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
          const maxLength = col.character_maximum_length ? `(${col.character_maximum_length})` : '';
          console.log(`  ${col.column_name}: ${col.data_type}${maxLength} ${nullable}`);
        });

        // Get row count
        const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        console.log(`\nTotal rows: ${countResult.rows[0].count}`);

        // Get sample data (first 2 rows)
        const sampleResult = await client.query(`SELECT * FROM "${tableName}" LIMIT 2`);
        console.log('\nSample data (first 2 rows):');
        if (sampleResult.rows.length > 0) {
          console.log(JSON.stringify(sampleResult.rows, null, 2));
        } else {
          console.log('  (No data available)');
        }
      }
    }

  } catch (error) {
    console.error('Error exploring database:', error.message);
    console.error('Full error:', error);
  } finally {
    await client.end();
    console.log('\n\nConnection closed.');
  }
}

exploreDatabase();
