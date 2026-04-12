api.controller = function($window, $scope, $location) {
  var c = this;

  c.searchTerm = c.data.initialQuery || '';

  c.submitSearch = function() {
    var searchTerm = c.normalizeTerm(c.searchTerm);

    if (!searchTerm) {
      return;
    }

    $window.location.href = '?id=' + encodeURIComponent(c.data.config.resultsPageId) + '&q=' + encodeURIComponent(searchTerm);
  };

  c.normalizeTerm = function(value) {
    return (value || '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  };

  $scope.$on('$locationChangeSuccess', function() {
    c.searchTerm = c.normalizeTerm($location.search().q || '');
  });
};
