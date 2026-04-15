api.controller = function($window, $scope, $location) {
  var c = this;

  c.searchTerm = c.data.initialQuery || '';
  c.selectedFilter = c.data.initialFilter || 'all';

  c.submitSearch = function() {
    var searchTerm = c.normalizeTerm(c.searchTerm);
    var targetUrl;

    if (!searchTerm) {
      return;
    }

    targetUrl = '?id=' + encodeURIComponent(c.data.config.resultsPageId) + '&q=' + encodeURIComponent(searchTerm);

    if (c.selectedFilter && c.selectedFilter !== 'all') {
      targetUrl += '&filter=' + encodeURIComponent(c.selectedFilter);
    }

    $window.location.href = targetUrl;
  };

  c.normalizeTerm = function(value) {
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

  $scope.$on('$locationChangeSuccess', function() {
    c.searchTerm = c.normalizeTerm($location.search().q || '');
    c.selectedFilter = c.normalizeFilter($location.search().filter || 'all');
  });
};
