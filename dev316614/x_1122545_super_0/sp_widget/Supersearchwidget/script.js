(function() {
  var currentUser = gs.getUser();
  var firstName = '';

  if (currentUser && currentUser.getFirstName) {
    firstName = currentUser.getFirstName() || '';
  }

  data.config = {
    resultsPageId: options.results_page_id || 'search_results',
    inputPlaceholder: options.input_placeholder || 'Finn artikler, bestillingsskjema eller nyheter fra ett søk.',
    buttonLabel: options.button_label || 'Sok',
    compactMode: String(options.compact_mode) === 'true'
  };

  data.greetingName = firstName;
  data.initialQuery = $sp.getParameter('q') || '';
})();
