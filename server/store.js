// Dónde se guardan los minutos grabados:
//   - Postgres (Supabase) si existe la variable DATABASE_URL (en el servidor real);
//   - si no, archivos en ./data-recorder (para probar en la compu).
// Las dos opciones ofrecen lo mismo: init, save, load, prune.
import fs from 'node:fs/promises';
import path from 'node:path';

export async function createStore() {
  if (process.env.DATABASE_URL) return createPgStore(process.env.DATABASE_URL);
  return createFileStore(process.env.RECORDER_DIR || 'data-recorder');
}

async function createPgStore(url) {
  const { default: pg } = await import('pg');
  // Supabase pide SSL; rejectUnauthorized:false porque usa certificados propios del pooler.
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS liq_minutes (
      symbol text NOT NULL,
      minute bigint NOT NULL,
      data bytea NOT NULL,
      PRIMARY KEY (symbol, minute)
    )`);
  return {
    kind: 'postgres',
    async save(symbol, minute, data) {
      await pool.query(
        'INSERT INTO liq_minutes (symbol, minute, data) VALUES ($1, $2, $3) ON CONFLICT (symbol, minute) DO UPDATE SET data = EXCLUDED.data',
        [symbol, minute, data],
      );
    },
    async load(symbol, fromMinute, toMinute) {
      const r = await pool.query('SELECT minute, data FROM liq_minutes WHERE symbol = $1 AND minute >= $2 AND minute <= $3 ORDER BY minute', [
        symbol,
        fromMinute,
        toMinute,
      ]);
      return r.rows.map((x) => ({ minute: Number(x.minute), data: x.data }));
    },
    async prune(beforeMinute) {
      const r = await pool.query('DELETE FROM liq_minutes WHERE minute < $1', [beforeMinute]);
      return r.rowCount;
    },
    async stats() {
      const r = await pool.query("SELECT count(*)::int AS rows, pg_total_relation_size('liq_minutes') AS bytes FROM liq_minutes");
      return { rows: r.rows[0].rows, bytes: Number(r.rows[0].bytes) };
    },
  };
}

async function createFileStore(dir) {
  await fs.mkdir(dir, { recursive: true });
  const file = (symbol, minute) => path.join(dir, `${symbol.replace(':', '_')}_${minute}.bin`);
  return {
    kind: 'archivos',
    save: (symbol, minute, data) => fs.writeFile(file(symbol, minute), data),
    async load(symbol, fromMinute, toMinute) {
      const prefix = `${symbol.replace(':', '_')}_`;
      const out = [];
      for (const f of await fs.readdir(dir)) {
        if (!f.startsWith(prefix)) continue;
        const minute = Number(f.slice(prefix.length, -4));
        if (minute >= fromMinute && minute <= toMinute) out.push({ minute, data: await fs.readFile(path.join(dir, f)) });
      }
      return out.sort((a, b) => a.minute - b.minute);
    },
    async prune(beforeMinute) {
      let n = 0;
      for (const f of await fs.readdir(dir)) {
        const minute = Number(f.split('_').pop().slice(0, -4));
        if (minute < beforeMinute) {
          await fs.unlink(path.join(dir, f));
          n++;
        }
      }
      return n;
    },
    async stats() {
      let bytes = 0;
      const files = await fs.readdir(dir);
      for (const f of files) bytes += (await fs.stat(path.join(dir, f))).size;
      return { rows: files.length, bytes };
    },
  };
}
