var SuperSearchAnalyticsBridge = Class.create();
SuperSearchAnalyticsBridge.prototype = {
    initialize: function() {},

    publishSearch: function(payloadJson) {
        var payload = this._parsePayload(payloadJson);
        var query = this._normalizeQuery(payload.query);
        var analyticsPayload;

        if (!query) {
            return false;
        }

        analyticsPayload = {
            query: query,
            portal_id: this._normalizeSysId(payload.portalId),
            page_id: this._resolvePageSysId(payload.pageId),
            refinement_occurred: false,
            search_results: this._buildSearchResults(payload.searchResults)
        };

        analyticsPayload = this._removeEmptyValues(analyticsPayload);
        new GlideSPSearchAnalytics().publish(JSON.stringify(analyticsPayload));

        return true;
    },

    publishClick: function(payloadJson) {
        var payload = this._parsePayload(payloadJson);
        var query = this._normalizeQuery(payload.query);
        var clickedResult = payload.clickedResult || {};
        var sourceTable = this._mapResultTypeToTable(clickedResult.resultType);
        var clickRankPayload;
        var analyticsPayload;
        var portalId;
        var pageId;
        var clickRank;

        if (!query || !clickedResult.sysId || !sourceTable) {
            return false;
        }

        portalId = this._normalizeSysId(payload.portalId);
        pageId = this._resolvePageSysId(payload.pageId);
        clickRank = this._normalizePositiveInteger(payload.clickRank);

        clickRankPayload = {
            query: query,
            portal_id: portalId,
            click_rank: clickRank
        };

        analyticsPayload = {
            query: query,
            portal_id: portalId,
            page_id: pageId,
            refinement_occurred: false,
            click_rank: clickRank,
            browser_info: String(payload.browserInfo || ''),
            result_clicked_sys_id: String(clickedResult.sysId),
            label_description: String(clickedResult.label || ''),
            source_table: sourceTable,
            search_results: this._buildSearchResults(payload.searchResults)
        };

        clickRankPayload = this._removeEmptyValues(clickRankPayload);
        analyticsPayload = this._removeEmptyValues(analyticsPayload);

        try {
            new GlideSPSearchAnalytics().publish(JSON.stringify(clickRankPayload));
        } catch (rankEx) {
            gs.warn('SuperSearchAnalyticsBridge: failed to publish click-rank analytics. ' + (rankEx.message || rankEx));
        }

        try {
            new GlideSPSearchAnalytics().publish(JSON.stringify(analyticsPayload));
        } catch (detailEx) {
            gs.warn('SuperSearchAnalyticsBridge: failed to publish click-detail analytics. ' + (detailEx.message || detailEx));
        }

        // Some custom-widget click publishes do not reliably roll the rank back onto sys_search_event.
        // Update the matching search event directly so dashboards can depend on click_rank.
        this._updateSearchEventClickRank(query, portalId, clickRank, pageId);

        return true;
    },

    _buildSearchResults: function(searchResults) {
        var results = [];
        var index;
        var item;
        var tableName;

        if (!searchResults || !searchResults.length) {
            return results;
        }

        for (index = 0; index < searchResults.length; index++) {
            item = searchResults[index] || {};
            tableName = this._mapResultTypeToTable(item.resultType);

            if (!item.sysId || !tableName) {
                continue;
            }

            results.push({
                record_id: String(item.sysId),
                table_name: tableName
            });
        }

        return results;
    },

    _mapResultTypeToTable: function(resultType) {
        var normalizedType = String(resultType || '').toLowerCase();

        if (normalizedType === 'knowledge') {
            return 'kb_knowledge';
        }

        if (normalizedType === 'catalog_item') {
            return 'sc_cat_item';
        }

        if (normalizedType === 'news') {
            return 'sn_cd_content_base';
        }

        if (normalizedType === 'sys_user') {
            return 'sys_user';
        }

        if (normalizedType === 'topic') {
            return 'topic';
        }

        return '';
    },

    _resolvePageSysId: function(pageId) {
        var normalizedPageId = String(pageId || '');
        var pageRecord;

        if (!normalizedPageId) {
            return '';
        }

        if (/^[0-9a-f]{32}$/i.test(normalizedPageId)) {
            return normalizedPageId;
        }

        pageRecord = new GlideRecord('sp_page');
        pageRecord.addQuery('id', normalizedPageId);
        pageRecord.setLimit(1);
        pageRecord.query();

        if (pageRecord.next()) {
            return pageRecord.getUniqueValue();
        }

        return '';
    },

    _normalizeQuery: function(value) {
        return String(value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    },

    _normalizeSysId: function(value) {
        var normalizedValue = String(value || '');

        if (/^[0-9a-f]{32}$/i.test(normalizedValue)) {
            return normalizedValue;
        }

        return '';
    },

    _normalizePositiveInteger: function(value) {
        var normalizedValue = parseInt(value, 10);

        if (isNaN(normalizedValue) || normalizedValue < 1) {
            return '';
        }

        return normalizedValue;
    },

    _updateSearchEventClickRank: function(query, portalId, clickRank, pageId) {
        var searchEvent;
        var sessionId = gs.getSessionID ? gs.getSessionID() : '';
        var existingRank;
        var nextRank;

        if (!query || !portalId || !clickRank) {
            return false;
        }

        searchEvent = new GlideRecord('sys_search_event');
        searchEvent.addQuery('search_query', query);
        searchEvent.addQuery('application_id', portalId);
        searchEvent.addQuery('application_table', 'sp_portal');
        searchEvent.addQuery('user', gs.getUserID());

        if (sessionId) {
          searchEvent.addQuery('session', sessionId);
        }

        if (pageId) {
          searchEvent.addQuery('ui_source', pageId);
        }

        searchEvent.orderByDesc('sys_created_on');
        searchEvent.setLimit(1);
        searchEvent.query();

        if (!searchEvent.next()) {
            return false;
        }

        existingRank = parseInt(searchEvent.getValue('click_rank'), 10);

        if (isNaN(existingRank) || existingRank < 0) {
            existingRank = 0;
        }

        nextRank = Math.max(existingRank, clickRank);
        searchEvent.setValue('click_rank', nextRank);
        searchEvent.update();

        return true;
    },

    _removeEmptyValues: function(payload) {
        var cleanPayload = {};
        var key;

        for (key in payload) {
            if (!payload.hasOwnProperty(key)) {
                continue;
            }

            if (payload[key] === '' || payload[key] === null || typeof payload[key] === 'undefined') {
                continue;
            }

            cleanPayload[key] = payload[key];
        }

        return cleanPayload;
    },

    _parsePayload: function(payloadJson) {
        if (!payloadJson) {
            return {};
        }

        if (typeof payloadJson === 'object') {
            return payloadJson;
        }

        try {
            return JSON.parse(payloadJson);
        } catch (ex) {
            gs.warn('SuperSearchAnalyticsBridge: invalid payload. ' + ex);
            return {};
        }
    },

    type: 'SuperSearchAnalyticsBridge'
};
