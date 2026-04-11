var superSearchEngine = Class.create();
superSearchEngine.prototype = {
    initialize: function() {
        this.KNOWLEDGE_TABLE = 'kb_knowledge';
        this.CATALOG_TABLE = 'sc_cat_item';
        this.CONNECTED_CONTENT_TABLE = 'm2m_connected_content';
        this.DEFAULT_PAGE_SIZE = 10;
        this.DEFAULT_CANDIDATE_LIMIT = 75;
        this.MAX_PAGE_SIZE = 50;
        this.MAX_CANDIDATE_LIMIT = 200;
        this.DEFAULT_ARTICLE_PAGE_ID = 'kb_article';
        this.DEFAULT_CATALOG_ITEM_PAGE_ID = 'sc_cat_item';
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
        var includeBodySearch = this._toBoolean(request.includeBodySearch);
        var requestedPage = this._clampInteger(request.page, 1, 1, 10000);
        var response = {
            query: query,
            normalizedQuery: normalizedQuery,
            page: requestedPage,
            pageSize: pageSize,
            total: 0,
            totalPages: 0,
            hasMore: false,
            results: []
        };
        var context;
        var scoredCandidates;
        var pagedCandidates;
        var startIndex;

        if (!normalizedQuery) {
            return response;
        }

        context = this._buildContext(articlePageId, catalogItemPageId);
        scoredCandidates = this._getScoredCandidates(context, query, normalizedQuery, candidateLimit, includeBodySearch);
        response.total = scoredCandidates.length;
        response.totalPages = response.total > 0 ? Math.ceil(response.total / pageSize) : 0;

        if (response.totalPages > 0 && requestedPage > response.totalPages) {
            response.page = response.totalPages;
        }

        if (response.totalPages === 0) {
            response.page = 1;
            return response;
        }

        startIndex = (response.page - 1) * pageSize;
        pagedCandidates = scoredCandidates.slice(startIndex, startIndex + pageSize);
        response.hasMore = response.page < response.totalPages;
        response.results = this._shapeResults(pagedCandidates, normalizedQuery, context);

        return response;
    },

    _buildContext: function(articlePageId, catalogItemPageId) {
        var knowledgeRecord = new GlideRecordSecure(this.KNOWLEDGE_TABLE);
        var catalogRecord = new GlideRecordSecure(this.CATALOG_TABLE);

        return {
            articlePageId: articlePageId,
            catalogItemPageId: catalogItemPageId,
            now: new GlideDateTime().getDisplayValue(),
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
            }
        };
    },

    _getScoredCandidates: function(context, query, normalizedQuery, candidateLimit, includeBodySearch) {
        var tokens = this._tokenize(normalizedQuery);
        var knowledgeLimit = this._clampInteger(Math.ceil(candidateLimit * 0.65), candidateLimit, 1, candidateLimit);
        var catalogLimit = this._clampInteger(candidateLimit, candidateLimit, 1, candidateLimit);
        var knowledgeCandidates = this._getKnowledgeCandidates(context, query, normalizedQuery, knowledgeLimit, includeBodySearch);
        var catalogCandidates = this._getCatalogCandidates(context, query, normalizedQuery, catalogLimit, includeBodySearch);
        var mergedCandidates = knowledgeCandidates.concat(catalogCandidates);

        return this._scoreAndSortCandidates(mergedCandidates, normalizedQuery, tokens);
    },

    _getKnowledgeCandidates: function(context, query, normalizedQuery, candidateLimit, includeBodySearch) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions = this._buildKnowledgePassDefinitions(context, query, includeBodySearch);
        var index;

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectKnowledgeCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        return candidates;
    },

    _getCatalogCandidates: function(context, query, normalizedQuery, candidateLimit, includeBodySearch) {
        var candidateMap = {};
        var candidates = [];
        var passDefinitions;
        var index;

        passDefinitions = this._buildCatalogPassDefinitions(context, query, includeBodySearch);

        for (index = 0; index < passDefinitions.length; index++) {
            if (candidates.length >= candidateLimit) {
                break;
            }

            this._collectCatalogCandidatesForPass(context, passDefinitions[index], candidateLimit, candidateMap, candidates);
        }

        return this._filterConnectedCatalogCandidates(candidates);
    },

    _buildKnowledgePassDefinitions: function(context, query, includeBodySearch) {
        var passes = [];
        var metadataFields = [];

        if (context.knowledgeFields.shortDescription) {
            passes.push({
                field: 'short_description',
                operator: '=',
                value: query
            });
            passes.push({
                field: 'short_description',
                operator: 'STARTSWITH',
                value: query
            });
            passes.push({
                field: 'short_description',
                operator: 'CONTAINS',
                value: query
            });
        }

        if (context.knowledgeFields.meta) {
            metadataFields.push('meta');
        }

        if (context.knowledgeFields.keywords) {
            metadataFields.push('keywords');
        }

        if (metadataFields.length > 0) {
            passes.push({
                fields: metadataFields,
                operator: 'CONTAINS',
                value: query
            });
        }

        if (includeBodySearch && context.knowledgeFields.text) {
            passes.push({
                field: 'text',
                operator: 'CONTAINS',
                value: query
            });
        }

        return passes;
    },

    _buildCatalogPassDefinitions: function(context, query, includeBodySearch) {
        var passes = [];
        var metadataFields = [];

        if (context.catalogFields.name) {
            passes.push({
                field: 'name',
                operator: '=',
                value: query
            });
            passes.push({
                field: 'name',
                operator: 'STARTSWITH',
                value: query
            });
            passes.push({
                field: 'name',
                operator: 'CONTAINS',
                value: query
            });
        }

        if (context.catalogFields.shortDescription) {
            passes.push({
                field: 'short_description',
                operator: 'CONTAINS',
                value: query
            });
        }

        if (context.catalogFields.meta) {
            metadataFields.push('meta');
        }

        if (metadataFields.length > 0) {
            passes.push({
                fields: metadataFields,
                operator: 'CONTAINS',
                value: query
            });
        }

        if (includeBodySearch && context.catalogFields.description) {
            passes.push({
                field: 'description',
                operator: 'CONTAINS',
                value: query
            });
        }

        return passes;
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
            record.addQuery('published', '<=', context.now);
        }

        if (context.knowledgeFields.validTo) {
            validToQuery = record.addQuery('valid_to', '');
            validToQuery.addOrCondition('valid_to', '>=', context.now);
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

        candidateMap[candidateKey] = candidate;
        candidates.push(candidate);
    },

    _filterConnectedCatalogCandidates: function(candidates) {
        var connectedIds = this._getConnectedCatalogItemIdMap(candidates);
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

    _scoreAndSortCandidates: function(candidates, normalizedQuery, tokens) {
        var index;
        var candidate;
        var scoredCandidates = [];

        for (index = 0; index < candidates.length; index++) {
            candidate = candidates[index];
            candidate.score = this._calculateScore(candidate, normalizedQuery, tokens);

            if (candidate.resultType === 'knowledge') {
                candidate.score += 20;
            }

            if (candidate.score > 0) {
                scoredCandidates.push(candidate);
            }
        }

        scoredCandidates.sort(this._compareCandidates);

        return scoredCandidates;
    },

    _calculateScore: function(candidate, normalizedQuery, tokens) {
        var title = this._normalizeQuery(candidate.title);
        var metadata = this._normalizeQuery(candidate.metaText);
        var body = this._normalizeQuery(this._stripHtml(candidate.bodyText));
        var score = 0;

        if (title) {
            if (title === normalizedQuery) {
                score += 1000;
            } else if (title.indexOf(normalizedQuery) === 0) {
                score += 800;
            } else if (title.indexOf(normalizedQuery) > -1) {
                score += 600;
            }

            score += this._scoreTokenCoverage(title, tokens, 40);
        }

        if (metadata) {
            if (metadata.indexOf(normalizedQuery) > -1) {
                score += 250;
            }

            score += this._scoreTokenCoverage(metadata, tokens, 12);
        }

        if (body) {
            if (body.indexOf(normalizedQuery) > -1) {
                score += 100;
            }

            score += this._scoreTokenCoverage(body, tokens, 4);
        }

        return score;
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

        for (index = 0; index < candidates.length; index++) {
            candidate = candidates[index];
            results.push({
                sysId: candidate.sysId,
                resultType: candidate.resultType,
                resultTypeLabel: candidate.resultTypeLabel,
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

    _getConnectedCatalogItemIdMap: function(candidates) {
        var candidateIds = [];
        var connectedItemMap = {};
        var connectedContent = new GlideRecordSecure(this.CONNECTED_CONTENT_TABLE);
        var candidateIdString;
        var index;

        for (index = 0; index < candidates.length; index++) {
            candidateIds.push(candidates[index].sysId);
        }

        if (candidateIds.length === 0 || !connectedContent.isValid()) {
            return connectedItemMap;
        }

        candidateIdString = candidateIds.join(',');
        connectedContent.addQuery('catalog_item', 'IN', candidateIdString);
        connectedContent.addNotNullQuery('topic');
        connectedContent.orderByDesc('popularity');
        connectedContent.query();

        while (connectedContent.next()) {
            connectedItemMap[connectedContent.getValue('catalog_item')] = true;
        }

        return connectedItemMap;
    },

    _getCatalogTypeLabel: function(record, context) {
        var className = context.catalogFields.className ? record.getValue('sys_class_name') : '';

        if (className === 'sc_cat_item_producer') {
            return 'Record producer';
        }

        return 'Bestilling';
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
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
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
