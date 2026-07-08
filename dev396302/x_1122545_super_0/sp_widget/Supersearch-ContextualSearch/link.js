function link(scope, element, attrs, controller) {
	var focusId;
	$(element).on('click', '.cxs-result-title>a', function($event) {
		focusId = $(this).attr('id');
	});

	scope.onBackToResult = function() {
		if (!focusId)
			return;

		setTimeout(function() {
			$('#' + focusId).focus();
		}, 500);
	};

	/*
		we can use angular expressions for the below funtionalities. But JAWS is reading angular expressions on live regions.
		so we are manipulating directly DOM.
	*/
	var timerPromise;
	scope.cxs.ariaStatus = '';
	function updateAriaStatus(msg) {
		var target = $(element).find('#sp_cxs_aria_status')[0];
		if (!target)
			return;

		scope.cxs.ariaStatus = msg;
		target.innerHTML = '<div>' +$('<div>', { text:msg }).html() + '</div>';
	}

	scope.setAriaStatus = function(msg, delay) {
		delay = delay || 0;
		if(delay == 0 || timerPromise)
			clearTimeout(timerPromise);

		(function(val) {
			timerPromise = setTimeout(function() {
				timerPromise = undefined;
				updateAriaStatus(val);
		}, delay);})(msg);
	};

	if (controller && controller.data && controller.data.ariaMsgs)
		scope.setAriaStatus(controller.data.ariaMsgs.noResultsToDisplay);
}
