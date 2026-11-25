// An in-memory DynamoDB for tests: the request shapes `dynamo-store.mjs`
// and the email consent store send, parsed strictly, so a malformed
// expression fails here instead of in production. Pages are small (PAGE
// items) so pagination is exercised. Not shipped in the Lambda zip.

const PAGE = 3;

function val(av) {
  if (!av) return undefined;
  if ('N' in av) return Number(av.N);
  if ('S' in av) return av.S;
  if ('BOOL' in av) return av.BOOL;
  throw new Error(`fake-dynamo: unsupported attribute value ${JSON.stringify(av)}`);
}
const fail = (code, message = code) => Object.assign(new Error(message), { code });

export function fakeDynamo() {
  const tables = new Map();
  const calls = [];
  const tableOf = (name) => {
    if (!name) throw fail('ValidationException', 'TableName required');
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };
  const keyOf = (k) => {
    const names = Object.keys(k).sort();
    if (names.length < 1 || names.length > 2) throw fail('ValidationException', 'bad key');
    return names.map((n) => `${n}=${val(k[n])}`).join('|');
  };
  const name = (tok, names = {}) => (tok.startsWith('#') ? names[tok] ?? (() => { throw fail('ValidationException', `unbound ${tok}`); })() : tok);
  const value = (tok, values = {}) => {
    if (!(tok in values)) throw fail('ValidationException', `unbound ${tok}`);
    return val(values[tok]);
  };

  function condition(expr, item, names, values) {
    if (!expr) return true;
    return expr.split(/\s+OR\s+/).some((part) => {
      let m = part.match(/^attribute_not_exists\((#?\w+)\)$/);
      if (m) return item?.[name(m[1], names)] === undefined;
      m = part.match(/^attribute_exists\((#?\w+)\)$/);
      if (m) return item?.[name(m[1], names)] !== undefined;
      m = part.match(/^(#?\w+) (<|<=|=|>|>=) (:\w+)$/);
      if (m) return compare(item?.[name(m[1], names)], m[2], value(m[3], values));
      throw fail('ValidationException', `fake-dynamo: unsupported condition "${part}"`);
    });
  }
  function compare(a, op, b) {
    if (a === undefined) return false;
    switch (op) {
      case '<': return a < b;
      case '<=': return a <= b;
      case '=': return a === b;
      case '>': return a > b;
      default: return a >= b;
    }
  }
  const toAv = (v) => (typeof v === 'number' ? { N: String(v) } : typeof v === 'boolean' ? { BOOL: v } : { S: v });
  const asItem = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toAv(v)]));

  const ops = {
    PutItem({ TableName, Item, ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues }) {
      const t = tableOf(TableName);
      const plain = Object.fromEntries(Object.entries(Item).map(([k, v]) => [k, val(v)]));
      const k = keyOf({ pk: Item.pk, ...(Item.sk ? { sk: Item.sk } : {}) });
      if (!condition(ConditionExpression, t.get(k), ExpressionAttributeNames, ExpressionAttributeValues)) throw fail('ConditionalCheckFailedException');
      t.set(k, plain);
      return {};
    },
    GetItem({ TableName, Key }) {
      const it = tableOf(TableName).get(keyOf(Key));
      return it ? { Item: asItem(it) } : {};
    },
    UpdateItem({ TableName, Key, UpdateExpression, ConditionExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values, ReturnValues }) {
      const t = tableOf(TableName);
      const k = keyOf(Key);
      const before = t.get(k);
      if (!condition(ConditionExpression, before, names, values)) throw fail('ConditionalCheckFailedException');
      const m = UpdateExpression.match(/^(?:SET (.+?))?\s*(?:ADD (#?\w+) (:\w+))?$/);
      if (!m || (!m[1] && !m[2])) throw fail('ValidationException', `fake-dynamo: unsupported update "${UpdateExpression}"`);
      const next = { ...(before || Object.fromEntries(Object.entries(Key).map(([kk, v]) => [kk, val(v)]))) };
      const touched = [];
      if (m[1]) {
        for (const assign of m[1].split(/,\s*/)) {
          const a = assign.match(/^(#?\w+) = (:\w+)$/);
          if (!a) throw fail('ValidationException', `fake-dynamo: unsupported SET "${assign}"`);
          next[name(a[1], names)] = value(a[2], values);
          touched.push(name(a[1], names));
        }
      }
      if (m[2]) {
        const attr = name(m[2], names);
        next[attr] = (next[attr] || 0) + value(m[3], values);
        touched.push(attr);
      }
      t.set(k, next);
      if (ReturnValues === 'UPDATED_NEW') return { Attributes: asItem(Object.fromEntries(touched.map((a) => [a, next[a]]))) };
      if (ReturnValues === 'ALL_NEW') return { Attributes: asItem(next) };
      return {};
    },
    DeleteItem({ TableName, Key, ReturnValues }) {
      const t = tableOf(TableName);
      const k = keyOf(Key);
      const old = t.get(k);
      t.delete(k);
      return ReturnValues === 'ALL_OLD' && old ? { Attributes: asItem(old) } : {};
    },
    Query({ TableName, KeyConditionExpression, FilterExpression, ExpressionAttributeNames: names, ExpressionAttributeValues: values, Limit, ExclusiveStartKey }) {
      const m = KeyConditionExpression.match(/^pk = (:\w+)(?: AND sk (=|<|<=|>|>=|begins_with) (:\w+))?$/);
      if (!m) throw fail('ValidationException', `fake-dynamo: unsupported key condition "${KeyConditionExpression}"`);
      const pk = value(m[1], values);
      let rows = [...tableOf(TableName).values()].filter((r) => r.pk === pk);
      if (m[2]) rows = rows.filter((r) => compare(r.sk, m[2], value(m[3], values)));
      rows.sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
      if (ExclusiveStartKey) rows = rows.filter((r) => r.sk > val(ExclusiveStartKey.sk));
      const page = rows.slice(0, Math.min(PAGE, Limit ?? Infinity));
      const more = rows.length > page.length;
      const items = page.filter((r) => condition(FilterExpression, r, names, values));
      return {
        Items: items.map(asItem),
        ...(more && page.length ? { LastEvaluatedKey: { pk: { S: pk }, sk: { S: page[page.length - 1].sk } } } : {}),
      };
    },
  };

  async function call(op, input) {
    calls.push({ op, input });
    if (!ops[op]) throw fail('UnknownOperationException', op);
    return ops[op](structuredClone(input));
  }
  return { call, tables, calls };
}
