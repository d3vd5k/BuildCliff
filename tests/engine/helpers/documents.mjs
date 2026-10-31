// A limited document fixture for business-logic unit tests, not a MongoDB
// substitute or evidence of database integration. Unsupported operators fail.
function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    const value = key.split('.').reduce((current, part) => current?.[part], document);
    if (!expected || typeof expected !== 'object' || expected instanceof Date) return value === expected;
    return Object.entries(expected).every(([operator, operand]) => {
      if (operator === '$gte') return value >= operand;
      if (operator === '$lte') return value <= operand;
      if (operator === '$nin') return !operand.includes(value);
      if (operator === '$elemMatch') return Array.isArray(value) && value.some(entry => matches(entry, operand));
      throw new Error(`Unsupported unit-fixture operator: ${operator}`);
    });
  });
}

function sorted(rows, order = {}) {
  return [...rows].sort((a, b) => {
    for (const [field, direction] of Object.entries(order)) {
      const left = field.split('.').reduce((current, part) => current?.[part], a);
      const right = field.split('.').reduce((current, part) => current?.[part], b);
      if (left < right) return -direction;
      if (left > right) return direction;
    }
    return 0;
  });
}

function snapshot(document, options = {}) {
  if (!document) return null;
  const copy = structuredClone(document);
  if (options.projection?._id === 0) delete copy._id;
  return copy;
}

export function documentDb(tables, { beforeWrite } = {}) {
  return {
    collection(name) {
      const rows = tables[name] ?? [];
      async function write(query, update, options, atomic) {
        await beforeWrite?.(name, tables);
        const row = rows.find(document => matches(document, query));
        if (!row) return atomic ? null : { matchedCount: 0 };
        const previous = snapshot(row, options);
        Object.assign(row, structuredClone(update.$set));
        return atomic ? options.returnDocument === 'after' ? snapshot(row, options) : previous : { matchedCount: 1 };
      }
      return {
        async findOne(query, options = {}) {
          return snapshot(sorted(rows.filter(document => matches(document, query)), options.sort)[0], options);
        },
        find(query, options = {}) {
          let selected = rows.filter(document => matches(document, query)).map(document => snapshot(document, options));
          return {
            sort(order) { selected = sorted(selected, order); return this; },
            async toArray() { return selected; },
          };
        },
        async countDocuments(query) { return rows.filter(document => matches(document, query)).length; },
        updateOne(query, update) { return write(query, update, {}, false); },
        findOneAndUpdate(query, update, options = {}) { return write(query, update, options, true); },
      };
    },
  };
}
