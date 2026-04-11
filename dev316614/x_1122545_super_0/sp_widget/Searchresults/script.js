(function() {
  var query = '';
  var page = 1;
  var pageSize = parseIntegerOption(options.page_size, 10);
  var candidateLimit = parseIntegerOption(options.candidate_limit, 75);
  var includeBodySearch = parseBooleanOption(options.include_body_search, true);
  var articlePageId = options.article_page_id || 'kb_article';
  var catalogItemPageId = options.catalog_item_page_id || 'sc_cat_item';
  var searchEngine = new x_1122545_super_0.superSearchEngine();

  if (input && typeof input.query !== 'undefined') {
    query = input.query;
  } else {
    query = $sp.getParameter('q') || '';
  }

  if (input && typeof input.page !== 'undefined') {
    page = parseIntegerOption(input.page, 1);
  } else {
    page = parseIntegerOption($sp.getParameter('page'), 1);
  }

  data.config = {
    pageSize: pageSize,
    articlePageId: articlePageId,
    catalogItemPageId: catalogItemPageId
  };

  data.search = searchEngine.searchKnowledge({
    query: query,
    page: page,
    pageSize: pageSize,
    candidateLimit: candidateLimit,
    includeBodySearch: includeBodySearch,
    articlePageId: articlePageId,
    catalogItemPageId: catalogItemPageId
  });

  function parseIntegerOption(value, defaultValue) {
    var parsedValue = parseInt(value, 10);

    return isNaN(parsedValue) ? defaultValue : parsedValue;
  }

  function parseBooleanOption(value, defaultValue) {
    if (value === true || value === false) {
      return value;
    }

    if (typeof value === 'undefined' || value === null || value === '') {
      return defaultValue;
    }

    return String(value) === 'true';
  }
})();
