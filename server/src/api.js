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
        write: [ "title", "votesUp", "votesDown", "author" ],
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

    if (guid) {
        req.session.guid = guid;
        req.session.authenticated = true;
        res.status(200).send({ code: 200 });
    } else {
        res.status(400).send({ code: 400 });
    }
});

app.get('/api/db/:tablename', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
    dbc.query('SELECT * FROM denis_td_' + req.params.tablename + ';', function(err, rows, fields) {
        if (err) {
            logger.info(errors.dbGet, err);
            res.status(500).send({ code: 500, error: errors.dbGet });

        } else {
            res.status(200).send(rows);

        }
    });
});

app.get('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
    if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id)) {
        res.status(400).send({ code: 400, error: errors.dbGetReq });

    } else {
        dbc.query('SELECT * FROM denis_td_' + req.params.tablename + ' WHERE id=' + req.params.id + ';', function(err, rows, fields) {
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
        });
    }
});

app.post('/api/db/:tablename', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
    if (!(req.body && typeof req.body == "object")) {
        res.status(400).send({ code: 400, error: errors.dbPostReq });

    } else {
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
                        changedBy: req.body.changedBy, 
                        changedAt: req.body.changedAt 
                    });
                }
            }
        );
    }
});

app.delete('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
    if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id)) {
        res.status(400).send({ code: 400, error: errors.dbDeleteReq });

    } else {
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
    }
});

app.put('/api/db/:tablename/:id', requireLogin, checkTableAcl, requireDbc, function(req, res)
{
    if (!(req.params && req.params.id && parseInt(req.params.id) == req.params.id) ||
        !(req.body && typeof req.body == "object"))
    {
        res.status(400).send({ code: 400, error: errors.dbPutReq });

    } else {
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
    }
});

} // exports
