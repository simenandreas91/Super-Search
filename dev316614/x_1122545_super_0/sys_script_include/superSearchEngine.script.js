var superSearchEngine = Class.create();
superSearchEngine.prototype = {
    initialize: function() {
        this.KNOWLEDGE_TABLE = 'kb_knowledge';
        this.CATALOG_TABLE = 'sc_cat_item';
        this.NEWS_TABLE = 'sn_cd_content_base';
        this.USER_TABLE = 'sys_user';
        this.TOPIC_TABLE = 'topic';
        this.SYNONYM_TABLE = 'ts_synonym_set';
        this.CONNECTED_CONTENT_TABLE = 'm2m_connected_content';
        this.PORTAL_TAXONOMY_TABLE = 'm2m_sp_portal_taxonomy';
        this.DEFAULT_PAGE_SIZE = 10;
        this.DEFAULT_CANDIDATE_LIMIT = 75;
        this.MAX_PAGE_SIZE = 50;
        this.MAX_CANDIDATE_LIMIT = 200;
        this.MAX_SYNONYM_RECORDS = 100;
        this.MAX_SEARCH_TERMS = 8;
        this.DEFAULT_SHORT_QUERY_LENGTH = 2;
        this.DEFAULT_SHORT_QUERY_CANDIDATE_LIMIT = 20;
        this.DEFAULT_SHORT_QUERY_RESULT_LIMIT = 10;
        this.DEFAULT_ARTICLE_PAGE_ID = 'kb_article';
        this.DEFAULT_CATALOG_ITEM_PAGE_ID = 'sc_cat_item';
        this.DEFAULT_NEWS_PAGE_ID = 'cd_news_article';
        this.DEFAULT_USER_PROFILE_PAGE_ID = 'user_profile';
        this.DEFAULT_TOPIC_PAGE_ID = 'emp_taxonomy_topic';
        this.DEFAULT_NEWS_CONTENT_TYPE_ID = '4880186c53202110a489ddeeff7b129a';
        this.KNOWLEDGE_FALLBACK_MIN_QUERY_TOKENS = 2;
        this.KNOWLEDGE_FALLBACK_MIN_TOKEN_LENGTH = 2;
        this.KNOWLEDGE_FALLBACK_REQUIRED_RATIO = 0.75;
        this.KNOWLEDGE_FALLBACK_MAX_CANDIDATES = 30;
        this.NEWS_FALLBACK_MIN_QUERY_TOKENS = 3;
        this.NEWS_FALLBACK_MIN_TOKEN_LENGTH = 3;
        this.NEWS_FALLBACK_REQUIRED_RATIO = 0.7;
        this.NEWS_FALLBACK_MAX_CANDIDATES = 25;
        this.NEWS_FALLBACK_SCORE_PENALTY = 20;
        this.NEWS_FALLBACK_STOP_WORDS = {
            'a': true,
            'an': true,
            'and': true,
            'av': true,
            'den': true,
            'denne': true,
            'det': true,
            'dette': true,
            'en': true,
            'et': true,
            'for': true,
            'fra': true,
            'i': true,
            'med': true,
            'og': true,
            'pa': true,
            'på': true,
            'som': true,
            'the': true,
            'til': true
        };
        this.SNIPPET_LENGTH = 180;
    },

    searchKnowledge: function(options) {
        var request = options || {};
        var query = this._cleanQuery(request.query);
        var normalizedQuery = this._normalizeQuery(query);
        var pageSize = this._clampInteger(request.pageSize, this.DEFAULT_PAGE_SIZE, 1, this.MAX_PAGE_SIZE);
        var candidateLimit = this._clampInteger(request.candidateLimit, this.DEFAULT_CANDIDATE_LIMIT, 1, this.MAX_CANDIDATE_LIMIT);
        var articlePageId = this._safeString(request.articlePageId) || this.DEFAULT_ARTICLE_PAGE_ID;
        var catalogItemPageId = this._safeString(request.catalogItemPageId) || this.DEFAULT_CATALOG_ITEM_PAGE_ID;
        var newsPageId = this._safeString(request.newsPageId) || this.DEFAULT_NEWS_PAGE_ID;
        var newsContentTypeId = this._safeString(request.newsContentTypeId) || this.DEFAULT_NEWS_CONTENT_TYPE_ID;
        var synonymDictionaryId = this._safeString(request.synonymDictionaryId);
        var portalSysId = this._safeString(request.portalSysId);
        var featuredKnowledgeBaseId = this._safeString(request.featuredKnowledgeBaseId);
        var featuredKnowledgeBaseLabel = this._cleanQuery(request.featuredKnowledgeBaseLabel);
        var featuredTopicId = this._safeString(request.featuredTopicId);
        var resultFilter = this._normalizeResultFilter(request.resultFilter);
        var includeBodySearch = this._toBoolean(request.includeBodySearch);
        var shortQueryLength = this._clampInteger(request.shortQueryLength, this.DEFAULT_SHORT_QUERY_LENGTH, 1, 10);
        var shortQueryCandidateLimit = this._clampInteger(request.shortQueryCandidateLimit, this.DEFAULT_SHORT_QUERY_CANDIDATE_LIMIT, 1, this.MAX_CANDIDATE_LIMIT);
        var shortQueryResultLimit = this._clampInteger(request.shortQueryResultLimit, this.DEFAULT_SHORT_QUERY_RESULT_LIMIT, 1, this.MAX_CANDIDATE_LIMIT);
        var requestedPage = this._clampInteger(request.page, 1, 1, 10000);
        var response = {
            query: query,
            normalizedQuery: normalizedQuery,
            querySummaryLabel: '"' + query + '"',
            hasSynonymExpansion: false,
            activeFilter: resultFilter,
            filters: this._buildEmptyFilters(featuredKnowledgeBaseId, featuredKnowledgeBaseLabel),
            page: requestedPage,
            pageSize: pageSize,
            total: 0,
            totalPages: 0,
            hasMore: false,
            allResults: [],
            results: []
        };
        var context;
        var queryProfile;
        var searchStrategy;
        var scoredCandidates;
        var pagedCandidates;
        var startIndex;

        if (!normalizedQuery) {
            return response;
        }

        context = this._buildContext(articlePageId, catalogItemPageId, newsPageId, newsContentTypeId, portalSysId, featuredKnowledgeBaseId, featuredKnowledgeBaseLabel, featuredTopicId);
        queryProfile = this._buildQueryProfile(query, normalizedQuery, synonymDictionaryId);
        searchStrategy = this._buildSearchStrategy(queryProfile, candidateLimit, pageSize, includeBodySearch, shortQueryLength, shortQueryCandidateLimit, shortQueryResultLimit);
        response.querySummaryLabel = this._buildQuerySummaryLabel(queryProfile.searchTerms);
        response.hasSynonymExpansion = queryProfile.synonymTerms.length > 0;
        response.pageSize = searchStrategy.pageSize;
        scoredCandidates = this._getScoredCandidates(context, queryProfile, searchStrategy.candidateLimit, searchStrategy.includeBodySearch);
        scoredCandidates = this._limitResults(scoredCandidates, searchStrategy.resultLimit);
        response.filters = this._buildFilterSummary(scoredCandidates, context);
        response.allResults = this._shapeResults(scoredCandidates, queryProfile, context);
        scoredCandidates = this._applyResultFilter(scoredCandidates, resultFilter);
        response.total = scoredCandidates.length;
        response.totalPages = response.total > 0 ? Math.ceil(response.total / response.pageSize) : 0;

        if (response.totalPages > 0 && requestedPage > response.totalPages) {
            response.page = response.totalPages;
        }

        if (response.totalPages === 0) {
            response.page = 1;
            return response;
        }

        startIndex = (response.page - 1) * response.pageSize;
        pagedCandidates = scoredCandidates.slice(startIndex, startIndex + response.pageSize);
        response.hasMore = response.page < response.totalPages;
        response.results = this._shapeResults(pagedCandidates, queryProfile, context);

        return response;
    },

    _buildContext: function(articlePageId, catalogItemPageId, newsPageId, newsContentTypeId, portalSysId, featuredKnowledgeBaseId, featuredKnowledgeBaseLabel, featuredTopicId) {
        var knowledgeRecord = new GlideRecordSecure(this.KNOWLEDGE_TABLE);
        var catalogRecord = new GlideRecordSecure(this.CATALOG_TABLE);
        var newsRecord = new GlideRecordSecure(this.NEWS_TABLE);
        var userRecord = new GlideRecordSecure(this.USER_TABLE);
        var topicRecord = new GlideRecordSecure(this.TOPIC_TABLE);
        var portalTaxonomyIds = this._getPortalTaxonomyIds(portalSysId);
        var excludedTopicIds = this._getExcludedTopicIdsForFeaturedTopic(featuredTopicId, portalTaxonomyIds);
        var currentDateTime = new GlideDateTime();
        var todayValue = currentDateTime.getValue().substring(0, 10);

        return {
            articlePageId: articlePageId,
            catalogItemPageId: catalogItemPageId,
            newsPageId: newsPageId,
            userProfilePageId: this.DEFAULT_USER_PROFILE_PAGE_ID,
            topicPageId: this.DEFAULT_TOPIC_PAGE_ID,
            newsContentTypeId: newsContentTypeId,
            portalSysId: portalSysId,
            portalTaxonomyIds: portalTaxonomyIds,
            featuredKnowledgeBaseId: featuredKnowledgeBaseId,
            featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
            featuredTopicId: featuredTopicId,
            excludedTopicIds: excludedTopicIds,
            todayValue: todayValue,
            knowledgeFields: {
                number: knowledgeRecord.isValidField('number'),
                shortDescription: knowledgeRecord.isValidField('short_description'),
                meta: knowledgeRecord.isValidField('meta'),
                keywords: knowledgeRecord.isValidField('keywords'),
                text: knowledgeRecord.isValidField('text'),
                language: knowledgeRecord.isValidField('language'),
                knowledgeBase: knowledgeRecord.isValidField('kb_knowledge_base'),
                category: knowledgeRecord.isValidField('kb_category'),
                workflowState: knowledgeRecord.isValidField('workflow_state'),
                published: knowledgeRecord.isValidField('published'),
                validTo: knowledgeRecord.isValidField('valid_to'),
                updatedOn: knowledgeRecord.isValidField('sys_updated_on')
            },
            catalogFields: {
                name: catalogRecord.isValidField('name'),
                shortDescription: catalogRecord.isValidField('short_description'),
                description: catalogRecord.isValidField('description'),
                meta: catalogRecord.isValidField('meta'),
                category: catalogRecord.isValidField('category'),
                catalog: catalogRecord.isValidField('sc_catalogs'),
                updatedOn: catalogRecord.isValidField('sys_updated_on'),
                className: catalogRecord.isValidField('sys_class_name'),
                picture: catalogRecord.isValidField('picture'),
                active: catalogRecord.isValidField('active'),
                hiddenInServicePortal: catalogRecord.isValidField('hidden_sp'),
                visibleInServicePortal: catalogRecord.isValidField('visible_sp'),
                availability: catalogRecord.isValidField('availability')
            },
            newsFields: {
                title: newsRecord.isValidField('title'),
                updatedOn: newsRecord.isValidField('sys_updated_on'),
                active: newsRecord.isValidField('active'),
                contentType: newsRecord.isValidField('content_type')
            },
            userFields: {
                name: userRecord.isValidField('name'),
                title: userRecord.isValidField('title'),
                department: userRecord.isValidField('department'),
                email: userRecord.isValidField('email'),
                userName: userRecord.isValidField('user_name'),
                updatedOn: userRecord.isValidField('sys_updated_on'),
                active: userRecord.isValidField('active')
            },
            topicFields: {
                name: topicRecord.isValidField('name'),
                description: topicRecord.isValidField('description'),
                taxonomy: topicRecord.isValidField('taxonomy'),
                parentTopic: topicRecord.isValidField('parent_topic'),
                updatedOn: topicRecord.isValidField('sys_updated_on'),
                active: topicRecord.isValidField('active')
            }
        };
    },

    _buildQueryProfile: function(query, normalizedQuery, synonymDictionaryId) {
        var searchTerms = this._getExpandedSearchTerms(query, normalizedQuery, synonymDictionaryId);

        return {
            primaryTerm: searchTerms[0],
            synonymTerms: searchTerms.slice(1),
            searchTerms: searchTerms
        };
    },

    _buildSearchStrategy: function(queryProfile, candidateLimit, pageSize, includeBodySearch, shortQueryLength, shortQueryCandidateLimit, shortQueryResultLimit) {
        var primaryLength = queryProfile && queryProfile.primaryTerm && queryProfile.primaryTerm.normalizedValue ?
            queryProfile.primaryTerm.normalizedValue.length : 0;
        var isShortQuery = primaryLength > 0 && primaryLength <= shortQueryLength;

        return {
            isShortQuery: isShortQuery,
            candidateLimit: isShortQuery ? Math.min(candidateLimit, shortQueryCandidateLimit) : candidateLimit,
            resultLimit: isShortQuery ? shortQueryResultLimit : 0,
            pageSize: isShortQuery ? Math.min(pageSize, shortQueryResultLimit) : pageSize,
            includeBodySearch: isShortQuery ? false : includeBodySearch
        };
    },

    _limitResults: function(candidates, resultLimit) {
        if (!resultLimit || resultLimit < 1 || candidates.length <= resultLimit) {
            return candidates;
        }

        return candidates.slice(0, resultLimit);
    },

    _buildQuerySummaryLabel: function(searchTerms) {
        var parts = [];
        var index;

        if (!searchTerms || searchTerms.length === 0) {
            return '""';
        }

        for (index = 0; index < searchTerms.length; index++) {
            parts.push('"' + searchTerms[index].value + '"');
        }

        if (parts.length === 1) {
            return parts[0];
        }

        if (parts.length === 2) {
            return parts[0] + ' eller ' + parts[1];
        }

        return parts.slice(0, parts.length - 1).join(', ') + ' eller ' + parts[parts.length - 1];
    },

    _getExpandedSearchTerms: function(query, normalizedQuery, synonymDictionaryId) {
        var terms = [];
        var uniqueTerms = {};
        var synonymTerms = this._getMatchedSynonymTerms(normalizedQuery, synonymDictionaryId);
        var index;

        this._appendSearchTerm(terms, uniqueTerms, query, true);

        for (index = 0; index < synonymTerms.length && terms.length < this.MAX_SEARCH_TERMS; index++) {
            this._appendSearchTerm(terms, uniqueTerms, synonymTerms[index], false);
        }

        return terms;
    },

    _appendSearchTerm: function(terms, uniqueTerms, value, isPrimary) {
        var cleanValue = this._cleanQuery(value);
        var normalizedValue = this._normalizeQuery(cleanValue);

        if (!normalizedValue || uniqueTerms[normalizedValue]) {
            return;
        }

        uniqueTerms[normalizedValue] = true;
        terms.push({
            value: cleanValue,
            normalizedValue: normalizedValue,
            tokens: this._tokenize(normalizedValue),
            isPrimary: isPrimary === true
        });
    },

    _getMatchedSynonymTerms: function(normalizedQuery, synonymDictionaryId) {
        var synonymRecord = new GlideRecord(this.SYNONYM_TABLE);
        var tokens = this._tokenize(normalizedQuery);
        var tokenMap = this._buildTokenMap(tokens);
        var synonymTerms = [];
        var uniqueTerms = {};
        var synonymDefinition;
        var index;

        if (!normalizedQuery || !synonymRecord.isValid() || !synonymRecord.isValidField('synset')) {
            return synonymTerms;
        }

        if (synonymRecord.isValidField('active')) {
            synonymRecord.addActiveQuery();
        }

        if (synonymDictionaryId && synonymRecord.isValidField('dictionary')) {
            synonymRecord.addQuery('dictionary', synonymDictionaryId);
        }

        synonymRecord.addNotNullQuery('synset');
        this._applySynonymPrefilter(synonymRecord, normalizedQuery, tokens);
        synonymRecord.setLimit(this.MAX_SYNONYM_RECORDS);
        synonymRecord.query();

        while (synonymRecord.next()) {
            synonymDefinition = this._parseSynsetDefinition(synonymRecord.getValue('synset'));

            if (!this._synonymSetMatchesQuery(normalizedQuery, tokenMap, synonymDefinition.matchTerms)) {
                continue;
            }

            for (index = 0; index < synonymDefinition.expansionTerms.length; index++) {
                if (this._queryMatchesSynonymTerm(normalizedQuery, tokenMap, synonymDefinition.expansionTerms[index]) ||
                    uniqueTerms[synonymDefinition.expansionTerms[index].normalizedValue]) {
                    continue;
                }

                uniqueTerms[synonymDefinition.expansionTerms[index].normalizedValue] = true;
                synonymTerms.push(synonymDefinition.expansionTerms[index].value);
            }
        }

        return synonymTerms;
    },

    _applySynonymPrefilter: function(record, normalizedQuery, tokens) {
        var condition;
        var index;
        var token;

        condition = record.addQuery('synset', 'CONTAINS', normalizedQuery);

        for (index = 0; index < tokens.length; index++) {
            token = tokens[index];

            if (!token || token.length < 2 || token === normalizedQuery) {
                continue;
            }

            condition.addOrCondition('synset', 'CONTAINS', token);
        }
    },

    _parseSynsetDefinition: function(value) {
        var parts = this._safeString(value).split('=>');
        var leftTerms;
        var rightTerms;

        if (parts.length > 1) {
            leftTerms = this._splitSynsetTerms(parts.shift());
            rightTerms = this._splitSynsetTerms(parts.join('=>'));

            return {
                matchTerms: leftTerms,
                expansionTerms: rightTerms
            };
        }

        leftTerms = this._splitSynsetTerms(value);

        return {
            matchTerms: leftTerms,
            expansionTerms: leftTerms
        };
    },

    _splitSynsetTerms: function(value) {
        var rawTerms = this._safeString(value).split(',');
        var cleanTerms = [];
        var uniqueTerms = {};
        var index;
        var cleanValue;
        var normalizedTerm;

        for (index = 0; index < rawTerms.length; index++) {
            cleanValue = this._cleanQuery(rawTerms[index]);
            normalizedTerm = this._normalizeQuery(cleanValue);

            if (!normalizedTerm || uniqueTerms[normalizedTerm]) {
                continue;
            }

            uniqueTerms[normalizedTerm] = true;
            cleanTerms.push({
                value: cleanValue,
                normalizedValue: normalizedTerm
            });
        }

        return cleanTerms;
    },

    _synonymSetMatchesQuery: function(normalizedQuery, tokenMap, setTerms) {
        var index;

        for (index = 0; index < setTerms.length; index++) {
            if (this._queryMatchesSynonymTerm(normalizedQuery, tokenMap, setTerms[index])) {
                return true;
            }
        }

        return false;
    },

    _queryMatchesSynonymTerm: function(normalizedQuery, tokenMap, synonymTerm) {
        var normalizedSynonymTerm;

        if (!normalizedQuery || !synonymTerm) {
            return false;
        }

        normalizedSynonymTerm = synonymTerm.normalizedValue || this._normalizeQuery(synonymTerm);

        if (normalizedQuery === normalizedSynonymTerm) {
            return true;
        }

        if (normalizedSynonymTerm.indexOf(' ') === -1 && tokenMap[normalizedSynonymTerm]) {
            return true;
        }

        return this._containsWholePhrase(normalizedQuery, normalizedSynonymTerm);
    },

    _containsWholePhrase: function(text, phrase) {
        var escapedPhrase;
        var expression;

        if (!text || !phrase) {
            return false;
        }

        escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expression = new RegExp('(^|\\s)' + escapedPhrase + '(\\s|$)');

        return expression.test(text);
    },

    _buildTokenMap: function(tokens) {
        var tokenMap = {};
        var index;

        for (index = 0; index < tokens.length; index++) {
            if (tokens[index]) {
                tokenMap[tokens[index]] = true;
            }
        }

        return tokenMap;
    },

    _getScoredCandidates: function(context, queryProfile, candidateLimit, includeBodySearch) {
        var knowledgeLimit = this._clampInteger(Math.ceil(candidateLimit * 0.5), candidateLimit, 1, candidateLimit);
        var catalogLimit = this._clampInteger(Math.ceil(candidateLimit * 0.3), candidateLimit, 1, candidateLimit);
        var newsLimit = this._clampInteger(Math.ceil(candidateLimit * 0.25), candidateLimit, 1, candidateLimit);
        var userLimit = this._clampInteger(Math.ceil(candidateLimit * 0.35), candidateLimit, 1, candidateLimit);
        var topicLimit = this._clampInteger(Math.ceil(candidateLimit * 0.25), candidateLimit, 1, candidateLimit);
        var knowledgeCandidates = this._getKnowledgeCandidates(context, queryProfile, knowledgeLimit, includeBodySearch);
        var catalogCandidates = this._getCatalogCandidates(context, queryProfile, catalogLimit, includeBodySearch);
        var newsCandidates = this._getNewsCandidates(context, queryProfile, newsLimit);
        var userCandidates = this._getUserCandidates(context, queryProfile, userLimit);
        var topicCandidates = this._getTopicCandidates(context, queryProfile, topicLimit, includeBodySearch);
        var mergedCandidates = knowledgeCandidates.concat(catalogCandidates, newsCandidates, userCandidates, topicCandidates);

        return this._scoreAndSortCandidates(mergedCandidates, queryProfile);
    },

    _getKnowledgeCandidates: function(context, queryProfile, candidateLimit, includeBodySearch) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions = this._buildKnowledgePassDefinitions(context, queryProfile, includeBodySearch);
        var index;

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectKnowledgeCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        if (candidates.length === 0) {
            this._collectFallbackKnowledgeCandidates(context, queryProfile, candidateLimit, candidateMap, candidates);
        }

        return candidates;
    },

    _getCatalogCandidates: function(context, queryProfile, candidateLimit, includeBodySearch) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions;
        var index;

        if (context.portalTaxonomyIds.length === 0) {
            return candidates;
        }

        passDefinitions = this._buildCatalogPassDefinitions(context, queryProfile, includeBodySearch);

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectCatalogCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        return this._filterConnectedCatalogCandidates(candidates, context);
    },

    _getNewsCandidates: function(context, queryProfile, candidateLimit) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions = this._buildNewsPassDefinitions(context, queryProfile);
        var index;

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectNewsCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        if (candidates.length === 0) {
            this._collectFallbackNewsCandidates(context, queryProfile, candidateLimit, candidateMap, candidates);
        }

        return candidates;
    },

    _getUserCandidates: function(context, queryProfile, candidateLimit) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions = this._buildUserPassDefinitions(context, queryProfile);
        var index;

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectUserCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        return candidates;
    },

    _getTopicCandidates: function(context, queryProfile, candidateLimit, includeBodySearch) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions;
        var index;

        if (context.portalTaxonomyIds.length === 0) {
            return candidates;
        }

        passDefinitions = this._buildTopicPassDefinitions(context, queryProfile, includeBodySearch);

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectTopicCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        return candidates;
    },

    _buildKnowledgePassDefinitions: function(context, queryProfile, includeBodySearch) {
        var passes = [];
        var seenPasses = {};
        var metadataFields = [];

        if (context.knowledgeFields.number) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'number', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (context.knowledgeFields.shortDescription) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'short_description', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (context.knowledgeFields.meta) {
            metadataFields.push('meta');
        }

        if (context.knowledgeFields.keywords) {
            metadataFields.push('keywords');
        }

        if (metadataFields.length > 0) {
            this._appendMultiFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, metadataFields, 'CONTAINS');
        }

        if (includeBodySearch && context.knowledgeFields.text) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'text', ['CONTAINS']);
        }

        return passes;
    },

    _buildCatalogPassDefinitions: function(context, queryProfile, includeBodySearch) {
        var passes = [];
        var seenPasses = {};
        var metadataFields = [];

        if (context.catalogFields.name) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'name', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (context.catalogFields.shortDescription) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'short_description', ['CONTAINS']);
        }

        if (context.catalogFields.meta) {
            metadataFields.push('meta');
        }

        if (metadataFields.length > 0) {
            this._appendMultiFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, metadataFields, 'CONTAINS');
        }

        if (includeBodySearch && context.catalogFields.description) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'description', ['CONTAINS']);
        }

        return passes;
    },

    _buildNewsPassDefinitions: function(context, queryProfile) {
        var passes = [];
        var seenPasses = {};

        if (context.newsFields.title) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'title', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        return passes;
    },

    _buildUserPassDefinitions: function(context, queryProfile) {
        var passes = [];
        var seenPasses = {};

        if (context.userFields.name) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'name', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (context.userFields.title) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'title', ['STARTSWITH', 'CONTAINS']);
        }

        if (context.userFields.department) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'department.name', ['STARTSWITH', 'CONTAINS']);
        }

        if (context.userFields.userName) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'user_name', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (context.userFields.email) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'email', ['STARTSWITH', 'CONTAINS']);
        }

        return passes;
    },

    _buildTopicPassDefinitions: function(context, queryProfile, includeBodySearch) {
        var passes = [];
        var seenPasses = {};

        if (context.topicFields.name) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'name', ['=', 'STARTSWITH', 'CONTAINS']);
        }

        if (includeBodySearch && context.topicFields.description) {
            this._appendFieldPassDefinitions(passes, seenPasses, queryProfile.searchTerms, 'description', ['CONTAINS']);
        }

        return passes;
    },

    _appendFieldPassDefinitions: function(passes, seenPasses, searchTerms, fieldName, operators) {
        var termIndex;
        var operatorIndex;

        for (termIndex = 0; termIndex < searchTerms.length; termIndex++) {
            for (operatorIndex = 0; operatorIndex < operators.length; operatorIndex++) {
                this._appendPassDefinition(passes, seenPasses, {
                    field: fieldName,
                    operator: operators[operatorIndex],
                    value: searchTerms[termIndex].value
                });
            }
        }
    },

    _appendMultiFieldPassDefinitions: function(passes, seenPasses, searchTerms, fields, operator) {
        var termIndex;

        for (termIndex = 0; termIndex < searchTerms.length; termIndex++) {
            this._appendPassDefinition(passes, seenPasses, {
                fields: fields,
                operator: operator,
                value: searchTerms[termIndex].value
            });
        }
    },

    _appendPassDefinition: function(passes, seenPasses, passDefinition) {
        var signature = this._getPassDefinitionSignature(passDefinition);

        if (seenPasses[signature]) {
            return;
        }

        seenPasses[signature] = true;
        passes.push(passDefinition);
    },

    _getPassDefinitionSignature: function(passDefinition) {
        var fields = passDefinition.fields ? passDefinition.fields.join('|') : passDefinition.field;

        return fields + '::' + passDefinition.operator + '::' + passDefinition.value;
    },

    _collectKnowledgeCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        var record = new GlideRecordSecure(this.KNOWLEDGE_TABLE);
        var remainingCapacity = candidateLimit - candidates.length;

        if (remainingCapacity <= 0) {
            return;
        }

        this._applyKnowledgeBaseFilters(record, context);
        this._applyPassDefinition(record, passDefinition);

        if (context.knowledgeFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(remainingCapacity);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            this._storeKnowledgeCandidate(record, context, candidateMap, candidates);
        }
    },

    _collectFallbackKnowledgeCandidates: function(context, queryProfile, candidateLimit, candidateMap, candidates) {
        var primaryTokens = queryProfile && queryProfile.primaryTerm ? queryProfile.primaryTerm.tokens : [];
        var fallbackTokens = this._getFallbackKnowledgeTokens(primaryTokens);
        var requiredMatchCount;
        var remainingCapacity = candidateLimit - candidates.length;
        var probeLimit;
        var record;
        var condition;
        var index;
        var candidate;

        if (remainingCapacity <= 0 ||
            primaryTokens.length < this.KNOWLEDGE_FALLBACK_MIN_QUERY_TOKENS ||
            fallbackTokens.length < this.KNOWLEDGE_FALLBACK_MIN_QUERY_TOKENS) {
            return;
        }

        requiredMatchCount = this._getFallbackKnowledgeRequiredMatchCount(fallbackTokens.length);
        probeLimit = Math.min(this.KNOWLEDGE_FALLBACK_MAX_CANDIDATES, Math.max(remainingCapacity * 5, remainingCapacity));
        record = new GlideRecordSecure(this.KNOWLEDGE_TABLE);

        this._applyKnowledgeBaseFilters(record, context);
        condition = record.addQuery('short_description', 'CONTAINS', fallbackTokens[0]);

        for (index = 1; index < fallbackTokens.length; index++) {
            condition.addOrCondition('short_description', 'CONTAINS', fallbackTokens[index]);
        }

        if (context.knowledgeFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(probeLimit);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            if (!this._knowledgeShortDescriptionMatchesFallback(record.getValue('short_description'), fallbackTokens, requiredMatchCount)) {
                continue;
            }

            candidate = this._storeKnowledgeCandidate(record, context, candidateMap, candidates);

            if (candidate) {
                candidate.fallbackMatch = true;
            }
        }
    },

    _collectCatalogCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        // Portal search should mirror catalog availability in the portal, not raw table ACLs on sc_cat_item.
        var record = new GlideRecord(this.CATALOG_TABLE);
        var remainingCapacity = candidateLimit - candidates.length;

        if (remainingCapacity <= 0) {
            return;
        }

        this._applyCatalogBaseFilters(record, context);
        this._applyPassDefinition(record, passDefinition);

        if (context.catalogFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(remainingCapacity);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            this._storeCatalogCandidate(record, context, candidateMap, candidates);
        }
    },

    _collectNewsCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        var record = new GlideRecordSecure(this.NEWS_TABLE);
        var remainingCapacity = candidateLimit - candidates.length;

        if (remainingCapacity <= 0) {
            return;
        }

        this._applyNewsBaseFilters(record, context);
        this._applyPassDefinition(record, passDefinition);

        if (context.newsFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(remainingCapacity);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            this._storeNewsCandidate(record, context, candidateMap, candidates);
        }
    },

    _collectFallbackNewsCandidates: function(context, queryProfile, candidateLimit, candidateMap, candidates) {
        var primaryTokens = queryProfile && queryProfile.primaryTerm ? queryProfile.primaryTerm.tokens : [];
        var fallbackTokens = this._getFallbackNewsTokens(primaryTokens);
        var requiredMatchCount;
        var remainingCapacity = candidateLimit - candidates.length;
        var probeLimit;
        var record;
        var condition;
        var index;
        var candidate;

        if (remainingCapacity <= 0 ||
            primaryTokens.length < this.NEWS_FALLBACK_MIN_QUERY_TOKENS ||
            fallbackTokens.length < 2) {
            return;
        }

        requiredMatchCount = this._getFallbackNewsRequiredMatchCount(fallbackTokens.length);
        probeLimit = Math.min(this.NEWS_FALLBACK_MAX_CANDIDATES, Math.max(remainingCapacity * 5, remainingCapacity));
        record = new GlideRecordSecure(this.NEWS_TABLE);

        this._applyNewsBaseFilters(record, context);
        condition = record.addQuery('title', 'CONTAINS', fallbackTokens[0]);

        for (index = 1; index < fallbackTokens.length; index++) {
            condition.addOrCondition('title', 'CONTAINS', fallbackTokens[index]);
        }

        if (context.newsFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(probeLimit);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            if (!this._newsTitleMatchesFallback(record.getValue('title'), fallbackTokens, requiredMatchCount)) {
                continue;
            }

            candidate = this._storeNewsCandidate(record, context, candidateMap, candidates);

            if (candidate) {
                candidate.fallbackMatch = true;
            }
        }
    },

    _collectUserCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        var record = new GlideRecordSecure(this.USER_TABLE);
        var remainingCapacity = candidateLimit - candidates.length;

        if (remainingCapacity <= 0) {
            return;
        }

        this._applyUserBaseFilters(record, context);
        this._applyPassDefinition(record, passDefinition);

        record.orderBy('name');

        if (context.userFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(remainingCapacity);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            this._storeUserCandidate(record, context, candidateMap, candidates);
        }
    },

    _collectTopicCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        // Topic visibility in search should follow portal taxonomy and active state, not topic table ACLs.
        var record = new GlideRecord(this.TOPIC_TABLE);
        var remainingCapacity = candidateLimit - candidates.length;

        if (remainingCapacity <= 0) {
            return;
        }

        this._applyTopicBaseFilters(record, context);
        this._applyPassDefinition(record, passDefinition);

        if (context.topicFields.updatedOn) {
            record.orderByDesc('sys_updated_on');
        }

        record.setLimit(remainingCapacity);
        record.query();

        while (record.next() && candidates.length < candidateLimit) {
            this._storeTopicCandidate(record, context, candidateMap, candidates);
        }
    },

    _applyPassDefinition: function(record, passDefinition) {
        var condition;
        var index;

        if (passDefinition.field) {
            record.addQuery(passDefinition.field, passDefinition.operator, passDefinition.value);
            return;
        }

        if (!passDefinition.fields || passDefinition.fields.length === 0) {
            return;
        }

        for (index = 0; index < passDefinition.fields.length; index++) {
            if (index === 0) {
                condition = record.addQuery(passDefinition.fields[index], passDefinition.operator, passDefinition.value);
            } else {
                condition.addOrCondition(passDefinition.fields[index], passDefinition.operator, passDefinition.value);
            }
        }
    },

    _applyKnowledgeBaseFilters: function(record, context) {
        var validToQuery;

        if (record.isValidField('active')) {
            record.addActiveQuery();
        }

        if (context.knowledgeFields.workflowState) {
            record.addQuery('workflow_state', 'published');
        }

        if (context.knowledgeFields.published) {
            record.addQuery('published', '<=', context.todayValue);
        }

        if (context.knowledgeFields.validTo) {
            validToQuery = record.addQuery('valid_to', '');
            validToQuery.addOrCondition('valid_to', '>=', context.todayValue);
        }
    },

    _applyCatalogBaseFilters: function(record, context) {
        if (context.catalogFields.active) {
            record.addActiveQuery();
        }

        if (context.catalogFields.hiddenInServicePortal) {
            record.addQuery('hidden_sp', false);
        }

        if (context.catalogFields.visibleInServicePortal) {
            record.addQuery('visible_sp', true);
        }
    },

    _applyNewsBaseFilters: function(record, context) {
        if (context.newsFields.active) {
            record.addActiveQuery();
        }

        if (context.newsFields.contentType && context.newsContentTypeId) {
            record.addQuery('content_type', context.newsContentTypeId);
        }
    },

    _applyUserBaseFilters: function(record, context) {
        if (context.userFields.active) {
            record.addActiveQuery();
        }
    },

    _applyTopicBaseFilters: function(record, context) {
        if (context.topicFields.active) {
            record.addActiveQuery();
        }

        if (context.topicFields.taxonomy && context.portalTaxonomyIds.length > 0) {
            record.addQuery('taxonomy', 'IN', context.portalTaxonomyIds.join(','));
        }

        if (context.excludedTopicIds && context.excludedTopicIds.length > 0) {
            record.addQuery('sys_id', 'NOT IN', context.excludedTopicIds.join(','));
        }
    },

    _storeKnowledgeCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'kb:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return null;
        }

        candidate = {
            resultKey: 'kb:' + sysId,
            resultType: 'knowledge',
            resultTypeLabel: 'Kunnskapsartikkel',
            sysId: sysId,
            number: context.knowledgeFields.number ? record.getValue('number') : '',
            title: context.knowledgeFields.shortDescription ? this._safeString(record.getValue('short_description')) : '',
            metaText: this._buildKnowledgeMetadataText(record, context),
            bodyText: context.knowledgeFields.text ? this._safeString(record.getValue('text')) : '',
            kbName: context.knowledgeFields.knowledgeBase ? record.getDisplayValue('kb_knowledge_base') : '',
            categoryName: context.knowledgeFields.category ? record.getDisplayValue('kb_category') : '',
            language: context.knowledgeFields.language ? record.getValue('language') : '',
            updatedOn: context.knowledgeFields.updatedOn ? this._safeString(record.getValue('sys_updated_on')) : '',
            url: this._buildKnowledgeUrl(context.articlePageId, sysId)
        };

        candidate.isFeaturedKnowledgeBase = !!context.featuredKnowledgeBaseId &&
            context.knowledgeFields.knowledgeBase &&
            record.getValue('kb_knowledge_base') === context.featuredKnowledgeBaseId;

        if (candidate.isFeaturedKnowledgeBase && context.featuredKnowledgeBaseLabel) {
            candidate.resultTypeLabel = context.featuredKnowledgeBaseLabel;
            candidate.kbName = context.featuredKnowledgeBaseLabel;
        } else {
            candidate.resultTypeLabel = 'Artikler';
        }

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
        return candidate;
    },

    _filterConnectedCatalogCandidates: function(candidates, context) {
        var connectedIds = this._getConnectedCatalogItemIdMap(candidates, context);
        var filteredCandidates = [];
        var index;

        for (index = 0; index < candidates.length; index++) {
            if (connectedIds[candidates[index].sysId]) {
                filteredCandidates.push(candidates[index]);
            }
        }

        return filteredCandidates;
    },

    _storeCatalogCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'catalog:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return;
        }

        candidate = {
            resultKey: 'catalog:' + sysId,
            resultType: 'catalog_item',
            resultTypeLabel: this._getCatalogTypeLabel(record, context),
            sysId: sysId,
            number: '',
            title: context.catalogFields.name ? this._getLocalizedRecordValue(record, 'name') : '',
            metaText: this._buildCatalogMetadataText(record, context),
            bodyText: context.catalogFields.description ? this._getLocalizedRecordValue(record, 'description') : '',
            kbName: '',
            categoryName: context.catalogFields.category ? record.getDisplayValue('category') : '',
            language: '',
            updatedOn: context.catalogFields.updatedOn ? this._safeString(record.getValue('sys_updated_on')) : '',
            catalogName: context.catalogFields.catalog ? record.getDisplayValue('sc_catalogs') : '',
            url: this._buildCatalogUrl(context.catalogItemPageId, sysId)
        };

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
    },

    _storeNewsCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'news:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return null;
        }

        candidate = {
            resultKey: 'news:' + sysId,
            resultType: 'news',
            resultTypeLabel: 'Nyhet',
            sysId: sysId,
            number: '',
            title: context.newsFields.title ? this._safeString(record.getValue('title')) : '',
            metaText: '',
            bodyText: '',
            kbName: '',
            categoryName: '',
            language: '',
            updatedOn: context.newsFields.updatedOn ? this._safeString(record.getValue('sys_updated_on')) : '',
            catalogName: '',
            url: this._buildNewsUrl(context.newsPageId, sysId)
        };

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
        return candidate;
    },

    _storeUserCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'user:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return;
        }

        candidate = {
            resultKey: 'user:' + sysId,
            resultType: 'sys_user',
            resultTypeLabel: 'Ansatt',
            sysId: sysId,
            number: '',
            title: context.userFields.name ? this._safeString(record.getDisplayValue('name') || record.getValue('name')) : '',
            metaText: this._buildUserMetadataText(record, context),
            bodyText: '',
            kbName: '',
            categoryName: '',
            language: '',
            updatedOn: context.userFields.updatedOn ? this._safeString(record.getValue('sys_updated_on')) : '',
            catalogName: '',
            employeeTitle: context.userFields.title ? this._safeString(record.getValue('title')) : '',
            departmentName: context.userFields.department ? this._safeString(record.getDisplayValue('department')) : '',
            url: this._buildUserUrl(context.userProfilePageId, sysId)
        };

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
    },

    _storeTopicCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'topic:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return;
        }

        candidate = {
            resultKey: 'topic:' + sysId,
            resultType: 'topic',
            resultTypeLabel: 'Områdeside',
            sysId: sysId,
            number: '',
            title: context.topicFields.name ? this._safeString(record.getDisplayValue('name') || record.getValue('name')) : '',
            metaText: '',
            bodyText: context.topicFields.description ? this._safeString(record.getValue('description')) : '',
            kbName: '',
            categoryName: '',
            language: '',
            updatedOn: context.topicFields.updatedOn ? this._safeString(record.getValue('sys_updated_on')) : '',
            catalogName: '',
            employeeTitle: '',
            departmentName: '',
            url: this._buildTopicUrl(context.topicPageId, sysId)
        };

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
    },

    _buildKnowledgeMetadataText: function(record, context) {
        var parts = [];

        if (context.knowledgeFields.number) {
            parts.push(this._safeString(record.getValue('number')));
        }

        if (context.knowledgeFields.meta) {
            parts.push(this._safeString(record.getValue('meta')));
        }

        if (context.knowledgeFields.keywords) {
            parts.push(this._safeString(record.getValue('keywords')));
        }

        return parts.join(' ');
    },

    _buildCatalogMetadataText: function(record, context) {
        var parts = [];

        if (context.catalogFields.shortDescription) {
            parts.push(this._getLocalizedRecordValue(record, 'short_description'));
        }

        if (context.catalogFields.meta) {
            parts.push(this._getLocalizedRecordValue(record, 'meta'));
        }

        if (context.catalogFields.category) {
            parts.push(this._safeString(record.getDisplayValue('category')));
        }

        if (context.catalogFields.catalog) {
            parts.push(this._safeString(record.getDisplayValue('sc_catalogs')));
        }

        return parts.join(' ');
    },

    _buildUserMetadataText: function(record, context) {
        var parts = [];

        if (context.userFields.title) {
            parts.push(this._safeString(record.getValue('title')));
        }

        if (context.userFields.department) {
            parts.push(this._safeString(record.getDisplayValue('department')));
        }

        if (context.userFields.email) {
            parts.push(this._safeString(record.getValue('email')));
        }

        if (context.userFields.userName) {
            parts.push(this._safeString(record.getValue('user_name')));
        }

        return parts.join(' ');
    },

    _scoreAndSortCandidates: function(candidates, queryProfile) {
        var index;
        var candidate;
        var scoredCandidates = [];

        for (index = 0; index < candidates.length; index++) {
            candidate = candidates[index];
            candidate.score = this._calculateScore(candidate, queryProfile);
            candidate.resultTypePriority = this._getResultTypePriority(candidate);

            if (candidate.score > 0) {
                scoredCandidates.push(candidate);
            }
        }

        scoredCandidates.sort(this._compareCandidates);

        return scoredCandidates;
    },

    _calculateScore: function(candidate, queryProfile) {
        var title = this._normalizeQuery(candidate.title);
        var metadata = this._normalizeQuery(candidate.metaText);
        var body = this._normalizeQuery(this._stripHtml(candidate.bodyText));
        var primaryTerm = queryProfile.primaryTerm;
        var score = 0;

        score += this._calculateTermScore(title, primaryTerm, {
            exact: 1000,
            startsWith: 800,
            contains: 600,
            tokenWeight: 40
        });
        score += this._getBestSynonymScore(title, queryProfile.synonymTerms, {
            exact: 450,
            startsWith: 360,
            contains: 270,
            tokenWeight: 18
        });

        score += this._calculateTermScore(metadata, primaryTerm, {
            contains: 250,
            tokenWeight: 12
        });
        score += this._getBestSynonymScore(metadata, queryProfile.synonymTerms, {
            contains: 110,
            tokenWeight: 5
        });

        score += this._calculateTermScore(body, primaryTerm, {
            contains: 100,
            tokenWeight: 4
        });
        score += this._getBestSynonymScore(body, queryProfile.synonymTerms, {
            contains: 45,
            tokenWeight: 2
        });

        if (candidate.fallbackMatch === true) {
            score -= this.NEWS_FALLBACK_SCORE_PENALTY;
        }

        return score;
    },

    _getResultTypePriority: function(candidate) {
        if (!candidate || !candidate.resultType) {
            return 99;
        }

        if (candidate.resultType === 'catalog_item') {
            return 1;
        }

        if (candidate.resultType === 'knowledge') {
            return 2;
        }

        if (candidate.resultType === 'news') {
            return 3;
        }

        if (candidate.resultType === 'topic') {
            return 4;
        }

        if (candidate.resultType === 'sys_user') {
            return 5;
        }

        return 99;
    },

    _calculateTermScore: function(haystack, searchTerm, weights) {
        var score = 0;

        if (!haystack || !searchTerm || !searchTerm.normalizedValue) {
            return 0;
        }

        if (weights.exact && haystack === searchTerm.normalizedValue) {
            score += weights.exact;
        } else if (weights.startsWith && haystack.indexOf(searchTerm.normalizedValue) === 0) {
            score += weights.startsWith;
        } else if (weights.contains && haystack.indexOf(searchTerm.normalizedValue) > -1) {
            score += weights.contains;
        }

        if (weights.tokenWeight) {
            score += this._scoreTokenCoverage(haystack, searchTerm.tokens, weights.tokenWeight);
        }

        return score;
    },

    _getBestSynonymScore: function(haystack, synonymTerms, weights) {
        var highestScore = 0;
        var index;
        var currentScore;

        if (!haystack || !synonymTerms || synonymTerms.length === 0) {
            return 0;
        }

        for (index = 0; index < synonymTerms.length; index++) {
            currentScore = this._calculateTermScore(haystack, synonymTerms[index], weights);

            if (currentScore > highestScore) {
                highestScore = currentScore;
            }
        }

        return highestScore;
    },

    _scoreTokenCoverage: function(haystack, tokens, tokenWeight) {
        var uniqueTokens = {};
        var score = 0;
        var index;
        var token;

        if (!haystack || !tokens || tokens.length === 0) {
            return 0;
        }

        for (index = 0; index < tokens.length; index++) {
            token = tokens[index];

            if (!token || uniqueTokens[token]) {
                continue;
            }

            if (haystack.indexOf(token) > -1) {
                score += tokenWeight;
                uniqueTokens[token] = true;
            }
        }

        return score;
    },

    _shapeResults: function(candidates, queryProfile, context) {
        var results = [];
        var index;
        var candidate;
        var iconInfo;
        var highlightTerms = this._buildHighlightTerms(queryProfile);
        var snippet;

        for (index = 0; index < candidates.length; index++) {
            candidate = candidates[index];
            iconInfo = this._getResultIconInfo(candidate);
            snippet = candidate.resultType === 'sys_user' ? '' : this._buildSnippet(candidate, highlightTerms);
            results.push({
                sysId: candidate.sysId,
                resultType: candidate.resultType,
                resultTypeLabel: candidate.resultTypeLabel,
                isRequestItem: candidate.resultType === 'catalog_item',
                isNewsItem: candidate.resultType === 'news',
                isUser: candidate.resultType === 'sys_user',
                isTopic: candidate.resultType === 'topic',
                isFeaturedKnowledgeBase: candidate.isFeaturedKnowledgeBase === true,
                showUpdatedDate: candidate.resultType === 'knowledge' || candidate.resultType === 'news',
                iconKey: iconInfo.key,
                iconClass: iconInfo.className,
                iconLabel: iconInfo.label,
                number: candidate.number,
                title: candidate.title,
                titleHtml: this._highlightText(candidate.title, highlightTerms),
                snippet: snippet,
                snippetHtml: this._highlightText(snippet, highlightTerms),
                kbName: candidate.kbName,
                catalogName: candidate.catalogName || '',
                employeeTitle: candidate.employeeTitle || '',
                employeeTitleHtml: this._highlightText(candidate.employeeTitle || '', highlightTerms),
                departmentName: candidate.departmentName || '',
                departmentNameHtml: this._highlightText(candidate.departmentName || '', highlightTerms),
                categoryName: candidate.categoryName,
                language: candidate.language,
                updatedOnDisplay: this._formatUpdatedOnDisplay(candidate.updatedOn),
                url: candidate.url
            });
        }

        return results;
    },

    _formatUpdatedOnDisplay: function(updatedOn) {
        var value = this._safeString(updatedOn);
        var parts;

        if (!value) {
            return '';
        }

        parts = value.substring(0, 10).split('-');

        if (parts.length === 3) {
            return parts[2] + '.' + parts[1] + '.' + parts[0];
        }

        return value;
    },

    _getResultIconInfo: function(candidate) {
        if (candidate.isFeaturedKnowledgeBase) {
            return {
                key: 'featured_kb',
                className: 'fa-gavel',
                label: 'Utvalgt kunnskapsbase'
            };
        }

        if (candidate.resultType === 'news') {
            return {
                key: 'news',
                className: 'fa-newspaper-o',
                label: 'Nyhet'
            };
        }

        if (candidate.resultType === 'catalog_item') {
            return {
                key: 'catalog_item',
                className: 'fa-clipboard',
                label: candidate.resultTypeLabel || 'Bestilling'
            };
        }

        if (candidate.resultType === 'sys_user') {
            return {
                key: 'sys_user',
                className: 'fa-user',
                label: candidate.resultTypeLabel || 'Ansatt'
            };
        }

        if (candidate.resultType === 'topic') {
            return {
                key: 'topic',
                className: 'fa-sitemap',
                label: candidate.resultTypeLabel || 'Områdeside'
            };
        }

        return {
            key: 'knowledge',
            className: 'fa-book',
            label: 'Kunnskapsartikkel'
        };
    },

    _buildSnippet: function(candidate, highlightTerms) {
        var bodyText = this._stripHtml(candidate.bodyText);
        var metadataText = this._stripHtml(candidate.metaText);
        var bodyMatch = this._findFirstHighlightMatch(bodyText, highlightTerms);
        var metadataMatch = this._findFirstHighlightMatch(metadataText, highlightTerms);

        if (bodyText && bodyMatch) {
            return this._extractSnippet(bodyText, bodyMatch.start, bodyMatch.end, this.SNIPPET_LENGTH);
        }

        if (metadataText && metadataMatch) {
            return this._extractSnippet(metadataText, metadataMatch.start, metadataMatch.end, this.SNIPPET_LENGTH);
        }

        if (bodyText) {
            return this._truncateText(bodyText, this.SNIPPET_LENGTH);
        }

        if (metadataText) {
            return this._truncateText(metadataText, this.SNIPPET_LENGTH);
        }

        return this._truncateText(candidate.title, this.SNIPPET_LENGTH);
    },

    _extractSnippet: function(text, matchStart, matchEnd, length) {
        var startIndex;
        var endIndex;
        var snippet;

        if (!text) {
            return '';
        }

        if (typeof matchStart !== 'number' || typeof matchEnd !== 'number' || matchStart < 0 || matchEnd <= matchStart) {
            return this._truncateText(text, length);
        }

        startIndex = Math.max(matchStart - Math.floor(length / 3), 0);
        endIndex = Math.min(startIndex + length, text.length);
        snippet = text.substring(startIndex, endIndex);

        if (startIndex > 0) {
            snippet = '... ' + snippet;
        }

        if (endIndex < text.length) {
            snippet += ' ...';
        }

        return snippet;
    },

    _buildHighlightTerms: function(queryProfile) {
        var terms = [];
        var uniqueTerms = {};
        var searchTerms = queryProfile && queryProfile.searchTerms ? queryProfile.searchTerms : [];
        var searchTerm;
        var tokenIndex;
        var index;

        for (index = 0; index < searchTerms.length; index++) {
            searchTerm = searchTerms[index];

            if (!searchTerm) {
                continue;
            }

            this._appendHighlightTerm(terms, uniqueTerms, searchTerm.value);

            for (tokenIndex = 0; searchTerm.tokens && tokenIndex < searchTerm.tokens.length; tokenIndex++) {
                if (searchTerm.tokens[tokenIndex] && searchTerm.tokens[tokenIndex].length > 1) {
                    this._appendHighlightTerm(terms, uniqueTerms, searchTerm.tokens[tokenIndex]);
                }
            }
        }

        terms.sort(function(leftTerm, rightTerm) {
            return rightTerm.length - leftTerm.length;
        });

        return terms;
    },

    _appendHighlightTerm: function(terms, uniqueTerms, value) {
        var cleanValue = this._cleanQuery(value);
        var normalizedValue = this._normalizeQuery(cleanValue);

        if (!normalizedValue || uniqueTerms[normalizedValue]) {
            return;
        }

        uniqueTerms[normalizedValue] = true;
        terms.push(cleanValue);
    },

    _highlightText: function(text, highlightTerms) {
        var safeText = this._safeString(text);
        var matches = this._collectHighlightMatches(safeText, highlightTerms);
        var highlightedText = '';
        var currentIndex = 0;
        var matchIndex;
        var match;

        if (!safeText) {
            return '';
        }

        if (matches.length === 0) {
            return this._escapeHtml(safeText);
        }

        for (matchIndex = 0; matchIndex < matches.length; matchIndex++) {
            match = matches[matchIndex];
            highlightedText += this._escapeHtml(safeText.substring(currentIndex, match.start));
            highlightedText += '<mark>' +
                this._escapeHtml(safeText.substring(match.start, match.end)) +
                '</mark>';
            currentIndex = match.end;
        }

        highlightedText += this._escapeHtml(safeText.substring(currentIndex));

        return highlightedText;
    },

    _findFirstHighlightMatch: function(text, highlightTerms) {
        var matches = this._collectHighlightMatches(text, highlightTerms);

        return matches.length ? matches[0] : null;
    },

    _collectHighlightMatches: function(text, highlightTerms) {
        var sourceText = this._safeString(text);
        var normalizedText = sourceText.toLowerCase();
        var matches = [];
        var matchCandidates = [];
        var highlightTerm;
        var normalizedTerm;
        var searchIndex;
        var index;

        if (!sourceText || !highlightTerms || highlightTerms.length === 0) {
            return matches;
        }

        for (index = 0; index < highlightTerms.length; index++) {
            highlightTerm = this._safeString(highlightTerms[index]);
            normalizedTerm = highlightTerm.toLowerCase();

            if (!normalizedTerm) {
                continue;
            }

            searchIndex = normalizedText.indexOf(normalizedTerm);

            while (searchIndex > -1) {
                if (this._isValidHighlightBoundary(sourceText, searchIndex, searchIndex + highlightTerm.length, highlightTerm)) {
                    matchCandidates.push({
                        start: searchIndex,
                        end: searchIndex + highlightTerm.length,
                        length: highlightTerm.length
                    });
                }

                searchIndex = normalizedText.indexOf(normalizedTerm, searchIndex + normalizedTerm.length);
            }
        }

        matchCandidates.sort(function(leftMatch, rightMatch) {
            if (leftMatch.start !== rightMatch.start) {
                return leftMatch.start - rightMatch.start;
            }

            return rightMatch.length - leftMatch.length;
        });

        for (index = 0; index < matchCandidates.length; index++) {
            if (matches.length && matchCandidates[index].start < matches[matches.length - 1].end) {
                continue;
            }

            matches.push(matchCandidates[index]);
        }

        return matches;
    },

    _isValidHighlightBoundary: function(text, startIndex, endIndex, term) {
        var previousCharacter = startIndex > 0 ? text.charAt(startIndex - 1) : '';
        var nextCharacter = endIndex < text.length ? text.charAt(endIndex) : '';
        var firstTermCharacter = term ? term.charAt(0) : '';
        var lastTermCharacter = term ? term.charAt(term.length - 1) : '';

        if (this._isWordCharacter(firstTermCharacter) && this._isWordCharacter(previousCharacter)) {
            return false;
        }

        if (this._isWordCharacter(lastTermCharacter) && this._isWordCharacter(nextCharacter)) {
            return false;
        }

        return true;
    },

    _isWordCharacter: function(character) {
        return /[0-9A-Za-z\u00C0-\u017F_]/.test(character || '');
    },

    _truncateText: function(text, length) {
        var normalizedText = this._safeString(text);

        if (normalizedText.length <= length) {
            return normalizedText;
        }

        return normalizedText.substring(0, length - 3) + '...';
    },

    _buildKnowledgeUrl: function(articlePageId, sysId) {
        return '?id=' + encodeURIComponent(articlePageId) + '&sys_id=' + encodeURIComponent(sysId);
    },

    _buildCatalogUrl: function(catalogItemPageId, sysId) {
        return '?id=' + encodeURIComponent(catalogItemPageId) + '&sys_id=' + encodeURIComponent(sysId);
    },

    _buildNewsUrl: function(newsPageId, sysId) {
        return '?id=' + encodeURIComponent(newsPageId) + '&sys_id=' + encodeURIComponent(sysId);
    },

    _buildUserUrl: function(userProfilePageId, sysId) {
        return '?id=' + encodeURIComponent(userProfilePageId) + '&sys_id=' + encodeURIComponent(sysId);
    },

    _buildTopicUrl: function(topicPageId, sysId) {
        return '?id=' + encodeURIComponent(topicPageId) + '&topic_id=' + encodeURIComponent(sysId);
    },

    _getConnectedCatalogItemIdMap: function(candidates, context) {
        var candidateIds = [];
        var connectedItemMap = {};
        // Connected content and portal taxonomy are configuration records and should not disappear for end users.
        var connectedContent = new GlideRecord(this.CONNECTED_CONTENT_TABLE);
        var candidateIdString;
        var taxonomyIdString;
        var index;

        for (index = 0; index < candidates.length; index++) {
            candidateIds.push(candidates[index].sysId);
        }

        if (candidateIds.length === 0 || context.portalTaxonomyIds.length === 0 || !connectedContent.isValid()) {
            return connectedItemMap;
        }

        candidateIdString = candidateIds.join(',');
        taxonomyIdString = context.portalTaxonomyIds.join(',');
        connectedContent.addQuery('catalog_item', 'IN', candidateIdString);
        connectedContent.addNotNullQuery('topic');
        connectedContent.addQuery('topic.taxonomy', 'IN', taxonomyIdString);
        connectedContent.orderByDesc('popularity');
        connectedContent.query();

        while (connectedContent.next()) {
            connectedItemMap[connectedContent.getValue('catalog_item')] = true;
        }

        return connectedItemMap;
    },

    _getPortalTaxonomyIds: function(portalSysId) {
        var taxonomyIds = [];
        var uniqueTaxonomyIds = {};
        var portalTaxonomy = new GlideRecord(this.PORTAL_TAXONOMY_TABLE);
        var taxonomyId;

        if (!portalSysId || !portalTaxonomy.isValid()) {
            return taxonomyIds;
        }

        if (portalTaxonomy.isValidField('active')) {
            portalTaxonomy.addActiveQuery();
        }

        portalTaxonomy.addQuery('sp_portal', portalSysId);
        portalTaxonomy.addNotNullQuery('taxonomy');
        portalTaxonomy.orderBy('order');
        portalTaxonomy.query();

        while (portalTaxonomy.next()) {
            taxonomyId = portalTaxonomy.getValue('taxonomy');

            if (!taxonomyId || uniqueTaxonomyIds[taxonomyId]) {
                continue;
            }

            uniqueTaxonomyIds[taxonomyId] = true;
            taxonomyIds.push(taxonomyId);
        }

        return taxonomyIds;
    },

    _getExcludedTopicIdsForFeaturedTopic: function(featuredTopicId, portalTaxonomyIds) {
        var rootTopicId = this._safeString(featuredTopicId);
        var excludedTopicIds = [];
        var excludedTopicMap = {};
        var pendingTopicIds = [];
        var batchTopicIds;
        var topicRecord;
        var childTopicId;

        if (!rootTopicId) {
            return excludedTopicIds;
        }

        excludedTopicIds.push(rootTopicId);
        excludedTopicMap[rootTopicId] = true;
        pendingTopicIds.push(rootTopicId);

        topicRecord = new GlideRecord(this.TOPIC_TABLE);

        if (!topicRecord.isValid() || !topicRecord.isValidField('parent_topic')) {
            return excludedTopicIds;
        }

        while (pendingTopicIds.length > 0) {
            batchTopicIds = pendingTopicIds.splice(0, 100);
            topicRecord = new GlideRecord(this.TOPIC_TABLE);
            topicRecord.addQuery('parent_topic', 'IN', batchTopicIds.join(','));

            if (topicRecord.isValidField('taxonomy') && portalTaxonomyIds && portalTaxonomyIds.length > 0) {
                topicRecord.addQuery('taxonomy', 'IN', portalTaxonomyIds.join(','));
            }

            topicRecord.query();

            while (topicRecord.next()) {
                childTopicId = topicRecord.getUniqueValue();

                if (!childTopicId || excludedTopicMap[childTopicId]) {
                    continue;
                }

                excludedTopicMap[childTopicId] = true;
                excludedTopicIds.push(childTopicId);
                pendingTopicIds.push(childTopicId);
            }
        }

        return excludedTopicIds;
    },

    _getCatalogTypeLabel: function(record, context) {
        var className = context.catalogFields.className ? record.getValue('sys_class_name') : '';

        if (className === 'sc_cat_item_producer') {
            return 'Bestillingsskjema';
        }

        return 'Bestilling';
    },

    _normalizeResultFilter: function(value) {
        var normalizedValue = this._normalizeQuery(value);

        if (normalizedValue === 'knowledge') {
            return 'knowledge_total';
        }

        if (normalizedValue === 'knowledge_total' || normalizedValue === 'knowledge_articles' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'sys_user' || normalizedValue === 'topic' || normalizedValue === 'featured_kb' || normalizedValue === 'all') {
            return normalizedValue;
        }

        return 'all';
    },

    _applyResultFilter: function(candidates, resultFilter) {
        var filteredCandidates = [];
        var index;

        if (resultFilter === 'all') {
            return candidates;
        }

        for (index = 0; index < candidates.length; index++) {
            if (resultFilter === 'knowledge_total' && candidates[index].resultType === 'knowledge') {
                filteredCandidates.push(candidates[index]);
            } else if (resultFilter === 'featured_kb' && candidates[index].isFeaturedKnowledgeBase) {
                filteredCandidates.push(candidates[index]);
            } else if (resultFilter === 'knowledge_articles' &&
                candidates[index].resultType === 'knowledge' &&
                candidates[index].isFeaturedKnowledgeBase !== true) {
                filteredCandidates.push(candidates[index]);
            } else if (candidates[index].resultType === resultFilter) {
                filteredCandidates.push(candidates[index]);
            }
        }

        return filteredCandidates;
    },

    _buildEmptyFilters: function(featuredKnowledgeBaseId, featuredKnowledgeBaseLabel) {
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

        if (featuredKnowledgeBaseId && featuredKnowledgeBaseLabel) {
            filters.featured_kb = {
                id: 'featured_kb',
                label: featuredKnowledgeBaseLabel,
                count: 0
            };
        }

        return filters;
    },

    _buildFilterSummary: function(candidates, context) {
        var filters;
        var index;
        var resultType;

        filters = this._buildEmptyFilters(context.featuredKnowledgeBaseId, context.featuredKnowledgeBaseLabel);
        filters.all.count = candidates.length;

        for (index = 0; index < candidates.length; index++) {
            resultType = candidates[index].resultType;

            if (filters[resultType]) {
                filters[resultType].count += 1;
            }

            if (resultType === 'knowledge' && filters.knowledge_total) {
                filters.knowledge_total.count += 1;
            }

            if (resultType === 'knowledge' &&
                candidates[index].isFeaturedKnowledgeBase !== true &&
                filters.knowledge_articles) {
                filters.knowledge_articles.count += 1;
            }

            if (filters.featured_kb && candidates[index].isFeaturedKnowledgeBase) {
                filters.featured_kb.count += 1;
            }
        }

        return filters;
    },

    _compareCandidates: function(leftCandidate, rightCandidate) {
        var leftPriority = typeof leftCandidate.resultTypePriority === 'number' ? leftCandidate.resultTypePriority : 99;
        var rightPriority = typeof rightCandidate.resultTypePriority === 'number' ? rightCandidate.resultTypePriority : 99;

        if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
        }

        if (leftCandidate.score !== rightCandidate.score) {
            return rightCandidate.score - leftCandidate.score;
        }

        if (leftCandidate.updatedOn === rightCandidate.updatedOn) {
            if (leftCandidate.title === rightCandidate.title) {
                return 0;
            }

            return leftCandidate.title > rightCandidate.title ? 1 : -1;
        }

        return leftCandidate.updatedOn < rightCandidate.updatedOn ? 1 : -1;
    },

    _tokenize: function(normalizedQuery) {
        var tokens = normalizedQuery ? normalizedQuery.split(' ') : [];
        var cleanTokens = [];
        var index;

        for (index = 0; index < tokens.length; index++) {
            if (tokens[index]) {
                cleanTokens.push(tokens[index]);
            }
        }

        return cleanTokens;
    },

    _tokenizeForOverlap: function(value) {
        var normalizedValue = this._normalizeQuery(value).replace(/[^0-9a-z\u00C0-\u017F_]+/g, ' ');
        return this._tokenize(normalizedValue);
    },

    _getFallbackNewsTokens: function(tokens) {
        var filteredTokens = [];
        var uniqueTokens = {};
        var index;
        var token;

        for (index = 0; index < tokens.length; index++) {
            token = tokens[index];

            if (!token ||
                token.length < this.NEWS_FALLBACK_MIN_TOKEN_LENGTH ||
                this.NEWS_FALLBACK_STOP_WORDS[token] ||
                uniqueTokens[token]) {
                continue;
            }

            uniqueTokens[token] = true;
            filteredTokens.push(token);
        }

        return filteredTokens;
    },

    _getFallbackKnowledgeTokens: function(tokens) {
        var filteredTokens = [];
        var uniqueTokens = {};
        var index;
        var token;

        for (index = 0; index < tokens.length; index++) {
            token = tokens[index];

            if (!token ||
                token.length < this.KNOWLEDGE_FALLBACK_MIN_TOKEN_LENGTH ||
                this.NEWS_FALLBACK_STOP_WORDS[token] ||
                uniqueTokens[token]) {
                continue;
            }

            uniqueTokens[token] = true;
            filteredTokens.push(token);
        }

        return filteredTokens;
    },

    _getFallbackNewsRequiredMatchCount: function(tokenCount) {
        return Math.max(2, Math.ceil(tokenCount * this.NEWS_FALLBACK_REQUIRED_RATIO));
    },

    _getFallbackKnowledgeRequiredMatchCount: function(tokenCount) {
        return Math.max(2, Math.ceil(tokenCount * this.KNOWLEDGE_FALLBACK_REQUIRED_RATIO));
    },

    _newsTitleMatchesFallback: function(title, fallbackTokens, requiredMatchCount) {
        var titleTokens = this._tokenizeForOverlap(title);
        var titleTokenMap = this._buildTokenMap(titleTokens);
        var matchedTokenCount = 0;
        var index;

        if (!title || !fallbackTokens || fallbackTokens.length === 0) {
            return false;
        }

        for (index = 0; index < fallbackTokens.length; index++) {
            if (titleTokenMap[fallbackTokens[index]]) {
                matchedTokenCount += 1;
            }
        }

        return matchedTokenCount >= requiredMatchCount;
    },

    _knowledgeShortDescriptionMatchesFallback: function(shortDescription, fallbackTokens, requiredMatchCount) {
        var descriptionTokens = this._tokenizeForOverlap(shortDescription);
        var descriptionTokenMap = this._buildTokenMap(descriptionTokens);
        var matchedTokenCount = 0;
        var index;

        if (!shortDescription || !fallbackTokens || fallbackTokens.length === 0) {
            return false;
        }

        for (index = 0; index < fallbackTokens.length; index++) {
            if (descriptionTokenMap[fallbackTokens[index]]) {
                matchedTokenCount += 1;
            }
        }

        return matchedTokenCount >= requiredMatchCount;
    },

    _normalizeQuery: function(value) {
        return this._cleanQuery(value).toLowerCase();
    },

    _cleanQuery: function(value) {
        return this._safeString(value).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    },

    _getLocalizedRecordValue: function(record, fieldName) {
        var displayValue;

        if (!record || !fieldName) {
            return '';
        }

        displayValue = record.getDisplayValue(fieldName);

        return this._safeString(displayValue || record.getValue(fieldName));
    },

    _stripHtml: function(value) {
        return this._safeString(value)
            .replace(/&lt;script&gt;/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&amp;/gi, '&')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;/gi, '\'')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    },

    _escapeHtml: function(value) {
        return this._safeString(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _safeString: function(value) {
        return value === null || typeof value === 'undefined' ? '' : String(value);
    },

    _toBoolean: function(value) {
        if (value === true || value === false) {
            return value;
        }

        return this._safeString(value) === 'true';
    },

    _clampInteger: function(value, defaultValue, minimumValue, maximumValue) {
        var parsedValue = parseInt(value, 10);

        if (isNaN(parsedValue)) {
            parsedValue = defaultValue;
        }

        if (parsedValue < minimumValue) {
            parsedValue = minimumValue;
        }

        if (parsedValue > maximumValue) {
            parsedValue = maximumValue;
        }

        return parsedValue;
    },

    type: 'superSearchEngine'
};
