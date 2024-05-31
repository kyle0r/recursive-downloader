'use strict';
// The script uses CasperJS, a navigation scripting & testing utility for the PhantomJS (WebKit) and SlimerJS (Gecko) headless browsers
// https://casperjs-dev.readthedocs.io/
// PhantomJS: a QtWebKit based headless web browser https://phantomjs.org/
// an alt to PhantomJS is SlimerJS which requires FireFox https://slimerjs.org/download.html
//
// Unfortunately CasperJS, PhantomJS and SlimerJS have become inactive and deprecated projects.
// This is likely in part due to Chrome and Firefox supporting native headless modes
// Puppeteer might be a future alt? con: Chrome/Chromium?
// Further reading:
// https://pptr.dev/
// https://www.puzzle.ch/de/blog/articles/2018/02/12/phantomjs-is-dead-long-live-headless-browsers
// https://browsersync.io/
//
// See also TODO.txt: https://github.com/PeterCxy/yarmd which looks like a nodejs native project
// 
// There are some python options too that cover beautiful-soup and selenium
// https://realpython.com/modern-web-automation-with-python-and-selenium/
// https://realpython.com/beautiful-soup-web-scraper-python/
// https://www.freecodecamp.org/news/web-scraping-python-tutorial-how-to-scrape-data-from-a-website/
// https://www.webscrapingapi.com/python-headless-browser

// The logic of the script is
// 
// for each uri in uris array, call spider method
//   get HEAD uri
//   if html
//     GET uri
//     extract a.hrefs to hrefs array
//     for each href in hrefs array
//       if each uriFilter is a negative match
//         append href to pendingUris
//     check_pending() - recursively call spider method if pendingUris remain 
//   else
//     append uri to actualDownloads
//     check_pending() - recursively call spider method if pendingUris remain
//  
//  finally, set a ==CUT== point for the calling script
//  output aria2c download specification of the actualDownloads, to be used by the calling script
//
//  NOTES
//  casperjs has getCurrentUrl method, which returns a url-decoded url, might be useful
//  cite: https://casperjs-dev.readthedocs.io/en/latest/modules/casper.html#getcurrenturl


var fs = require('fs');
// looks like its not possible to use url or node:url in the phantomjs runtime
// cite: https://stackoverflow.com/a/24389819/490487
// info: https://nodejs.org/api/url.html
// info: https://www.npmjs.com/package/url
// info: https://stackoverflow.com/a/6168370/490487 it looks like this isn't available in phantom/casper
// maybe?: https://www.npmjs.com/package/url-parse
//var uriParser = require('url').parse; // << NOPE
//var uriParser = require('node:url').URL; // << NOPE
var uriParser = require('url-parse'); // << WORKS
// then uriParser(uri).protocol, host, hostname, pathname etc
// what is origin? https://url.spec.whatwg.org/#concept-url-origin

var configPath='./config.yaml';
//var YAML = require('yaml'); // did not want in phantomjs runtime
try {
  var YAML = require('js-yaml');
  var config = YAML.load(fs.read(configPath, { mode: 'r', charset: 'utf8' }));
} catch (err) {
  console.log('something went wrong trying to open/read config yaml:', configPath)
  console.log('caught:', err);
  phantom.exit(1);
}

// TODO support blacklist and whitelist
var uriFilter = []
if ('undefined' !== typeof config.uriFilter && Array === config.uriFilter.constructor) {
  uriFilter = config.uriFilter;
  // regex array of URI's to ignore/blacklist
  uriFilter.forEach(function(value, index) {
    this[index] = new RegExp(value);
  }, uriFilter);
  // ^^ note the uriFilter last arg: https://stackoverflow.com/a/12482991/490487
}

// FIXME validation on the uris, encoding, etc, is phantomjs/casperjs/aria2c sensitive to unencoded uris?
try {
  var stream = fs.open(config.uriFile, { mode: 'r', charset: 'utf8' });
  var uris = [];
  while(!stream.atEnd()) {
      uris.push(uriParser(stream.readLine()));
  }
} catch (err) {
  console.log('something went wrong trying to open/read uris file:', config.uriFile)
  console.log('caught:', err);
  console.log('closing stream if defined');
  if (stream) stream.close();
  phantom.exit(1);
} finally {
  console.log('closing stream if defined');
  if (stream) stream.close();
}

//phantom.exit(0);

// used in this script to access env vars
var system = require('system');


var casper = require('casper').create({ /*verbose: true, logLevel: 'debug'*/ });
//var utils = require('utils'); // looks like this is not used?

// uri variables
var visitedUris = [], pendingUris = [], actualDownloads = [];

// regex to detect HTML URI's
var textHtmlRegEx = new RegExp('text/html', 'i');

function spider(myUri) {
  //console.log('uri info:', JSON.stringify(uriParser(myUri),null,2))
  // fetch HEAD myUri i.e. don't download, get info first
  casper.open(myUri.href, { method: 'head' }).then(function(response) {
    console.log('START OPEN')
    visitedUris.push(response.url)
    console.log('Opened:', response.url, 'contentType:', response.contentType, 'http status code:', response.status);

    // logic for html URI's
    if (textHtmlRegEx.test(response.contentType)) {
      console.log('matched content type:', response.url, 'contentType: ', response.contentType);

      // GET the html page
      casper.open(response.url, { method: 'get' } ).then(function(response) {
        console.log('fetched:', response.url);
        
        // Find all a.hrefs present on this page, build the hrefs array
        // Why evaluate? To get access to __utils__: https://stackoverflow.com/a/22189482/490487
        var hrefs = this.evaluate(function() {
          var arr = [];
          // knowledge on forEach.call: https://stackoverflow.com/a/16053538/490487
          // :puke: reading the complexity on this Q&A makes me wish this was python and not js based
          // why not __utils__.findAll('a').forEach? makes accessing element easier?
          Array.prototype.forEach.call(__utils__.findAll('a'), function(element) {
            arr.push(element.getAttribute('href'));
          });
          return arr;
        });

        // for each href, for each uriFilter regex (rx), negative test the href, if OK append to pendingUris
        Array.prototype.forEach.call(hrefs, function(href) {
          // Note: .some tests whether at least one element in the array passes the test implemented by the provided function.
          // Therefore, all regex patterns in uriFilter must be non-matching (false) in order for a href to be append to pendingUris
          // Any href that matches a pattern we want to skip
          if (! uriFilter.some(function(rx) { return rx.test(href); }) ) {
            var tmpHref = uriParser(href);
            if (! tmpHref.host) { // relative
              href = uriParser(href, response.url); // for relative hrefs
            } else { // absolute
              href = tmpHref;
            }
            console.log('Append pending:', href.href);
            pendingUris.push(href);
          }
        });

        check_pending();
        
      });
    // catch all logic for any other content type, if not html the script will append to actualDownloads array
    } else {
      // TODO should the uriFilter be checked here too?
      this.echo(this.colorizer.format('Actual Download: '+ response.url, { fg: 'green' }));
      actualDownloads.push(myUri);
      check_pending();
    }
    console.log('END OPEN')
  });

}

function check_pending() {
  console.log('check pending:', pendingUris.length);
  // If there are URLs to be processed
  if (pendingUris.length > 0) {
    var nextUri = pendingUris.shift();
    casper.echo(casper.colorizer.format('<- Popped ' + nextUri.href + ' from the stack', { fg: 'blue' }));
    spider(nextUri);
  }
}

// https://casperjs.readthedocs.io/en/latest/modules/casper.html#eachthen
// for each each uri, current item will be stored in the response.data property
// spider the uris
casper.start().eachThen(uris, function(response) {
  if ('undefined' !== typeof config.username) {
    config.http_pw = system.env['spider_pw'];
    casper.setHttpAuth(config.username, config.http_pw);
  }

  spider(response.data);
  console.log('NEXT URI LOOP\n');
});


// https://casperjs.readthedocs.io/en/latest/modules/casper.html#run
// Runs the whole suite of steps and optionally executes a callback when they’ve all been done. 
casper.run(function() {
  // CUT mark for the next script
  casper.echo('\nfinished\n==CUT==');
  // output aria2c download specification
  Array.prototype.forEach.call(actualDownloads, function(uri) {
    casper.echo(uri.href);
    if ('undefined' !== typeof config.uriStripPaths) {
      casper.echo(' out='+decodeURIComponent(config.downloadPath+uri.pathname.replace(config.uriStripPaths, '')));
    } else {
      casper.echo(' out='+decodeURIComponent(config.downloadPath+uri.pathname));
    }

  });
  this.exit();
});

