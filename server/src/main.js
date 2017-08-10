var helmet = require('helmet');
var session = require('client-sessions');
var express = require('express');
var bodyParser = require('body-parser')
var logger = require('./logger');
var config = require('./config.js');

var app = express();
var engineeringMode = true;

app.use(helmet());

app.use(function(req, res, next) 
{
	if (req.path.substr(0, 4) == "/api") {
		res.contentType('application/json');
	}
	if (req.method == "POST" && req.headers["content-type"].substr(0, 16) != "application/json") {
		logger.info("Returning 415, content-type:", req.headers["content-type"]);
		res.status(415).send({ code: 415 });
	} else {
		next();
	}
});

app.use(bodyParser.json());

app.use(function(err, req, res, next)
{
	if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
		console.err("Returning 400");
		res.status(400).send({ code: 400 });
	} else {
		next();
	}
});

app.use(session(
{
	cookieName: 'session',
	secret: config.session.secret,
	duration: 60 * 60 * 1000, // 60 minutes initial duration
	activeDuration: 60 * 60 * 1000, // prolong by 60 minutes
	httpOnly: true, // do not expose to browser's javascript
	secure: config.session.secure, // instruct browser to only send cookie over https
	ephemeral: true // instruct browser to drop cookie when browser is closed
}));

app.use(function(req, res, next) 
{
	if (req.session) {
		if (req.session.authenticated && req.session.guid) {
			req.vl_guid = req.session.guid;
			req.vl_ipAddress = req.get("X-Votelist-RemoteAdress");
			logger.verbose("session", req.vl_guid, req.url);
		}
		// finishing processing the middleware and run the route
		next();
	} else {
		next();
	}
});

function requireLogin (req, res, next) 
{
	if (!req.session || !req.session.authenticated || !req.session.guid) {
		logger.warn("requireLogin: missing session/GUID or not authorized");
		res.status(401).send({ code: 401 });
	} else {
		next();
	}
};

app.get('/api/logout', function(req, res) 
{
	req.session.reset();
	res.status(200).send({ code: 200 });
});

app.get('/api/login', requireLogin, function(req, res) 
{
	res.status(200).send({ code: 200, guid: req.vl_guid });
});

app.get('/api/alive', function(req, res) 
{
	res.status(200).send({ code: 200 });
});

require("./api")(app, requireLogin);

app.use(express.static('../client'));

app.listen(3100, 'localhost');

