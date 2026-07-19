// A minimal in-memory stand-in for the slice of the supabase-js query
// builder that src/lib/db/*.ts actually uses (select/insert/update/delete,
// eq/is filters, order, single/maybeSingle, and being awaitable). Just
// enough to unit test the db helpers' branching without a live project.

export type FakeRow = Record<string, unknown>;

interface RunResult {
  data: FakeRow | FakeRow[] | null;
  error: { code: string; message: string } | null;
}

type Filter = (row: FakeRow) => boolean;

// Mirrors Supabase's default PostgREST `max-rows` setting: a select response
// never carries more rows than this, whatever the query asked for. Callers
// reading potentially-large ranges must paginate via .range().
export const FAKE_MAX_ROWS = 1000;

class FakeQuery implements PromiseLike<RunResult> {
  private filters: Filter[] = [];
  private orderCols: { col: string; asc: boolean }[] = [];
  private rangeBounds: { from: number; to: number } | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;

  constructor(
    private readonly table: FakeTable,
    private readonly op: 'select' | 'insert' | 'update' | 'delete',
    private readonly payload?: FakeRow,
  ) {}

  select(): this {
    return this;
  }

  eq(col: string, val: unknown): this {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  is(col: string, val: unknown): this {
    this.filters.push((row) => row[col] === val);
    return this;
  }

  gte(col: string, val: unknown): this {
    this.filters.push((row) => String(row[col]) >= String(val));
    return this;
  }

  lte(col: string, val: unknown): this {
    this.filters.push((row) => String(row[col]) <= String(val));
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCols.push({ col, asc: opts?.ascending ?? true });
    return this;
  }

  range(from: number, to: number): this {
    this.rangeBounds = { from, to };
    return this;
  }

  limit(): this {
    return this;
  }

  single(): this {
    this.wantSingle = true;
    return this;
  }

  maybeSingle(): this {
    this.wantMaybeSingle = true;
    return this;
  }

  private run(): RunResult {
    if (this.op === 'insert') return this.runInsert();

    let matched = this.table.rows.filter((row) => this.filters.every((f) => f(row)));

    if (this.op === 'update') {
      const collisionError = this.checkUpdateNameCollision(matched);
      if (collisionError) return collisionError;
      matched.forEach((row) => Object.assign(row, this.payload));
    } else if (this.op === 'delete') {
      this.table.rows = this.table.rows.filter((row) => !matched.includes(row));
    }

    if (this.orderCols.length) {
      matched = [...matched].sort((a, b) => {
        for (const { col, asc } of this.orderCols) {
          const av = a[col];
          const bv = b[col];
          if (av === bv) continue;
          const cmp = typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av) < String(bv) ? -1 : 1;
          return cmp * (asc ? 1 : -1);
        }
        return 0;
      });
    }

    return this.finish(matched);
  }

  // Mirrors the partial unique index (user_id, lower(name)) where deleted_at
  // is null: renaming a row into a name already held by another active row
  // for the same user must 23505, same as insert would.
  private checkUpdateNameCollision(matched: FakeRow[]): RunResult | null {
    if (typeof this.payload?.name !== 'string') return null;
    const newName = (this.payload.name as string).toLowerCase();
    const collision = this.table.rows.find(
      (row) =>
        !matched.includes(row) &&
        row.deleted_at === null &&
        typeof row.name === 'string' &&
        row.name.toLowerCase() === newName &&
        matched.some((m) => m.user_id === row.user_id),
    );
    if (collision) {
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }
    return null;
  }

  private runInsert(): RunResult {
    const payload = this.payload ?? {};
    const collision = this.table.rows.find(
      (row) =>
        row.deleted_at === null &&
        row.user_id === payload.user_id &&
        typeof row.name === 'string' &&
        typeof payload.name === 'string' &&
        row.name.toLowerCase() === (payload.name as string).toLowerCase(),
    );
    if (collision) {
      return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
    }
    const newRow: FakeRow = {
      id: `id-${this.table.nextId()}`,
      created_at: null,
      deleted_at: null,
      category_id: null,
      ...payload,
    };
    this.table.rows.push(newRow);
    return this.finish([newRow]);
  }

  private finish(matched: FakeRow[]): RunResult {
    if (this.op === 'select') {
      if (this.rangeBounds) matched = matched.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
      if (matched.length > FAKE_MAX_ROWS) matched = matched.slice(0, FAKE_MAX_ROWS);
    }
    if (this.wantSingle) {
      if (matched.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'no rows returned' } };
      return { data: matched[0], error: null };
    }
    if (this.wantMaybeSingle) {
      return { data: matched[0] ?? null, error: null };
    }
    return { data: matched, error: null };
  }

  then<TResult1 = RunResult, TResult2 = never>(
    onfulfilled?: ((value: RunResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export class FakeTable {
  rows: FakeRow[];
  private idCounter = 0;

  constructor(seed: FakeRow[] = []) {
    this.rows = seed.map((row) => ({ ...row }));
  }

  nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  select(): FakeQuery {
    return new FakeQuery(this, 'select');
  }

  insert(payload: FakeRow): FakeQuery {
    return new FakeQuery(this, 'insert', payload);
  }

  // Merge-on-conflict, the way PostgREST's ?on_conflict= upsert behaves:
  // a row matching an existing one on every conflict column replaces it.
  upsert(payload: FakeRow | FakeRow[], opts?: { onConflict?: string }): PromiseLike<RunResult> {
    const rows = Array.isArray(payload) ? payload : [payload];
    const conflictCols = (opts?.onConflict ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    for (const row of rows) {
      const existing = conflictCols.length
        ? this.rows.find((r) => conflictCols.every((col) => r[col] === row[col]))
        : undefined;
      if (existing) Object.assign(existing, row);
      else this.rows.push({ id: `id-${this.nextId()}`, ...row });
    }
    return Promise.resolve({ data: null, error: null });
  }

  update(payload: FakeRow): FakeQuery {
    return new FakeQuery(this, 'update', payload);
  }

  delete(): FakeQuery {
    return new FakeQuery(this, 'delete');
  }
}

export function fakeSupabaseClient(tables: Record<string, FakeTable>): { from(table: string): FakeTable } {
  return {
    from(table: string): FakeTable {
      const t = tables[table];
      if (!t) throw new Error(`fakeSupabaseClient: unmocked table "${table}"`);
      return t;
    },
  };
}
