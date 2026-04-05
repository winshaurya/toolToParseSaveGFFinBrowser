/*
 sqlite_wasm_loader.js

 Core browser-side SQLite (WASM) loader and secure query API.

 Usage:
  - Provide `initSqlJs` from the `sql.js` package or let the module dynamically
    import `sql.js` when available.

 Example:
   import { WasmSqliteDB } from './src/wasm/sqlite_wasm_loader.js';
   const loader = new WasmSqliteDB({ wasmURL: '/sql-wasm.wasm' });
   await loader.init();
   await loader.loadDatabaseFromUrl('/data/features.db');
   const rows = await loader.queryFeatures({ seqid: 'chr1', start: 1000, end: 2000, attributeName: 'Name' });

 Notes:
  - This module uses prepared statements with positional parameters to avoid
    SQL injection. Do not interpolate user input into SQL strings.
  - It aggregates joined rows into feature objects with `attributes` arrays.
*/

export class WasmSqliteDB {
  constructor({ wasmURL = '/sql-wasm.wasm', initSqlJs = null } = {}) {
    this.wasmURL = wasmURL;
    this.initSqlJs = initSqlJs; // optional function passed by consumer
    this.SQL = null; // resolved sql.js runtime
    this.db = null; // Database instance
    this._initPromise = null;
  }

  async init(providedInitSqlJs = null) {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      const initFn = providedInitSqlJs || this.initSqlJs;
      if (!initFn) {
        // Try dynamic import of sql.js; consumer can also pass initSqlJs
        try {
          const mod = await import('sql.js');
          // sql.js packaging varies: support named or default exports
          if (typeof mod.initSqlJs === 'function') {
            this.initSqlJs = mod.initSqlJs;
          } else if (typeof mod.default === 'function') {
            this.initSqlJs = mod.default;
          } else if (mod && typeof mod === 'object' && typeof mod.default?.initSqlJs === 'function') {
            this.initSqlJs = mod.default.initSqlJs;
          } else {
            throw new Error('initSqlJs not found in sql.js module');
          }
        } catch (err) {
          throw new Error('sql.js dynamic import failed; pass initSqlJs to init(): ' + err.message);
        }
      } else {
        this.initSqlJs = initFn;
      }

      // Initialize the runtime and point to the wasm file.
      const config = { locateFile: () => this.wasmURL };
      this.SQL = await this.initSqlJs(config);
      return this.SQL;
    })();
    return this._initPromise;
  }

  async loadDatabaseFromUrl(url) {
    if (!this.SQL) throw new Error('SQL runtime not initialized. Call init() first.');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch DB: ' + res.status + ' ' + res.statusText);
    const buf = await res.arrayBuffer();
    this.db = new this.SQL.Database(new Uint8Array(buf));
    return this.db;
  }

  async loadDatabaseFromFile(file) {
    if (!this.SQL) throw new Error('SQL runtime not initialized. Call init() first.');
    const buf = await file.arrayBuffer();
    this.db = new this.SQL.Database(new Uint8Array(buf));
    return this.db;
  }

  close() {
    if (this.db) {
      try {
        this.db.close();
      } catch (err) {
        // ignore
      }
      this.db = null;
    }
  }

  async queryFeatures({ seqid, start, end, attributeName = null, limit = null } = {}) {
    if (!this.db) throw new Error('Database not loaded. Call loadDatabaseFromUrl() or loadDatabaseFromFile().');
    if (typeof seqid !== 'string') throw new TypeError('seqid must be a string');
    if (typeof start !== 'number' || typeof end !== 'number') throw new TypeError('start/end must be numbers');

    // Build SQL with positional placeholders (?) and a deterministic parameter order.
    let sql;
    let params = [];
    if (attributeName) {
      // Select only features that have at least one attribute with `attributeName`.
      // We still left-join `attributes a` to return all attributes for each feature.
      sql = `
        SELECT f.id AS fid, s.name AS seqname, f.source, f.type, f.start, f.end, f.length, f.score, f.strand, f.phase,
               a.key AS attr_key, a.value AS attr_value
        FROM features f
        JOIN seqnames s ON f.seqname_id = s.id
        JOIN attributes af ON af.feature_id = f.id AND af.key = ?
        LEFT JOIN attributes a ON a.feature_id = f.id
        WHERE s.name = ? AND f.start <= ? AND f.end >= ?
        ORDER BY f.id
      `;
      params = [attributeName, seqid, end, start];
    } else {
      sql = `
        SELECT f.id AS fid, s.name AS seqname, f.source, f.type, f.start, f.end, f.length, f.score, f.strand, f.phase,
               a.key AS attr_key, a.value AS attr_value
        FROM features f
        JOIN seqnames s ON f.seqname_id = s.id
        LEFT JOIN attributes a ON a.feature_id = f.id
        WHERE s.name = ? AND f.start <= ? AND f.end >= ?
        ORDER BY f.id
      `;
      params = [seqid, end, start];
    }

    if (limit && Number.isInteger(limit) && limit > 0) {
      sql += ' LIMIT ' + Number(limit);
      // limit appended directly; it is a number controlled by caller code, not interpolated from free text
    }

    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
    } catch (err) {
      stmt.free();
      throw new Error('Failed to bind query parameters: ' + err.message);
    }

    const results = [];
    let currentFid = null;
    let current = null;

    const getRow = (st) => {
      if (typeof st.getAsObject === 'function') return st.getAsObject();
      const values = st.get();
      const cols = st.getColumnNames();
      const obj = {};
      for (let i = 0; i < cols.length; i++) obj[cols[i]] = values[i];
      return obj;
    };

    try {
      while (stmt.step()) {
        const row = getRow(stmt);
        const fid = row.fid;
        if (fid !== currentFid) {
          if (current) results.push(current);
          currentFid = fid;
          current = {
            id: fid,
            seqname: row.seqname,
            source: row.source,
            type: row.type,
            start: row.start,
            end: row.end,
            length: row.length,
            score: row.score,
            strand: row.strand,
            phase: row.phase,
            attributes: []
          };
        }
        if (row.attr_key != null) {
          current.attributes.push({ key: row.attr_key, value: row.attr_value });
        }
      }
      if (current) results.push(current);
    } finally {
      stmt.free();
    }

    return results;
  }
}

export default WasmSqliteDB;
