(function() {
  var query = '';
  var page = 1;
  var pageSize = parseIntegerOption(options.page_size, 10);
  var candidateLimit = parseIntegerOption(options.candidate_limit, 75);
  var includeBodySearch = parseBooleanOption(options.include_body_search, true);
  var shortQueryLength = parseIntegerOption(options.short_query_length, 2);
  var shortQueryCandidateLimit = parseIntegerOption(options.short_query_candidate_limit, 20);
  var shortQueryResultLimit = parseIntegerOption(options.short_query_result_limit, 10);
  var articlePageId = options.article_page_id || 'kb_article';
  var catalogItemPageId = options.catalog_item_page_id || 'sc_cat_item';
  var newsPageId = options.news_page_id || 'cd_news_article';
  var newsContentTypeId = options.news_content_type_id || '4880186c53202110a489ddeeff7b129a';
  var synonymDictionaryId = options.synonym_dictionary_id || '';
  var featuredKnowledgeBaseId = options.featured_knowledge_base_id || 'bb0370019f22120047a2d126c42e7073';
  var featuredKnowledgeBaseLabel = options.featured_knowledge_base_label || 'Styrende dokumenter';
  var featuredTopicId = options.featured_topic_id || '';
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
    candidateLimit: candidateLimit,
    includeBodySearch: includeBodySearch,
    articlePageId: articlePageId,
    catalogItemPageId: catalogItemPageId,
    newsPageId: newsPageId,
    newsContentTypeId: newsContentTypeId,
    shortQueryLength: shortQueryLength,
    shortQueryCandidateLimit: shortQueryCandidateLimit,
    shortQueryResultLimit: shortQueryResultLimit,
    synonymDictionaryId: synonymDictionaryId,
    portalSysId: portalSysId,
    featuredKnowledgeBaseId: featuredKnowledgeBaseId,
    featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
    featuredTopicId: featuredTopicId,
    resultFilter: resultFilter,
    deferInitialQuery: !input
  };

  if (input && typeof input.query !== 'undefined') {
    data.search = searchEngine.searchKnowledge({
      query: query,
      page: page,
      pageSize: pageSize,
      candidateLimit: candidateLimit,
      includeBodySearch: includeBodySearch,
      shortQueryLength: shortQueryLength,
      shortQueryCandidateLimit: shortQueryCandidateLimit,
      shortQueryResultLimit: shortQueryResultLimit,
      articlePageId: articlePageId,
      catalogItemPageId: catalogItemPageId,
      newsPageId: newsPageId,
      newsContentTypeId: newsContentTypeId,
      synonymDictionaryId: synonymDictionaryId,
      portalSysId: portalSysId,
      featuredKnowledgeBaseId: featuredKnowledgeBaseId,
      featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
      featuredTopicId: featuredTopicId,
      resultFilter: resultFilter
    });
  } else {
    data.search = buildInitialSearch(query, page, pageSize, resultFilter, featuredKnowledgeBaseId, featuredKnowledgeBaseLabel);
  }

  function buildInitialSearch(initialQuery, initialPage, initialPageSize, initialFilter, featuredKbId, featuredKbLabel) {
    return {
      query: initialQuery,
      normalizedQuery: '',
      querySummaryLabel: initialQuery ? '"' + initialQuery + '"' : '""',
      hasSynonymExpansion: false,
      activeFilter: initialFilter,
      filters: buildEmptyFilters(featuredKbId, featuredKbLabel),
      page: initialPage,
      pageSize: initialPageSize,
      total: 0,
      totalPages: 0,
      hasMore: false,
      allResults: [],
      results: []
    };
  }

  function buildEmptyFilters(featuredKbId, featuredKbLabel) {
    var filters = {
      all: {
        id: 'all',
        label: 'Alle',
        count: 0
      },
      knowledge_total: {
        id: 'knowledge_total',
        label: 'Kunnskapsartikler',
        count: 0
      },
      knowledge_articles: {
        id: 'knowledge_articles',
        label: 'Artikler',
        count: 0
      },
      news: {
        id: 'news',
        label: 'Nyheter',
        count: 0
      },
      sys_user: {
        id: 'sys_user',
        label: 'Finn kollegaen min',
        count: 0
      },
      topic: {
        id: 'topic',
        label: 'Områdesider',
        count: 0
      },
      catalog_item: {
        id: 'catalog_item',
        label: 'Bestillinger og skjema',
        count: 0
      }
    };

    if (featuredKbId && featuredKbLabel) {
      filters.featured_kb = {
        id: 'featured_kb',
        label: featuredKbLabel,
        count: 0
      };
    }

    return filters;
  }

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

    if (normalizedValue === 'knowledge') {
      return 'knowledge_total';
    }

    if (normalizedValue === 'knowledge_total' || normalizedValue === 'knowledge_articles' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'sys_user' || normalizedValue === 'topic' || normalizedValue === 'featured_kb') {
      return normalizedValue;
    }

    return 'all';
  }
})();
