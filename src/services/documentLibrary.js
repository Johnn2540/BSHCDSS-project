// Pure presentation data for the public and tutor document libraries.
function searchText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function buildDocumentLibrary(groups, query = {}) {
  const q = typeof query.q === 'string' ? query.q.trim().replace(/\s+/g, ' ').slice(0, 150) : '';
  const requestedCategory = typeof query.category === 'string' ? query.category : '';
  const category = groups.some((group) => group.category === requestedCategory) ? requestedCategory : '';
  const terms = searchText(q).split(/\s+/).filter(Boolean);
  const categories = groups.map((group) => ({
    value: group.category,
    count: group.documents.length,
    selected: group.category === category,
  }));
  const visibleGroups = groups.map((group, index) => ({
    category: group.category,
    anchor: `document-group-${index + 1}`,
    documents: group.documents.filter((doc) => {
      if (category && doc.category !== category) return false;
      const haystack = searchText([doc.title, doc.description, doc.fileName].join(' '));
      return terms.every((term) => haystack.includes(term));
    }),
  })).filter((group) => group.documents.length);
  return {
    groups: visibleGroups,
    categories,
    q,
    category,
    isFiltered: Boolean(q || category),
    total: groups.reduce((count, group) => count + group.documents.length, 0),
    resultCount: visibleGroups.reduce((count, group) => count + group.documents.length, 0),
    categoryCount: categories.length,
  };
}

module.exports = { buildDocumentLibrary };
