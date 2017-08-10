
module.exports = {
	connection: {
		host     : 'localhost',
		user     : 'denis_tdvl_adm',
		password : 'xxx',
		database : 'denis_td_votelist',
		timezone : 'utc'
	},
	session: {
		secret : require('crypto').randomBytes(64).toString('hex'),
		secure : true
	},
	passphrase: "yyy"
}
