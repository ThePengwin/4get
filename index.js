var program = require('commander');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');

var threadUrl = null;

var threadUrlRegex=/^https?\:\/\/boards\.4chan\.org\/([a-z0-9]{1,4})\/thread\/([0-9]+)\/?(.*)$/;

var boards = ['a','b','c','d','e','f','g','gif','h','hr','k','m','o','p','r','s',
			  't','u','v','vg','vr','w','wg','i','ic','r9k','s4s','cm','hm',
			  'lgbt','y','3','aco','adv','an','asp','biz','cgl','ck','co','diy',
			  'fa','fit','gd','hc','his','int','jp','lit','mlp','mu','n','news',
			  'out','po','pol','sci','soc','sp','tg','toy','trv','tv','vp','wsg',
			  'wsr','x'];

program
	.version('0.0.1')
	.option('-j, --json', 'Save JSON output')
	//.option('-f, --follow', 'Follow thread till 404 or error')
	//.option('-r, --refresh [time]', 'set refresh time for following in seconds. defaults to 10',10)
	.arguments('<url>')
	.action(function (url) {
		threadUrl = url;
	});

program.parse(process.argv);

if (threadUrl == null) {
   console.error('No thread specified. Type -h for help.');
   process.exit(1);
}
if (!threadUrlRegex.test(threadUrl)) {
   console.error('Invalid thread specified, please specify a proper 4chan board URL.');
   process.exit(1);
}

var threadDetails = threadUrlRegex.exec(threadUrl),
	board = threadDetails[1],
	threadnumber = threadDetails[2];

if (boards.indexOf(board) == -1) {
   console.error('Invalid board specified. I don\'t think "'+board+'" is a board.');
   process.exit(1);
}

var jsonURL = 'https://a.4cdn.org/'+board+'/thread/'+threadnumber+'.json';


request(jsonURL, function (error, response, body) {

	if (!error && response.statusCode == 200) {
		var folder = './'+board+'/'+threadnumber+'/';
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

			var savePostImage = function(post,cb) {
				var remotePath = 'https://i.4cdn.org/'+board+'/'+post.tim+post.ext;
				var localPath = folder+post.tim+post.ext;

				var localFile = fs.createWriteStream(localPath);
				var fileTransfer = request(remotePath).pipe(localFile);

				fileTransfer.on('finish',function(){
					console.log('[Image] '+remotePath+' -> '+localPath);
					cb();
				});
				
			}
			var hasImage = function(post) {
				return (typeof post.tim != 'undefined') && (typeof post.ext != 'undefined');
			}

			var imagePosts = thread.posts.filter(hasImage);

			var recursiveReduceImages = function(postArray,cb) {
				if (postArray.length < 1) {
					cb();
				} else {
					var post = postArray.shift();
					savePostImage(post,function(){
						recursiveReduceImages(postArray,cb);
					});
				}
			};

			recursiveReduceImages(imagePosts,function(){
				console.log('[Thread] Saved all images!');
			})

			});

	} else {

	}
});