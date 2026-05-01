(function() {
	var SUPER_SEARCH_CONTEXT_SYS_ID = '6c09b68ec364cb906b68770d05013165';
	var SUPER_SEARCH_CONTEXT_NAME = 'Super search KBs';
	var DEFAULT_PAGE_SIZE = 10;
	var DEFAULT_LIMIT = 10;
	var DEFAULT_CANDIDATE_LIMIT = 75;
	var CONTEXTUAL_STOP_WORDS = {
		'a': true,
		'all': true,
		'alle': true,
		'an': true,
		'and': true,
		'are': true,
		'av': true,
		'can': true,
		'do': true,
		'en': true,
		'er': true,
		'et': true,
		'for': true,
		'fra': true,
		'har': true,
		'how': true,
		'hva': true,
		'hvordan': true,
		'i': true,
		'is': true,
		'jeg': true,
		'kan': true,
		'med': true,
		'my': true,
		'of': true,
		'og': true,
		'on': true,
		'or': true,
		'paa': true,
		'pa': true,
		'på': true,
		'som': true,
		'the': true,
		'til': true,
		'to': true,
		'what': true
	};
	var CONTEXTUAL_SYNONYM_DEFINITIONS = [
		{
			match: ['hjemmefra', 'jobbe hjemmefra', 'arbeide hjemmefra', 'jobbe hjemme', 'arbeide hjemme'],
			expand: ['hjemmefra', 'hjemmekontor', 'retningslinjer hjemmekontor']
		},
		{
			match: ['remote work', 'work from home', 'working from home', 'home office'],
			expand: ['hjemmekontor', 'hjemmefra', 'retningslinjer hjemmekontor']
		},
		{
			match: ['arbeidstid', 'working hours', 'office hours', 'work hours'],
			expand: ['arbeidstid', 'standard arbeidstid', 'fleksitid']
		},
		{
			match: ['fleksibel arbeidstid', 'flexible hours', 'flexitime', 'flextime'],
			expand: ['fleksitid', 'arbeidstid']
		},
		{
			match: ['configure router', 'configure broadband router', 'router configuration'],
			expand: ['configuring broadband router', 'broadband router', 'set up router']
		},
		{
			match: ['setup router', 'set up router', 'install router', 'router setup'],
			expand: ['set up router', 'home network router', 'broadband router']
		},
		{
			match: ['wireless disconnect', 'wifi disconnect', 'wi fi disconnect', 'wireless drops', 'wifi drops'],
			expand: ['wireless disconnect', 'wireless network', 'intermittently disconnect']
		}
	];

	if (!input) {
		initializeWidgetData();
		return;
	}

	if (input.action == 'super_search') {
		data.searchResponse = runSuperSearch(input);
		return;
	}

	if (input.action == 'get_article_content') {
		data.knowledge_content = getKBViewModel().getArticleContentBySysId(input.articleId);
		return;
	}

	if (input.action == 'register_kb_view' && input.articleId) {
		registerKnowledgeView(input.articleId, input.tsQueryId);
	}

	function initializeWidgetData() {
		var rpSysId = options.cat_item || $sp.getParameter('sys_id');
		var config = new sn_cxs.CXSUIConfig().getRPConfig(rpSysId) || {};

		normalizeConfig(config);

		data.cxs = {
			session: gs.generateGUID(),
			displayed_on: 'record_producer:' + rpSysId,
			usingSuperSearch: true,
			config: config,
			property: {
				show_meta_data: gs.getProperty('com.snc.contextual_search.widget.form.show_meta_data', false) == 'true' || false,
				wait_time: parseInt(gs.getProperty('com.snc.contextual_search.wait_time', 500), 10),
				min_length: parseInt(gs.getProperty('com.snc.contextual_search.min_length', 4), 10)
			},
			kb_property: {
				show_author: (gs.getProperty('glide.knowman.search.show_author', false) == 'true' || false),
				show_article_number: (gs.getProperty('glide.knowman.search.show_article_number', false) == 'true' || false),
				show_category: (gs.getProperty('glide.knowman.search.show_category', false) == 'true' || false),
				show_relevance: (gs.getProperty('glide.knowman.search.show_relevancy', false) == 'true' || false),
				show_last_modified: (gs.getProperty('glide.knowman.search.show_last_modified', false) == 'true' || false),
				show_published: (gs.getProperty('glide.knowman.search.show_published', false) == 'true' || false),
				show_unpublished: (gs.getProperty('glide.knowman.show_unpublished', false) == 'true' || false),
				show_view_count: (gs.getProperty('glide.knowman.search.show_view_count', false) == 'true' || false),
				show_rating: (gs.getProperty('glide.knowman.search.show_rating', false) == 'true' || false)
			},
			knowledgeBase: String($sp.getKnowledgeBases()),
			catalog: String($sp.getCatalogs().value + '')
		};

		data.ariaMsgs = {
			searchCompleted: gs.getMessage('Showing {0} search results based on field {1}'),
			searching: gs.getMessage('Searching for {0}'),
			loadingMoreResults: gs.getMessage('Loading more results'),
			resultsLoaded: gs.getMessage('More results loaded'),
			allResultsLoaded: gs.getMessage('Showing all {0} search results'),
			noMatchingResults: gs.getMessage('No matching results found for {0}'),
			noResultsToDisplay: gs.getMessage('No results to display')
		};

		data.i18nMsgs = {
			noRating: gs.getMessage('No rating'),
			rating: gs.getMessage('{0} star rating'),
			views: gs.getMessage('{0} views'),
			view: gs.getMessage('{0} view'),
			comment: gs.getMessage('{0} comment'),
			comments: gs.getMessage('{0} comments'),
			reply: gs.getMessage('{0} reply'),
			replies: gs.getMessage('{0} replies'),
			clickHere: gs.getMessage('Click here to view this result. This result will open in a new window.'),
			catalog: {
				order: gs.getMessage("Navigates to '{0}' catalog page")
			},
			trueValue: gs.getMessage('true')
		};

		data.isA11yEnabled = false;
	}

	function normalizeConfig(config) {
		config.cxs_context_config = {
			value: SUPER_SEARCH_CONTEXT_SYS_ID,
			display_value: SUPER_SEARCH_CONTEXT_NAME
		};

		if (!config.results_header_text)
			config.results_header_text = {};
		if (!config.results_header_text.value)
			config.results_header_text.value = 'Articles that may help';
		if (!config.results_header_text.display_value)
			config.results_header_text.display_value = config.results_header_text.value;
		if (config.results_header_text.display_value == 'Related Search Results')
			config.results_header_text.display_value = 'Articles that may help';
		if (config.results_header_text.value == 'Related Search Results')
			config.results_header_text.value = 'Articles that may help';

		if (!config.allow_expand_collapse)
			config.allow_expand_collapse = {};
		if (typeof config.allow_expand_collapse.value === 'undefined' || config.allow_expand_collapse.value === '')
			config.allow_expand_collapse.value = true;

		if (!config.results_per_page)
			config.results_per_page = {};
		if (!config.results_per_page.value)
			config.results_per_page.value = DEFAULT_PAGE_SIZE;

		if (!config.limit)
			config.limit = {};
		if (!config.limit.value)
			config.limit.value = DEFAULT_LIMIT;
	}

	function runSuperSearch(request) {
		var query = cleanQuery(request.query);
		var page = parseIntegerOption(request.page, 1);
		var configuredLimit = parseIntegerOption(request.limit, DEFAULT_LIMIT);
		var limit = clamp(configuredLimit, 1, 50);
		var pageSize = clamp(parseIntegerOption(request.pageSize, DEFAULT_PAGE_SIZE), 1, limit);
		var searchResult;
		var portalRecord = $sp.getPortalRecord();
		var portalSysId = options.portal_sys_id || (portalRecord ? portalRecord.getUniqueValue() : '');
		var engine = new x_1122545_super_0.superSearchEngine();

		searchResult = engine.searchKnowledge({
			query: query,
			page: page,
			pageSize: pageSize,
			candidateLimit: parseIntegerOption(options.candidate_limit, DEFAULT_CANDIDATE_LIMIT),
			includeBodySearch: parseBooleanOption(options.include_body_search, true),
			shortQueryLength: parseIntegerOption(options.short_query_length, 2),
			shortQueryCandidateLimit: parseIntegerOption(options.short_query_candidate_limit, 20),
			shortQueryResultLimit: parseIntegerOption(options.short_query_result_limit, 10),
			articlePageId: options.article_page_id || 'kb_article',
			portalSysId: portalSysId,
			featuredKnowledgeBaseId: options.featured_knowledge_base_id || '',
			featuredKnowledgeBaseLabel: options.featured_knowledge_base_label || '',
			resultFilter: 'knowledge_total'
		});

		if (!hasSearchResults(searchResult))
			searchResult = runContextualFallbackSearch(engine, query, page, pageSize, limit, portalSysId);

		publishSearchAnalytics(query, searchResult, portalSysId, pageSize);
		return buildContextualResponse(searchResult, query, page, pageSize, limit);
	}

	function runContextualFallbackSearch(engine, query, page, pageSize, limit, portalSysId) {
		var fallbackTerms = getContextualFallbackTerms(query);
		var mergedResults = [];
		var seenResults = {};
		var index;
		var resultIndex;
		var fallbackResult;
		var result;
		var startIndex;
		var pagedResults;

		if (fallbackTerms.length === 0)
			return null;

		for (index = 0; index < fallbackTerms.length && mergedResults.length < limit; index++) {
			fallbackResult = engine.searchKnowledge({
				query: fallbackTerms[index],
				page: 1,
				pageSize: limit,
				candidateLimit: parseIntegerOption(options.candidate_limit, DEFAULT_CANDIDATE_LIMIT),
				includeBodySearch: parseBooleanOption(options.include_body_search, true),
				shortQueryLength: parseIntegerOption(options.short_query_length, 2),
				shortQueryCandidateLimit: parseIntegerOption(options.short_query_candidate_limit, 20),
				shortQueryResultLimit: parseIntegerOption(options.short_query_result_limit, 10),
				articlePageId: options.article_page_id || 'kb_article',
				portalSysId: portalSysId,
				featuredKnowledgeBaseId: options.featured_knowledge_base_id || '',
				featuredKnowledgeBaseLabel: options.featured_knowledge_base_label || '',
				resultFilter: 'knowledge_total'
			});

			if (!fallbackResult || !fallbackResult.results)
				continue;

			for (resultIndex = 0; resultIndex < fallbackResult.results.length && mergedResults.length < limit; resultIndex++) {
				result = fallbackResult.results[resultIndex];

				if (!result || !result.sysId || seenResults[result.sysId])
					continue;

				if (!resultHasVisibleFallbackTerm(result, fallbackTerms[index]))
					continue;

				seenResults[result.sysId] = true;
				mergedResults.push(result);
			}
		}

		startIndex = (page - 1) * pageSize;
		pagedResults = mergedResults.slice(startIndex, startIndex + pageSize);

		return {
			query: query,
			normalizedQuery: cleanQuery(query).toLowerCase(),
			querySummaryLabel: '"' + query + '"',
			hasSynonymExpansion: false,
			activeFilter: 'knowledge_total',
			filters: {},
			page: page,
			pageSize: pageSize,
			total: mergedResults.length,
			totalPages: mergedResults.length > 0 ? Math.ceil(mergedResults.length / pageSize) : 0,
			hasMore: startIndex + pagedResults.length < mergedResults.length,
			allResults: mergedResults,
			results: pagedResults,
			contextualFallback: true
		};
	}

	function getContextualFallbackTerms(query) {
		var normalizedQuery = cleanQuery(query).toLowerCase().replace(/[^0-9a-z\u00C0-\u017F_]+/g, ' ');
		var rawTokens = normalizedQuery ? normalizedQuery.split(' ') : [];
		var terms = [];
		var seenTerms = {};
		var index;
		var token;

		appendContextualSynonymTerms(normalizedQuery, terms, seenTerms);

		if (terms.length > 0)
			return terms;

		for (index = 0; index < rawTokens.length; index++) {
			token = rawTokens[index];

			if (!token || token.length < 3 || CONTEXTUAL_STOP_WORDS[token] || seenTerms[token])
				continue;

			appendContextualFallbackTerm(terms, seenTerms, token);
		}

		return terms;
	}

	function appendContextualSynonymTerms(normalizedQuery, terms, seenTerms) {
		var definitionIndex;
		var matchIndex;
		var expansionIndex;
		var definition;

		for (definitionIndex = 0; definitionIndex < CONTEXTUAL_SYNONYM_DEFINITIONS.length; definitionIndex++) {
			definition = CONTEXTUAL_SYNONYM_DEFINITIONS[definitionIndex];

			for (matchIndex = 0; matchIndex < definition.match.length; matchIndex++) {
				if (!contextualPhraseMatches(normalizedQuery, definition.match[matchIndex]))
					continue;

				for (expansionIndex = 0; expansionIndex < definition.expand.length; expansionIndex++)
					appendContextualFallbackTerm(terms, seenTerms, definition.expand[expansionIndex]);

				break;
			}
		}
	}

	function contextualPhraseMatches(normalizedQuery, phrase) {
		var normalizedPhrase = normalizeContextualMatchText(phrase);

		if (!normalizedQuery || !normalizedPhrase)
			return false;

		return (' ' + normalizedQuery + ' ').indexOf(' ' + normalizedPhrase + ' ') > -1;
	}

	function appendContextualFallbackTerm(terms, seenTerms, term) {
		var normalizedTerm = normalizeContextualMatchText(term);

		if (!normalizedTerm || seenTerms[normalizedTerm])
			return;

		seenTerms[normalizedTerm] = true;
		terms.push(term);
	}

	function resultHasVisibleFallbackTerm(result, term) {
		var normalizedNeedle = normalizeContextualMatchText(term);
		var visibleText;
		var needleTokens;
		var index;

		if (!normalizedNeedle)
			return false;

		visibleText = normalizeContextualMatchText([
			result.title,
			result.snippet,
			result.kbName,
			result.categoryName,
			result.number
		].join(' '));

		if (visibleText.indexOf(normalizedNeedle) > -1)
			return true;

		needleTokens = getContextualMatchTokens(normalizedNeedle);
		if (needleTokens.length === 0)
			return false;

		for (index = 0; index < needleTokens.length; index++) {
			if (visibleText.indexOf(needleTokens[index]) === -1)
				return false;
		}

		return true;
	}

	function getContextualMatchTokens(value) {
		var tokens = normalizeContextualMatchText(value).split(' ');
		var filteredTokens = [];
		var index;
		var token;

		for (index = 0; index < tokens.length; index++) {
			token = tokens[index];

			if (!token || token.length < 3 || CONTEXTUAL_STOP_WORDS[token])
				continue;

			filteredTokens.push(token);
		}

		return filteredTokens;
	}

	function normalizeContextualMatchText(value) {
		return cleanQuery(value)
			.toLowerCase()
			.replace(/<[^>]+>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, '\'')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/[^0-9a-z\u00C0-\u017F_]+/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/^\s+|\s+$/g, '');
	}

	function hasSearchResults(searchResult) {
		if (!searchResult)
			return false;

		if (typeof searchResult.total !== 'undefined')
			return parseInt(searchResult.total, 10) > 0;

		return searchResult.results && searchResult.results.length > 0;
	}

	function buildContextualResponse(searchResult, query, page, pageSize, limit) {
		var shapedResults = [];
		var sourceResults = searchResult && searchResult.results ? searchResult.results : [];
		var startIndex = (page - 1) * pageSize;
		var remaining = Math.max(limit - startIndex, 0);
		var total = Math.min(searchResult && searchResult.total ? searchResult.total : 0, limit);
		var hasMore;
		var index;

		for (index = 0; index < sourceResults.length && index < remaining; index++)
			shapedResults.push(shapeKnowledgeResult(sourceResults[index], startIndex + index));

		hasMore = (startIndex + shapedResults.length) < total;

		return {
			results: shapedResults,
			request: {
				query: {
					freetext: query
				},
				meta: {
					page: page,
					pageSize: pageSize,
					limit: limit
				}
			},
			meta: {
				has_more_results: hasMore,
				page: page,
				page_size: pageSize,
				total: total,
				tsQueryId: ''
			}
		};
	}

	function shapeKnowledgeResult(result, absoluteIndex) {
		var sysId = result && result.sysId ? result.sysId : '';

		return {
			id: 'kb_knowledge:' + sysId,
			domId: 'super_cxs_result_' + sysId,
			sysId: sysId,
			resultType: 'knowledge',
			resultTypeLabel: result.resultTypeLabel || 'Knowledge article',
			number: result.number || '',
			title: result.title || '',
			titleHtml: result.titleHtml || result.title || '',
			snippet: result.snippet || '',
			snippetHtml: result.snippetHtml || result.snippet || '',
			kbName: result.kbName || '',
			categoryName: result.categoryName || '',
			updatedOnDisplay: result.updatedOnDisplay || '',
			link: result.url || '',
			sp_link: result.url || '',
			meta: {
				source: 'knowledge',
				score: absoluteIndex + 1,
				relevance: {}
			},
			searchResultActions: {}
		};
	}

	function registerKnowledgeView(articleId, tsQueryId) {
		var kb = new GlideRecordSecure('kb_knowledge');
		if (!kb.get(articleId))
			return;

		data.viewCount = parseInt(kb.getValue('sys_view_count'), 10) || 0;
	}

	function getKBViewModel() {
		if (typeof global !== 'undefined' && global.KBViewModel)
			return new global.KBViewModel();

		return new KBViewModel();
	}

	function publishSearchAnalytics(query, searchResult, portalSysId, pageSize) {
		var normalizedQuery = cleanQuery(query);
		var analyticsResults = [];
		var displayedResults = searchResult && searchResult.results ? searchResult.results : [];
		var index;

		if (!normalizedQuery)
			return;

		try {
			for (index = 0; index < displayedResults.length && index < pageSize; index++) {
				if (displayedResults[index].resultType !== 'knowledge')
					continue;

				analyticsResults.push({
					sysId: displayedResults[index].sysId || '',
					resultType: displayedResults[index].resultType || ''
				});
			}

			new global.SuperSearchAnalyticsBridge().publishSearch(JSON.stringify({
				query: normalizedQuery,
				portalId: portalSysId || '',
				pageId: 'record_producer',
				pageSize: pageSize,
				hasResults: searchResult && parseInt(searchResult.total, 10) > 0,
				searchResults: analyticsResults
			}));
		} catch (ex) {
			gs.warn('Super Search: failed to publish contextual search analytics for query "{0}". {1}', normalizedQuery, ex.message || ex);
		}
	}

	function cleanQuery(value) {
		return String(value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
	}

	function parseIntegerOption(value, defaultValue) {
		var parsed = parseInt(value, 10);
		return isNaN(parsed) ? defaultValue : parsed;
	}

	function parseBooleanOption(value, defaultValue) {
		if (value === true || value === false)
			return value;
		if (typeof value === 'undefined' || value === null || value === '')
			return defaultValue;
		return String(value) === 'true';
	}

	function clamp(value, minValue, maxValue) {
		var parsed = parseIntegerOption(value, minValue);
		if (parsed < minValue)
			return minValue;
		if (parsed > maxValue)
			return maxValue;
		return parsed;
	}
})();
