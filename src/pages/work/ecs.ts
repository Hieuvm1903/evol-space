/** A tiny Entity-Component-System world.
 *  - An entity is a plain object; a "component" is any optional field on it.
 *  - `with("a", "b")` returns the entities that currently have both (a cached query).
 *  - Systems are just functions that loop over a query each tick (see runtime.ts).
 *  Use `set` / `unset` (not direct assignment) when adding or removing a component so
 *  the cached queries stay correct. */
export class World<E extends object> {
  private all = new Set<E>();
  private queries = new Map<string, { keys: (keyof E)[]; set: Set<E>; cache: E[] | null }>();

  get size() { return this.all.size; }
  entities(): E[] { return Array.from(this.all); }

  add(e: E): E { this.all.add(e); this.reindex(e); return e; }

  remove(e: E) {
    this.all.delete(e);
    for (const q of this.queries.values()) if (q.set.delete(e)) q.cache = null;
  }

  set<K extends keyof E>(e: E, key: K, value: E[K]) { e[key] = value; this.reindex(e); }
  unset<K extends keyof E>(e: E, key: K) { delete (e as any)[key]; this.reindex(e); }

  with(...keys: (keyof E)[]): readonly E[] {
    const id = keys.join("|");
    let q = this.queries.get(id);
    if (!q) {
      q = { keys, set: new Set(), cache: null };
      for (const e of this.all) if (keys.every((k) => e[k] !== undefined)) q.set.add(e);
      this.queries.set(id, q);
    }
    return (q.cache ??= Array.from(q.set));
  }

  clear() { this.all.clear(); this.queries.clear(); }

  private reindex(e: E) {
    for (const q of this.queries.values()) {
      const ok = q.keys.every((k) => e[k] !== undefined);
      if (ok) { if (!q.set.has(e)) { q.set.add(e); q.cache = null; } }
      else if (q.set.delete(e)) q.cache = null;
    }
  }
}
