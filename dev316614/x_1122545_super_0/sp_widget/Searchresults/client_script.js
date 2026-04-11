api.controller = function($location) {
  var c = this;

  c.search = c.data.search;
  c.isLoading = false;

  c.goToPage = function(page) {
    if (c.isLoading || !c.search || page < 1 || page > c.search.totalPages || page === c.search.page) {
      return;
    }

    c.isLoading = true;
    c.server.get({
      query: c.search.query,
      page: page,
      resultFilter: c.search.activeFilter
    }).then(function(response) {
      c.search = response.data.search;
      c.updateUrl();
      c.isLoading = false;
    }, function() {
      c.isLoading = false;
    });
  };

  c.showPager = function() {
    return c.search && c.search.totalPages > 1;
  };

  c.setFilter = function(filterId) {
    if (c.isLoading || !c.search || !filterId || filterId === c.search.activeFilter) {
      return;
    }

    c.isLoading = true;
    c.server.get({
      query: c.search.query,
      page: 1,
      resultFilter: filterId
    }).then(function(response) {
      c.search = response.data.search;
      c.updateUrl();
      c.isLoading = false;
    }, function() {
      c.isLoading = false;
    });
  };

  c.isActiveFilter = function(filterId) {
    return c.search && c.search.activeFilter === filterId;
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
