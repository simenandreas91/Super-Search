(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

	response.setContentType('application/json');
	response.setBody({
		"sessionToken":gs.getSession().getSessionToken(),
		"username": gs.getUserName()
		});

})(request, response);