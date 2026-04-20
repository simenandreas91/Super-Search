api.controller = function($window, $scope, $location, $interval, $timeout) {
  var c = this;
  var placeholderStartPromise = null;
  var placeholderTypingPromise = null;
  var placeholderStartDelay = 180;
  var placeholderTypingDelay = 70;

  c.searchTerm = c.data.initialQuery || '';
  c.selectedFilter = 'all';
  c.isInputFocused = false;
  c.placeholder = {
    fullText: c.data.config.inputPlaceholder || '',
    typedText: '',
    isVisible: false
  };

  c.submitSearch = function() {
    var searchTerm = c.normalizeTerm(c.searchTerm);
    var targetUrl;

    if (!searchTerm) {
      return;
    }

    targetUrl = '?id=' + encodeURIComponent(c.data.config.resultsPageId) + '&q=' + encodeURIComponent(searchTerm);

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

  c.onInputFocus = function() {
    c.isInputFocused = true;
    syncPlaceholderAnimation(false);
  };

  c.onInputBlur = function() {
    c.isInputFocused = false;
    syncPlaceholderAnimation(true);
  };

  c.onSearchTermChange = function() {
    syncPlaceholderAnimation(false);
  };

  function hasSearchTerm() {
    return !!c.normalizeTerm(c.searchTerm);
  }

  function shouldShowPlaceholder() {
    return !!c.placeholder.fullText && !c.isInputFocused && !hasSearchTerm();
  }

  function cancelPlaceholderTimers() {
    if (placeholderStartPromise) {
      $timeout.cancel(placeholderStartPromise);
      placeholderStartPromise = null;
    }

    if (placeholderTypingPromise) {
      $interval.cancel(placeholderTypingPromise);
      placeholderTypingPromise = null;
    }
  }

  function hidePlaceholderAnimation() {
    cancelPlaceholderTimers();
    c.placeholder.typedText = '';
    c.placeholder.isVisible = false;
  }

  function startPlaceholderAnimation() {
    var index = 0;

    hidePlaceholderAnimation();

    if (!shouldShowPlaceholder()) {
      return;
    }

    c.placeholder.isVisible = true;

    placeholderStartPromise = $timeout(function() {
      placeholderStartPromise = null;
      c.placeholder.typedText = c.placeholder.fullText.charAt(0);
      index = 1;

      if (index >= c.placeholder.fullText.length) {
        return;
      }

      placeholderTypingPromise = $interval(function() {
        index += 1;
        c.placeholder.typedText = c.placeholder.fullText.slice(0, index);

        if (index >= c.placeholder.fullText.length) {
          $interval.cancel(placeholderTypingPromise);
          placeholderTypingPromise = null;
        }
      }, placeholderTypingDelay);
    }, placeholderStartDelay);
  }

  function syncPlaceholderAnimation(restartWhenVisible) {
    if (!shouldShowPlaceholder()) {
      hidePlaceholderAnimation();
      return;
    }

    if (restartWhenVisible || !c.placeholder.isVisible) {
      startPlaceholderAnimation();
    }
  }

  $scope.$on('$locationChangeSuccess', function() {
    c.searchTerm = c.normalizeTerm($location.search().q || '');
    c.selectedFilter = 'all';
    syncPlaceholderAnimation(true);
  });

  $scope.$on('$destroy', function() {
    cancelPlaceholderTimers();
  });

  syncPlaceholderAnimation(false);
};
