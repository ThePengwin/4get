#!/usr/bin/env node

var program = require('commander');
var request = require('request');
var fs = require('fs');
var q = require('q');
var mkdirp = require('mkdirp');

var threadUrl = null;

var threadUrlRegex=/^https?\:\/\/boards\.4chan(nel)?\.org\/([a-z0-9]{1,4})\/thread\/([0-9]+)\/?(.*)$/;

var boards = ['a', 'c', 'w', 'm', 'cgl', 'cm', 'f', 'n', 'jp', 'v', 'vg', 'vp', 'vr', 'co', 'g', 'tv', 'k', 'o', 'an', 'tg', 'sp', 'asp', 'sci', 'his', 'int', 'out', 'toy', 'i', 'po', 'p', 'ck', 'ic', 'wg', 'lit', 'mu', 'fa', '3', 'gd', 'diy', 'wsg', 'qst', 'biz', 'trv', 'fit', 'x', 'adv', 'lgbt', 'mlp', 'news', 'wsr', 'vip', 'b', 'r9k', 'pol', 'bant', 'soc', 's4s', 's', 'hc', 'hm', 'h', 'e', 'u', 'd', 'y', 't', 'hr', 'gif', 'aco', 'r'];

function formatNumber(number, dummyPrevious) {
	return parseInt(number,10);
}

program
	.version('1.3.0')
	.option('-j, --json', 'Save JSON output')
	.option('-f, --follow', 'Follow thread till 404 or error')
	.option('-r, --refresh <time>', 'set refresh time for following in seconds. defaults to 10',formatNumber)
	.option('-d, --downloads <count>', 'Amount of simultaneous downloads for attachments. defaults to 4',formatNumber)
	.arguments('<url>')
	.action(function (url) {
		threadUrl = url;
	});

program.parse(process.argv);

if (program.refresh == undefined || isNaN(program.refresh) || program.refresh < 1) {
	program.refresh = 10;
}

if (program.downloads == undefined || isNaN(program.downloads) || program.downloads < 1) {
	program.downloads = 4;
}
if (threadUrl == null) {
   console.error('No thread specified. Type -h for help.');
   process.exit(1);
}
if (!threadUrlRegex.test(threadUrl)) {
   console.error('Invalid thread specified, please specify a proper 4chan board URL.');
   process.exit(1);
}

var threadDetails = threadUrlRegex.exec(threadUrl),
	board = threadDetails[2],
	threadnumber = threadDetails[3];

if (boards.indexOf(board) == -1) {
   console.error('Invalid board specified. I don\'t think "'+board+'" is a board.');
   process.exit(1);
}

var jsonURL = 'https://a.4cdn.org/'+board+'/thread/'+threadnumber+'.json';
var folder = './'+board+'/'+threadnumber+'/';

var savePostImage = function(post) {

	var deferred = q.defer();

	var remotePath = 'https://i.4cdn.org/'+board+'/'+post.tim+post.ext;
	var localPath = folder+post.tim+post.ext;

	if (fs.existsSync(localPath)) {
		console.log('[Image] '+localPath+' Already Exists');
		deferred.resolve();
		return deferred.promise;		
	}

	var localFile = fs.createWriteStream(localPath);
	var fileTransfer = request(remotePath).pipe(localFile);

	fileTransfer.on('finish',function(){
		fileTransfer.end();
		localFile.end();
		setTimeout(function(){
			deferred.resolve();
		},200);
		console.log('[Image] '+remotePath+' -> '+localPath);
	});

	return deferred.promise;
}

var imageQueues = [];
for (var i = 0; i < program.downloads; i++) {
	imageQueues[i] = q();
}
var handledPosts = [];

var saveThreadImages = function(posts) {
	var n = 0;
	posts.forEach(function(post) {
			imageQueues[n] = imageQueues[n].then(function () {return savePostImage(post)});
			n++;
			if (n >= program.downloads) {
				n=0;
			}
	});
};

var isNew = function(post){
	return handledPosts.indexOf(post.no) == -1;
}

var postHasImage = function(post) {
	return (typeof post.tim != 'undefined') && (typeof post.ext != 'undefined');
}

var doneRequest = function() {

}

var requestAndDownload = function(lastModified) {

	console.log('[Request] Getting '+jsonURL);

	var requestOptions = {
		url:jsonURL
	}

	if (typeof lastModified !== 'undefined') {
		requestOptions.headers = {
			'If-Modified-Since': lastModified
		};
	}

	request(requestOptions, function (error, response, body) {

		if (error) {

			console.error('Failed to recieve a response: "'+error);
			process.exit(1);

		}

		var newLastModified = response.headers['last-modified'];
		
		if (response.statusCode == 200) {

			//thread is good, lets make a dir for it.
			mkdirp(folder,function(err){

				if (err) {
					console.error('Cant create folder "'+folder+'": '+err);
					process.exit(1);
				}
		
				var thread = JSON.parse(body);

				if (program.json) {
					var jsonContents = JSON.stringify(thread,null,4);
					var jsonPath = folder+'thread.json';
					fs.writeFile(jsonPath, jsonContents, function(err) {
						if(err) {
							console.error('[JSON] Failed to save JSON!');
							process.exit(1);
						}
						console.log('[JSON] Saved '+jsonPath);
					});
				}

				var imagePosts = thread.posts.filter(postHasImage);
				var imagePosts = imagePosts.filter(isNew);

				console.log('[Request] Found '+imagePosts.length+' to get.');

				handledPosts = handledPosts.concat(thread.posts.map(function (post) {return post.no;}));
				saveThreadImages(imagePosts);


				if (program.follow) {
					setTimeout(function() {
						requestAndDownload(newLastModified)
					},program.refresh*1000);
				}

			});

		} else if(response.statusCode == 304) {

			console.log('[Request] Got response 304 - No New Posts');

			setTimeout(function() {
				requestAndDownload(newLastModified)
			},program.refresh*1000);

		} else if(response.statusCode == 404) {

			console.log('[Request] Got response 404, Thread no longer exists');

		} else {

			console.log('[Request] Unhandled response code.');
			process.exit(1);
		}
	});
}

requestAndDownload();
