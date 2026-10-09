// A small in-memory stand-in for the Prisma models the admin CRUD screens and public pages use.
// Test-only: it understands just the query shapes this application issues.
let counter = 0;
const RELATIONS = {
  album: { activity: ['activity', 'activityId', 'one'], photos: ['photo', 'albumId', 'many'] },
  video: { activity: ['activity', 'activityId', 'one'] },
  announcement: { author: ['user', 'authorId', 'one'] },
  activity: { albums: ['album', 'activityId', 'many'], videos: ['video', 'activityId', 'many'] },
};

function compare(value, condition) {
  if (condition === null || typeof condition !== 'object' || condition instanceof Date) {
    return condition instanceof Date ? value instanceof Date && +value === +condition : value === condition;
  }
  return Object.entries(condition).every(([operator, expected]) => {
    switch (operator) {
      case 'equals': return value === expected;
      case 'in': return expected.includes(value);
      case 'notIn': return !expected.includes(value);
      case 'not': return !compare(value, expected);
      case 'lte': return value != null && value <= expected;
      case 'lt': return value != null && value < expected;
      case 'gte': return value != null && value >= expected;
      case 'gt': return value != null && value > expected;
      case 'contains': return typeof value === 'string' && value.toLowerCase().includes(String(expected).toLowerCase());
      case 'startsWith': return typeof value === 'string' && value.toLowerCase().startsWith(String(expected).toLowerCase());
      case 'mode': return true;
      default: return false;
    }
  });
}

function matches(row, where = {}) {
  return Object.entries(where || {}).every(([key, condition]) => {
    if (key === 'OR') return condition.some((entry) => matches(row, entry));
    if (key === 'AND') return [].concat(condition).every((entry) => matches(row, entry));
    if (key === 'NOT') return ![].concat(condition).some((entry) => matches(row, entry));
    return compare(row[key], condition);
  });
}

function sortRows(rows, orderBy) {
  const order = [].concat(orderBy || []);
  if (!order.length) return rows;
  return [...rows].sort((a, b) => {
    for (const entry of order) {
      const [field, spec] = Object.entries(entry)[0];
      const direction = (typeof spec === 'object' ? spec.sort : spec) === 'desc' ? -1 : 1;
      const nullsLast = typeof spec === 'object' && spec.nulls === 'last';
      const av = a[field], bv = b[field];
      if (av == null && bv == null) continue;
      if (av == null) return nullsLast ? 1 : -direction;
      if (bv == null) return nullsLast ? -1 : direction;
      if (av < bv) return -direction;
      if (av > bv) return direction;
    }
    return 0;
  });
}

function createMemoryDb(tables) {
  const models = {};
  const names = Object.keys(tables);

  function shape(name, row, args = {}) {
    const copy = { ...row };
    const extras = { ...(args.include || {}) };
    if (args.select) for (const [key, value] of Object.entries(args.select)) if (value && typeof value === 'object') extras[key] = value;
    for (const [key, spec] of Object.entries(extras)) {
      if (key === '_count') {
        copy._count = {};
        for (const relation of Object.keys(spec.select || {})) {
          const [target, foreign] = RELATIONS[name][relation];
          copy._count[relation] = tables[target].filter((entry) => entry[foreign] === row.id).length;
        }
        continue;
      }
      const relation = RELATIONS[name] && RELATIONS[name][key];
      if (!relation) continue;
      const [target, foreign, kind] = relation;
      const options = spec === true ? {} : spec;
      if (kind === 'one') {
        const found = tables[target].find((entry) => entry.id === row[foreign]);
        copy[key] = found ? shape(target, found, { select: options.select }) : null;
      } else {
        let rows = tables[target].filter((entry) => entry[foreign] === row.id && matches(entry, options.where));
        rows = sortRows(rows, options.orderBy);
        if (options.take) rows = rows.slice(0, options.take);
        copy[key] = rows.map((entry) => shape(target, entry, { select: options.select }));
      }
    }
    if (args.select) {
      const picked = {};
      for (const key of Object.keys(args.select)) if (args.select[key]) picked[key] = copy[key];
      return picked;
    }
    return copy;
  }

  for (const name of names) {
    const rows = tables[name];
    const find = (where) => rows.filter((row) => matches(row, where));
    models[name] = {
      findMany: async (args = {}) => {
        let found = sortRows(find(args.where), args.orderBy);
        if (args.distinct) {
          const field = [].concat(args.distinct)[0];
          found = found.filter((row, index, all) => all.findIndex((entry) => entry[field] === row[field]) === index);
        }
        if (args.skip || args.take) found = found.slice(args.skip || 0, (args.skip || 0) + (args.take ?? found.length));
        return found.map((row) => shape(name, row, args));
      },
      findFirst: async (args = {}) => {
        const row = sortRows(find(args.where), args.orderBy)[0];
        return row ? shape(name, row, args) : null;
      },
      findUnique: async (args) => {
        const row = rows.find((entry) => Object.entries(args.where).every(([key, value]) => entry[key] === value));
        return row ? shape(name, row, args) : null;
      },
      count: async (args = {}) => find(args && args.where).length,
      aggregate: async (args = {}) => {
        const found = find(args.where);
        const max = (field) => found.reduce((best, row) => (row[field] && (!best || row[field] > best) ? row[field] : best), null);
        return { _max: Object.fromEntries(Object.keys(args._max || {}).map((field) => [field, max(field)])), _count: { _all: found.length } };
      },
      create: async ({ data }) => {
        const now = new Date();
        const row = { id: `${name}-${++counter}`, createdAt: now, updatedAt: now, ...data };
        for (const key of Object.keys(row)) if (row[key] === undefined) delete row[key];
        const unique = (tables.__unique && tables.__unique[name]) || [];
        for (const field of unique) {
          if (row[field] != null && rows.some((entry) => entry[field] === row[field])) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        rows.push(row);
        return { ...row };
      },
      update: async ({ where, data }) => {
        const row = rows.find((entry) => Object.entries(where).every(([key, value]) => entry[key] === value));
        if (!row) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      updateMany: async ({ where, data }) => { const found = find(where); found.forEach((row) => Object.assign(row, data)); return { count: found.length }; },
      upsert: async ({ where, create, update }) => {
        const row = rows.find((entry) => Object.entries(where).every(([key, value]) => entry[key] === value));
        if (row) { Object.assign(row, update, { updatedAt: new Date() }); return { ...row }; }
        return models[name].create({ data: { ...where, ...create } });
      },
      delete: async ({ where }) => {
        const index = rows.findIndex((entry) => Object.entries(where).every(([key, value]) => entry[key] === value));
        if (index < 0) throw Object.assign(new Error('Record not found'), { code: 'P2025' });
        const [removed] = rows.splice(index, 1);
        // Foreign keys: optional links are cleared and owned photos are removed, like the real schema.
        if (name === 'activity') for (const table of ['album', 'video']) tables[table].forEach((row) => { if (row.activityId === removed.id) row.activityId = null; });
        if (name === 'album') for (let i = tables.photo.length - 1; i >= 0; i--) if (tables.photo[i].albumId === removed.id) tables.photo.splice(i, 1);
        return removed;
      },
    };
  }
  return models;
}

module.exports = { createMemoryDb };
