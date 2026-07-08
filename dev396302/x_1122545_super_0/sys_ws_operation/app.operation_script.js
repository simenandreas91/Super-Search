(function process(/*RESTAPIRequest*/ request, /*RESTAPIResponse*/ response) {

	var responseBody = gs.getProperty('x_1122545_super_0.SuperSearchDashboard');
	response.setContentType('text/html');
	response.setStatus(200);
	response.getStreamWriter().writeString(responseBody);

})(request, response);