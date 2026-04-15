api.controller = function($window) {
  var c = this;

  c.isLoading = false;
  c.normalizeQuery = function(value) {
    return (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  };

  c.normalizeFilter = function(value) {
    var normalizedValue = String(value || 'all').toLowerCase();

    if (normalizedValue === 'knowledge') {
      return 'knowledge_total';
    }

    if (normalizedValue === 'knowledge_total' || normalizedValue === 'knowledge_articles' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'sys_user' || normalizedValue === 'topic' || normalizedValue === 'featured_kb') {
      return normalizedValue;
    }

    return 'all';
  };

  c.matchesFilter = function(result, filterId) {
    if (!result) {
      return false;
    }

    if (filterId === 'all') {
      return true;
    }

    if (filterId === 'knowledge_total') {
      return result.resultType === 'knowledge';
    }

    if (filterId === 'featured_kb') {
      return result.isFeaturedKnowledgeBase === true;
    }

    if (filterId === 'knowledge_articles') {
      return result.resultType === 'knowledge' && result.isFeaturedKnowledgeBase !== true;
    }

    return result.resultType === filterId;
  };

  c.getFilteredResults = function(search, filterId) {
    var allResults = search && angular.isArray(search.allResults) ? search.allResults : [];

    return allResults.filter(function(result) {
      return c.matchesFilter(result, filterId);
    });
  };

  c.applyClientState = function(search, request) {
    var nextFilter;
    var filteredResults;
    var totalPages;
    var nextPage;
    var startIndex;

    if (!search) {
      return search;
    }

    nextFilter = c.normalizeFilter(request && typeof request.resultFilter !== 'undefined' ? request.resultFilter : search.activeFilter);
    filteredResults = c.getFilteredResults(search, nextFilter);
    totalPages = filteredResults.length ? Math.ceil(filteredResults.length / search.pageSize) : 0;
    nextPage = parseInt(request && typeof request.page !== 'undefined' ? request.page : search.page, 10);

    if (isNaN(nextPage) || nextPage < 1) {
      nextPage = 1;
    }

    if (totalPages > 0 && nextPage > totalPages) {
      nextPage = totalPages;
    }

    if (totalPages === 0) {
      nextPage = 1;
    }

    startIndex = (nextPage - 1) * search.pageSize;
    search.activeFilter = nextFilter;
    search.page = nextPage;
    search.total = filteredResults.length;
    search.totalPages = totalPages;
    search.hasMore = nextPage < totalPages;
    search.results = filteredResults.slice(startIndex, startIndex + search.pageSize);

    return search;
  };

  c.prepareSearch = function(search) {
    var preparedSearch = search || {};

    if (!angular.isArray(preparedSearch.allResults)) {
      preparedSearch.allResults = angular.isArray(preparedSearch.results) ? preparedSearch.results.slice(0) : [];
    }

    if (!preparedSearch.pageSize || preparedSearch.pageSize < 1) {
      preparedSearch.pageSize = 10;
    }

    preparedSearch.activeFilter = c.normalizeFilter(preparedSearch.activeFilter);
    preparedSearch.page = parseInt(preparedSearch.page, 10) || 1;

    return c.applyClientState(preparedSearch, {
      page: preparedSearch.page,
      resultFilter: preparedSearch.activeFilter
    });
  };

  c.executeSearch = function(request) {
    var nextQuery = c.search ? c.search.query : '';
    var nextPage = c.search ? c.search.page : 1;
    var nextFilter = c.search ? c.search.activeFilter : 'all';

    request = request || {};

    if (typeof request.query !== 'undefined') {
      nextQuery = c.normalizeQuery(request.query);
    }

    if (typeof request.page !== 'undefined') {
      nextPage = request.page;
    }

    if (typeof request.resultFilter !== 'undefined') {
      nextFilter = c.normalizeFilter(request.resultFilter);
    }

    if (!nextQuery) {
      return;
    }

    c.isLoading = true;
    c.server.get({
      query: nextQuery,
      page: nextPage,
      resultFilter: nextFilter
    }).then(function(response) {
      c.search = c.prepareSearch(response.data.search);
      c.data.config.deferInitialQuery = false;
      c.updateUrl();
      c.isLoading = false;
    }, function() {
      c.isLoading = false;
    });
  };

  c.updateLocalResults = function(request) {
    if (!c.search) {
      return;
    }

    c.applyClientState(c.search, request || {});
    c.updateUrl();
  };

  c.goToPage = function(page) {
    if (c.isLoading || !c.search || page < 1 || page > c.search.totalPages || page === c.search.page) {
      return;
    }

    c.updateLocalResults({
      page: page
    });
  };

  c.showPager = function() {
    return c.search && c.search.totalPages > 1;
  };

  c.setFilter = function(filterId) {
    if (c.isLoading || !c.search || !filterId || filterId === c.search.activeFilter) {
      return;
    }

    c.updateLocalResults({
      page: 1,
      resultFilter: filterId
    });
  };

  c.isActiveFilter = function(filterId) {
    return c.search && c.search.activeFilter === filterId;
  };

  c.hasZeroResultState = function() {
    return c.search && c.search.zeroResultState;
  };

  c.runSuggestedQuery = function(query) {
    var normalizedQuery = c.normalizeQuery(query);

    if (c.isLoading || !normalizedQuery) {
      return;
    }

    if (c.search && c.search.query === normalizedQuery && c.search.activeFilter === 'all' && c.search.page === 1) {
      return;
    }

    c.executeSearch({
      query: normalizedQuery,
      page: 1,
      resultFilter: 'all'
    });
  };

  c.getStartIndex = function() {
    if (!c.search || !c.search.total) {
      return 0;
    }

    return ((c.search.page - 1) * c.search.pageSize) + 1;
  };

  c.getEndIndex = function() {
    if (!c.search || !c.search.total) {
      return 0;
    }

    return Math.min(c.search.page * c.search.pageSize, c.search.total);
  };

  c.openResult = function(result, event) {
    var currentNode;

    if (c.isLoading || !result || !result.url) {
      return;
    }

    if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.which === 2)) {
      return;
    }

    currentNode = event && event.target;

    while (currentNode) {
      if (currentNode.tagName === 'A') {
        return;
      }

      if (event && currentNode === event.currentTarget) {
        break;
      }

      currentNode = currentNode.parentNode;
    }

    $window.location.href = result.url;
  };

  c.handleResultKeypress = function(event, result) {
    var keyCode = event.which || event.keyCode;

    if (keyCode !== 13 && keyCode !== 32) {
      return;
    }

    event.preventDefault();
    c.openResult(result, event);
  };

  c.updateUrl = function() {
    var currentParams = new $window.URLSearchParams($window.location.search || '');
    var params = new $window.URLSearchParams(currentParams.toString());
    var currentQueryString;
    var queryString;
    var currentUrl;
    var nextUrl;

    if (!c.search || !c.search.query) {
      params.delete('q');
      params.delete('page');
      params.delete('filter');
    } else {
      params.set('q', c.search.query);

      if (c.search.page > 1) {
        params.set('page', c.search.page);
      } else {
        params.delete('page');
      }

      if (c.search.activeFilter && c.search.activeFilter !== 'all') {
        params.set('filter', c.search.activeFilter);
      } else {
        params.delete('filter');
      }
    }

    currentQueryString = currentParams.toString();
    queryString = params.toString();
    currentUrl = $window.location.pathname + (currentQueryString ? '?' + currentQueryString : '') + ($window.location.hash || '');
    nextUrl = $window.location.pathname + (queryString ? '?' + queryString : '') + ($window.location.hash || '');

    if (nextUrl === currentUrl) {
      return;
    }

    $window.history.replaceState(null, '', nextUrl);
  };

  c.search = c.prepareSearch(c.data.search);

  if (c.data.config.deferInitialQuery && c.search && c.search.query) {
    c.isLoading = true;
    c.executeSearch({
      query: c.search.query,
      page: c.search.page,
      resultFilter: c.search.activeFilter
    });
  }
};
