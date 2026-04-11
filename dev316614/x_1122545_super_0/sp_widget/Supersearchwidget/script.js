(function() {
  var currentUser = gs.getUser();
  var firstName = '';

  if (currentUser && currentUser.getFirstName) {
    firstName = currentUser.getFirstName() || '';
  }

  data.config = {
    resultsPageId: options.results_page_id || 'search_results',
    inputPlaceholder: options.input_placeholder || 'Finn artikler, bestillinger og record producers fra ett sok.',
    buttonLabel: options.button_label || 'Sok'
  };

  data.greetingName = firstName;
  data.initialQuery = $sp.getParameter('q') || '';
})();
