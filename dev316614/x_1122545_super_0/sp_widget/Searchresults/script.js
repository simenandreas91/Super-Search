(function() {
  var query = '';
  var page = 1;
  var pageSize = parseIntegerOption(options.page_size, 10);
  var candidateLimit = parseIntegerOption(options.candidate_limit, 75);
  var includeBodySearch = parseBooleanOption(options.include_body_search, true);
  var articlePageId = options.article_page_id || 'kb_article';
  var catalogItemPageId = options.catalog_item_page_id || 'sc_cat_item';
  var newsPageId = options.news_page_id || 'cd_news_article';
  var newsContentTypeId = options.news_content_type_id || '4880186c53202110a489ddeeff7b129a';
  var synonymDictionaryId = options.synonym_dictionary_id || '';
  var featuredKnowledgeBaseId = options.featured_knowledge_base_id || 'bb0370019f22120047a2d126c42e7073';
  var featuredKnowledgeBaseLabel = options.featured_knowledge_base_label || 'Human Resources General Knowledge';
  var portalRecord = $sp.getPortalRecord();
  var portalSysId = options.portal_sys_id || (portalRecord ? portalRecord.getUniqueValue() : '');
  var resultFilter = 'all';
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

  if (input && typeof input.resultFilter !== 'undefined') {
    resultFilter = normalizeFilter(input.resultFilter);
  } else {
    resultFilter = normalizeFilter($sp.getParameter('filter'));
  }

  data.config = {
    pageSize: pageSize,
    articlePageId: articlePageId,
    catalogItemPageId: catalogItemPageId,
    newsPageId: newsPageId,
    newsContentTypeId: newsContentTypeId,
    synonymDictionaryId: synonymDictionaryId,
    portalSysId: portalSysId,
    featuredKnowledgeBaseId: featuredKnowledgeBaseId,
    featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
    resultFilter: resultFilter
  };

  data.search = searchEngine.searchKnowledge({
    query: query,
    page: page,
    pageSize: pageSize,
    candidateLimit: candidateLimit,
    includeBodySearch: includeBodySearch,
    articlePageId: articlePageId,
    catalogItemPageId: catalogItemPageId,
    newsPageId: newsPageId,
    newsContentTypeId: newsContentTypeId,
    synonymDictionaryId: synonymDictionaryId,
    portalSysId: portalSysId,
    featuredKnowledgeBaseId: featuredKnowledgeBaseId,
    featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
    resultFilter: resultFilter
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

  function normalizeFilter(value) {
    var normalizedValue = String(value || 'all').toLowerCase();

    if (normalizedValue === 'knowledge' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'featured_kb') {
      return normalizedValue;
    }

    return 'all';
  }
})();
