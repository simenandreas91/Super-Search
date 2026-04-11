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
      page: page
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
      return;
    }

    $location.search('q', c.search.query);

    if (c.search.page > 1) {
      $location.search('page', c.search.page);
    } else {
      $location.search('page', null);
    }
  };
};
