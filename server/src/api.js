var mysql = require('mysql');
var http = require('https');
var logger = require('./logger');

var errors = require('./errors.js');
var config = require('./config.js');

var tableAcl = {
	login: {
		write: [ ],
		methods: ["GET", "POST"]
	},
	votelist: {
		selectFields: 'id,title,author,votesUp,votesDown,changedAt',
		write: [ "title", "author" ],
		methods: ["GET", "POST", "PUT", "DELETE"]
	}
}

var dbc = null; // database connection

function requireDbc(req, res, next) 
{
	if (!(dbc && (dbc.state == "connected" || dbc.state == "authenticated"))) {
		logger.info("Connecting to DB " + config.connection.database);
		dbc = mysql.createConnection(config.connection);
		if (!dbc) {
			res.status(500).send({ code: 500, error: errors.dbc });
		} else {
			dbc.connect(function(err) {
				if (err) {
					logger.error('Error connecting to db: ' + err.stack);
					res.status(500).send({ code: 500, error: errors.dbc });
				} else {
					logger.info("Success! ThreadId " + dbc.threadId);
					next();
				}
			});
		}
	} else {
		next();
	}
}

function checkTableAcl(req, res, next)
{
	if (!(req.params && req.params.tablename && (Object.keys(tableAcl).indexOf(req.params.tablename) > -1))) {
		res.status(403).send({ code: 403, error: errors.dbTableAcl });
		
	} else {
		if (tableAcl[req.params.tablename].methods.indexOf(req.method) == -1) {
			res.status(405).send({ code: 405, error: errors.dbTableAclMethod });

		} else if (req.method == "POST" || req.method == "PUT") {
			var fieldErrors = false;
			// ignore some fields
			delete req.body.id;
			delete req.body.ipAddress;
			delete req.body.guid;
			delete req.body.changedAt;
			Object.keys(req.body).forEach(k => 
				fieldErrors = fieldErrors || (tableAcl[req.params.tablename].write.indexOf(k) == -1));
			// todo: check types against db schema
			if (fieldErrors) {
				res.status(400).send({ code: 400, error: errors.dbTableAclWriteField });
			} else {
				next();
			}

		} else {
			next();
		}
	}
}

module.exports = function(app, requireLogin, extractUser)
{

app.post('/api/login', function(req, res) 
{
	//logger.info(req);
	var guid = req.get("X-Votelist-GUID");
	var ipAddress = req.get("X-Votelist-RemoteAdress");
	logger.info("post login guid/ip:", guid, ipAddress);

	if (req.body.passphrase === config.passphrase) {
		if (guid && ipAddress) {
			req.session.guid = guid;
			req.session.authenticated = true;
			req.vl_guid = guid;
			req.vl_ipAddress = ipAddress;
			res.status(200).send({ code: 200, guid: guid });
		} else {
			res.status(400).send({ code: 400 });
		}
	} else {
		res.status(401).send({ code: 401, guid: guid });
	}
});

app.get('/api/db/:tablename', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
	dbc.query('SELECT ' + tableAcl.votelist.selectFields + ',IF(guid="' + req.session.guid +
		'", 1, 0) AS canEdit FROM denis_td_' + req.params.tablename + ';', 
		function(err, rows, fields) {
			if (err) {
				logger.info(errors.dbGet, err);
				res.status(500).send({ code: 500, error: errors.dbGet });

			} else {
				res.status(200).send(rows);

			}
		}
	);
});

app.get('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
	if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id)) {
		res.status(400).send({ code: 400, error: errors.dbGetReq });

	} else {
		dbc.query('SELECT ' + tableAcl.votelist.selectFields + ',IF(guid="' + req.session.guid +
			'", 1, 0) AS canEdit FROM denis_td_' + req.params.tablename + 
			' WHERE id=' + req.params.id + ';', 
			function(err, rows, fields) {
				if (err) {
					logger.info(errors.dbGet, err);
					res.status(500).send({ code: 500, error: errors.dbGet });

				} else {
					if (rows.length == 0) {
						res.status(404).send({ code: 404 });

					} else {
						if (rows.length > 1) {
							logger.error("'id' is not unique");
						}
						res.status(200).send(rows[0]);

					}
				}
			}
		);
	}
});

app.post('/api/db/:tablename', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
	if (!(req.body && typeof req.body == "object")) {
		res.status(400).send({ code: 400, error: errors.dbPostReq });

	} else {
		dbc.query('SELECT COUNT(id) FROM denis_td_' + req.params.tablename + ';', function(err, rows, fields) {
			if (err) {
				logger.info(errors.dbGet, err);
				res.status(500).send({ code: 500, error: errors.dbGet });

			} else {
				if (rows.length == 0) {
					res.status(500).send({ code: 500, error: errors.dbGet });

				} else {
					if (rows.length != 1) {
						logger.error("COUNT(id) failed");
						res.status(500).send({ code: 500 });
						return;
					}
					if (rows[0]["COUNT(id)"] > 999) {
						res.status(429).send({ code: 429, error: errors.tooManyRequests });
						return;
					}
				}
			}

			var ipAddress = req.get("X-Votelist-RemoteAdress");
			var now = new Date();
			now.setMilliseconds(0);

			req.body.changedAt = now.toISOString();
			req.body.guid = req.session.guid;
			req.body.ipAddress = ipAddress;
			dbc.query("INSERT INTO denis_td_" + req.params.tablename + " SET ?;", req.body,
				function(err, info) {
					if (err) {
						logger.info(errors.dbPost, err);
						res.status(500).send({ code: 500, error: errors.dbPost });

					} else {
						res.status(200).send({ 
							id: info.insertId,
							changedAt: req.body.changedAt
						});
					}
				}
			);
		});
	}
});

app.delete('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
	if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id)) {
		res.status(400).send({ code: 400, error: errors.dbDeleteReq });

	} else {
		dbc.query('SELECT id,guid FROM denis_td_' + req.params.tablename + " WHERE id=" + req.params.id + ";", function(err, rows, fields) {
			if (err) {
				logger.info(errors.dbGet, err);
				res.status(500).send({ code: 500, error: errors.dbGet });
				return;

			} else {
				if (rows.length == 0) {
					res.status(500).send({ code: 500, error: errors.dbGet });
					return;

				} else {
					if (rows.length > 1) {
						logger.warn("id not unique");
					}
					if (rows[0]["guid"] != req.session.guid) {
						res.status(403).send({ code: 403 });
						return;
					}
				}
			}
			dbc.query("DELETE FROM denis_td_" + req.params.tablename + " WHERE id=" + req.params.id + ";",
				function(err, info) {
					if (err) {
						logger.info(errors.dbDelete, err);
						res.status(500).send({ code: 500, error: errors.dbDelete });
					} else {
						if (info.affectedRows == 0) {
							res.status(404).send({ code: 404 });
						} else {
							res.status(200).send({ count: info.affectedRows });
						}
					}
				}
			);
		});
	}
});

app.put('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
	if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id) ||
		!(req.body && typeof req.body == "object"))
	{
		res.status(400).send({ code: 400, error: errors.dbPutReq });

	} else {
		dbc.query('SELECT id,guid FROM denis_td_' + req.params.tablename + " WHERE id=" + req.params.id + ";", function(err, rows, fields) {
			if (err) {
				logger.info(errors.dbGet, err);
				res.status(500).send({ code: 500, error: errors.dbGet });
				return;

			} else {
				if (rows.length == 0) {
					res.status(500).send({ code: 500, error: errors.dbGet });
					return;

				} else {
					if (rows.length > 1) {
						logger.warn("id not unique");
					}
					if (rows[0]["guid"] != req.session.guid) {
						res.status(403).send({ code: 403 });
						return;
					}
				}
			}

			var ipAddress = req.get("X-Votelist-RemoteAdress");
			var now = new Date();
			now.setMilliseconds(0);

			req.body.changedAt = now.toISOString();
			req.body.guid = req.session.guid;
			req.body.ipAddress = ipAddress;
			dbc.query("UPDATE denis_td_" + req.params.tablename + " SET ? WHERE id=" + req.params.id + ";", req.body,
				function(err, info) {
					if (err) {
						logger.info(errors.dbPut, err);
						res.status(500).send({ code: 500, error: errors.dbPut });
					} else {
						logger.info(info);
						if (info.affectedRows == 0) {
							res.status(404).send({ code: 404 });
						} else {
							res.status(200).send({ 
								count: info.affectedRows, 
								changed: info.changedRows,
								guid: req.body.guid, 
								changedAt: req.body.changedAt  
							});
						}
					}
				}
			);
		});
	}
});

app.get('/api/votelist', requireLogin, requireDbc, function(req, res)
{
	dbc.query('SELECT vl.id,title,author,votesUp,votesDown,changedAt,' +
		'IF(vl.guid="' + req.session.guid + '", 1, 0) AS canEdit,' +
		'ISNULL(votes.guid) AS canVote ' +
		'FROM denis_td_votelist AS vl LEFT JOIN denis_td_votes AS votes ON vl.id=votes.vlId AND ' +
		'votes.guid="' + req.session.guid + '" ' +
		'ORDER BY (votesUp-votesDown) DESC, vl.title ASC;',
		function(err, rows, fields) {
			if (err) {
				logger.info(errors.dbGet, err);
				res.status(500).send({ code: 500, error: errors.dbGet });

			} else {
				res.status(200).send(rows);

			}
		}
	);
});

app.post('/api/votes/:id/:vote', requireLogin, requireDbc, function(req, res)
{
	if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id && 
		(req.params.vote == "voteup" || req.params.vote == "votedown"))) {
		res.status(400).send({ code: 400, error: errors.dbPostReq });

	} else {
		dbc.query('SELECT vlId,guid FROM denis_td_votes WHERE vlId=' + req.params.id + 
			' AND guid="' + req.session.guid + '";',
			function(err, rows, fields) {
				if (err) {
					logger.info(errors.dbGet, err);
					res.status(500).send({ code: 500, error: errors.dbGet });
					return;

				} else {
					if (rows.length > 0) {
						// already voted
						res.status(403).send({ code: 403 });
						return;

					} else {
						var now = new Date();
						now.setMilliseconds(0);
						var changedAt = now.toISOString();
						var setStr = "votesUp = votesUp + 1, changedAt = '" + changedAt + "'";
						if (req.params.vote == "votedown") {
							setStr = "votesDown = votesDown + 1, changedAt = '" + changedAt + "'";
						}
						dbc.query("UPDATE denis_td_votelist SET "+setStr+" WHERE id="+req.params.id+";", 
							function(err, info) {
								if (err || info.affectedRows == 0) {
									logger.info(errors.dbPost, err);
									res.status(500).send({ code: 500, error: errors.dbPost });
								} else {
									res.status(200).send({ count: info.affectedRows });

									// invalidate guid
									dbc.query("INSERT INTO denis_td_votes SET ?;", 
										{ vlId: req.params.id, guid: req.session.guid },
										function(err, info) {
											if (err || info.affectedRows == 0) {
												logger.info(errors.dbPost, err);
											}
										}
									);
								}
							}
						);
					}
				}
			}
		);
	}
});

} // exports
