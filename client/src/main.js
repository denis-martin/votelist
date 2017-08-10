
vl = null;
var apiBasePath = "/";

var voteListApp = angular.module('voteListApp', ["mobile-angular-ui", 'LocalStorageModule'])

.controller('voteListCtrl', function($rootScope, $scope, $http, $timeout, SharedState, localStorageService) // root controller
{
	vl = this;
	$scope.vl = vl;
	$rootScope.vl = vl;
	vl.thinking = "";
	vl.needLogin = false;
	vl.passphrase = "";
	vl.userName = localStorageService.get("userName");
	if (!vl.userName) {
		vl.needUserName = true;
	}
	vl.guid = localStorageService.get("guid");
	if (!vl.guid) {
		vl.guid = Guid.NewGuid().ToString();
	}
	vl.list = [];

	SharedState.initialize($scope, "loginModal");

	$http.defaults.headers.common['X-Votelist-GUID'] = vl.guid;
	$http.defaults.headers.common['X-Votelist-RemoteAdress'] = "127.0.0.1";

	$rootScope.uiLogin = function()
	{
		console.log("uiLogin");
		vl.login(vl.passphrase, 
			function(response) {
				SharedState.turnOff("loginModal");
				vl.refresh();
			}, 
			function(response) {
				vl.modalError = "Fehlgeschlagen (" + response.status + ")";
				$timeout(function() { $scope.modalError = ""; }, 5000);
			}
		);
	}

	vl.loginTest = function(fnSuccess, fnError)
	{
		vl.thinking = "Sende Anmeldeinformationen...";
		$http.get(apiBasePath + "api/login").then(
			function(response) {
				console.log("loginTest success", response);
				vl.loginSuccess(response, fnSuccess);
			},
			function(response) {
				console.log("loginTest error", response);
				vl.thinking = "";
				vl.needLogin = true;
				if (fnError) {
					fnError(response);
				}
			}
		);
	}

	vl.login = function(passphrase, fnSuccess, fnError)
	{
		vl.thinking = "Sende Anmeldeinformationen...";
		$http.post(apiBasePath + "api/login", { user: vl.userName, passphrase: passphrase }).then(
			function(response) {
				console.log("login success", response);
				vl.loginSuccess(response, fnSuccess);
			},
			function(response) {
				console.log("login error", response);
				vl.thinking = "";
				vl.needLogin = true;
				if (response.data.user) {
					vl.userName = response.data.user;
				}
				if (fnError) {
					fnError(response);
				}
			}
		);
	}

	vl.loginSuccess = function(response, fnSuccess)
	{
		vl.thinking = "";
		vl.needLogin = false;
		console.log(vl.guid, response.data.guid);
		vl.guid = response.data.guid;
		$http.defaults.headers.common['X-Votelist-GUID'] = vl.guid;
		
		if (fnSuccess) {
			fnSuccess(response);
		}
	}

	vl.logout = function()
	{
		vl.thinking = "Abmelden...";
		$http.get(apiBasePath + "api/logout").then(
			function(response) {
				vl.needLogin = true;
				console.log("success", response);
				vl.thinking = "";
				vl.loginTest();
			},
			function(response) {
				console.log("error", response);
				vl.thinking = "";
				vl.loginTest();
			}
		);
	}

	vl.refresh = function()
	{
		console.log("refresh", vl.guid);
		$http.get(apiBasePath + "api/db/votelist").then(
			function(response) {
				if (!vl.list || vl.list.length == 0) {
					// initial fetch of data
					vl.list = response.data;
				} else {
					// incremental update
					var pos = response.data.map(e => e.id);
					vl.list.forEach(function(element, i, elementArray) {
						var j = pos.indexOf(element.id);
						if (j >= 0) {
							// update element
							if (element.changedAt != response.data[j].changedAt) {
								console.log("updating", i);
								// update keys
								angular.forEach(response.data[j], function(v, k) {
									element[k] = v;
								});
							}
						} else {
							// remove element
							console.log("removing", i);
							elementArray.splice(i, 1);
						}
					});
					var curPos = vl.list.map(e => e.id);
					response.data.forEach(function(element, i) {
						var j = curPos.indexOf(element.id);
						if (j == -1) {
							// add element
							vl.list.push(element);
						}
					});
				}
				$timeout(function() { vl.refresh(); }, 10000);
			},
			function(response) {
				console.error("get api/db/votelist error", response);
				if (response.status == 401) {
					SharedState.turnOn("loginModal");
				}
			}
		);
	}

	vl.addItem = function(title)
	{
		if ($scope.thinkingAddItem) {
			return;
		}
		if (title.length <= 4) {
			alert("Gib bitte mindestens 5 Zeichen ein!")
			return;
		}
		$scope.thinkingAddItem = true;
		var item = {
			title: title,
			author: vl.userName
		}
		$http.post(apiBasePath + "api/db/votelist", item).then(
			function(response) {
				console.log("post api/db/votelist success", response.data);
				item.changedAt = null;
				item.id = response.data.id;
				item.votesUp = 0;
				item.votesDown = 0;
				vl.list.push(item);
				$scope.addText = "";
				$scope.thinkingAddItem = false;
			},
			function(response) {
				console.error("post api/db/votelist error", response);
				if (response.status == 401) {
					SharedState.turnOn("loginModal");
				}
				$scope.thinkingAddItem = false;
			}
		);
	}

	vl.loginTest(vl.refresh, function() {
		SharedState.turnOn("loginModal");
	});
})

;