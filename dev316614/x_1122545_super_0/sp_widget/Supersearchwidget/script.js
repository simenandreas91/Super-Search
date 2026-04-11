(function() {
  data.config = {
    resultsPageId: options.results_page_id || 'search_results',
    inputPlaceholder: options.input_placeholder || 'Sok i kunnskapsbasen',
    buttonLabel: options.button_label || 'Sok'
  };

  data.initialQuery = $sp.getParameter('q') || '';
})();
