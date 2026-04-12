var superSearchEngine = Class.create();
superSearchEngine.prototype = {
    initialize: function() {
        this.KNOWLEDGE_TABLE = 'kb_knowledge';
        this.CATALOG_TABLE = 'sc_cat_item';
        this.NEWS_TABLE = 'sn_cd_content_base';
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
        this.DEFAULT_NEWS_CONTENT_TYPE_ID = '4880186c53202110a489ddeeff7b129a';
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

        context = this._buildContext(articlePageId, catalogItemPageId, newsPageId, newsContentTypeId, portalSysId, featuredKnowledgeBaseId, featuredKnowledgeBaseLabel);
        queryProfile = this._buildQueryProfile(query, normalizedQuery, synonymDictionaryId);
        searchStrategy = this._buildSearchStrategy(queryProfile, candidateLimit, pageSize, includeBodySearch, shortQueryLength, shortQueryCandidateLimit, shortQueryResultLimit);
        response.querySummaryLabel = this._buildQuerySummaryLabel(queryProfile.searchTerms);
        response.hasSynonymExpansion = queryProfile.synonymTerms.length > 0;
        response.pageSize = searchStrategy.pageSize;
        scoredCandidates = this._getScoredCandidates(context, queryProfile, searchStrategy.candidateLimit, searchStrategy.includeBodySearch);
        scoredCandidates = this._limitResults(scoredCandidates, searchStrategy.resultLimit);
        response.filters = this._buildFilterSummary(scoredCandidates, context);
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
        response.results = this._shapeResults(pagedCandidates, queryProfile.primaryTerm.normalizedValue, context);

        return response;
    },

    _buildContext: function(articlePageId, catalogItemPageId, newsPageId, newsContentTypeId, portalSysId, featuredKnowledgeBaseId, featuredKnowledgeBaseLabel) {
        var knowledgeRecord = new GlideRecordSecure(this.KNOWLEDGE_TABLE);
        var catalogRecord = new GlideRecordSecure(this.CATALOG_TABLE);
        var newsRecord = new GlideRecordSecure(this.NEWS_TABLE);
        var portalTaxonomyIds = this._getPortalTaxonomyIds(portalSysId);
        var currentDateTime = new GlideDateTime();
        var todayValue = currentDateTime.getValue().substring(0, 10);

        return {
            articlePageId: articlePageId,
            catalogItemPageId: catalogItemPageId,
            newsPageId: newsPageId,
            newsContentTypeId: newsContentTypeId,
            portalSysId: portalSysId,
            portalTaxonomyIds: portalTaxonomyIds,
            featuredKnowledgeBaseId: featuredKnowledgeBaseId,
            featuredKnowledgeBaseLabel: featuredKnowledgeBaseLabel,
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
        var knowledgeCandidates = this._getKnowledgeCandidates(context, queryProfile, knowledgeLimit, includeBodySearch);
        var catalogCandidates = this._getCatalogCandidates(context, queryProfile, catalogLimit, includeBodySearch);
        var newsCandidates = this._getNewsCandidates(context, queryProfile, newsLimit);
        var mergedCandidates = knowledgeCandidates.concat(catalogCandidates, newsCandidates);

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

        return candidates;
    },

    _buildKnowledgePassDefinitions: function(context, queryProfile, includeBodySearch) {
        var passes = [];
        var seenPasses = {};
        var metadataFields = [];

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

    _collectCatalogCandidatesForPass: function(context, passDefinition, candidateLimit, candidateMap, candidates) {
        var record = new GlideRecordSecure(this.CATALOG_TABLE);
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

    _storeKnowledgeCandidate: function(record, context, candidateMap, candidates) {
        var sysId = record.getUniqueValue();
        var candidateKey = 'kb:' + sysId;
        var candidate;

        if (!sysId || candidateMap[candidateKey]) {
            return;
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
            candidate.kbName = context.featuredKnowledgeBaseLabel;
        }

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
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
            title: context.catalogFields.name ? this._safeString(record.getValue('name')) : '',
            metaText: this._buildCatalogMetadataText(record, context),
            bodyText: context.catalogFields.description ? this._safeString(record.getValue('description')) : '',
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
            return;
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
    },

    _buildKnowledgeMetadataText: function(record, context) {
        var parts = [];

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
            parts.push(this._safeString(record.getValue('short_description')));
        }

        if (context.catalogFields.meta) {
            parts.push(this._safeString(record.getValue('meta')));
        }

        if (context.catalogFields.category) {
            parts.push(this._safeString(record.getDisplayValue('category')));
        }

        if (context.catalogFields.catalog) {
            parts.push(this._safeString(record.getDisplayValue('sc_catalogs')));
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

            if (candidate.resultType === 'knowledge') {
                candidate.score += 20;
            } else if (candidate.resultType === 'news') {
                candidate.score += 10;
            }

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

        return score;
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

    _shapeResults: function(candidates, normalizedQuery, context) {
        var results = [];
        var index;
        var candidate;
        var iconInfo;

        for (index = 0; index < candidates.length; index++) {
            candidate = candidates[index];
            iconInfo = this._getResultIconInfo(candidate);
            results.push({
                sysId: candidate.sysId,
                resultType: candidate.resultType,
                resultTypeLabel: candidate.resultTypeLabel,
                isRequestItem: candidate.resultType === 'catalog_item',
                isNewsItem: candidate.resultType === 'news',
                isFeaturedKnowledgeBase: candidate.isFeaturedKnowledgeBase === true,
                iconKey: iconInfo.key,
                iconClass: iconInfo.className,
                iconLabel: iconInfo.label,
                number: candidate.number,
                title: candidate.title,
                snippet: this._buildSnippet(candidate, normalizedQuery),
                kbName: candidate.kbName,
                catalogName: candidate.catalogName || '',
                categoryName: candidate.categoryName,
                language: candidate.language,
                url: candidate.url
            });
        }

        return results;
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

        return {
            key: 'knowledge',
            className: 'fa-book',
            label: 'Kunnskapsartikkel'
        };
    },

    _buildSnippet: function(candidate, normalizedQuery) {
        var bodyText = this._stripHtml(candidate.bodyText);
        var metadataText = this._stripHtml(candidate.metaText);
        var normalizedBody = this._normalizeQuery(bodyText);
        var normalizedMetadata = this._normalizeQuery(metadataText);

        if (bodyText && normalizedBody.indexOf(normalizedQuery) > -1) {
            return this._extractSnippet(bodyText, normalizedQuery, this.SNIPPET_LENGTH);
        }

        if (metadataText && normalizedMetadata.indexOf(normalizedQuery) > -1) {
            return this._extractSnippet(metadataText, normalizedQuery, this.SNIPPET_LENGTH);
        }

        if (bodyText) {
            return this._truncateText(bodyText, this.SNIPPET_LENGTH);
        }

        if (metadataText) {
            return this._truncateText(metadataText, this.SNIPPET_LENGTH);
        }

        return this._truncateText(candidate.title, this.SNIPPET_LENGTH);
    },

    _extractSnippet: function(text, normalizedQuery, length) {
        var normalizedText = this._normalizeQuery(text);
        var matchIndex = normalizedText.indexOf(normalizedQuery);
        var startIndex;
        var endIndex;
        var snippet;

        if (!text) {
            return '';
        }

        if (matchIndex < 0) {
            return this._truncateText(text, length);
        }

        startIndex = Math.max(matchIndex - Math.floor(length / 3), 0);
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

    _getConnectedCatalogItemIdMap: function(candidates, context) {
        var candidateIds = [];
        var connectedItemMap = {};
        var connectedContent = new GlideRecordSecure(this.CONNECTED_CONTENT_TABLE);
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
        var portalTaxonomy = new GlideRecordSecure(this.PORTAL_TAXONOMY_TABLE);
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

    _getCatalogTypeLabel: function(record, context) {
        var className = context.catalogFields.className ? record.getValue('sys_class_name') : '';

        if (className === 'sc_cat_item_producer') {
            return 'Bestillingsskjema';
        }

        return 'Bestilling';
    },

    _normalizeResultFilter: function(value) {
        var normalizedValue = this._normalizeQuery(value);

        if (normalizedValue === 'knowledge' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'featured_kb' || normalizedValue === 'all') {
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
            if (resultFilter === 'featured_kb' && candidates[index].isFeaturedKnowledgeBase) {
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
            knowledge: {
                id: 'knowledge',
                label: 'Artikler',
                count: 0
            },
            news: {
                id: 'news',
                label: 'Nyheter',
                count: 0
            },
            catalog_item: {
                id: 'catalog_item',
                label: 'Bestillinger og skjemaer',
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

            if (filters.featured_kb && candidates[index].isFeaturedKnowledgeBase) {
                filters.featured_kb.count += 1;
            }
        }

        return filters;
    },

    _compareCandidates: function(leftCandidate, rightCandidate) {
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

    _normalizeQuery: function(value) {
        return this._cleanQuery(value).toLowerCase();
    },

    _cleanQuery: function(value) {
        return this._safeString(value).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
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
