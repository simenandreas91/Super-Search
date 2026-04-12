api.controller = function($location) {
  var c = this;

  c.search = c.data.search;
  c.isLoading = false;
  c.normalizeQuery = function(value) {
    return (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
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
      nextFilter = request.resultFilter;
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
      c.search = response.data.search;
      c.updateUrl();
      c.isLoading = false;
    }, function() {
      c.isLoading = false;
    });
  };

  c.goToPage = function(page) {
    if (c.isLoading || !c.search || page < 1 || page > c.search.totalPages || page === c.search.page) {
      return;
    }

    c.executeSearch({
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

    c.executeSearch({
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

  c.updateUrl = function() {
    if (!c.search || !c.search.query) {
      $location.search('q', null);
      $location.search('page', null);
      $location.search('filter', null);
      return;
    }

    $location.search('q', c.search.query);

    if (c.search.page > 1) {
      $location.search('page', c.search.page);
    } else {
      $location.search('page', null);
    }

    if (c.search.activeFilter && c.search.activeFilter !== 'all') {
      $location.search('filter', c.search.activeFilter);
    } else {
      $location.search('filter', null);
    }
  };
};
