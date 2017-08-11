
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
		vl.userName = "Gast";
	}
	vl.guid = localStorageService.get("guid");
	if (!vl.guid) {
		vl.guid = Guid.NewGuid().ToString();
		localStorageService.set("guid", vl.guid);
	}
	vl.list = [];
	vl.filter = { title: "" };
	vl.editText = "";

	SharedState.initialize($scope, "loginModal");

	$http.defaults.headers.common['X-Votelist-GUID'] = vl.guid;
	$http.defaults.headers.common['X-Votelist-RemoteAdress'] = "127.0.0.1";

	vl.applySearch = function(filterText)
	{
		vl.filter.title = filterText;
	}

	vl.resetSearch = function()
	{
		vl.filter.title = "";
		$scope.searchText = "";
	}

	vl.setActiveItem = function(item)
	{
		vl.activeItem = item;
		vl.editText = vl.activeItem.title;
	}

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

	$rootScope.uiChangeName = function()
	{
		console.log("uiChangeName");
		SharedState.turnOff("authorModal");
		vl.needUserName = false;
		if (vl.authorModalContinueAddItem) {
			vl.addItem($scope.addText);
			vl.authorModalContinueAddItem = false;
		}
		if (vl.userName && vl.userName != "Gast") {
			localStorageService.set("userName", vl.userName);
		}
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
		localStorageService.set("guid", vl.guid);
		
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
		$http.get(apiBasePath + "api/votelist").then(
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
				} else {
					// let's hope the best
					$timeout(function() { vl.refresh(); }, 10000);
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
		if (vl.needUserName) {
			SharedState.turnOn("authorModal");
			vl.authorModalContinueAddItem = true;
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
				if (response.status == 429) {
					alert("Ups. Da sind insgesamt zu viele Wünsche (oder jemand hat hier Blödsinn getrieben!)");
				}
				$scope.thinkingAddItem = false;
			}
		);
	}

	vl.saveItem = function(vi, title)
	{
		if (vl.thinkingSaveItem) {
			return;
		}
		if (title.length <= 4) {
			alert("Gib bitte mindestens 5 Zeichen ein!")
			return;
		}

		vl.thinkingSaveItem = true;
		var item = {
			title: title,
			author: vl.userName
		}
		$http.put(apiBasePath + "api/db/votelist/" + vi.id, item).then(
			function(response) {
				console.log("put api/db/votelist/" + vi.id + " success", response.data);
				vi.title = item.title;
				vi.author = item.author;
				vl.editText = item.title;
				vl.thinkingSaveItem = false;
			},
			function(response) {
				console.error("post api/db/votelist error", response);
				if (response.status == 401) {
					SharedState.turnOn("loginModal");
				}
				vl.thinkingSaveItem = false;
				alert("Das Speichern ist leider fehlgeschlagen (" + response.status + ") :(");
			}
		);
	}

	vl.vote = function(vi, vote)
	{
		if (vl.thinkingVoteItem) {
			return;
		}

		vl.thinkingVoteItem = true;
		var item = {}
		$http.post(apiBasePath + "api/votes/" + vi.id + "/" + vote, item).then(
			function(response) {
				if (vote == "voteup") {
					vi.votesUp = vi.votesUp + 1;
				} else if (vote == "votedown") {
					vi.votesDown = vi.votesDown + 1;
				}
				vi.canVote = 0;
				vl.thinkingVoteItem = false;
				console.log("post api/votes/" + vi.id + "/" + vote + " success", response.data);
			},
			function(response) {
				console.error("post api/votes/" + vi.id + "/" + vote + " error", response);
				if (response.status == 401) {
					SharedState.turnOn("loginModal");
				}
				vl.thinkingVoteItem = false;
				alert("Das Speichern ist leider fehlgeschlagen (" + response.status + ") :(");
			}
		);
	}

	vl.loginTest(vl.refresh, function() {
		SharedState.turnOn("loginModal");
	});
})

;