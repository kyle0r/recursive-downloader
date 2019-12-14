var urls = [
'https://domain.tld/example/path'
];

var system = require('system');
var http_pw = system.env['spider_pw'];

urlPrefix='https://domain.tld/example'

var casper = require('casper').create({ /*verbose: true, logLevel: 'debug'*/ });
var utils = require('utils');

// URL variables
var visitedUrls = [], pendingUrls = [], actualDownloads = [];

var textHtmlRegEx = new RegExp('text/html', 'i');
var uriFilter = [
   /^\?/
  ,/^\//
  ,/^(http|ftp|sftp)/
];

function spider(myUri) {
  casper.open(myUri, { method: 'head' }).then(function(response) {
    console.log('START OPEN')
    visitedUrls.push(response.url)
    console.log('Opened:', response.url, 'contentType:', response.contentType);
    if (textHtmlRegEx.test(response.contentType)) {
      console.log('matched content type:', response.url, 'contentType: ', response.contentType);

      casper.open(response.url, { method: 'get' } ).then(function(response) {
        console.log('fetched:', response.url);
        
        // Find links present on this page
        var links = this.evaluate(function() {
          var links = [];
          Array.prototype.forEach.call(__utils__.findAll('a'), function(e) {
            links.push(e.getAttribute('href'));
          });
          return links;
        });

        Array.prototype.forEach.call(links, function(link) {
          if (! uriFilter.some(function(rx) { return rx.test(link); }) ) {
            console.log('Append pending:', response.url+link);
            // FIXME ensure the / gets between the url and link
            pendingUrls.push(response.url+link);
          }
        });

        check_pending();
        
      });
    } else {
      this.echo(this.colorizer.format('Actual Download: '+ response.url, { fg: 'green' }));
      actualDownloads.push(response.url);
      check_pending();
    }
    console.log('END OPEN')
  });
}

function check_pending() {
  console.log('check pending:', pendingUrls.length);
  // If there are URLs to be processed
  if (pendingUrls.length > 0) {
    var nextUrl = pendingUrls.shift();
    casper.echo(casper.colorizer.format('<- Popped ' + nextUrl + ' from the stack', { fg: 'blue' }));
    spider(nextUrl);
  }
}

casper.start().eachThen(urls, function(response) {
  spider(response.data);
  console.log('NEXT URI LOOP\n');
});

casper.setHttpAuth('username', http_pw);


casper.run(function() {
  console.log('\nfinished\n==CUT==');
  Array.prototype.forEach.call(actualDownloads, function(link) {
    casper.echo(link);
    casper.echo(' out='+decodeURIComponent(link.replace(urlPrefix, '')));
  });
  this.exit();
});

