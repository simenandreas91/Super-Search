(function() {
  var currentUser = gs.getUser();
  var firstName = '';
  var initialFilter = normalizeFilter($sp.getParameter('filter'));

  if (currentUser && currentUser.getFirstName) {
    firstName = currentUser.getFirstName() || '';
  }

  data.config = {
    resultsPageId: options.results_page_id || 'search_results',
    inputPlaceholder: options.input_placeholder || 'Finn artikler, nyheter, henvedelser eller personer.',
    buttonLabel: options.button_label || 'Sok',
    compactMode: String(options.compact_mode) === 'true'
  };

  data.filterOptions = [
    {
      id: 'all',
      label: 'Alle'
    },
    {
      id: 'knowledge_total',
      label: 'Artikler'
    },
    {
      id: 'news',
      label: 'Nyheter'
    },
    {
      id: 'catalog_item',
      label: 'Henvendelser'
    },
    {
      id: 'sys_user',
      label: 'Personer'
    },
    {
      id: 'topic',
      label: 'Områder'
    }
  ];

  data.greetingName = firstName;
  data.initialQuery = $sp.getParameter('q') || '';
  data.initialFilter = initialFilter;

  function normalizeFilter(value) {
    var normalizedValue = String(value || 'all').toLowerCase();

    if (normalizedValue === 'knowledge' || normalizedValue === 'featured_kb' || normalizedValue === 'knowledge_articles') {
      return 'knowledge_total';
    }

    if (normalizedValue === 'knowledge_total' || normalizedValue === 'knowledge_articles' || normalizedValue === 'catalog_item' || normalizedValue === 'news' || normalizedValue === 'sys_user' || normalizedValue === 'topic' || normalizedValue === 'featured_kb') {
      return normalizedValue;
    }

    return 'all';
  }
})();
