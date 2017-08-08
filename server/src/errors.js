
module.exports = {
    dbc: { id: 1, msg: "Database connection failure" },
    dbTableAcl: { id: 2, msg: "Error retrieving content: resource not authorized" },
    dbTableAclWriteField: { id: 3, msg: "Error inserting content: field not authorized" },
    dbTableAclMethod: { id: 4, msg: "Error: method not allowed" },

    dbGet: { id: 11, msg: "Error retrieving content" },
    dbPost: { id: 12, msg: "Error inserting content" },
    dbPut: { id: 13, msg: "Error updating content" },
    dbDelete: { id: 14, msg: "Error deleting content" },

    dbGetReq: { id: 110, msg: "Error retrieving content: Bad request" },
    dbPostReq: { id: 120, msg: "Error inserting content: Bad request" },
    dbPutReq: { id: 130, msg: "Error updating content: Bad request" },
    dbDeleteReq: { id: 140, msg: "Error deleting content: Bad request" },
    
    badGateway: { id: 502, msg: "Error retrieving content: bad gateway" },
    notFound: { id: 404, msg: "Error retrieving content: resource not found" },
}
